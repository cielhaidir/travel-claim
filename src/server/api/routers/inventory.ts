import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  AuditAction,
  COAType,
  CrmFulfillmentStatus,
  InventoryBucketType,
  InventoryMovementType,
  InventoryReservationStatus,
  JournalSourceType,
  JournalStatus,
  type Prisma,
} from "../../../../generated/prisma";
import { createTRPCRouter, permissionProcedure } from "@/server/api/trpc";
import {
  generateFulfillmentRequestNumber,
  generateJournalEntryNumber,
} from "@/lib/utils/numberGenerators";

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

const decimalNumber = z.coerce.number().finite();

async function ensureInventoryBalance(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string | null;
    itemId: string;
    warehouseId: string;
    bucketType?: InventoryBucketType;
  },
) {
  const bucketType = input.bucketType ?? InventoryBucketType.SALE_STOCK;

  const existing = await tx.inventoryBalance.findFirst({
    where: {
      itemId: input.itemId,
      warehouseId: input.warehouseId,
      bucketType,
    },
  });

  if (existing) {
    return existing;
  }

  return tx.inventoryBalance.create({
    data: {
      tenantId: input.tenantId,
      itemId: input.itemId,
      warehouseId: input.warehouseId,
      bucketType,
      qtyOnHand: 0,
      qtyReserved: 0,
    },
  });
}

