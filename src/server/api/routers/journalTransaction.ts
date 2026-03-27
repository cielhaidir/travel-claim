import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { JournalEntryType, Role } from "../../../../generated/prisma";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { userHasAnyRole } from "@/lib/auth/role-check";

const FINANCE_ROLES: Role[] = [Role.FINANCE, Role.ADMIN, Role.ROOT];

function applyScope<T extends Record<string, unknown>>(
  _ctx: unknown,
  where: T,
): T {
  return where;
}

export const journalTransactionRouter = createTRPCRouter({
  // ─── LIST ─────────────────────────────────────────────────────────────────
  list: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/journal-transactions",
        protect: true,
        tags: ["Finance", "Journal"],
        summary: "List journal transactions",
      },
      mcp: {
        enabled: true,
        name: "journal_list",
        description:
          "List journal transactions with optional filters. Finance and Admin roles can see all; others see only transactions linked to their own bailouts or claims.",
      },
    })
    .input(
      z.object({
        bailoutId: z.string().optional(),
        claimId: z.string().optional(),
        chartOfAccountId: z.string().optional(),
        balanceAccountId: z.string().optional(),
        entryType: z.nativeEnum(JournalEntryType).optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const isFinance = userHasAnyRole(ctx.session.user, FINANCE_ROLES);

      // Build where clause
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: Record<string, any> = applyScope(ctx, {
        deletedAt: null,
      });

      if (!isFinance) {
        // Regular users can only see transactions tied to their own entities
        where.OR = [
          { bailout: { requesterId: ctx.session.user.id } },
          { claim: { submitterId: ctx.session.user.id } },
        ];
      }

      if (input.bailoutId) where.bailoutId = input.bailoutId;
      if (input.claimId) where.claimId = input.claimId;
      if (input.chartOfAccountId)
        where.chartOfAccountId = input.chartOfAccountId;
      if (input.balanceAccountId)
        where.balanceAccountId = input.balanceAccountId;
      if (input.entryType) where.entryType = input.entryType;

      if (input.startDate || input.endDate) {
        where.transactionDate = {};
        if (input.startDate) where.transactionDate.gte = input.startDate;
        if (input.endDate) where.transactionDate.lte = input.endDate;
      }

      const rows = await ctx.db.journalTransaction.findMany({
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        where,
        include: {
          chartOfAccount: {
            select: { id: true, code: true, name: true, accountType: true },
          },
          balanceAccount: {
            select: { id: true, code: true, name: true, balance: true },
          },
          bailout: {
            select: {
              id: true,
              bailoutNumber: true,
              category: true,
              amount: true,
              status: true,
            },
          },
          claim: {
            select: {
              id: true,
              claimNumber: true,
              claimType: true,
              amount: true,
              status: true,
            },
          },
        },
        orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
      });

      let nextCursor: string | undefined;
      if (rows.length > input.limit) {
        const next = rows.pop();
        nextCursor = next!.id;
      }

      return { journalTransactions: rows, nextCursor };
    }),

  // ─── GET BY ID ────────────────────────────────────────────────────────────
  getById: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/journal-transactions/{id}",
        protect: true,
        tags: ["Finance", "Journal"],
        summary: "Get a single journal transaction by ID",
      },
      mcp: {
        enabled: true,
        name: "journal_get_by_id",
        description:
          "Retrieve full detail of a single journal transaction including linked bailout, claim, COA, and balance account.",
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const tx = await ctx.db.journalTransaction.findFirst({
        where: applyScope(ctx, { id: input.id, deletedAt: null }),
        include: {
          chartOfAccount: true,
          balanceAccount: true,
          bailout: {
            include: {
              requester: { select: { id: true, name: true, email: true } },
              travelRequest: {
                select: { id: true, requestNumber: true, destination: true },
              },
            },
          },
          claim: {
            include: {
              submitter: { select: { id: true, name: true, email: true } },
              travelRequest: {
                select: { id: true, requestNumber: true, destination: true },
              },
            },
          },
        },
      });

      if (!tx) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Journal transaction not found",
        });
      }

      const isFinance = userHasAnyRole(ctx.session.user, FINANCE_ROLES);
      const isBailoutOwner = tx.bailout?.requesterId === ctx.session.user.id;
      const isClaimOwner = tx.claim?.submitterId === ctx.session.user.id;

      if (!isFinance && !isBailoutOwner && !isClaimOwner) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view this journal transaction",
        });
      }

      return tx;
    }),

  // ─── LIST BALANCE ACCOUNTS ────────────────────────────────────────────────
  listBalanceAccounts: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/balance-accounts",
        protect: true,
        tags: ["Finance", "Journal"],
        summary: "List balance accounts",
      },
      mcp: {
        enabled: true,
        name: "list_balance_accounts",
        description:
          "List all active balance accounts used for journal transaction tracking.",
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: Record<string, any> = applyScope(ctx, {
        deletedAt: null,
      });
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

  // ─── GET BALANCE ACCOUNT BY ID ────────────────────────────────────────────
  getBalanceAccountById: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/balance-accounts/{id}",
        protect: true,
        tags: ["Finance", "Journal"],
        summary: "Get a balance account by ID",
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const ba = await ctx.db.balanceAccount.findFirst({
        where: applyScope(ctx, { id: input.id, deletedAt: null }),
        include: {
          journalTransactions: {
            where: applyScope(ctx, { deletedAt: null }),
            take: 10,
            orderBy: { transactionDate: "desc" },
            select: {
              id: true,
              transactionNumber: true,
              transactionDate: true,
              amount: true,
              entryType: true,
              description: true,
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
});

