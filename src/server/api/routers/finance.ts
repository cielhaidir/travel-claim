import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  AuditAction,
  BailoutStatus,
  ClaimStatus,
  COAType,
  JournalEntryType,
  JournalSourceType,
  JournalStatus,
  Role,
  type Prisma,
} from "../../../../generated/prisma";
import { db as dbClient } from "@/server/db";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { userHasAnyRole } from "@/lib/auth/role-check";
import {
  generateJournalEntryNumber,
  generateJournalTransactionNumber,
} from "@/lib/utils/numberGenerators";

const FINANCE_ROLES: Role[] = [Role.FINANCE, Role.ADMIN, Role.ROOT];

// ─── Helpers ─────────────────────────────────────────────────────────────────

type DbClient = typeof dbClient;
type DbTx = Prisma.TransactionClient;

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

function assertSameTenant(ctx: unknown, tenantId: string | null | undefined) {
  const scope = getTenantScope(ctx);
  if (scope.isRoot) return;
  if (!scope.tenantId || scope.tenantId !== tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Cross-tenant access denied",
    });
  }
}

function assertTenantMatch(
  expectedTenantId: string | null,
  actualTenantId: string | null | undefined,
  entityLabel: string,
) {
  if (expectedTenantId !== actualTenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `${entityLabel} tidak berada dalam tenant yang sama`,
    });
  }
}

async function assertJournalBuildReferences(
  tx: DbTx,
  input: {
    tenantId: string | null;
    chartOfAccountId: string;
    offsetChartOfAccountId: string;
    balanceAccountId?: string;
    claimId?: string;
    bailoutId?: string;
  },
) {
  const [coa, offsetCoa, balanceAccount, claim, bailout] = await Promise.all([
    tx.chartOfAccount.findUnique({
      where: { id: input.chartOfAccountId },
      select: { tenantId: true, isActive: true },
    }),
    tx.chartOfAccount.findUnique({
      where: { id: input.offsetChartOfAccountId },
      select: { tenantId: true, isActive: true },
    }),
    input.balanceAccountId
      ? tx.balanceAccount.findUnique({
          where: { id: input.balanceAccountId },
          select: { tenantId: true, isActive: true, deletedAt: true },
        })
      : Promise.resolve(null),
    input.claimId
      ? tx.claim.findUnique({
          where: { id: input.claimId },
          select: { tenantId: true, deletedAt: true },
        })
      : Promise.resolve(null),
    input.bailoutId
      ? tx.bailout.findUnique({
          where: { id: input.bailoutId },
          select: { tenantId: true, deletedAt: true },
        })
      : Promise.resolve(null),
  ]);

  if (!coa || !coa.isActive) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "COA jurnal debit tidak valid" });
  }
  if (!offsetCoa || !offsetCoa.isActive) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "COA jurnal kredit tidak valid" });
  }
  assertTenantMatch(input.tenantId, coa.tenantId, "COA jurnal debit");
  assertTenantMatch(input.tenantId, offsetCoa.tenantId, "COA jurnal kredit");

  if (balanceAccount) {
    if (!balanceAccount.isActive || balanceAccount.deletedAt) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Balance account jurnal tidak valid" });
    }
    assertTenantMatch(input.tenantId, balanceAccount.tenantId, "Balance account jurnal");
  }

  if (claim) {
    if (claim.deletedAt) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Claim jurnal tidak valid" });
    }
    assertTenantMatch(input.tenantId, claim.tenantId, "Claim jurnal");
  }

  if (bailout) {
    if (bailout.deletedAt) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Bailout jurnal tidak valid" });
    }
    assertTenantMatch(input.tenantId, bailout.tenantId, "Bailout jurnal");
  }
}

/** Generate a sequential journal transaction number, e.g. JRN-2026-00001 */
async function generateJournalNumber(
  db: DbClient,
  ctx: unknown,
): Promise<string> {
  return generateJournalTransactionNumber(db, getTenantScope(ctx).tenantId);
}