export const inventoryRouter = createTRPCRouter({
  listItems: permissionProcedure("inventory", "read")
    .input(
      z.object({
        search: z.string().optional(),
        isActive: z.boolean().optional(),
        isStockTracked: z.boolean().optional(),
        limit: z.number().min(1).max(200).default(100),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where = withTenantWhere(ctx, {
        deletedAt: null,
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.isStockTracked !== undefined
          ? { isStockTracked: input.isStockTracked }
          : {}),
        ...(input.search
          ? {
              OR: [
                { sku: { contains: input.search, mode: "insensitive" as const } },
                { name: { contains: input.search, mode: "insensitive" as const } },
                {
                  category: {
                    contains: input.search,
                    mode: "insensitive" as const,
                  },
                },
              ],
            }
          : {}),
      });

      const items = await ctx.db.inventoryItem.findMany({
        where,
        take: input.limit,
        orderBy: [{ name: "asc" }],
        include: {
          balances: {
            include: {
              warehouse: {
                select: { id: true, code: true, name: true },
              },
            },
            orderBy: [{ warehouse: { name: "asc" } }],
          },
          crmProducts: {
            where: { deletedAt: null },
            select: { id: true, code: true, name: true, type: true },
          },
          inventoryCoa: {
            select: { id: true, code: true, name: true, accountType: true },
          },
          temporaryAssetCoa: {
            select: { id: true, code: true, name: true, accountType: true },
          },
          cogsCoa: {
            select: { id: true, code: true, name: true, accountType: true },
          },
        },
      });

      return { items };
    }),

  getItemById: permissionProcedure("inventory", "read")
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const item = await ctx.db.inventoryItem.findFirst({
        where: withTenantWhere(ctx, { id: input.id, deletedAt: null }),
        include: {
          balances: {
            include: {
              warehouse: {
                select: { id: true, code: true, name: true },
              },
            },
            orderBy: [{ warehouse: { name: "asc" } }],
          },
          crmProducts: {
            where: { deletedAt: null },
            select: {
              id: true,
              code: true,
              name: true,
              type: true,
              isActive: true,
            },
            orderBy: [{ name: "asc" }],
          },
          ledgerEntries: {
            orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
            take: 30,
            include: {
              warehouse: { select: { id: true, code: true, name: true } },
              chartOfAccount: { select: { id: true, code: true, name: true } },
              createdBy: { select: { id: true, name: true, email: true } },
            },
          },
          inventoryCoa: {
            select: { id: true, code: true, name: true, accountType: true },
          },
          temporaryAssetCoa: {
            select: { id: true, code: true, name: true, accountType: true },
          },
          cogsCoa: {
            select: { id: true, code: true, name: true, accountType: true },
          },
          reservations: {
            where: { status: { in: ["ACTIVE", "PARTIAL"] } },
            orderBy: [{ createdAt: "desc" }],
            include: {
              warehouse: { select: { id: true, code: true, name: true } },
              leadLine: {
                select: {
                  id: true,
                  lead: {
                    select: {
                      id: true,
                      company: true,
                      stage: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Inventory item not found",
        });
      }

      const journalSourceIds = [...new Set(
        (item.ledgerEntries ?? [])
          .map((entry) => entry.referenceId)
          .filter((value): value is string => Boolean(value)),
      )];

      const relatedJournals = journalSourceIds.length
        ? await ctx.db.journalEntry.findMany({
            where: withTenantWhere(ctx, {
              sourceId: { in: journalSourceIds },
              status: JournalStatus.POSTED,
            }),
            orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
            take: 20,
            include: {
              lines: {
                orderBy: { lineNumber: "asc" },
                include: {
                  chartOfAccount: {
                    select: { id: true, code: true, name: true },
                  },
                },
              },
              createdBy: { select: { id: true, name: true, email: true } },
            },
          })
        : [];

      return {
        ...item,
        relatedJournals,
      };
    }),

  createItem: permissionProcedure("inventory", "create")
    .input(
      z.object({
        sku: z.string().min(1).max(50),
        name: z.string().min(1).max(200),
        description: z.string().optional(),
        unitOfMeasure: z.string().min(1).max(30),
        category: z.string().max(100).optional(),
        isStockTracked: z.boolean().default(true),
        minStock: decimalNumber.default(0),
        reorderPoint: decimalNumber.default(0),
        standardCost: decimalNumber.optional(),
        inventoryCoaId: z.string().optional(),
        temporaryAssetCoaId: z.string().optional(),
        cogsCoaId: z.string().optional(),
        isActive: z.boolean().default(true),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const scope = getTenantScope(ctx);
      const existing = await ctx.db.inventoryItem.findFirst({
        where: withTenantWhere(ctx, { sku: input.sku }),
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Inventory item with SKU \"${input.sku}\" already exists`,
        });
      }

      const item = await ctx.db.inventoryItem.create({
        data: {
          tenantId: scope.tenantId,
          sku: input.sku,
          name: input.name,
          description: input.description,
          unitOfMeasure: input.unitOfMeasure,
          category: input.category,
          isStockTracked: input.isStockTracked,
          minStock: input.minStock,
          reorderPoint: input.reorderPoint,
          standardCost: input.standardCost,
          inventoryCoaId: input.inventoryCoaId,
          temporaryAssetCoaId: input.temporaryAssetCoaId,
          cogsCoaId: input.cogsCoaId,
          isActive: input.isActive,
        },
      });

      await ctx.db.auditLog.create({
        data: {
          tenantId: item.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.CREATE,
          entityType: "InventoryItem",
          entityId: item.id,
          changes: {
            after: {
              sku: item.sku,
              name: item.name,
              unitOfMeasure: item.unitOfMeasure,
              category: item.category,
              inventoryCoaId: item.inventoryCoaId,
              temporaryAssetCoaId: item.temporaryAssetCoaId,
              cogsCoaId: item.cogsCoaId,
            },
          },
        },
      });

      return item;
    }),

  updateItem: permissionProcedure("inventory", "update")
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        description: z.string().nullable().optional(),
        unitOfMeasure: z.string().min(1).max(30).optional(),
        category: z.string().max(100).nullable().optional(),
        isStockTracked: z.boolean().optional(),
        minStock: decimalNumber.optional(),
        reorderPoint: decimalNumber.optional(),
        standardCost: decimalNumber.nullable().optional(),
        inventoryCoaId: z.string().nullable().optional(),
        temporaryAssetCoaId: z.string().nullable().optional(),
        cogsCoaId: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const current = await ctx.db.inventoryItem.findFirst({
        where: withTenantWhere(ctx, { id: input.id, deletedAt: null }),
      });

      if (!current) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Inventory item not found" });
      }

      const updated = await ctx.db.inventoryItem.update({
        where: { id: current.id },
        data: {
          name: input.name,
          description: input.description === undefined ? undefined : input.description,
          unitOfMeasure: input.unitOfMeasure,
          category: input.category === undefined ? undefined : input.category,
          isStockTracked: input.isStockTracked,
          minStock: input.minStock,
          reorderPoint: input.reorderPoint,
          standardCost: input.standardCost === undefined ? undefined : input.standardCost,
          inventoryCoaId:
            input.inventoryCoaId === undefined ? undefined : input.inventoryCoaId,
          temporaryAssetCoaId:
            input.temporaryAssetCoaId === undefined ? undefined : input.temporaryAssetCoaId,
          cogsCoaId: input.cogsCoaId === undefined ? undefined : input.cogsCoaId,
          isActive: input.isActive,
        },
      });

      await ctx.db.auditLog.create({
        data: {
          tenantId: updated.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "InventoryItem",
          entityId: updated.id,
          changes: {
            before: current,
            after: updated,
          },
        },
      });

      return updated;
    }),

  listWarehouses: permissionProcedure("inventory", "read")
    .input(
      z.object({
        search: z.string().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const warehouses = await ctx.db.warehouse.findMany({
        where: withTenantWhere(ctx, {
          deletedAt: null,
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.search
            ? {
                OR: [
                  { code: { contains: input.search, mode: "insensitive" as const } },
                  { name: { contains: input.search, mode: "insensitive" as const } },
                ],
              }
            : {}),
        }),
        include: {
          balances: {
            select: {
              id: true,
              bucketType: true,
              qtyOnHand: true,
              qtyReserved: true,
              item: { select: { id: true, sku: true, name: true } },
            },
          },
        },
        orderBy: [{ name: "asc" }],
      });

      return { warehouses };
    }),

  listCoaOptions: permissionProcedure("inventory", "read")
    .input(
      z.object({
        accountType: z.nativeEnum(COAType).optional(),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const accounts = await ctx.db.chartOfAccount.findMany({
        where: withTenantWhere(ctx, {
          isActive: true,
          ...(input.accountType ? { accountType: input.accountType } : {}),
        }),
        select: {
          id: true,
          code: true,
          name: true,
          accountType: true,
          category: true,
          subcategory: true,
        },
        orderBy: [{ code: "asc" }],
      });

      return { accounts };
    }),

  createWarehouse: permissionProcedure("inventory", "create")
    .input(
      z.object({
        code: z.string().min(1).max(30),
        name: z.string().min(1).max(150),
        description: z.string().optional(),
        isActive: z.boolean().default(true),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const scope = getTenantScope(ctx);
      const existing = await ctx.db.warehouse.findFirst({
        where: withTenantWhere(ctx, { code: input.code }),
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Warehouse with code \"${input.code}\" already exists`,
        });
      }

      const warehouse = await ctx.db.warehouse.create({
        data: {
          tenantId: scope.tenantId,
          code: input.code,
          name: input.name,
          description: input.description,
          isActive: input.isActive,
        },
      });

      await ctx.db.auditLog.create({
        data: {
          tenantId: warehouse.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.CREATE,
          entityType: "Warehouse",
          entityId: warehouse.id,
          changes: { after: warehouse },
        },
      });

      return warehouse;
    }),

  stockOverview: permissionProcedure("inventory", "read")
    .input(
      z.object({
        warehouseId: z.string().optional(),
        itemId: z.string().optional(),
        lowStockOnly: z.boolean().default(false),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const balances = await ctx.db.inventoryBalance.findMany({
        where: withTenantWhere(ctx, {
          ...(input.warehouseId ? { warehouseId: input.warehouseId } : {}),
          ...(input.itemId ? { itemId: input.itemId } : {}),
        }),
        include: {
          item: {
            select: {
              id: true,
              sku: true,
              name: true,
              unitOfMeasure: true,
              minStock: true,
              reorderPoint: true,
              isActive: true,
              inventoryCoa: {
                select: { id: true, code: true, name: true },
              },
              temporaryAssetCoa: {
                select: { id: true, code: true, name: true },
              },
              cogsCoa: {
                select: { id: true, code: true, name: true },
              },
            },
          },
          warehouse: {
            select: { id: true, code: true, name: true },
          },
        },
        orderBy: [{ item: { name: "asc" } }, { warehouse: { name: "asc" } }],
      });

      const rows = input.lowStockOnly
        ? balances.filter((balance) => Number(balance.qtyOnHand) <= Number(balance.item.reorderPoint ?? 0))
        : balances;

      return { balances: rows };
    }),

  reclassifyTemporaryAssetToSaleStock: permissionProcedure("inventory", "update")
    .input(
      z.object({
        itemId: z.string(),
        warehouseId: z.string(),
        quantity: decimalNumber.positive(),
        movementDate: z.coerce.date().optional(),
        referenceType: z.string().max(50).optional(),
        referenceId: z.string().max(100).optional(),
        notes: z.string().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const scope = getTenantScope(ctx);

      const item = await ctx.db.inventoryItem.findFirst({
        where: withTenantWhere(ctx, { id: input.itemId, deletedAt: null }),
      });
      if (!item) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Inventory item not found" });
      }

      const warehouse = await ctx.db.warehouse.findFirst({
        where: withTenantWhere(ctx, { id: input.warehouseId, deletedAt: null }),
      });
      if (!warehouse) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Warehouse not found" });
      }

      const result = await ctx.db.$transaction(async (tx) => {
        const tempAssetBalance = await ensureInventoryBalance(tx, {
          tenantId: scope.tenantId,
          itemId: item.id,
          warehouseId: warehouse.id,
          bucketType: InventoryBucketType.TEMP_ASSET,
        });

        const saleStockBalance = await ensureInventoryBalance(tx, {
          tenantId: scope.tenantId,
          itemId: item.id,
          warehouseId: warehouse.id,
          bucketType: InventoryBucketType.SALE_STOCK,
        });

        const availableTempAsset =
          Number(tempAssetBalance.qtyOnHand ?? 0) - Number(tempAssetBalance.qtyReserved ?? 0);

        if (availableTempAsset < input.quantity) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Saldo temporary asset tidak mencukupi untuk reklasifikasi",
          });
        }

        const tempBefore = Number(tempAssetBalance.qtyOnHand ?? 0);
        const tempAfter = tempBefore - input.quantity;
        const saleBefore = Number(saleStockBalance.qtyOnHand ?? 0);
        const saleAfter = saleBefore + input.quantity;

        const updatedTempAssetBalance = await tx.inventoryBalance.update({
          where: { id: tempAssetBalance.id },
          data: { qtyOnHand: tempAfter },
        });

        const updatedSaleStockBalance = await tx.inventoryBalance.update({
          where: { id: saleStockBalance.id },
          data: { qtyOnHand: saleAfter },
        });

        const commonReferenceType = input.referenceType ?? "InventoryReclassification";
        const commonReferenceId =
          input.referenceId ?? `${item.id}:${warehouse.id}:${Date.now()}`;
        const unitCost = item.standardCost ?? undefined;
        const totalCost = item.standardCost
          ? Number(item.standardCost) * input.quantity
          : undefined;

        const transferOutLedger = await tx.inventoryLedgerEntry.create({
          data: {
            tenantId: scope.tenantId,
            itemId: item.id,
            warehouseId: warehouse.id,
            bucketType: InventoryBucketType.TEMP_ASSET,
            movementType: InventoryMovementType.TRANSFER_OUT,
            referenceType: commonReferenceType,
            referenceId: commonReferenceId,
            chartOfAccountId: item.temporaryAssetCoaId ?? undefined,
            quantityBefore: tempBefore,
            quantityChange: -input.quantity,
            quantityAfter: tempAfter,
            unitCost,
            totalCost,
            notes:
              input.notes ??
              `Reclassified ${input.quantity} from temporary asset to sale stock`,
            movementDate: input.movementDate,
            createdById: ctx.session.user.id,
          },
        });

        const transferInLedger = await tx.inventoryLedgerEntry.create({
          data: {
            tenantId: scope.tenantId,
            itemId: item.id,
            warehouseId: warehouse.id,
            bucketType: InventoryBucketType.SALE_STOCK,
            movementType: InventoryMovementType.TRANSFER_IN,
            referenceType: commonReferenceType,
            referenceId: commonReferenceId,
            chartOfAccountId: item.inventoryCoaId ?? undefined,
            quantityBefore: saleBefore,
            quantityChange: input.quantity,
            quantityAfter: saleAfter,
            unitCost,
            totalCost,
            notes:
              input.notes ??
              `Reclassified ${input.quantity} from temporary asset to sale stock`,
            movementDate: input.movementDate,
            createdById: ctx.session.user.id,
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId: scope.tenantId,
            userId: ctx.session.user.id,
            action: AuditAction.UPDATE,
            entityType: "InventoryReclassification",
            entityId: transferInLedger.id,
            changes: {
              after: {
                itemId: item.id,
                warehouseId: warehouse.id,
                quantity: input.quantity,
                fromBucketType: InventoryBucketType.TEMP_ASSET,
                toBucketType: InventoryBucketType.SALE_STOCK,
                referenceType: commonReferenceType,
                referenceId: commonReferenceId,
              },
            },
          },
        });

        return {
          tempAssetBalance: updatedTempAssetBalance,
          saleStockBalance: updatedSaleStockBalance,
          ledgers: [transferOutLedger, transferInLedger],
        };
      });

      return result;
    }),

  fulfillmentSummary: permissionProcedure("inventory", "read")
    .input(z.object({}).optional())
    .output(z.any())
    .query(async ({ ctx }) => {
      const [requests, reservationCounts] = await Promise.all([
        ctx.db.crmFulfillmentRequest.groupBy({
          by: ["status"],
          where: withTenantWhere(ctx, {}),
          _count: { _all: true },
        }),
        ctx.db.inventoryReservation.groupBy({
          by: ["status"],
          where: withTenantWhere(ctx, {}),
          _count: { _all: true },
        }),
      ]);

      const requestMap = new Map<string, number>();
      for (const row of requests) {
        requestMap.set(row.status, row._count._all);
      }

      const reservationMap = new Map<string, number>();
      for (const row of reservationCounts) {
        reservationMap.set(row.status, row._count._all);
      }

      return {
        requests: {
          draft: requestMap.get(CrmFulfillmentStatus.DRAFT) ?? 0,
          reserved: requestMap.get(CrmFulfillmentStatus.RESERVED) ?? 0,
          partial: requestMap.get(CrmFulfillmentStatus.PARTIAL) ?? 0,
          ready: requestMap.get(CrmFulfillmentStatus.READY) ?? 0,
          delivered: requestMap.get(CrmFulfillmentStatus.DELIVERED) ?? 0,
          canceled: requestMap.get(CrmFulfillmentStatus.CANCELED) ?? 0,
        },
        reservations: {
          active: reservationMap.get(InventoryReservationStatus.ACTIVE) ?? 0,
          partial: reservationMap.get(InventoryReservationStatus.PARTIAL) ?? 0,
          fulfilled: reservationMap.get(InventoryReservationStatus.FULFILLED) ?? 0,
          released: reservationMap.get(InventoryReservationStatus.RELEASED) ?? 0,
          canceled: reservationMap.get(InventoryReservationStatus.CANCELED) ?? 0,
        },
      };
    }),

  listFulfillmentRequests: permissionProcedure("inventory", "read")
    .input(
      z.object({
        status: z.nativeEnum(CrmFulfillmentStatus).optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(200).default(100),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const requests = await ctx.db.crmFulfillmentRequest.findMany({
        where: withTenantWhere(ctx, {
          ...(input.status ? { status: input.status } : {}),
          ...(input.search
            ? {
                OR: [
                  { requestNumber: { contains: input.search, mode: "insensitive" as const } },
                  { lead: { company: { contains: input.search, mode: "insensitive" as const } } },
                  { customer: { company: { contains: input.search, mode: "insensitive" as const } } },
                ],
              }
            : {}),
        }),
        take: input.limit,
        orderBy: [{ createdAt: "desc" }],
        include: {
          lead: { select: { id: true, company: true, stage: true } },
          customer: { select: { id: true, company: true } },
          lines: {
            include: {
              inventoryItem: {
                select: { id: true, sku: true, name: true, unitOfMeasure: true },
              },
              warehouse: {
                select: { id: true, code: true, name: true },
              },
            },
          },
        },
      });

      const cogsJournals = requests.length
        ? await ctx.db.journalEntry.findMany({
            where: withTenantWhere(ctx, {
              sourceId: { in: requests.map((request) => request.id) },
              referenceNumber: { in: requests.map((request) => request.requestNumber) },
              status: JournalStatus.POSTED,
            }),
            select: {
              id: true,
              journalNumber: true,
              sourceId: true,
              referenceNumber: true,
              transactionDate: true,
              description: true,
              lines: {
                orderBy: { lineNumber: "asc" },
                select: {
                  id: true,
                  description: true,
                  debitAmount: true,
                  creditAmount: true,
                  lineNumber: true,
                  chartOfAccount: {
                    select: { id: true, code: true, name: true },
                  },
                },
              },
            },
            orderBy: [{ createdAt: "desc" }],
          })
        : [];

      const cogsJournalMap = new Map<string, (typeof cogsJournals)[number]>();
      for (const journal of cogsJournals) {
        if (journal.sourceId && !cogsJournalMap.has(journal.sourceId)) {
          cogsJournalMap.set(journal.sourceId, journal);
        }
      }

      return {
        requests: requests.map((request) => ({
          ...request,
          cogsJournal: cogsJournalMap.get(request.id) ?? null,
        })),
      };
    }),

  createStockReceipt: permissionProcedure("inventory", "create")
    .input(
      z.object({
        itemId: z.string(),
        warehouseId: z.string(),
        saleQuantity: decimalNumber.min(0).default(0),
        temporaryAssetQuantity: decimalNumber.min(0).default(0),
        unitCost: decimalNumber.min(0).optional(),
        movementDate: z.coerce.date().optional(),
        referenceType: z.string().max(50).optional(),
        referenceId: z.string().max(100).optional(),
        notes: z.string().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const scope = getTenantScope(ctx);

      const item = await ctx.db.inventoryItem.findFirst({
        where: withTenantWhere(ctx, { id: input.itemId, deletedAt: null }),
      });
      if (!item) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Inventory item not found" });
      }

      const warehouse = await ctx.db.warehouse.findFirst({
        where: withTenantWhere(ctx, { id: input.warehouseId, deletedAt: null }),
      });
      if (!warehouse) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Warehouse not found" });
      }

      const saleQuantity = Number(input.saleQuantity ?? 0);
      const temporaryAssetQuantity = Number(input.temporaryAssetQuantity ?? 0);
      const totalQuantity = saleQuantity + temporaryAssetQuantity;

      if (totalQuantity <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Minimal salah satu alokasi quantity harus lebih dari 0",
        });
      }

      const result = await ctx.db.$transaction(async (tx) => {
        const allocations = [
          {
            bucketType: InventoryBucketType.SALE_STOCK,
            quantity: saleQuantity,
            chartOfAccountId: item.inventoryCoaId ?? undefined,
            noteLabel: "sale stock",
          },
          {
            bucketType: InventoryBucketType.TEMP_ASSET,
            quantity: temporaryAssetQuantity,
            chartOfAccountId: item.temporaryAssetCoaId ?? undefined,
            noteLabel: "temporary asset",
          },
        ].filter((entry) => entry.quantity > 0);

        const balances = [] as Array<unknown>;
        const ledgers = [] as Array<unknown>;

        for (const allocation of allocations) {
          const balance = await ensureInventoryBalance(tx, {
            tenantId: scope.tenantId,
            itemId: item.id,
            warehouseId: warehouse.id,
            bucketType: allocation.bucketType,
          });

          const beforeQty = Number(balance.qtyOnHand ?? 0);
          const afterQty = beforeQty + allocation.quantity;

          const updatedBalance = await tx.inventoryBalance.update({
            where: { id: balance.id },
            data: {
              qtyOnHand: afterQty,
            },
          });

          const ledger = await tx.inventoryLedgerEntry.create({
            data: {
              tenantId: scope.tenantId,
              itemId: item.id,
              warehouseId: warehouse.id,
              bucketType: allocation.bucketType,
              movementType: InventoryMovementType.RECEIPT,
              referenceType: input.referenceType,
              referenceId: input.referenceId,
              chartOfAccountId: allocation.chartOfAccountId,
              quantityBefore: beforeQty,
              quantityChange: allocation.quantity,
              quantityAfter: afterQty,
              unitCost: input.unitCost,
              totalCost:
                input.unitCost !== undefined
                  ? input.unitCost * allocation.quantity
                  : undefined,
              notes:
                input.notes ??
                `Manual receipt ${allocation.noteLabel} for ${item.sku}`,
              movementDate: input.movementDate,
              createdById: ctx.session.user.id,
            },
          });

          balances.push(updatedBalance);
          ledgers.push(ledger);
        }

        if (input.unitCost !== undefined) {
          await tx.inventoryItem.update({
            where: { id: item.id },
            data: { standardCost: input.unitCost },
          });
        }

        await tx.auditLog.create({
          data: {
            tenantId: scope.tenantId,
            userId: ctx.session.user.id,
            action: AuditAction.CREATE,
            entityType: "InventoryStockReceipt",
            entityId: item.id,
            changes: {
              after: {
                itemId: item.id,
                warehouseId: warehouse.id,
                saleQuantity,
                temporaryAssetQuantity,
                totalQuantity,
              },
            },
          },
        });

        return { balances, ledgers };
      });

      return result;
    }),

  deliverFulfillmentRequest: permissionProcedure("inventory", "update")
    .input(
      z.object({
        fulfillmentRequestId: z.string(),
        deliveredAt: z.coerce.date().optional(),
        notes: z.string().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const scope = getTenantScope(ctx);

      const result = await ctx.db.$transaction(async (tx) => {
        const request = await tx.crmFulfillmentRequest.findFirst({
          where: withTenantWhere(ctx, { id: input.fulfillmentRequestId }),
          include: {
            lines: true,
            lead: { select: { id: true } },
          },
        });

        if (!request) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Fulfillment request not found" });
        }

        if (request.status === CrmFulfillmentStatus.DELIVERED) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Fulfillment request already delivered" });
        }

        const cogsPostingMap = new Map<
          string,
          {
            cogsCoaId: string;
            inventoryCoaId: string;
            amount: number;
            itemName: string;
          }
        >();

        for (const line of request.lines) {
          const reservations = await tx.inventoryReservation.findMany({
            where: withTenantWhere(ctx, {
              sourceType: "FULFILLMENT_REQUEST",
              sourceId: request.id,
              itemId: line.inventoryItemId,
              ...(line.warehouseId ? { warehouseId: line.warehouseId } : {}),
              status: { in: [InventoryReservationStatus.ACTIVE, InventoryReservationStatus.PARTIAL] },
            }),
            orderBy: [{ createdAt: "asc" }],
          });

          let qtyToDeliver = Number(line.qtyReserved ?? 0);
          if (qtyToDeliver <= 0) {
            continue;
          }

          const item = await tx.inventoryItem.findFirst({
            where: withTenantWhere(ctx, { id: line.inventoryItemId, deletedAt: null }),
          });
          if (!item) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Inventory item not found for fulfillment delivery" });
          }

          for (const reservation of reservations) {
            if (qtyToDeliver <= 0) break;

            if (!reservation.warehouseId) continue;

            const balance = await ensureInventoryBalance(tx, {
              tenantId: scope.tenantId,
              itemId: reservation.itemId,
              warehouseId: reservation.warehouseId,
            });

            const remainingReserved = Number(reservation.qtyReserved ?? 0) - Number(reservation.qtyFulfilled ?? 0) - Number(reservation.qtyReleased ?? 0);
            if (remainingReserved <= 0) continue;

            const issueQty = Math.min(remainingReserved, qtyToDeliver);
            const beforeQty = Number(balance.qtyOnHand ?? 0);
            const beforeReserved = Number(balance.qtyReserved ?? 0);

            if (beforeQty < issueQty || beforeReserved < issueQty) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Insufficient on-hand or reserved quantity to deliver fulfillment request",
              });
            }

            const afterQty = beforeQty - issueQty;
            const afterReserved = beforeReserved - issueQty;

            await tx.inventoryBalance.update({
              where: { id: balance.id },
              data: {
                qtyOnHand: afterQty,
                qtyReserved: afterReserved,
              },
            });

            await tx.inventoryReservation.update({
              where: { id: reservation.id },
              data: {
                qtyFulfilled: Number(reservation.qtyFulfilled ?? 0) + issueQty,
                status:
                  Number(reservation.qtyFulfilled ?? 0) + issueQty >= Number(reservation.qtyReserved ?? 0)
                    ? InventoryReservationStatus.FULFILLED
                    : InventoryReservationStatus.PARTIAL,
              },
            });

            const issueTotalCost = item.standardCost
              ? Number(item.standardCost) * issueQty
              : undefined;

            await tx.inventoryLedgerEntry.create({
              data: {
                tenantId: scope.tenantId,
                itemId: reservation.itemId,
                warehouseId: reservation.warehouseId,
                bucketType: InventoryBucketType.SALE_STOCK,
                movementType: InventoryMovementType.ISSUE,
                referenceType: "CrmFulfillmentRequest",
                referenceId: request.id,
                chartOfAccountId: item.inventoryCoaId ?? undefined,
                quantityBefore: beforeQty,
                quantityChange: -issueQty,
                quantityAfter: afterQty,
                unitCost: item.standardCost ?? undefined,
                totalCost: issueTotalCost,
                notes: input.notes ?? `Delivered ${issueQty} units for ${request.requestNumber}`,
                movementDate: input.deliveredAt,
                createdById: ctx.session.user.id,
              },
            });

            if (
              issueTotalCost !== undefined &&
              issueTotalCost > 0 &&
              item.inventoryCoaId &&
              item.cogsCoaId
            ) {
              const postingKey = `${item.cogsCoaId}:${item.inventoryCoaId}`;
              const currentPosting = cogsPostingMap.get(postingKey);
              cogsPostingMap.set(postingKey, {
                cogsCoaId: item.cogsCoaId,
                inventoryCoaId: item.inventoryCoaId,
                amount: (currentPosting?.amount ?? 0) + issueTotalCost,
                itemName: item.name,
              });
            }

            await tx.crmFulfillmentRequestLine.update({
              where: { id: line.id },
              data: {
                qtyDelivered: Number(line.qtyDelivered ?? 0) + issueQty,
                qtyReserved: Math.max(Number(line.qtyReserved ?? 0) - issueQty, 0),
              },
            });

            qtyToDeliver -= issueQty;
          }
        }

        let cogsJournal: Awaited<ReturnType<typeof tx.journalEntry.create>> | null = null;

        if (cogsPostingMap.size > 0) {
          const journalNumber = await generateJournalEntryNumber(
            tx as unknown as Prisma.DefaultPrismaClient,
            scope.tenantId,
          );
          const postingEntries = [...cogsPostingMap.values()];

          cogsJournal = await tx.journalEntry.create({
            data: {
              tenantId: scope.tenantId,
              journalNumber,
              transactionDate: input.deliveredAt ?? new Date(),
              description: `COGS posting for ${request.requestNumber}`,
              sourceType: JournalSourceType.MANUAL,
              sourceId: request.id,
              referenceNumber: request.requestNumber,
              notes: input.notes ?? `Automatic COGS journal for fulfillment ${request.requestNumber}`,
              status: JournalStatus.POSTED,
              createdById: ctx.session.user.id,
              postedById: ctx.session.user.id,
              postedAt: new Date(),
              lines: {
                create: postingEntries.flatMap((entry, index) => [
                  {
                    chartOfAccountId: entry.cogsCoaId,
                    description: `COGS - ${entry.itemName}`,
                    debitAmount: entry.amount,
                    creditAmount: 0,
                    lineNumber: index * 2 + 1,
                  },
                  {
                    chartOfAccountId: entry.inventoryCoaId,
                    description: `Inventory reduction - ${entry.itemName}`,
                    debitAmount: 0,
                    creditAmount: entry.amount,
                    lineNumber: index * 2 + 2,
                  },
                ]),
              },
            },
            include: {
              lines: {
                orderBy: { lineNumber: "asc" },
                include: {
                  chartOfAccount: { select: { id: true, code: true, name: true } },
                },
              },
            },
          });
        }

        const refreshed = await tx.crmFulfillmentRequest.findFirst({
          where: { id: request.id },
          include: {
            lines: {
              include: {
                inventoryItem: {
                  select: { id: true, sku: true, name: true, unitOfMeasure: true },
                },
                warehouse: {
                  select: { id: true, code: true, name: true },
                },
              },
            },
            lead: { select: { id: true, company: true, stage: true } },
            customer: { select: { id: true, company: true } },
          },
        });

        if (!refreshed) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Fulfillment request not found after delivery" });
        }

        const fullyDelivered = refreshed.lines.every(
          (line) => Number(line.qtyDelivered ?? 0) >= Number(line.qtyRequested ?? 0),
        );
        const hasDelivered = refreshed.lines.some(
          (line) => Number(line.qtyDelivered ?? 0) > 0,
        );

        const nextStatus = fullyDelivered
          ? CrmFulfillmentStatus.DELIVERED
          : hasDelivered
            ? CrmFulfillmentStatus.PARTIAL
            : refreshed.status;

        const finalized = await tx.crmFulfillmentRequest.update({
          where: { id: request.id },
          data: {
            status: nextStatus,
            deliveredAt: fullyDelivered ? input.deliveredAt ?? new Date() : undefined,
          },
          include: {
            lines: {
              include: {
                inventoryItem: {
                  select: { id: true, sku: true, name: true, unitOfMeasure: true },
                },
                warehouse: {
                  select: { id: true, code: true, name: true },
                },
              },
            },
            lead: { select: { id: true, company: true, stage: true } },
            customer: { select: { id: true, company: true } },
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId: scope.tenantId,
            userId: ctx.session.user.id,
            action: AuditAction.UPDATE,
            entityType: "CrmFulfillmentDelivery",
            entityId: request.id,
            changes: {
              after: {
                status: nextStatus,
                deliveredAt: finalized.deliveredAt,
                cogsJournalId: cogsJournal?.id,
                cogsJournalNumber: cogsJournal?.journalNumber,
              },
            },
          },
        });

        return {
          ...finalized,
          cogsJournal,
        };
      });

      return result;
    }),

  cancelFulfillmentRequest: permissionProcedure("inventory", "update")
    .input(
      z.object({
        fulfillmentRequestId: z.string(),
        notes: z.string().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const scope = getTenantScope(ctx);

      const result = await ctx.db.$transaction(async (tx) => {
        const request = await tx.crmFulfillmentRequest.findFirst({
          where: withTenantWhere(ctx, { id: input.fulfillmentRequestId }),
          include: {
            lines: true,
            lead: { select: { id: true } },
          },
        });

        if (!request) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Fulfillment request not found" });
        }

        if (request.status === CrmFulfillmentStatus.DELIVERED) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Delivered fulfillment request cannot be canceled",
          });
        }

        if (request.status === CrmFulfillmentStatus.CANCELED) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Fulfillment request already canceled",
          });
        }

        for (const line of request.lines) {
          const reservations = await tx.inventoryReservation.findMany({
            where: withTenantWhere(ctx, {
              sourceType: "FULFILLMENT_REQUEST",
              sourceId: request.id,
              itemId: line.inventoryItemId,
              ...(line.warehouseId ? { warehouseId: line.warehouseId } : {}),
              status: { in: [InventoryReservationStatus.ACTIVE, InventoryReservationStatus.PARTIAL] },
            }),
            orderBy: [{ createdAt: "asc" }],
          });

          let releasedForLine = 0;

          for (const reservation of reservations) {
            const remainingReserved =
              Number(reservation.qtyReserved ?? 0) -
              Number(reservation.qtyFulfilled ?? 0) -
              Number(reservation.qtyReleased ?? 0);

            if (remainingReserved <= 0 || !reservation.warehouseId) continue;

            const balance = await ensureInventoryBalance(tx, {
              tenantId: scope.tenantId,
              itemId: reservation.itemId,
              warehouseId: reservation.warehouseId,
            });

            const beforeReserved = Number(balance.qtyReserved ?? 0);
            const afterReserved = Math.max(beforeReserved - remainingReserved, 0);

            await tx.inventoryBalance.update({
              where: { id: balance.id },
              data: { qtyReserved: afterReserved },
            });

            await tx.inventoryReservation.update({
              where: { id: reservation.id },
              data: {
                qtyReleased: Number(reservation.qtyReleased ?? 0) + remainingReserved,
                status: InventoryReservationStatus.RELEASED,
              },
            });

            const item = await tx.inventoryItem.findFirst({
              where: withTenantWhere(ctx, { id: reservation.itemId, deletedAt: null }),
            });

            await tx.inventoryLedgerEntry.create({
              data: {
                tenantId: scope.tenantId,
                itemId: reservation.itemId,
                warehouseId: reservation.warehouseId,
                movementType: InventoryMovementType.RELEASE,
                referenceType: "CrmFulfillmentRequest",
                referenceId: request.id,
                quantityBefore: Number(balance.qtyOnHand ?? 0),
                quantityChange: 0,
                quantityAfter: Number(balance.qtyOnHand ?? 0),
                unitCost: item?.standardCost ?? undefined,
                totalCost: undefined,
                notes: input.notes ?? `Released ${remainingReserved} units for ${request.requestNumber}`,
                createdById: ctx.session.user.id,
              },
            });

            releasedForLine += remainingReserved;
          }

          if (releasedForLine > 0) {
            await tx.crmFulfillmentRequestLine.update({
              where: { id: line.id },
              data: {
                qtyReserved: Math.max(Number(line.qtyReserved ?? 0) - releasedForLine, 0),
              },
            });
          }
        }

        const finalized = await tx.crmFulfillmentRequest.update({
          where: { id: request.id },
          data: { status: CrmFulfillmentStatus.CANCELED, canceledAt: new Date() },
          include: {
            lines: {
              include: {
                inventoryItem: {
                  select: { id: true, sku: true, name: true, unitOfMeasure: true },
                },
                warehouse: {
                  select: { id: true, code: true, name: true },
                },
              },
            },
            lead: { select: { id: true, company: true, stage: true } },
            customer: { select: { id: true, company: true } },
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId: scope.tenantId,
            userId: ctx.session.user.id,
            action: AuditAction.UPDATE,
            entityType: "CrmFulfillmentCancellation",
            entityId: request.id,
            changes: {
              after: {
                status: CrmFulfillmentStatus.CANCELED,
                canceledAt: new Date(),
              },
            },
          },
        });

        return finalized;
      });

      return result;
    }),

  createFulfillmentRequest: permissionProcedure("inventory", "create")
    .input(
      z.object({
        leadId: z.string(),
        customerId: z.string().optional(),
        requestNumber: z.string().min(1).max(50).optional(),
        requestedDate: z.coerce.date().optional(),
        notes: z.string().optional(),
        lines: z.array(
          z.object({
            leadLineId: z.string().optional(),
            inventoryItemId: z.string(),
            warehouseId: z.string().optional(),
            qtyRequested: decimalNumber.positive(),
          }),
        ).min(1),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const scope = getTenantScope(ctx);
      const lead = await ctx.db.crmLead.findFirst({
        where: withTenantWhere(ctx, { id: input.leadId, deletedAt: null }),
        include: { customer: { select: { id: true } } },
      });

      if (!lead) {
        throw new TRPCError({ code: "NOT_FOUND", message: "CRM lead not found" });
      }

      const requestNumber = input.requestNumber ?? await generateFulfillmentRequestNumber(ctx.db, scope.tenantId);

      const existing = await ctx.db.crmFulfillmentRequest.findFirst({
        where: withTenantWhere(ctx, { requestNumber }),
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Fulfillment request \"${requestNumber}\" already exists`,
        });
      }

      const activeStatuses = [
        CrmFulfillmentStatus.DRAFT,
        CrmFulfillmentStatus.RESERVED,
        CrmFulfillmentStatus.PARTIAL,
        CrmFulfillmentStatus.READY,
      ];

      const activeRequest = await ctx.db.crmFulfillmentRequest.findFirst({
        where: withTenantWhere(ctx, {
          leadId: lead.id,
          status: { in: activeStatuses },
        }),
        select: { id: true, requestNumber: true, status: true },
      });

      if (activeRequest) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Lead already has active fulfillment request ${activeRequest.requestNumber} (${activeRequest.status})`,
        });
      }

      const incomingLeadLineIds = input.lines
        .map((line) => line.leadLineId)
        .filter((value): value is string => Boolean(value));

      if (incomingLeadLineIds.length > 0) {
        const duplicateLine = await ctx.db.crmFulfillmentRequestLine.findFirst({
          where: {
            leadLineId: { in: incomingLeadLineIds },
            fulfillmentRequest: {
              is: withTenantWhere(ctx, {
                status: { in: activeStatuses },
              }),
            },
          },
          include: {
            fulfillmentRequest: {
              select: { requestNumber: true, status: true },
            },
          },
        });

        if (duplicateLine) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `A selected line is already included in active fulfillment request ${duplicateLine.fulfillmentRequest.requestNumber} (${duplicateLine.fulfillmentRequest.status})`,
          });
        }
      }

      const request = await ctx.db.$transaction(async (tx) => {
        const createdRequest = await tx.crmFulfillmentRequest.create({
          data: {
            tenantId: scope.tenantId,
            leadId: lead.id,
            customerId: input.customerId ?? lead.customer?.id,
            requestNumber,
            requestedDate: input.requestedDate,
            notes: input.notes,
            status: CrmFulfillmentStatus.DRAFT,
            lines: {
              create: input.lines.map((line) => ({
                tenantId: scope.tenantId,
                leadLineId: line.leadLineId,
                inventoryItemId: line.inventoryItemId,
                warehouseId: line.warehouseId,
                qtyRequested: line.qtyRequested,
              })),
            },
          },
          include: {
            lines: true,
            lead: { select: { id: true, company: true, stage: true } },
            customer: { select: { id: true, company: true } },
          },
        });

        let hasAnyReservation = false;
        let fullyReserved = true;

        for (const line of createdRequest.lines) {
          const item = await tx.inventoryItem.findFirst({
            where: withTenantWhere(ctx, { id: line.inventoryItemId, deletedAt: null }),
          });
          if (!item) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Inventory item not found for fulfillment line",
            });
          }

          const candidateBalances = await tx.inventoryBalance.findMany({
            where: withTenantWhere(ctx, {
              itemId: line.inventoryItemId,
              bucketType: InventoryBucketType.SALE_STOCK,
              ...(line.warehouseId ? { warehouseId: line.warehouseId } : {}),
            }),
            orderBy: [{ qtyOnHand: "desc" }],
            include: {
              warehouse: { select: { id: true, code: true, name: true } },
            },
          });

          const requestedQty = Number(line.qtyRequested ?? 0);
          let qtyToReserve = requestedQty;
          let reservedForLine = 0;

          for (const balance of candidateBalances) {
            if (qtyToReserve <= 0) break;

            const available = Number(balance.qtyOnHand ?? 0) - Number(balance.qtyReserved ?? 0);
            if (available <= 0) continue;

            const reserveQty = Math.min(available, qtyToReserve);
            const nextReserved = Number(balance.qtyReserved ?? 0) + reserveQty;

            await tx.inventoryBalance.update({
              where: { id: balance.id },
              data: { qtyReserved: nextReserved },
            });

            await tx.inventoryReservation.create({
              data: {
                tenantId: scope.tenantId,
                itemId: line.inventoryItemId,
                warehouseId: balance.warehouseId,
                leadLineId: line.leadLineId,
                sourceType: "FULFILLMENT_REQUEST",
                sourceId: createdRequest.id,
                qtyReserved: reserveQty,
                qtyFulfilled: 0,
                qtyReleased: 0,
                status:
                  reserveQty === requestedQty
                    ? InventoryReservationStatus.ACTIVE
                    : InventoryReservationStatus.PARTIAL,
              },
            });

            await tx.inventoryLedgerEntry.create({
              data: {
                tenantId: scope.tenantId,
                itemId: line.inventoryItemId,
                warehouseId: balance.warehouseId,
                movementType: InventoryMovementType.RESERVATION,
                referenceType: "CrmFulfillmentRequest",
                referenceId: createdRequest.id,
                quantityBefore: Number(balance.qtyOnHand ?? 0),
                quantityChange: 0,
                quantityAfter: Number(balance.qtyOnHand ?? 0),
                unitCost: item.standardCost ?? undefined,
                totalCost: undefined,
                notes: `Reserved ${reserveQty} units for ${createdRequest.requestNumber}`,
                movementDate: createdRequest.requestedDate,
                createdById: ctx.session.user.id,
              },
            });

            reservedForLine += reserveQty;
            qtyToReserve -= reserveQty;
            hasAnyReservation = true;
          }

          await tx.crmFulfillmentRequestLine.update({
            where: { id: line.id },
            data: {
              qtyReserved: reservedForLine,
              warehouseId:
                line.warehouseId ?? candidateBalances.find((b) => Number(b.qtyOnHand ?? 0) - Number(b.qtyReserved ?? 0) >= 0)?.warehouseId ?? line.warehouseId,
            },
          });

          if (reservedForLine < requestedQty) {
            fullyReserved = false;
          }
        }

        const nextStatus = fullyReserved
          ? CrmFulfillmentStatus.RESERVED
          : hasAnyReservation
            ? CrmFulfillmentStatus.PARTIAL
            : CrmFulfillmentStatus.DRAFT;

        const finalizedRequest = await tx.crmFulfillmentRequest.update({
          where: { id: createdRequest.id },
          data: { status: nextStatus },
          include: {
            lines: {
              include: {
                inventoryItem: {
                  select: { id: true, sku: true, name: true, unitOfMeasure: true },
                },
                warehouse: {
                  select: { id: true, code: true, name: true },
                },
              },
            },
            lead: { select: { id: true, company: true, stage: true } },
            customer: { select: { id: true, company: true } },
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId: finalizedRequest.tenantId,
            userId: ctx.session.user.id,
            action: AuditAction.CREATE,
            entityType: "CrmFulfillmentRequest",
            entityId: finalizedRequest.id,
            changes: {
              after: {
                requestNumber: finalizedRequest.requestNumber,
                status: finalizedRequest.status,
              },
            },
          },
        });

        return finalizedRequest;
      });

      return request;
    }),
});
