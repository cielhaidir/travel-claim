import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  AuditAction,
  JournalSourceType,
  JournalStatus,
  Role,
  type Prisma,
} from "../../../../generated/prisma";
import { createTRPCRouter, financeProcedure, protectedProcedure } from "@/server/api/trpc";
import { userHasAnyRole } from "@/lib/auth/role-check";
import { generateJournalEntryNumber } from "@/lib/utils/numberGenerators";

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

function assertBalanced(lines: Array<{ debitAmount: number; creditAmount: number }>) {
  if (lines.length < 2) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Jurnal harus memiliki minimal 2 baris",
    });
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const [index, line] of lines.entries()) {
    const debit = Number(line.debitAmount ?? 0);
    const credit = Number(line.creditAmount ?? 0);

    if ((debit <= 0 && credit <= 0) || (debit > 0 && credit > 0)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Baris jurnal ke-${index + 1} harus memiliki salah satu debit atau kredit`,
      });
    }

    totalDebit += debit;
    totalCredit += credit;
  }

  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Jurnal tidak seimbang. Total debit ${totalDebit} harus sama dengan total kredit ${totalCredit}`,
    });
  }

  return { totalDebit, totalCredit };
}

const lineInput = z.object({
  chartOfAccountId: z.string().min(1),
  balanceAccountId: z.string().min(1).optional(),
  description: z.string().optional(),
  debitAmount: z.number().min(0).default(0),
  creditAmount: z.number().min(0).default(0),
  lineNumber: z.number().int().positive().optional(),
});

