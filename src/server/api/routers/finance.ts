import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  AuditAction,
  BailoutStatus,
  ClaimStatus,
  JournalEntryType,
  Role,
  type Prisma,
} from "../../../../generated/prisma";
import { db as dbClient } from "@/server/db";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { userHasAnyRole } from "@/lib/auth/role-check";

const FINANCE_ROLES: Role[] = [Role.FINANCE, Role.ADMIN];

// ─── Helpers ─────────────────────────────────────────────────────────────────

type DbClient = typeof dbClient;

/** Generate a sequential journal transaction number, e.g. JRN-2026-00001 */
async function generateJournalNumber(db: DbClient): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.journalTransaction.count({
    where: { transactionNumber: { startsWith: `JRN-${year}` } },
  });
  return `JRN-${year}-${String(count + 1).padStart(5, "0")}`;
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const financeRouter = createTRPCRouter({
  // ─── LIST BAILOUTS ────────────────────────────────────────────────────────
  listBailout: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/finance/bailouts",
        protect: true,
        tags: ["Finance"],
        summary: "List all bailouts belonging to the current user",
      },
      mcp: {
        enabled: true,
        name: "finance_list_bailout",
        description:
          "Get all bailout records created by the currently authenticated user, ordered by most recent first. Finance and Admin roles can see all bailouts.",
      },
    })
    .input(
      z.object({
        status: z.nativeEnum(BailoutStatus).optional(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const isFinance = userHasAnyRole(ctx.session.user, FINANCE_ROLES);

      const where: Record<string, unknown> = { deletedAt: null };

      if (!isFinance) {
        where.requesterId = ctx.session.user.id;
      }

      if (input.status) {
        where.status = input.status;
      }

      const bailouts = await ctx.db.bailout.findMany({
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        where,
        include: {
          requester: {
            select: { id: true, name: true, email: true, employeeId: true },
          },
          travelRequest: {
            select: {
              id: true,
              requestNumber: true,
              destination: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      let nextCursor: string | undefined = undefined;
      if (bailouts.length > input.limit) {
        const nextItem = bailouts.pop();
        nextCursor = nextItem!.id;
      }

      return { bailouts, nextCursor };
    }),

  // ─── GET BAILOUT (Finance view) ───────────────────────────────────────────
  getBailout: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/finance/bailouts/{id}",
        protect: true,
        tags: ["Finance"],
        summary: "Get bailout detail for finance processing",
      },
      mcp: {
        enabled: true,
        name: "finance_get_bailout",
        description:
          "Retrieve full bailout detail including requester, travel request, approvals, and attached files. Intended for Finance role to review before disbursement.",
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      if (!userHasAnyRole(ctx.session.user, FINANCE_ROLES)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Finance or Admin can access this endpoint",
        });
      }

      const bailout = await ctx.db.bailout.findUnique({
        where: { id: input.id, deletedAt: null },
        include: {
          requester: {
            select: {
              id: true,
              name: true,
              email: true,
              employeeId: true,
              phoneNumber: true,
              role: true,
              department: { select: { id: true, name: true, code: true } },
            },
          },
          travelRequest: {
            select: {
              id: true,
              requestNumber: true,
              destination: true,
              purpose: true,
              travelType: true,
              status: true,
              startDate: true,
              endDate: true,
            },
          },
          approvals: {
            orderBy: { sequence: "asc" },
            include: {
              approver: {
                select: { id: true, name: true, email: true, role: true },
              },
            },
          },
          finance: {
            select: { id: true, name: true, email: true },
          },
          journalTransactions: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              transactionNumber: true,
              transactionDate: true,
              amount: true,
              entryType: true,
              description: true,
              chartOfAccount: {
                select: { id: true, code: true, name: true },
              },
              balanceAccount: {
                select: { id: true, code: true, name: true },
              },
            },
          },
        },
      });

      if (!bailout) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bailout tidak ditemukan",
        });
      }

      return bailout;
    }),

  // ─── ATTACH FILE TO BAILOUT ───────────────────────────────────────────────
  attachFileToBailout: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/finance/bailouts/{bailoutId}/attachments",
        protect: true,
        tags: ["Finance"],
        summary: "Attach a supporting file to a bailout",
      },
      mcp: {
        enabled: true,
        name: "finance_attach_file_to_bailout",
        description:
          "Attach a receipt, transfer proof, or supporting document to a bailout record. Finance staff upload disbursement evidence here. Stores metadata; actual file binary is handled by the storage layer separately.",
      },
    })
    .input(
      z.object({
        bailoutNumber: z.string().min(1),
        storageUrl: z.string().url(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      if (!userHasAnyRole(ctx.session.user, FINANCE_ROLES)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Finance or Admin can attach files to a bailout",
        });
      }

      const bailout = await ctx.db.bailout.findUnique({
        where: { bailoutNumber: input.bailoutNumber, deletedAt: null },
      });

      if (!bailout) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bailout tidak ditemukan",
        });
      }

      // File may be attached at any point from APPROVED_DIRECTOR onward (ready for disbursement)
      const attachableStatuses: BailoutStatus[] = [
        BailoutStatus.APPROVED_DIRECTOR,
        BailoutStatus.DISBURSED,
      ];

      if (!attachableStatuses.includes(bailout.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Files can only be attached to bailouts that are fully approved (APPROVED_DIRECTOR) or already disbursed (DISBURSED)",
        });
      }

      const updatedBailout = await ctx.db.bailout.update({
        where: { bailoutNumber: input.bailoutNumber },
        data: {
          storageUrl: input.storageUrl,
          financeId: ctx.session.user.id,
          updatedAt: new Date(),
        },
      });

      const attachmentMeta: Prisma.InputJsonValue = {
        storageUrl: input.storageUrl,
        attachedAt: new Date().toISOString(),
        attachedBy: ctx.session.user.id,
      };

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "Bailout",
          entityId: bailout.id,
          metadata: {
            action: "attach_file",
            attachment: attachmentMeta,
          },
        },
      });

      return {
        bailout: updatedBailout,
        attachment: attachmentMeta,
      };
    }),

  // ─── PROCESS BAILOUT TRANSACTION ──────────────────────────────────────────
  /**
   * Finance creates a journal transaction for a fully-approved bailout,
   * records the storage URL (receipt/transfer proof), assigns the chart of
   * account and balance account, and updates the bailout finance ownership.
   *
   * This is the "create transaction" action mentioned in the requirements.
   */
  processBailoutTransaction: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/finance/bailouts/{bailoutId}/transaction",
        protect: true,
        tags: ["Finance"],
        summary: "Process bailout as a journal transaction (expense entry)",
      },
      mcp: {
        enabled: true,
        name: "finance_process_bailout_transaction",
        description:
          "Record a bailout as an expense journal transaction. Attach a storage URL (receipt/proof), link to a chart of account and a balance account. Creates a JournalTransaction and updates the bailout's financeId and storageUrl.",
      },
    })
    .input(
      z.object({
        bailoutId: z.string().min(1),
        storageUrl: z.string().url(),
        chartOfAccountId: z.string().min(1),
        balanceAccountId: z.string().min(1),
        /** Optional override for the accounting date; defaults to today. */
        transactionDate: z.coerce.date().optional(),
        notes: z.string().optional(),
        referenceNumber: z.string().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      if (!userHasAnyRole(ctx.session.user, FINANCE_ROLES)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Finance or Admin can process bailout transactions",
        });
      }

      // ── Validate bailout ──────────────────────────────────────────────────
      const bailout = await ctx.db.bailout.findUnique({
        where: { id: input.bailoutId, deletedAt: null },
      });

      if (!bailout) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bailout tidak ditemukan",
        });
      }

      // Only fully-approved bailouts can be processed (APPROVED_DIRECTOR or DISBURSED)
      const processableStatuses: BailoutStatus[] = [
        BailoutStatus.APPROVED_DIRECTOR,
        BailoutStatus.DISBURSED,
      ];
      if (!processableStatuses.includes(bailout.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Bailout must be fully approved before processing. Current status: ${bailout.status}`,
        });
      }

      // ── Validate COA & Balance Account ────────────────────────────────────
      const coa = await ctx.db.chartOfAccount.findUnique({
        where: { id: input.chartOfAccountId, isActive: true },
      });
      const balanceAccount = await ctx.db.balanceAccount.findUnique({
        where: { id: input.balanceAccountId, isActive: true, deletedAt: null },
      });

      if (!coa) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Chart of Account tidak ditemukan atau tidak aktif",
        });
      }
      if (!balanceAccount) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Balance Account tidak ditemukan atau tidak aktif",
        });
      }

      // ── Generate transaction number ───────────────────────────────────────
      const transactionNumber = await generateJournalNumber(ctx.db);
      const txDate = input.transactionDate ?? new Date();

      // ── Run in a DB transaction ───────────────────────────────────────────
      const result = await ctx.db.$transaction(async (tx) => {
        // 1. Create journal entry (expense = DEBIT on expense account)
        const journal = await tx.journalTransaction.create({
          data: {
            transactionNumber,
            transactionDate: txDate,
            description: `Bailout expense: ${bailout.bailoutNumber} — ${bailout.description}`,
            amount: bailout.amount,
            entryType: JournalEntryType.DEBIT,
            bailoutId: bailout.id,
            chartOfAccountId: input.chartOfAccountId,
            balanceAccountId: input.balanceAccountId,
            referenceNumber: input.referenceNumber,
            notes: input.notes,
          },
          include: {
            chartOfAccount: { select: { id: true, code: true, name: true } },
            balanceAccount: {
              select: { id: true, code: true, name: true, balance: true },
            },
          },
        });

        // 2. Deduct from balance account (expense reduces the balance)
        const updatedBalance = await tx.balanceAccount.update({
          where: { id: input.balanceAccountId },
          data: {
            balance: {
              decrement: bailout.amount,
            },
          },
        });

        // 3. Update bailout — attach storage URL and assign finance user
        const updatedBailout = await tx.bailout.update({
          where: { id: input.bailoutId },
          data: {
            storageUrl: input.storageUrl,
            financeId: ctx.session.user.id,
          },
        });

        return { journal, updatedBalance, updatedBailout };
      });

      // ── Audit log ─────────────────────────────────────────────────────────
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "Bailout",
          entityId: bailout.id,
          metadata: {
            action: "process_transaction",
            journalTransactionId: result.journal.id,
            transactionNumber,
            chartOfAccountId: input.chartOfAccountId,
            balanceAccountId: input.balanceAccountId,
            storageUrl: input.storageUrl,
          },
        },
      });

      return result;
    }),

  // ─── PROCESS CLAIM TRANSACTION ────────────────────────────────────────────
  /**
   * Finance finalises a claim by:
   *   1. Attaching a storage URL (proof of payment)
   *   2. Linking a chart of account and balance account
   *   3. Creating a journal transaction (expense DEBIT)
   *   4. Updating the claim's financeId
   */
  processClaimTransaction: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/finance/claims/{claimId}/transaction",
        protect: true,
        tags: ["Finance"],
        summary: "Process claim as a journal transaction (expense entry)",
      },
      mcp: {
        enabled: true,
        name: "finance_process_claim_transaction",
        description:
          "Record a finalized claim as an expense journal transaction. Attach a storage URL (payment proof), link to a chart of account and balance account. Creates a JournalTransaction and updates the claim's financeId. Claim must be APPROVED or PAID.",
      },
    })
    .input(
      z.object({
        claimId: z.string().min(1),
        storageUrl: z.string().url(),
        chartOfAccountId: z.string().min(1),
        balanceAccountId: z.string().min(1),
        /** Optional override for the accounting date; defaults to today. */
        transactionDate: z.coerce.date().optional(),
        notes: z.string().optional(),
        referenceNumber: z.string().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      if (!userHasAnyRole(ctx.session.user, FINANCE_ROLES)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Finance or Admin can process claim transactions",
        });
      }

      // ── Validate claim ────────────────────────────────────────────────────
      const claim = await ctx.db.claim.findUnique({
        where: { id: input.claimId, deletedAt: null },
      });

      if (!claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Claim tidak ditemukan",
        });
      }

      // Claim must be final (APPROVED or PAID)
      const processableStatuses: ClaimStatus[] = [
        ClaimStatus.APPROVED,
        ClaimStatus.PAID,
      ];
      if (!processableStatuses.includes(claim.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Claim must be APPROVED or PAID before processing. Current status: ${claim.status}`,
        });
      }

      // ── Validate COA & Balance Account ────────────────────────────────────
      const coa = await ctx.db.chartOfAccount.findUnique({
        where: { id: input.chartOfAccountId, isActive: true },
      });
      const balanceAccount = await ctx.db.balanceAccount.findUnique({
        where: { id: input.balanceAccountId, isActive: true, deletedAt: null },
      });

      if (!coa) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Chart of Account tidak ditemukan atau tidak aktif",
        });
      }
      if (!balanceAccount) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Balance Account tidak ditemukan atau tidak aktif",
        });
      }

      // ── Generate transaction number ───────────────────────────────────────
      const transactionNumber = await generateJournalNumber(ctx.db);
      const txDate = input.transactionDate ?? new Date();

      // ── Run in a DB transaction ───────────────────────────────────────────
      const result = await ctx.db.$transaction(async (tx) => {
        // 1. Create journal entry (expense = DEBIT)
        const journal = await tx.journalTransaction.create({
          data: {
            transactionNumber,
            transactionDate: txDate,
            description: `Claim expense: ${claim.claimNumber} — ${claim.description}`,
            amount: claim.amount,
            entryType: JournalEntryType.DEBIT,
            claimId: claim.id,
            chartOfAccountId: input.chartOfAccountId,
            balanceAccountId: input.balanceAccountId,
            referenceNumber: input.referenceNumber,
            notes: input.notes,
          },
          include: {
            chartOfAccount: { select: { id: true, code: true, name: true } },
            balanceAccount: {
              select: { id: true, code: true, name: true, balance: true },
            },
          },
        });

        // 2. Deduct from balance account
        const updatedBalance = await tx.balanceAccount.update({
          where: { id: input.balanceAccountId },
          data: {
            balance: {
              decrement: claim.amount,
            },
          },
        });

        // 3. Update claim — attach storage URL and assign finance user
        const updatedClaim = await tx.claim.update({
          where: { id: input.claimId },
          data: {
            financeId: ctx.session.user.id,
          },
        });

        return { journal, updatedBalance, updatedClaim };
      });

      // ── Audit log ─────────────────────────────────────────────────────────
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "Claim",
          entityId: claim.id,
          metadata: {
            action: "process_transaction",
            journalTransactionId: result.journal.id,
            transactionNumber,
            chartOfAccountId: input.chartOfAccountId,
            balanceAccountId: input.balanceAccountId,
            storageUrl: input.storageUrl,
          },
        },
      });

      return result;
    }),

  // ─── BALANCE ACCOUNTS ─────────────────────────────────────────────────────

  /** List all balance accounts (Finance and Admin only). */
  listBalanceAccounts: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/finance/balance-accounts",
        protect: true,
        tags: ["Finance"],
        summary: "List balance accounts (Finance/Admin only)",
      },
      mcp: {
        enabled: true,
        name: "finance_list_balance_accounts",
        description:
          "List all balance accounts used for expense tracking via journal transactions.",
      },
    })
    .input(
      z.object({
        isActive: z.boolean().optional(),
        limit: z.number().min(1).max(200).default(100),
        cursor: z.string().optional(),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      if (!userHasAnyRole(ctx.session.user, FINANCE_ROLES)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Finance or Admin can list balance accounts",
        });
      }

      const where: Record<string, unknown> = { deletedAt: null };
      if (input.isActive !== undefined) where.isActive = input.isActive;

      const rows = await ctx.db.balanceAccount.findMany({
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        where,
        orderBy: { code: "asc" },
      });

      let nextCursor: string | undefined;
      if (rows.length > input.limit) {
        const next = rows.pop();
        nextCursor = next!.id;
      }

      return { balanceAccounts: rows, nextCursor };
    }),

  /** Create a new balance account (Finance and Admin only). */
  createBalanceAccount: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/finance/balance-accounts",
        protect: true,
        tags: ["Finance"],
        summary: "Create a balance account",
      },
      mcp: {
        enabled: true,
        name: "finance_create_balance_account",
        description:
          "Create a new balance account for tracking expense allocations via journal transactions.",
      },
    })
    .input(
      z.object({
        code: z.string().min(1).max(30),
        name: z.string().min(1).max(150),
        balance: z.number().default(0),
        description: z.string().optional(),
        isActive: z.boolean().default(true),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      if (!userHasAnyRole(ctx.session.user, FINANCE_ROLES)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Finance or Admin can create balance accounts",
        });
      }

      // Ensure code is unique
      const existing = await ctx.db.balanceAccount.findUnique({
        where: { code: input.code },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Balance account with code "${input.code}" already exists`,
        });
      }

      const balanceAccount = await ctx.db.balanceAccount.create({
        data: {
          code: input.code,
          name: input.name,
          balance: input.balance,
          description: input.description,
          isActive: input.isActive,
        },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.CREATE,
          entityType: "BalanceAccount",
          entityId: balanceAccount.id,
          changes: { after: { code: input.code, name: input.name } },
        },
      });

      return balanceAccount;
    }),

  /** Update an existing balance account (Finance and Admin only). */
  updateBalanceAccount: protectedProcedure
    .meta({
      openapi: {
        method: "PUT",
        path: "/finance/balance-accounts/{id}",
        protect: true,
        tags: ["Finance"],
        summary: "Update a balance account",
      },
    })
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1).max(150).optional(),
        description: z.string().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      if (!userHasAnyRole(ctx.session.user, FINANCE_ROLES)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Finance or Admin can update balance accounts",
        });
      }

      const existing = await ctx.db.balanceAccount.findUnique({
        where: { id: input.id, deletedAt: null },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Balance account tidak ditemukan",
        });
      }

      const { id, ...data } = input;
      const updated = await ctx.db.balanceAccount.update({
        where: { id },
        data,
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "BalanceAccount",
          entityId: id,
          changes: { before: existing, after: updated },
        },
      });

      return updated;
    }),

  // ─── R2 PRESIGN ──────────────────────────────────────────────────────────
  /**
   * Return a pre-signed PUT URL so the client can upload directly to R2.
   * The caller sends the file directly to R2 and then passes the resulting
   * public URL to processBailoutTransaction / processClaimTransaction.
   */
  getUploadUrl: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/finance/upload-url",
        protect: true,
        tags: ["Finance"],
        summary: "Get a pre-signed R2 upload URL for a finance document",
      },
      mcp: {
        enabled: true,
        name: "finance_get_upload_url",
        description:
          "Generate a short-lived pre-signed PUT URL for uploading a finance document (receipt, payment proof, etc.) directly to Cloudflare R2. Pass entityType ('bailouts' or 'claims'), entityId, filename, and contentType.",
      },
    })
    .input(
      z.object({
        entityType: z.enum(["bailouts", "claims"]),
        entityId: z.string().min(1),
        filename: z.string().min(1),
        contentType: z.string().min(1),
        expiresIn: z.number().min(60).max(3600).default(900),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      if (!userHasAnyRole(ctx.session.user, FINANCE_ROLES)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Finance or Admin can request upload URLs",
        });
      }

      // Lazy-import to avoid issues when R2 is not configured
      const { getPresignedUploadUrl, buildStorageKey, getPublicUrl } =
        await import("@/lib/storage/r2");

      const key = buildStorageKey(
        input.entityType,
        input.entityId,
        input.filename,
      );

      const uploadUrl = await getPresignedUploadUrl(
        key,
        input.contentType,
        input.expiresIn,
      );

      return {
        uploadUrl,
        key,
        publicUrl: getPublicUrl(key),
        expiresIn: input.expiresIn,
      };
    }),
});