function assertClaimAccountingAccounts(input: {
  expenseType: COAType;
  offsetType: COAType;
}) {
  if (input.expenseType !== COAType.EXPENSE) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Akun beban klaim harus bertipe EXPENSE/Beban",
    });
  }

  if (input.offsetType !== COAType.ASSET) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Akun lawan pembayaran klaim harus bertipe ASSET/Aset (misalnya kas atau bank)",
    });
  }
}

function assertBailoutAccountingAccounts(input: {
  advanceType: COAType;
  offsetType: COAType;
}) {
  if (input.advanceType !== COAType.ASSET) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Akun pencairan bailout harus bertipe ASSET/Aset karena dicatat sebagai uang muka, bukan langsung beban",
    });
  }

  if (input.offsetType !== COAType.ASSET) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Akun lawan pencairan bailout harus bertipe ASSET/Aset (misalnya kas atau bank)",
    });
  }
}

function assertSettlementAccounts(input: {
  expenseTypes: COAType[];
  advanceType: COAType;
  refundAccountType?: COAType;
  employeeReceivableType?: COAType;
  employeePayableType?: COAType;
}) {
  if (input.expenseTypes.some((type) => type !== COAType.EXPENSE)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Semua akun beban settlement harus bertipe EXPENSE/Beban",
    });
  }

  if (input.advanceType !== COAType.ASSET) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Akun uang muka settlement harus bertipe ASSET/Aset",
    });
  }

  if (input.refundAccountType && input.refundAccountType !== COAType.ASSET) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Akun kas/bank untuk refund settlement harus bertipe ASSET/Aset",
    });
  }

  if (input.employeeReceivableType && input.employeeReceivableType !== COAType.ASSET) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Akun piutang karyawan settlement harus bertipe ASSET/Aset",
    });
  }

  if (input.employeePayableType && input.employeePayableType !== COAType.LIABILITY) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Akun hutang karyawan settlement harus bertipe LIABILITY/Liabilitas",
    });
  }
}