export const journalEntryRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        status: z.nativeEnum(JournalStatus).optional(),
        sourceType: z.nativeEnum(JournalSourceType).optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: Prisma.JournalEntryWhereInput = withTenantWhere(ctx, {
        deletedAt: null,
      } satisfies Prisma.JournalEntryWhereInput);

      if (input.status) where.status = input.status;
      if (input.sourceType) where.sourceType = input.sourceType;
      if (input.startDate || input.endDate) {
        where.transactionDate = {};
        if (input.startDate) where.transactionDate.gte = input.startDate;
        if (input.endDate) where.transactionDate.lte = input.endDate;
      }

      const rows = await ctx.db.journalEntry.findMany({
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        where,
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          postedBy: { select: { id: true, name: true, email: true } },
          lines: {
            orderBy: { lineNumber: "asc" },
            include: {
              chartOfAccount: {
                select: { id: true, code: true, name: true, accountType: true },
              },
              balanceAccount: {
                select: { id: true, code: true, name: true },
              },
            },
          },
          claim: { select: { id: true, claimNumber: true, status: true } },
          bailout: { select: { id: true, bailoutNumber: true, status: true } },
        },
        orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
      });

      let nextCursor: string | undefined;
      if (rows.length > input.limit) {
        const next = rows.pop();
        nextCursor = next?.id;
      }

      return { journalEntries: rows, nextCursor };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const journal = await ctx.db.journalEntry.findFirst({
        where: withTenantWhere(ctx, { id: input.id, deletedAt: null }),
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          postedBy: { select: { id: true, name: true, email: true } },
          claim: {
            select: {
              id: true,
              claimNumber: true,
              status: true,
              amount: true,
            },
          },
          bailout: {
            select: {
              id: true,
              bailoutNumber: true,
              status: true,
              amount: true,
            },
          },
          lines: {
            orderBy: { lineNumber: "asc" },
            include: {
              chartOfAccount: true,
              balanceAccount: true,
            },
          },
        },
      });

      if (!journal) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Jurnal tidak ditemukan" });
      }

      return journal;
    }),

  createDraft: financeProcedure
    .input(
      z.object({
        transactionDate: z.coerce.date(),
        description: z.string().min(3),
        sourceType: z.nativeEnum(JournalSourceType).optional(),
        sourceId: z.string().optional(),
        claimId: z.string().optional(),
        bailoutId: z.string().optional(),
        referenceNumber: z.string().optional(),
        notes: z.string().optional(),
        lines: z.array(lineInput).min(2),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      assertBalanced(input.lines);

      const tenantId = getTenantScope(ctx).tenantId;
      const journalNumber = await generateJournalEntryNumber(ctx.db, tenantId);

      const coaIds = [...new Set(input.lines.map((line) => line.chartOfAccountId))];
      const balanceIds = [
        ...new Set(input.lines.map((line) => line.balanceAccountId).filter(Boolean)),
      ] as string[];

      const [coas, balances] = await Promise.all([
        ctx.db.chartOfAccount.findMany({
          where: withTenantWhere(ctx, {
            id: { in: coaIds },
            isActive: true,
          } satisfies Prisma.ChartOfAccountWhereInput),
          select: { id: true },
        }),
        balanceIds.length > 0
          ? ctx.db.balanceAccount.findMany({
              where: withTenantWhere(ctx, {
                id: { in: balanceIds },
                isActive: true,
                deletedAt: null,
              } satisfies Prisma.BalanceAccountWhereInput),
              select: { id: true },
            })
          : Promise.resolve([]),
      ]);

      if (coas.length !== coaIds.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Ada bagan akun yang tidak ditemukan atau tidak aktif",
        });
      }

      if (balances.length !== balanceIds.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Ada akun saldo yang tidak ditemukan atau tidak aktif",
        });
      }

      const created = await ctx.db.journalEntry.create({
        data: {
          tenantId,
          journalNumber,
          transactionDate: input.transactionDate,
          description: input.description,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          claimId: input.claimId,
          bailoutId: input.bailoutId,
          referenceNumber: input.referenceNumber,
          notes: input.notes,
          status: JournalStatus.DRAFT,
          createdById: ctx.session.user.id,
          lines: {
            create: input.lines.map((line, index) => ({
              chartOfAccountId: line.chartOfAccountId,
              balanceAccountId: line.balanceAccountId,
              description: line.description,
              debitAmount: line.debitAmount,
              creditAmount: line.creditAmount,
              lineNumber: line.lineNumber ?? index + 1,
            })),
          },
        },
        include: {
          lines: {
            orderBy: { lineNumber: "asc" },
            include: {
              chartOfAccount: { select: { id: true, code: true, name: true } },
              balanceAccount: { select: { id: true, code: true, name: true } },
            },
          },
        },
      });

      await ctx.db.auditLog.create({
        data: {
          tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.CREATE,
          entityType: "JournalEntry",
          entityId: created.id,
          metadata: {
            journalNumber: created.journalNumber,
            status: created.status,
          },
        },
      });

      return created;
    }),

  post: financeProcedure
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const journal = await ctx.db.journalEntry.findFirst({
        where: withTenantWhere(ctx, { id: input.id, deletedAt: null }),
        include: {
          lines: true,
        },
      });

      if (!journal) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Jurnal tidak ditemukan" });
      }

      if (journal.status === JournalStatus.POSTED) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Jurnal sudah diposting" });
      }
      if (journal.status === JournalStatus.VOID) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Jurnal void tidak bisa diposting" });
      }

      const normalizedLines = journal.lines.map((line) => ({
        debitAmount: Number(line.debitAmount),
        creditAmount: Number(line.creditAmount),
      }));
      assertBalanced(normalizedLines);

      const balanceLines = journal.lines.filter((line) => line.balanceAccountId);
      const result = await ctx.db.$transaction(async (tx) => {
        for (const line of balanceLines) {
          if (!line.balanceAccountId) continue;

          const amount = Number(line.debitAmount) > 0
            ? Number(line.debitAmount)
            : -Number(line.creditAmount);

          await tx.balanceAccount.update({
            where: { id: line.balanceAccountId },
            data: {
              balance: amount >= 0 ? { increment: amount } : { decrement: Math.abs(amount) },
            },
          });
        }

        return tx.journalEntry.update({
          where: { id: input.id },
          data: {
            status: JournalStatus.POSTED,
            postedById: ctx.session.user.id,
            postedAt: new Date(),
          },
          include: {
            lines: {
              orderBy: { lineNumber: "asc" },
              include: {
                chartOfAccount: { select: { id: true, code: true, name: true } },
                balanceAccount: { select: { id: true, code: true, name: true, balance: true } },
              },
            },
          },
        });
      });

      await ctx.db.auditLog.create({
        data: {
          tenantId: journal.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "JournalEntry",
          entityId: journal.id,
          metadata: {
            action: "post",
            journalNumber: journal.journalNumber,
          },
        },
      });

      return result;
    }),

  void: financeProcedure
    .input(
      z.object({
        id: z.string(),
        reason: z.string().min(3).optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const journal = await ctx.db.journalEntry.findFirst({
        where: withTenantWhere(ctx, { id: input.id, deletedAt: null }),
      });

      if (!journal) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Jurnal tidak ditemukan" });
      }

      if (journal.status === JournalStatus.VOID) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Jurnal sudah void" });
      }

      const updated = await ctx.db.journalEntry.update({
        where: { id: input.id },
        data: {
          status: JournalStatus.VOID,
          notes: input.reason ? [journal.notes, `VOID: ${input.reason}`].filter(Boolean).join("\n") : journal.notes,
        },
      });

      await ctx.db.auditLog.create({
        data: {
          tenantId: journal.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "JournalEntry",
          entityId: journal.id,
          metadata: {
            action: "void",
            reason: input.reason,
          },
        },
      });

      return updated;
    }),

  getPostingPreview: protectedProcedure
    .input(
      z.object({
        lines: z.array(lineInput).min(2),
      }),
    )
    .output(z.any())
    .query(({ ctx, input }) => {
      if (!userHasAnyRole(ctx.session.user, FINANCE_ROLES)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Hanya Finance atau Admin yang boleh melihat preview posting" });
      }

      return assertBalanced(input.lines);
    }),
});
