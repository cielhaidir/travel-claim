import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { AuditAction, Role } from "../../../../generated/prisma";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { userHasAnyRole, userHasRole } from "@/lib/auth/role-check";
import { generateJournalTransactionNumber } from "@/lib/utils/numberGenerators";

const FINANCE_ROLES: Role[] = [Role.FINANCE, Role.ADMIN, Role.ROOT];

function getTenantScope(ctx: unknown): {
  tenantId: string | null;
  isRoot: boolean;
} {
  const typed = ctx as { tenantId?: string | null; isRoot?: boolean };
  return {
    tenantId: typed.tenantId ?? null,
    isRoot: typed.isRoot ?? false,
  };
}

function withTenantWhere<T extends Record<string, unknown>>(
  ctx: unknown,
  where: T,
): T {
  const { tenantId, isRoot } = getTenantScope(ctx);
  if (!isRoot) {
    (where as Record<string, unknown>).tenantId = tenantId;
  }
  return where;
}

export const balanceAccountRouter = createTRPCRouter({
  // ─── LIST ─────────────────────────────────────────────────────────────────
  list: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/balance-accounts",
        protect: true,
        tags: ["BalanceAccount"],
        summary: "List balance accounts",
      },
      mcp: {
        enabled: true,
        name: "balance_account_list",
        description:
          "List all balance accounts with optional filters. Available to all authenticated users.",
      },
    })
    .input(
      z.object({
        isActive: z.boolean().optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(200).default(100),
        cursor: z.string().optional(),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: Record<string, any> = withTenantWhere(ctx, {
        deletedAt: null,
      });

      if (input.isActive !== undefined) {
        where.isActive = input.isActive;
      }

      if (input.search) {
        where.OR = [
          { code: { contains: input.search, mode: "insensitive" } },
          { name: { contains: input.search, mode: "insensitive" } },
        ];
      }

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

  // ─── GET BY ID ────────────────────────────────────────────────────────────
  getById: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/balance-accounts/{id}",
        protect: true,
        tags: ["BalanceAccount"],
        summary: "Get a balance account by ID",
      },
      mcp: {
        enabled: true,
        name: "balance_account_get_by_id",
        description:
          "Retrieve a balance account including its last 20 journal transactions.",
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const ba = await ctx.db.balanceAccount.findFirst({
        where: withTenantWhere(ctx, { id: input.id, deletedAt: null }),
        include: {
          journalTransactions: {
            where: withTenantWhere(ctx, { deletedAt: null }),
            orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
            take: 20,
            select: {
              id: true,
              transactionNumber: true,
              transactionDate: true,
              amount: true,
              entryType: true,
              description: true,
              referenceNumber: true,
              chartOfAccount: {
                select: { id: true, code: true, name: true },
              },
              bailout: {
                select: { id: true, bailoutNumber: true, category: true },
              },
              claim: {
                select: { id: true, claimNumber: true, claimType: true },
              },
            },
          },
        },
      });

      if (!ba) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Balance account not found",
        });
      }

      return ba;
    }),

  // ─── GET BY CODE ──────────────────────────────────────────────────────────
  getByCode: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/balance-accounts/by-code/{code}",
        protect: true,
        tags: ["BalanceAccount"],
        summary: "Get a balance account by code",
      },
      mcp: {
        enabled: true,
        name: "balance_account_get_by_code",
        description: "Look up a balance account by its unique code.",
      },
    })
    .input(z.object({ code: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const ba = await ctx.db.balanceAccount.findFirst({
        where: withTenantWhere(ctx, { code: input.code, deletedAt: null }),
      });

      if (!ba) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Balance account with code "${input.code}" not found`,
        });
      }

      return ba;
    }),

  // ─── CREATE ───────────────────────────────────────────────────────────────
  create: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/balance-accounts",
        protect: true,
        tags: ["BalanceAccount"],
        summary: "Create a balance account (Finance/Admin only)",
      },
      mcp: {
        enabled: true,
        name: "balance_account_create",
        description:
          "Create a new balance account for tracking expense allocations via journal transactions. Requires Finance or Admin role.",
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

      // Ensure code is unique (including soft-deleted, to avoid confusion)
      const existing = await ctx.db.balanceAccount.findFirst({
        where: withTenantWhere(ctx, { code: input.code }),
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A balance account with code "${input.code}" already exists`,
        });
      }

      const ba = await ctx.db.balanceAccount.create({
        data: {
          tenantId: getTenantScope(ctx).tenantId,
          code: input.code,
          name: input.name,
          balance: input.balance,
          description: input.description,
          isActive: input.isActive,
        },
      });

      await ctx.db.auditLog.create({
        data: {
          tenantId: ba.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.CREATE,
          entityType: "BalanceAccount",
          entityId: ba.id,
          changes: {
            after: {
              code: ba.code,
              name: ba.name,
              balance: ba.balance.toString(),
            },
          },
        },
      });

      return ba;
    }),

  // ─── UPDATE ───────────────────────────────────────────────────────────────
  update: protectedProcedure
    .meta({
      openapi: {
        method: "PUT",
        path: "/balance-accounts/{id}",
        protect: true,
        tags: ["BalanceAccount"],
        summary: "Update a balance account (Finance/Admin only)",
      },
      mcp: {
        enabled: true,
        name: "balance_account_update",
        description:
          "Update name, description, or active status of a balance account. Balance adjustments should be made through journal transactions, not here directly.",
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

      const existing = await ctx.db.balanceAccount.findFirst({
        where: withTenantWhere(ctx, { id: input.id, deletedAt: null }),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Balance account not found",
        });
      }

      const { id, ...data } = input;

      const updated = await ctx.db.balanceAccount.update({
        where: { id },
        data,
      });

      await ctx.db.auditLog.create({
        data: {
          tenantId: existing.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "BalanceAccount",
          entityId: id,
          changes: {
            before: {
              name: existing.name,
              description: existing.description,
              isActive: existing.isActive,
            },
            after: {
              name: updated.name,
              description: updated.description,
              isActive: updated.isActive,
            },
          },
        },
      });

      return updated;
    }),

  // ─── ADJUST BALANCE ───────────────────────────────────────────────────────
  /**
   * Manual balance adjustment (e.g. initial funding, corrections).
   * Creates a journal entry with the given entry type so history is preserved.
   */
  adjustBalance: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/balance-accounts/{id}/adjust",
        protect: true,
        tags: ["BalanceAccount"],
        summary: "Manually adjust the balance (Finance/Admin only)",
      },
      mcp: {
        enabled: true,
        name: "balance_account_adjust",
        description:
          "Manually adjust a balance account (e.g. initial funding or correction). A JournalTransaction is recorded for traceability. Use CREDIT to increase balance, DEBIT to decrease.",
      },
    })
    .input(
      z.object({
        id: z.string().min(1),
        amount: z.number().positive(),
        entryType: z.enum(["DEBIT", "CREDIT"]),
        chartOfAccountId: z.string().min(1),
        description: z.string().min(5),
        transactionDate: z.coerce.date().optional(),
        referenceNumber: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      if (!userHasAnyRole(ctx.session.user, FINANCE_ROLES)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Finance or Admin can adjust balance accounts",
        });
      }

      const [ba, coa] = await Promise.all([
        ctx.db.balanceAccount.findUnique({
          where: { id: input.id, isActive: true, deletedAt: null },
        }),
        ctx.db.chartOfAccount.findFirst({
          where: withTenantWhere(ctx, {
            id: input.chartOfAccountId,
            isActive: true,
          }),
        }),
      ]);

      if (!ba) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Balance account not found or inactive",
        });
      }
      if (!coa) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Chart of Account not found or inactive",
        });
      }

      const scoped = withTenantWhere(ctx, { id: ba.id });
      const scopedTenantId = (scoped as { tenantId?: string | null }).tenantId;
      if (scopedTenantId !== undefined && ba.tenantId !== scopedTenantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cross-tenant access denied",
        });
      }

      // Generate sequential journal number
      const transactionNumber = await generateJournalTransactionNumber(
        ctx.db,
        ba.tenantId,
      );

      const result = await ctx.db.$transaction(async (tx) => {
        const journal = await tx.journalTransaction.create({
          data: {
            transactionNumber,
            transactionDate: input.transactionDate ?? new Date(),
            description: input.description,
            amount: input.amount,
            entryType: input.entryType,
            tenantId: ba.tenantId,
            chartOfAccountId: input.chartOfAccountId,
            balanceAccountId: input.id,
            referenceNumber: input.referenceNumber,
            notes: input.notes,
          },
        });

        const updatedBa = await tx.balanceAccount.update({
          where: { id: input.id },
          data: {
            balance:
              input.entryType === "CREDIT"
                ? { increment: input.amount }
                : { decrement: input.amount },
          },
        });

        return { journal, balanceAccount: updatedBa };
      });

      await ctx.db.auditLog.create({
        data: {
          tenantId: ba.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "BalanceAccount",
          entityId: input.id,
          metadata: {
            action: "manual_adjustment",
            entryType: input.entryType,
            amount: input.amount,
            transactionNumber,
          },
        },
      });

      return result;
    }),

  // ─── DELETE (soft) ────────────────────────────────────────────────────────
  delete: protectedProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: "/balance-accounts/{id}",
        protect: true,
        tags: ["BalanceAccount"],
        summary: "Soft-delete a balance account (Admin only)",
      },
      mcp: {
        enabled: true,
        name: "balance_account_delete",
        description: "Soft-delete a balance account. Requires Admin role.",
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      if (!userHasRole(ctx.session.user, Role.ADMIN)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Admin can delete balance accounts",
        });
      }

      const existing = await ctx.db.balanceAccount.findFirst({
        where: withTenantWhere(ctx, { id: input.id, deletedAt: null }),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Balance account not found",
        });
      }

      // Prevent deletion if there are journal transactions linked to this account
      const txCount = await ctx.db.journalTransaction.count({
        where: withTenantWhere(ctx, {
          balanceAccountId: input.id,
          deletedAt: null,
        }),
      });
      if (txCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot delete: ${txCount} journal transaction(s) are linked to this account. Deactivate it instead.`,
        });
      }

      const deleted = await ctx.db.balanceAccount.update({
        where: { id: input.id },
        data: { deletedAt: new Date(), isActive: false },
      });

      await ctx.db.auditLog.create({
        data: {
          tenantId: existing.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.DELETE,
          entityType: "BalanceAccount",
          entityId: input.id,
        },
      });

      return deleted;
    }),
});