function assertBalancedJournalLines(
  lines: Array<{ debitAmount: Prisma.Decimal | number; creditAmount: Prisma.Decimal | number }>,
) {
  if (lines.length < 2) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Jurnal settlement harus memiliki minimal 2 baris",
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
        message: `Baris jurnal settlement ke-${index + 1} harus memiliki salah satu debit atau kredit`,
      });
    }

    totalDebit += debit;
    totalCredit += credit;
  }

  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Jurnal settlement tidak seimbang. Total debit ${totalDebit} harus sama dengan total kredit ${totalCredit}`,
    });
  }

  return { totalDebit, totalCredit };
}

async function createPostedJournalWithLines(
  tx: DbTx,
  input: {
    tenantId: string | null;
    transactionDate: Date;
    description: string;
    sourceType: JournalSourceType;
    claimId?: string;
    bailoutId?: string;
    referenceNumber?: string;
    notes?: string;
    createdById: string;
    lines: Array<{
      chartOfAccountId: string;
      balanceAccountId?: string;
      description?: string;
      debitAmount: Prisma.Decimal | number;
      creditAmount: Prisma.Decimal | number;
    }>;
  },
) {
  assertBalancedJournalLines(input.lines);

  const coaIds = [...new Set(input.lines.map((line) => line.chartOfAccountId))];
  const balanceIds = [...new Set(input.lines.map((line) => line.balanceAccountId).filter(Boolean))] as string[];

  const [coas, balanceAccounts, claim, bailout] = await Promise.all([
    tx.chartOfAccount.findMany({
      where: {
        id: { in: coaIds },
        tenantId: input.tenantId,
        isActive: true,
      },
      select: { id: true },
    }),
    balanceIds.length > 0
      ? tx.balanceAccount.findMany({
          where: {
            id: { in: balanceIds },
            tenantId: input.tenantId,
            isActive: true,
            deletedAt: null,
          },
          select: { id: true },
        })
      : Promise.resolve([]),
    input.claimId
      ? tx.claim.findUnique({
          where: { id: input.claimId },
          select: { id: true, tenantId: true, deletedAt: true },
        })
      : Promise.resolve(null),
    input.bailoutId
      ? tx.bailout.findUnique({
          where: { id: input.bailoutId },
          select: { id: true, tenantId: true, deletedAt: true },
        })
      : Promise.resolve(null),
  ]);

  if (coas.length !== coaIds.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Ada akun COA settlement yang tidak ditemukan, tidak aktif, atau bukan milik tenant aktif",
    });
  }

  if (balanceAccounts.length !== balanceIds.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Ada balance account settlement yang tidak ditemukan, tidak aktif, atau bukan milik tenant aktif",
    });
  }

  if (claim) {
    if (claim.deletedAt || claim.tenantId !== input.tenantId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Claim settlement tidak valid" });
    }
  }

  if (bailout) {
    if (bailout.deletedAt || bailout.tenantId !== input.tenantId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Bailout settlement tidak valid" });
    }
  }

  const journalNumber = await generateJournalEntryNumber(tx as unknown as DbClient, input.tenantId);

  return tx.journalEntry.create({
    data: {
      tenantId: input.tenantId,
      journalNumber,
      transactionDate: input.transactionDate,
      description: input.description,
      sourceType: input.sourceType,
      sourceId: input.claimId ?? input.bailoutId,
      claimId: input.claimId,
      bailoutId: input.bailoutId,
      referenceNumber: input.referenceNumber,
      notes: input.notes,
      status: JournalStatus.POSTED,
      createdById: input.createdById,
      postedById: input.createdById,
      postedAt: new Date(),
      lines: {
        create: input.lines.map((line, index) => ({
          chartOfAccountId: line.chartOfAccountId,
          balanceAccountId: line.balanceAccountId,
          description: line.description,
          debitAmount: line.debitAmount,
          creditAmount: line.creditAmount,
          lineNumber: index + 1,
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
}

async function createPostedDoubleEntryJournal(
  tx: DbTx,
  input: {
    tenantId: string | null;
    transactionDate: Date;
    description: string;
    sourceType: JournalSourceType;
    claimId?: string;
    bailoutId?: string;
    chartOfAccountId: string;
    offsetChartOfAccountId: string;
    balanceAccountId?: string;
    amount: Prisma.Decimal | number;
    referenceNumber?: string;
    notes?: string;
    createdById: string;
  },
) {
  await assertJournalBuildReferences(tx, input);

  const journalNumber = await generateJournalEntryNumber(tx as unknown as DbClient, input.tenantId);

  const lines: Prisma.JournalEntryLineCreateWithoutJournalEntryInput[] = [
    {
      chartOfAccount: { connect: { id: input.chartOfAccountId } },
      description: input.description,
      debitAmount: input.amount,
      creditAmount: 0,
      lineNumber: 1,
    },
    {
      chartOfAccount: { connect: { id: input.offsetChartOfAccountId } },
      balanceAccount: input.balanceAccountId
        ? { connect: { id: input.balanceAccountId } }
        : undefined,
      description: `Lawan jurnal - ${input.description}`,
      debitAmount: 0,
      creditAmount: input.amount,
      lineNumber: 2,
    },
  ];

  return tx.journalEntry.create({
    data: {
      tenantId: input.tenantId,
      journalNumber,
      transactionDate: input.transactionDate,
      description: input.description,
      sourceType: input.sourceType,
      sourceId: input.claimId ?? input.bailoutId,
      claimId: input.claimId,
      bailoutId: input.bailoutId,
      referenceNumber: input.referenceNumber,
      notes: input.notes,
      status: JournalStatus.POSTED,
      createdById: input.createdById,
      postedById: input.createdById,
      postedAt: new Date(),
      lines: {
        create: lines,
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

      const where: Prisma.BailoutWhereInput = withTenantWhere(ctx, {
        deletedAt: null,
      } satisfies Prisma.BailoutWhereInput);

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

      assertSameTenant(ctx, bailout.tenantId);

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

      const bailout = await ctx.db.bailout.findFirst({
        where: withTenantWhere(ctx, {
          bailoutNumber: input.bailoutNumber,
          deletedAt: null,
        } satisfies Prisma.BailoutWhereInput),
      });

      if (!bailout) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bailout tidak ditemukan",
        });
      }

      assertSameTenant(ctx, bailout.tenantId);

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
        where: { id: bailout.id },
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
          tenantId: bailout.tenantId,
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
        offsetChartOfAccountId: z.string().min(1).optional(),
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

      assertSameTenant(ctx, bailout.tenantId);

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
      const [coa, offsetCoa, balanceAccount] = await Promise.all([
        ctx.db.chartOfAccount.findFirst({
          where: withTenantWhere(ctx, {
            id: input.chartOfAccountId,
            isActive: true,
          } satisfies Prisma.ChartOfAccountWhereInput),
        }),
        ctx.db.chartOfAccount.findFirst({
          where: withTenantWhere(ctx, {
            id: input.offsetChartOfAccountId ?? input.chartOfAccountId,
            isActive: true,
          } satisfies Prisma.ChartOfAccountWhereInput),
        }),
        ctx.db.balanceAccount.findFirst({
          where: withTenantWhere(ctx, {
            id: input.balanceAccountId,
            isActive: true,
            deletedAt: null,
          } satisfies Prisma.BalanceAccountWhereInput),
        }),
      ]);

      if (!coa) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bagan Akun beban tidak ditemukan atau tidak aktif",
        });
      }
      if (!offsetCoa) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bagan Akun lawan tidak ditemukan atau tidak aktif",
        });
      }
      if (!balanceAccount) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Akun saldo tidak ditemukan atau tidak aktif",
        });
      }

      assertBailoutAccountingAccounts({
        advanceType: coa.accountType,
        offsetType: offsetCoa.accountType,
      });

      // ── Generate transaction number ───────────────────────────────────────
      const transactionNumber = await generateJournalNumber(ctx.db, ctx);
      const txDate = input.transactionDate ?? new Date();

      // ── Run in a DB transaction ───────────────────────────────────────────
      const result = await ctx.db.$transaction(async (tx) => {
        // 1. Create legacy journal transaction (temporary compatibility)
        const journal = await tx.journalTransaction.create({
          data: {
            transactionNumber,
            transactionDate: txDate,
            description: `Beban bailout: ${bailout.bailoutNumber} — ${bailout.description}`,
            amount: bailout.amount,
            entryType: JournalEntryType.DEBIT,
            tenantId: bailout.tenantId,
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

        // 2. Create proper double-entry journal
        const journalEntry = await createPostedDoubleEntryJournal(tx, {
          tenantId: bailout.tenantId,
          transactionDate: txDate,
          description: `Pencairan bailout ${bailout.bailoutNumber}`,
          sourceType: JournalSourceType.BAILOUT,
          bailoutId: bailout.id,
          chartOfAccountId: input.chartOfAccountId,
          offsetChartOfAccountId: offsetCoa.id,
          balanceAccountId: input.balanceAccountId,
          amount: bailout.amount,
          referenceNumber: input.referenceNumber,
          notes: input.notes,
          createdById: ctx.session.user.id,
        });

        // 3. Deduct from balance account (expense reduces the balance)
        const updatedBalance = await tx.balanceAccount.update({
          where: { id: input.balanceAccountId },
          data: {
            balance: {
              decrement: bailout.amount,
            },
          },
        });

        // 4. Update bailout — attach storage URL and assign finance user
        const updatedBailout = await tx.bailout.update({
          where: { id: input.bailoutId },
          data: {
            storageUrl: input.storageUrl,
            financeId: ctx.session.user.id,
          },
        });

        return { journal, journalEntry, updatedBalance, updatedBailout };
      });

      // ── Audit log ─────────────────────────────────────────────────────────
      await ctx.db.auditLog.create({
        data: {
          tenantId: bailout.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "Bailout",
          entityId: bailout.id,
          metadata: {
            action: "process_transaction",
            journalTransactionId: result.journal.id,
            journalEntryId: result.journalEntry.id,
            transactionNumber,
            journalNumber: result.journalEntry.journalNumber,
            chartOfAccountId: input.chartOfAccountId,
            offsetChartOfAccountId: offsetCoa.id,
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
        offsetChartOfAccountId: z.string().min(1).optional(),
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

      assertSameTenant(ctx, claim.tenantId);

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
      const [coa, offsetCoa, balanceAccount] = await Promise.all([
        ctx.db.chartOfAccount.findFirst({
          where: withTenantWhere(ctx, {
            id: input.chartOfAccountId,
            isActive: true,
          } satisfies Prisma.ChartOfAccountWhereInput),
        }),
        ctx.db.chartOfAccount.findFirst({
          where: withTenantWhere(ctx, {
            id: input.offsetChartOfAccountId ?? input.chartOfAccountId,
            isActive: true,
          } satisfies Prisma.ChartOfAccountWhereInput),
        }),
        ctx.db.balanceAccount.findFirst({
          where: withTenantWhere(ctx, {
            id: input.balanceAccountId,
            isActive: true,
            deletedAt: null,
          } satisfies Prisma.BalanceAccountWhereInput),
        }),
      ]);

      if (!coa) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bagan Akun beban tidak ditemukan atau tidak aktif",
        });
      }
      if (!offsetCoa) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bagan Akun lawan tidak ditemukan atau tidak aktif",
        });
      }
      if (!balanceAccount) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Akun saldo tidak ditemukan atau tidak aktif",
        });
      }

      assertClaimAccountingAccounts({
        expenseType: coa.accountType,
        offsetType: offsetCoa.accountType,
      });

      // ── Generate transaction number ───────────────────────────────────────
      const transactionNumber = await generateJournalNumber(ctx.db, ctx);
      const txDate = input.transactionDate ?? new Date();

      // ── Run in a DB transaction ───────────────────────────────────────────
      const result = await ctx.db.$transaction(async (tx) => {
        // 1. Create legacy journal transaction (temporary compatibility)
        const journal = await tx.journalTransaction.create({
          data: {
            transactionNumber,
            transactionDate: txDate,
            description: `Beban klaim: ${claim.claimNumber} — ${claim.description}`,
            amount: claim.amount,
            entryType: JournalEntryType.DEBIT,
            tenantId: claim.tenantId,
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

        // 2. Create proper double-entry journal
        const journalEntry = await createPostedDoubleEntryJournal(tx, {
          tenantId: claim.tenantId,
          transactionDate: txDate,
          description: `Pembayaran klaim ${claim.claimNumber}`,
          sourceType: JournalSourceType.CLAIM,
          claimId: claim.id,
          chartOfAccountId: input.chartOfAccountId,
          offsetChartOfAccountId: offsetCoa.id,
          balanceAccountId: input.balanceAccountId,
          amount: claim.amount,
          referenceNumber: input.referenceNumber,
          notes: input.notes,
          createdById: ctx.session.user.id,
        });

        // 3. Deduct from balance account
        const updatedBalance = await tx.balanceAccount.update({
          where: { id: input.balanceAccountId },
          data: {
            balance: {
              decrement: claim.amount,
            },
          },
        });

        // 4. Update claim — attach storage URL and assign finance user
        const updatedClaim = await tx.claim.update({
          where: { id: input.claimId },
          data: {
            financeId: ctx.session.user.id,
          },
        });

        return { journal, journalEntry, updatedBalance, updatedClaim };
      });

      // ── Audit log ─────────────────────────────────────────────────────────
      await ctx.db.auditLog.create({
        data: {
          tenantId: claim.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "Claim",
          entityId: claim.id,
          metadata: {
            action: "process_transaction",
            journalTransactionId: result.journal.id,
            journalEntryId: result.journalEntry.id,
            transactionNumber,
            journalNumber: result.journalEntry.journalNumber,
            chartOfAccountId: input.chartOfAccountId,
            offsetChartOfAccountId: offsetCoa.id,
            balanceAccountId: input.balanceAccountId,
            storageUrl: input.storageUrl,
          },
        },
      });

      return result;
    }),

  settleBailoutTransaction: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/finance/bailouts/{bailoutId}/settlement",
        protect: true,
        tags: ["Finance"],
        summary: "Settle bailout into expense journal",
      },
    })
    .input(
      z.object({
        bailoutId: z.string().min(1),
        expenseChartOfAccountId: z.string().min(1).optional(),
        expenseLines: z.array(
          z.object({
            chartOfAccountId: z.string().min(1),
            amount: z.number().positive(),
            description: z.string().optional(),
          }),
        ).min(1).optional(),
        advanceChartOfAccountId: z.string().min(1),
        varianceHandling: z.enum(["REQUIRE_EXACT", "REFUND_TO_BANK", "REFUND_TO_RECEIVABLE", "TOPUP_TO_PAYABLE"]).optional(),
        refundBankChartOfAccountId: z.string().min(1).optional(),
        refundBankBalanceAccountId: z.string().min(1).optional(),
        employeeReceivableChartOfAccountId: z.string().min(1).optional(),
        employeePayableChartOfAccountId: z.string().min(1).optional(),
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
          message: "Only Finance or Admin can settle bailout transactions",
        });
      }

      const bailout = await ctx.db.bailout.findUnique({
        where: { id: input.bailoutId, deletedAt: null },
      });

      if (!bailout) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bailout tidak ditemukan",
        });
      }

      assertSameTenant(ctx, bailout.tenantId);

      if (bailout.status !== BailoutStatus.DISBURSED) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Settlement bailout hanya bisa dilakukan untuk bailout yang sudah dicairkan",
        });
      }

      const existingSettlement = await ctx.db.journalEntry.findFirst({
        where: withTenantWhere(ctx, {
          bailoutId: bailout.id,
          sourceType: JournalSourceType.SETTLEMENT,
          status: JournalStatus.POSTED,
          deletedAt: null,
        } satisfies Prisma.JournalEntryWhereInput),
        select: { id: true, journalNumber: true },
      });

      if (existingSettlement) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Settlement bailout sudah pernah diposting dengan nomor jurnal ${existingSettlement.journalNumber}`,
        });
      }

      const normalizedExpenseLines = input.expenseLines && input.expenseLines.length > 0
        ? input.expenseLines
        : input.expenseChartOfAccountId
          ? [{
              chartOfAccountId: input.expenseChartOfAccountId,
              amount: Number(bailout.amount),
              description: `Settlement bailout ${bailout.bailoutNumber}`,
            }]
          : [];

      if (normalizedExpenseLines.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Settlement membutuhkan minimal satu akun beban atau expenseLines",
        });
      }

      const varianceHandling = input.varianceHandling ?? "REQUIRE_EXACT";
      const expenseCoaIds = [...new Set(normalizedExpenseLines.map((line) => line.chartOfAccountId))];
      const coaIdsToFetch = [
        ...expenseCoaIds,
        input.advanceChartOfAccountId,
        input.refundBankChartOfAccountId,
        input.employeeReceivableChartOfAccountId,
        input.employeePayableChartOfAccountId,
      ].filter(Boolean) as string[];

      const [coas, refundBalanceAccount] = await Promise.all([
        ctx.db.chartOfAccount.findMany({
          where: withTenantWhere(ctx, {
            id: { in: coaIdsToFetch },
            isActive: true,
          } satisfies Prisma.ChartOfAccountWhereInput),
        }),
        input.refundBankBalanceAccountId
          ? ctx.db.balanceAccount.findFirst({
              where: withTenantWhere(ctx, {
                id: input.refundBankBalanceAccountId,
                isActive: true,
                deletedAt: null,
              } satisfies Prisma.BalanceAccountWhereInput),
            })
          : Promise.resolve(null),
      ]);

      const coaMap = new Map(coas.map((coa) => [coa.id, coa]));
      const missingCoaId = coaIdsToFetch.find((id) => !coaMap.has(id));
      if (missingCoaId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Bagan akun settlement tidak ditemukan atau tidak aktif: ${missingCoaId}`,
        });
      }

      const advanceCoa = coaMap.get(input.advanceChartOfAccountId);
      if (!advanceCoa) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bagan Akun uang muka tidak ditemukan atau tidak aktif",
        });
      }

      if (input.refundBankBalanceAccountId && !refundBalanceAccount) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Balance account refund settlement tidak ditemukan atau tidak aktif",
        });
      }

      const totalRealization = normalizedExpenseLines.reduce((sum, line) => sum + Number(line.amount), 0);
      if (totalRealization <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Total realisasi settlement harus lebih besar dari 0",
        });
      }

      const advanceAmount = Number(bailout.amount);
      const variance = Number((advanceAmount - totalRealization).toFixed(2));
      const journalDescription = `Settlement bailout ${bailout.bailoutNumber}`;

      assertSettlementAccounts({
        expenseTypes: normalizedExpenseLines.map((line) => coaMap.get(line.chartOfAccountId)?.accountType).filter(Boolean) as COAType[],
        advanceType: advanceCoa.accountType,
        refundAccountType: input.refundBankChartOfAccountId
          ? coaMap.get(input.refundBankChartOfAccountId)?.accountType
          : undefined,
        employeeReceivableType: input.employeeReceivableChartOfAccountId
          ? coaMap.get(input.employeeReceivableChartOfAccountId)?.accountType
          : undefined,
        employeePayableType: input.employeePayableChartOfAccountId
          ? coaMap.get(input.employeePayableChartOfAccountId)?.accountType
          : undefined,
      });

      if (Math.abs(variance) <= 0.001 && varianceHandling !== "REQUIRE_EXACT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Variance handling hanya boleh dipakai jika ada selisih settlement",
        });
      }

      if (variance > 0) {
        if (varianceHandling === "REQUIRE_EXACT") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Realisasi settlement (${totalRealization}) lebih kecil dari uang muka (${advanceAmount}). Pilih REFUND_TO_BANK atau REFUND_TO_RECEIVABLE.`,
          });
        }
        if (varianceHandling === "TOPUP_TO_PAYABLE") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "TOPUP_TO_PAYABLE hanya valid bila realisasi lebih besar dari uang muka",
          });
        }
        if (varianceHandling === "REFUND_TO_BANK") {
          if (!input.refundBankChartOfAccountId || !input.refundBankBalanceAccountId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "REFUND_TO_BANK membutuhkan akun kas/bank dan balance account refund",
            });
          }
        }
        if (varianceHandling === "REFUND_TO_RECEIVABLE" && !input.employeeReceivableChartOfAccountId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "REFUND_TO_RECEIVABLE membutuhkan akun piutang karyawan",
          });
        }
      }

      if (variance < 0) {
        if (varianceHandling !== "TOPUP_TO_PAYABLE") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Realisasi settlement (${totalRealization}) lebih besar dari uang muka (${advanceAmount}). Gunakan TOPUP_TO_PAYABLE.`,
          });
        }
        if (!input.employeePayableChartOfAccountId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "TOPUP_TO_PAYABLE membutuhkan akun hutang karyawan",
          });
        }
      }

      const journalLines: Array<{
        chartOfAccountId: string;
        balanceAccountId?: string;
        description?: string;
        debitAmount: number;
        creditAmount: number;
      }> = normalizedExpenseLines.map((line) => ({
        chartOfAccountId: line.chartOfAccountId,
        description: line.description || journalDescription,
        debitAmount: Number(line.amount),
        creditAmount: 0,
      }));

      if (variance > 0 && varianceHandling === "REFUND_TO_BANK") {
        journalLines.push({
          chartOfAccountId: input.refundBankChartOfAccountId!,
          balanceAccountId: input.refundBankBalanceAccountId,
          description: `Pengembalian selisih settlement bailout ${bailout.bailoutNumber}`,
          debitAmount: variance,
          creditAmount: 0,
        });
      }

      if (variance > 0 && varianceHandling === "REFUND_TO_RECEIVABLE") {
        journalLines.push({
          chartOfAccountId: input.employeeReceivableChartOfAccountId!,
          description: `Piutang karyawan atas selisih settlement bailout ${bailout.bailoutNumber}`,
          debitAmount: variance,
          creditAmount: 0,
        });
      }

      journalLines.push({
        chartOfAccountId: advanceCoa.id,
        description: `Penutupan uang muka bailout ${bailout.bailoutNumber}`,
        debitAmount: 0,
        creditAmount: advanceAmount,
      });

      if (variance < 0 && varianceHandling === "TOPUP_TO_PAYABLE") {
        journalLines.push({
          chartOfAccountId: input.employeePayableChartOfAccountId!,
          description: `Hutang karyawan atas selisih settlement bailout ${bailout.bailoutNumber}`,
          debitAmount: 0,
          creditAmount: Math.abs(variance),
        });
      }

      assertBalancedJournalLines(journalLines);

      const txDate = input.transactionDate ?? new Date();
      const journalEntry = await ctx.db.$transaction(async (tx) => {
        const created = await createPostedJournalWithLines(tx, {
          tenantId: bailout.tenantId,
          transactionDate: txDate,
          description: journalDescription,
          sourceType: JournalSourceType.SETTLEMENT,
          bailoutId: bailout.id,
          referenceNumber: input.referenceNumber,
          notes: input.notes,
          createdById: ctx.session.user.id,
          lines: journalLines,
        });

        if (variance > 0 && varianceHandling === "REFUND_TO_BANK" && input.refundBankBalanceAccountId) {
          await tx.balanceAccount.update({
            where: { id: input.refundBankBalanceAccountId },
            data: {
              balance: {
                increment: variance,
              },
            },
          });
        }

        return created;
      });

      await ctx.db.auditLog.create({
        data: {
          tenantId: bailout.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "Bailout",
          entityId: bailout.id,
          metadata: {
            action: "settlement_transaction",
            journalEntryId: journalEntry.id,
            journalNumber: journalEntry.journalNumber,
            advanceChartOfAccountId: advanceCoa.id,
            expenseLines: normalizedExpenseLines,
            totalRealization,
            advanceAmount,
            variance,
            varianceHandling,
            refundBankChartOfAccountId: input.refundBankChartOfAccountId,
            refundBankBalanceAccountId: input.refundBankBalanceAccountId,
            employeeReceivableChartOfAccountId: input.employeeReceivableChartOfAccountId,
            employeePayableChartOfAccountId: input.employeePayableChartOfAccountId,
          },
        },
      });

      return {
        journalEntry,
        bailout,
        settlement: {
          totalRealization,
          advanceAmount,
          variance,
          varianceHandling,
        },
      };
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

      const where: Prisma.BalanceAccountWhereInput = withTenantWhere(ctx, {
        deletedAt: null,
      } satisfies Prisma.BalanceAccountWhereInput);
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
      const existing = await ctx.db.balanceAccount.findFirst({
        where: withTenantWhere(ctx, {
          code: input.code,
          deletedAt: null,
        } satisfies Prisma.BalanceAccountWhereInput),
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Balance account with code "${input.code}" already exists`,
        });
      }

      const balanceAccount = await ctx.db.balanceAccount.create({
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
          tenantId: getTenantScope(ctx).tenantId,
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

      const existing = await ctx.db.balanceAccount.findFirst({
        where: withTenantWhere(ctx, {
          id: input.id,
          deletedAt: null,
        } satisfies Prisma.BalanceAccountWhereInput),
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
          tenantId: existing.tenantId,
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
