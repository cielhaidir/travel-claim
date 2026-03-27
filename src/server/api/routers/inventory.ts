import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  AuditAction,
  COAType,
  CrmFulfillmentStatus,
  InventoryBucketType,
  InventoryMovementType,
  InventoryReservationStatus,
  InventoryTrackingMode,
  InventoryUnitCondition,
  InventoryUnitStatus,
  InventoryUsageType,
  JournalSourceType,
  JournalStatus,
  type Prisma,
} from "../../../../generated/prisma";
import { createTRPCRouter, permissionProcedure } from "@/server/api/trpc";
import {
  generateFulfillmentRequestNumber,
  generateJournalEntryNumber,
} from "@/lib/utils/numberGenerators";

function withInventoryWhere<T extends Record<string, unknown>>(where: T): T {
  return where;
}

const decimalNumber = z.coerce.number().finite();

function isSerializedTrackingMode(mode: InventoryTrackingMode) {
  return mode === InventoryTrackingMode.SERIAL || mode === InventoryTrackingMode.BOTH;
}

async function ensureInventoryBalance(
  tx: Prisma.TransactionClient,
  input: {
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
      const where = withInventoryWhere({
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
                { brand: { contains: input.search, mode: "insensitive" as const } },
                { model: { contains: input.search, mode: "insensitive" as const } },
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
          units: {
            select: { id: true },
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
        where: withInventoryWhere({ id: input.id, deletedAt: null }),
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
          units: {
            orderBy: [{ createdAt: "desc" }],
            take: 50,
            select: {
              id: true,
              serialNumber: true,
              assetTag: true,
              batchNumber: true,
              status: true,
              condition: true,
              bucketType: true,
              receivedDate: true,
              purchaseDate: true,
              warrantyExpiry: true,
              assignedAt: true,
              notes: true,
              warehouse: { select: { id: true, code: true, name: true } },
              receiptBatch: {
                select: {
                  id: true,
                  vendorName: true,
                  vendorReference: true,
                  batchNumber: true,
                  unitCost: true,
                  receivedDate: true,
                },
              },
              assignedToUser: { select: { id: true, name: true, email: true } },
            },
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
          receiptBatches: {
            orderBy: [{ receivedDate: "desc" }, { createdAt: "desc" }],
            take: 20,
            select: {
              id: true,
              bucketType: true,
              vendorName: true,
              vendorReference: true,
              batchNumber: true,
              unitCost: true,
              receivedQty: true,
              remainingQty: true,
              receivedDate: true,
              referenceType: true,
              referenceId: true,
              notes: true,
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
            where: withInventoryWhere({
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
        brand: z.string().max(100).optional(),
        model: z.string().max(150).optional(),
        manufacturerPartNumber: z.string().max(100).optional(),
        barcode: z.string().max(100).optional(),
        technicalSpecs: z.string().optional(),
        trackingMode: z.nativeEnum(InventoryTrackingMode).default(InventoryTrackingMode.QUANTITY),
        usageType: z.nativeEnum(InventoryUsageType).default(InventoryUsageType.BOTH),
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
      const existing = await ctx.db.inventoryItem.findFirst({
        where: withInventoryWhere({ sku: input.sku }),
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Inventory item with SKU \"${input.sku}\" already exists`,
        });
      }

      const item = await ctx.db.inventoryItem.create({
        data: {
          sku: input.sku,
          name: input.name,
          description: input.description,
          unitOfMeasure: input.unitOfMeasure,
          category: input.category,
          brand: input.brand,
          model: input.model,
          manufacturerPartNumber: input.manufacturerPartNumber,
          barcode: input.barcode,
          technicalSpecs: input.technicalSpecs,
          trackingMode: input.trackingMode,
          usageType: input.usageType,
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
          userId: ctx.session.user.id,
          action: AuditAction.CREATE,
          entityType: "InventoryItem",
          entityId: item.id,
          changes: {
            after: {
              sku: item.sku,
              name: item.name,
              brand: item.brand,
              model: item.model,
              trackingMode: item.trackingMode,
              usageType: item.usageType,
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
        brand: z.string().max(100).nullable().optional(),
        model: z.string().max(150).nullable().optional(),
        manufacturerPartNumber: z.string().max(100).nullable().optional(),
        barcode: z.string().max(100).nullable().optional(),
        technicalSpecs: z.string().nullable().optional(),
        trackingMode: z.nativeEnum(InventoryTrackingMode).optional(),
        usageType: z.nativeEnum(InventoryUsageType).optional(),
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
        where: withInventoryWhere({ id: input.id, deletedAt: null }),
      });

      if (!current) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Inventory item not found" });
      }

      if (input.isActive === false && current.isActive) {
        const activeReservation = await ctx.db.inventoryReservation.findFirst({
          where: withInventoryWhere({
            itemId: current.id,
            status: { in: [InventoryReservationStatus.ACTIVE, InventoryReservationStatus.PARTIAL] },
          }),
          select: { id: true, sourceId: true, sourceType: true },
        });

        if (activeReservation) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Item tidak bisa dinonaktifkan karena masih memiliki reservasi aktif/parsial.",
          });
        }

        const activeFulfillmentLine = await ctx.db.crmFulfillmentRequestLine.findFirst({
          where: {
            inventoryItemId: current.id,
            fulfillmentRequest: {
              is: withInventoryWhere({
                status: {
                  in: [
                    CrmFulfillmentStatus.DRAFT,
                    CrmFulfillmentStatus.RESERVED,
                    CrmFulfillmentStatus.PARTIAL,
                    CrmFulfillmentStatus.READY,
                  ],
                },
              }),
            },
          },
          include: {
            fulfillmentRequest: {
              select: { requestNumber: true, status: true },
            },
          },
        });

        if (activeFulfillmentLine) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Item tidak bisa dinonaktifkan karena masih dipakai oleh fulfillment aktif ${activeFulfillmentLine.fulfillmentRequest.requestNumber} (${activeFulfillmentLine.fulfillmentRequest.status}).`,
          });
        }
      }

      const updated = await ctx.db.inventoryItem.update({
        where: { id: current.id },
        data: {
          name: input.name,
          description: input.description === undefined ? undefined : input.description,
          unitOfMeasure: input.unitOfMeasure,
          category: input.category === undefined ? undefined : input.category,
          brand: input.brand === undefined ? undefined : input.brand,
          model: input.model === undefined ? undefined : input.model,
          manufacturerPartNumber:
            input.manufacturerPartNumber === undefined ? undefined : input.manufacturerPartNumber,
          barcode: input.barcode === undefined ? undefined : input.barcode,
          technicalSpecs:
            input.technicalSpecs === undefined ? undefined : input.technicalSpecs,
          trackingMode: input.trackingMode,
          usageType: input.usageType,
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
        where: withInventoryWhere({
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
        where: withInventoryWhere({
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

  listAssignableUsers: permissionProcedure("inventory", "read")
    .input(z.object({ search: z.string().optional() }).optional())
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const users = await ctx.db.user.findMany({
        where: {
          deletedAt: null,
          ...(input?.search
            ? {
                OR: [
                  { name: { contains: input.search, mode: "insensitive" } },
                  { email: { contains: input.search, mode: "insensitive" } },
                  { employeeId: { contains: input.search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        select: { id: true, name: true, email: true, employeeId: true },
        orderBy: [{ name: "asc" }],
        take: 100,
      });

      return { users };
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
      const existing = await ctx.db.warehouse.findFirst({
        where: withInventoryWhere({ code: input.code }),
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Warehouse with code \"${input.code}\" already exists`,
        });
      }

      const warehouse = await ctx.db.warehouse.create({
        data: {
          code: input.code,
          name: input.name,
          description: input.description,
          isActive: input.isActive,
        },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.CREATE,
          entityType: "Warehouse",
          entityId: warehouse.id,
          changes: { after: warehouse },
        },
      });

      return warehouse;
    }),

  updateWarehouse: permissionProcedure("inventory", "update")
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(150).optional(),
        description: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const current = await ctx.db.warehouse.findFirst({
        where: withInventoryWhere({ id: input.id, deletedAt: null }),
      });

      if (!current) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Warehouse not found" });
      }

      if (input.isActive === false && current.isActive) {
        const activeReservation = await ctx.db.inventoryReservation.findFirst({
          where: withInventoryWhere({
            warehouseId: current.id,
            status: { in: [InventoryReservationStatus.ACTIVE, InventoryReservationStatus.PARTIAL] },
          }),
          select: { id: true, sourceId: true, sourceType: true },
        });

        if (activeReservation) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Gudang tidak bisa dinonaktifkan karena masih memiliki reservasi aktif/parsial.",
          });
        }

        const activeFulfillmentLine = await ctx.db.crmFulfillmentRequestLine.findFirst({
          where: {
            warehouseId: current.id,
            fulfillmentRequest: {
              is: withInventoryWhere({
                status: {
                  in: [
                    CrmFulfillmentStatus.DRAFT,
                    CrmFulfillmentStatus.RESERVED,
                    CrmFulfillmentStatus.PARTIAL,
                    CrmFulfillmentStatus.READY,
                  ],
                },
              }),
            },
          },
          include: {
            fulfillmentRequest: {
              select: { requestNumber: true, status: true },
            },
          },
        });

        if (activeFulfillmentLine) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Gudang tidak bisa dinonaktifkan karena masih dipakai oleh fulfillment aktif ${activeFulfillmentLine.fulfillmentRequest.requestNumber} (${activeFulfillmentLine.fulfillmentRequest.status}).`,
          });
        }
      }

      const updated = await ctx.db.warehouse.update({
        where: { id: current.id },
        data: {
          name: input.name,
          description: input.description === undefined ? undefined : input.description,
          isActive: input.isActive,
        },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "Warehouse",
          entityId: updated.id,
          changes: {
            before: current,
            after: updated,
          },
        },
      });

      return updated;
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
        where: withInventoryWhere({
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
              trackingMode: true,
              usageType: true,
              brand: true,
              model: true,
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

      const serializedCandidates = rows.filter((balance) =>
        isSerializedTrackingMode(balance.item.trackingMode),
      );

      const serializedUnits = serializedCandidates.length
        ? await ctx.db.inventoryItemUnit.findMany({
            where: withInventoryWhere({
              inventoryItemId: { in: [...new Set(serializedCandidates.map((balance) => balance.itemId))] },
              warehouseId: { in: [...new Set(serializedCandidates.map((balance) => balance.warehouseId))] },
            }),
            select: {
              id: true,
              inventoryItemId: true,
              warehouseId: true,
              bucketType: true,
              serialNumber: true,
              assetTag: true,
              status: true,
              condition: true,
              assignedToUser: { select: { id: true, name: true, email: true } },
            },
            orderBy: [{ createdAt: "asc" }],
          })
        : [];

      const receiptBatches = rows.length
        ? await ctx.db.inventoryReceiptBatch.findMany({
            where: withInventoryWhere({
              inventoryItemId: { in: [...new Set(rows.map((balance) => balance.itemId))] },
              warehouseId: { in: [...new Set(rows.map((balance) => balance.warehouseId))] },
              bucketType: { in: [...new Set(rows.map((balance) => balance.bucketType))] },
            }),
            select: {
              id: true,
              inventoryItemId: true,
              warehouseId: true,
              bucketType: true,
              vendorName: true,
              vendorReference: true,
              batchNumber: true,
              unitCost: true,
              receivedQty: true,
              remainingQty: true,
              receivedDate: true,
              referenceType: true,
              referenceId: true,
            },
            orderBy: [{ receivedDate: "desc" }, { createdAt: "desc" }],
          })
        : [];

      const serializedUnitMap = new Map<string, (typeof serializedUnits)>();
      for (const unit of serializedUnits) {
        const key = `${unit.inventoryItemId}:${unit.warehouseId}:${unit.bucketType}`;
        serializedUnitMap.set(key, [...(serializedUnitMap.get(key) ?? []), unit]);
      }

      const receiptBatchMap = new Map<string, (typeof receiptBatches)>();
      for (const batch of receiptBatches) {
        const key = `${batch.inventoryItemId}:${batch.warehouseId}:${batch.bucketType}`;
        receiptBatchMap.set(key, [...(receiptBatchMap.get(key) ?? []), batch]);
      }

      return {
        balances: rows.map((balance) => {
          const key = `${balance.itemId}:${balance.warehouseId}:${balance.bucketType}`;
          const relatedUnits = serializedUnitMap.get(key) ?? [];
          const relatedBatches = receiptBatchMap.get(key) ?? [];
          return {
            ...balance,
            serializedSummary: isSerializedTrackingMode(balance.item.trackingMode)
              ? {
                  totalUnits: relatedUnits.length,
                  inStockUnits: relatedUnits.filter((unit) => unit.status === InventoryUnitStatus.IN_STOCK).length,
                  reservedUnits: relatedUnits.filter((unit) => unit.status === InventoryUnitStatus.RESERVED).length,
                  assignedUnits: relatedUnits.filter((unit) => unit.status === InventoryUnitStatus.ASSIGNED).length,
                }
              : null,
            serializedUnits: relatedUnits,
            batchSummary: {
              totalBatches: relatedBatches.length,
              latestVendorName: relatedBatches[0]?.vendorName ?? null,
              latestUnitCost: relatedBatches[0]?.unitCost ?? null,
            },
            receiptBatches: relatedBatches,
          };
        }),
      };
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
      const item = await ctx.db.inventoryItem.findFirst({
        where: withInventoryWhere({ id: input.itemId, deletedAt: null }),
      });
      if (!item) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Inventory item not found" });
      }

      const warehouse = await ctx.db.warehouse.findFirst({
        where: withInventoryWhere({ id: input.warehouseId, deletedAt: null }),
      });
      if (!warehouse) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Warehouse not found" });
      }

      const result = await ctx.db.$transaction(async (tx) => {
        const tempAssetBalance = await ensureInventoryBalance(tx, {
          itemId: item.id,
          warehouseId: warehouse.id,
          bucketType: InventoryBucketType.TEMP_ASSET,
        });

        const saleStockBalance = await ensureInventoryBalance(tx, {
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

  reclassifySerializedUnits: permissionProcedure("inventory", "update")
    .input(
      z.object({
        unitIds: z.array(z.string()).min(1),
        toBucketType: z.nativeEnum(InventoryBucketType),
        referenceType: z.string().max(50).optional(),
        referenceId: z.string().max(100).optional(),
        notes: z.string().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const units = await ctx.db.inventoryItemUnit.findMany({
        where: withInventoryWhere({ id: { in: input.unitIds } }),
        include: { inventoryItem: true, warehouse: true },
      });

      if (units.length !== input.unitIds.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sebagian serialized unit tidak ditemukan" });
      }
      if (units.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Pilih minimal satu serialized unit" });
      }

      const first = units[0]!;
      if (!first.warehouseId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Serialized unit harus masih terikat ke warehouse untuk bisa direklasifikasi" });
      }

      if (units.some((unit) => unit.inventoryItemId !== first.inventoryItemId || unit.warehouseId !== first.warehouseId || unit.bucketType !== first.bucketType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Semua serialized unit harus berasal dari item, warehouse, dan bucket yang sama" });
      }

      if (first.bucketType === input.toBucketType) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Bucket tujuan harus berbeda dari bucket asal" });
      }

      if (units.some((unit) => unit.status !== InventoryUnitStatus.IN_STOCK)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Hanya unit dengan status IN_STOCK yang boleh direklasifikasi" });
      }

      const quantity = units.length;
      const item = first.inventoryItem;
      const warehouseId = first.warehouseId;

      return ctx.db.$transaction(async (tx) => {
        const fromBalance = await ensureInventoryBalance(tx, {
          itemId: item.id,
          warehouseId,
          bucketType: first.bucketType,
        });
        const toBalance = await ensureInventoryBalance(tx, {
          itemId: item.id,
          warehouseId,
          bucketType: input.toBucketType,
        });

        const available = Number(fromBalance.qtyOnHand ?? 0) - Number(fromBalance.qtyReserved ?? 0);
        if (available < quantity) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Saldo bucket asal tidak cukup untuk reklasifikasi serialized unit" });
        }

        const fromAfter = Number(fromBalance.qtyOnHand ?? 0) - quantity;
        const toAfter = Number(toBalance.qtyOnHand ?? 0) + quantity;

        await tx.inventoryBalance.update({ where: { id: fromBalance.id }, data: { qtyOnHand: fromAfter } });
        await tx.inventoryBalance.update({ where: { id: toBalance.id }, data: { qtyOnHand: toAfter } });
        await tx.inventoryItemUnit.updateMany({ where: { id: { in: input.unitIds } }, data: { bucketType: input.toBucketType } });

        const referenceType = input.referenceType ?? "InventorySerializedReclassification";
        const referenceId = input.referenceId ?? `${item.id}:${warehouseId}:${Date.now()}`;

        await tx.inventoryLedgerEntry.create({ data: {
          itemId: item.id,
          warehouseId,
          bucketType: first.bucketType,
          movementType: InventoryMovementType.TRANSFER_OUT,
          referenceType,
          referenceId,
          chartOfAccountId: first.bucketType === InventoryBucketType.TEMP_ASSET ? item.temporaryAssetCoaId ?? undefined : item.inventoryCoaId ?? undefined,
          quantityBefore: Number(fromBalance.qtyOnHand ?? 0),
          quantityChange: -quantity,
          quantityAfter: fromAfter,
          unitCost: item.standardCost ?? undefined,
          totalCost: item.standardCost ? Number(item.standardCost) * quantity : undefined,
          notes: input.notes ?? `Serialized reclassification of ${quantity} unit(s)`,
          createdById: ctx.session.user.id,
        } });
        await tx.inventoryLedgerEntry.create({ data: {
          itemId: item.id,
          warehouseId,
          bucketType: input.toBucketType,
          movementType: InventoryMovementType.TRANSFER_IN,
          referenceType,
          referenceId,
          chartOfAccountId: input.toBucketType === InventoryBucketType.TEMP_ASSET ? item.temporaryAssetCoaId ?? undefined : item.inventoryCoaId ?? undefined,
          quantityBefore: Number(toBalance.qtyOnHand ?? 0),
          quantityChange: quantity,
          quantityAfter: toAfter,
          unitCost: item.standardCost ?? undefined,
          totalCost: item.standardCost ? Number(item.standardCost) * quantity : undefined,
          notes: input.notes ?? `Serialized reclassification of ${quantity} unit(s)`,
          createdById: ctx.session.user.id,
        } });

        return { success: true, quantity, fromBucketType: first.bucketType, toBucketType: input.toBucketType };
      });
    }),

  assignInventoryUnit: permissionProcedure("inventory", "update")
    .input(z.object({ unitId: z.string(), userId: z.string(), notes: z.string().optional() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const unit = await ctx.db.inventoryItemUnit.findFirst({
        where: withInventoryWhere({ id: input.unitId }),
        include: { inventoryItem: true },
      });
      if (!unit) throw new TRPCError({ code: "NOT_FOUND", message: "Inventory unit not found" });
      if (unit.status !== InventoryUnitStatus.IN_STOCK && unit.status !== InventoryUnitStatus.ASSIGNED) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Hanya unit IN_STOCK atau ASSIGNED yang bisa di-assign" });
      }
      if (unit.inventoryItem.usageType === InventoryUsageType.SALE) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unit untuk item usage SALE tidak bisa di-assign ke user" });
      }

      const assignee = await ctx.db.user.findFirst({ where: { id: input.userId, deletedAt: null } });
      if (!assignee) throw new TRPCError({ code: "NOT_FOUND", message: "User tujuan tidak ditemukan" });

      const updated = await ctx.db.inventoryItemUnit.update({
        where: { id: unit.id },
        data: {
          assignedToUserId: assignee.id,
          assignedAt: new Date(),
          status: InventoryUnitStatus.ASSIGNED,
          notes: input.notes ?? unit.notes,
        },
        include: {
          warehouse: { select: { id: true, code: true, name: true } },
          assignedToUser: { select: { id: true, name: true, email: true } },
        },
      });

      await ctx.db.auditLog.create({ data: {
        userId: ctx.session.user.id,
        action: AuditAction.UPDATE,
        entityType: "InventoryUnitAssignment",
        entityId: unit.id,
        changes: { after: { assignedToUserId: assignee.id, status: InventoryUnitStatus.ASSIGNED } },
      } });

      return updated;
    }),

  unassignInventoryUnit: permissionProcedure("inventory", "update")
    .input(z.object({ unitId: z.string(), notes: z.string().optional() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const unit = await ctx.db.inventoryItemUnit.findFirst({ where: withInventoryWhere({ id: input.unitId }) });
      if (!unit) throw new TRPCError({ code: "NOT_FOUND", message: "Inventory unit not found" });
      if (unit.status !== InventoryUnitStatus.ASSIGNED) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Hanya unit ASSIGNED yang bisa di-unassign" });
      }

      const updated = await ctx.db.inventoryItemUnit.update({
        where: { id: unit.id },
        data: {
          assignedToUserId: null,
          assignedAt: null,
          status: InventoryUnitStatus.IN_STOCK,
          notes: input.notes ?? unit.notes,
        },
        include: {
          warehouse: { select: { id: true, code: true, name: true } },
          assignedToUser: { select: { id: true, name: true, email: true } },
        },
      });

      await ctx.db.auditLog.create({ data: {
        userId: ctx.session.user.id,
        action: AuditAction.UPDATE,
        entityType: "InventoryUnitAssignment",
        entityId: unit.id,
        changes: { after: { assignedToUserId: null, status: InventoryUnitStatus.IN_STOCK } },
      } });

      return updated;
    }),

  fulfillmentSummary: permissionProcedure("inventory", "read")
    .input(z.object({}).optional())
    .output(z.any())
    .query(async ({ ctx }) => {
      const [requests, reservationCounts] = await Promise.all([
        ctx.db.crmFulfillmentRequest.groupBy({
          by: ["status"],
          where: withInventoryWhere({}),
          _count: { _all: true },
        }),
        ctx.db.inventoryReservation.groupBy({
          by: ["status"],
          where: withInventoryWhere({}),
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
        where: withInventoryWhere({
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
                select: { id: true, sku: true, name: true, unitOfMeasure: true, trackingMode: true },
              },
              warehouse: {
                select: { id: true, code: true, name: true },
              },
              reservedUnits: {
                include: {
                  inventoryItemUnit: {
                    select: {
                      id: true,
                      serialNumber: true,
                      assetTag: true,
                      bucketType: true,
                      status: true,
                      assignedToUser: { select: { id: true, name: true, email: true } },
                    },
                  },
                  reservation: {
                    select: { id: true, status: true, warehouseId: true },
                  },
                },
              },
            },
          },
        },
      });

      const cogsJournals = requests.length
        ? await ctx.db.journalEntry.findMany({
            where: withInventoryWhere({
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
        serializedUnits: z
          .array(
            z.object({
              bucketType: z.nativeEnum(InventoryBucketType),
              serialNumber: z.string().max(150).optional(),
              assetTag: z.string().max(150).optional(),
              batchNumber: z.string().max(100).optional(),
              condition: z.nativeEnum(InventoryUnitCondition).default(InventoryUnitCondition.NEW),
              receivedDate: z.coerce.date().optional(),
              purchaseDate: z.coerce.date().optional(),
              warrantyExpiry: z.coerce.date().optional(),
              notes: z.string().optional(),
            }),
          )
          .default([]),
        vendorName: z.string().max(150).optional(),
        vendorReference: z.string().max(100).optional(),
        batchNumber: z.string().max(100).optional(),
        unitCost: decimalNumber.min(0).optional(),
        movementDate: z.coerce.date().optional(),
        referenceType: z.string().max(50).optional(),
        referenceId: z.string().max(100).optional(),
        notes: z.string().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.inventoryItem.findFirst({
        where: withInventoryWhere({ id: input.itemId, deletedAt: null }),
      });
      if (!item) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Inventory item not found" });
      }

      const warehouse = await ctx.db.warehouse.findFirst({
        where: withInventoryWhere({ id: input.warehouseId, deletedAt: null }),
      });
      if (!warehouse) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Warehouse not found" });
      }

      const saleQuantity = Number(input.saleQuantity ?? 0);
      const temporaryAssetQuantity = Number(input.temporaryAssetQuantity ?? 0);
      const totalQuantity = saleQuantity + temporaryAssetQuantity;
      const normalizedBatchNumber = input.batchNumber?.trim() || undefined;
      const normalizedVendorName = input.vendorName?.trim() || undefined;
      const normalizedVendorReference = input.vendorReference?.trim() || undefined;
      const normalizedSerializedUnits = (input.serializedUnits ?? []).map((unit, index) => ({
        index,
        bucketType: unit.bucketType,
        serialNumber: unit.serialNumber?.trim() || undefined,
        assetTag: unit.assetTag?.trim() || undefined,
        batchNumber: unit.batchNumber?.trim() || undefined,
        condition: unit.condition,
        receivedDate: unit.receivedDate,
        purchaseDate: unit.purchaseDate,
        warrantyExpiry: unit.warrantyExpiry,
        notes: unit.notes?.trim() || undefined,
      }));

      if (totalQuantity <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Minimal salah satu alokasi quantity harus lebih dari 0",
        });
      }

      const isSerializedTracking =
        item.trackingMode === InventoryTrackingMode.SERIAL ||
        item.trackingMode === InventoryTrackingMode.BOTH;

      if (isSerializedTracking) {
        if (!Number.isInteger(saleQuantity) || !Number.isInteger(temporaryAssetQuantity)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Item serialized hanya boleh menerima quantity bilangan bulat",
          });
        }

        if (normalizedSerializedUnits.length !== totalQuantity) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Jumlah unit serial harus sama dengan total quantity receipt",
          });
        }

        for (const unit of normalizedSerializedUnits) {
          if (!unit.serialNumber && !unit.assetTag) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Unit ke-${unit.index + 1} wajib memiliki serial number atau asset tag`,
            });
          }
        }

        const saleUnitCount = normalizedSerializedUnits.filter(
          (unit) => unit.bucketType === InventoryBucketType.SALE_STOCK,
        ).length;
        const tempAssetUnitCount = normalizedSerializedUnits.filter(
          (unit) => unit.bucketType === InventoryBucketType.TEMP_ASSET,
        ).length;

        if (saleUnitCount !== saleQuantity || tempAssetUnitCount !== temporaryAssetQuantity) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Alokasi bucket serialized unit harus sama dengan quantity sale stock dan temporary asset",
          });
        }

        const serialNumbers = normalizedSerializedUnits
          .map((unit) => unit.serialNumber)
          .filter((value): value is string => Boolean(value));
        const assetTags = normalizedSerializedUnits
          .map((unit) => unit.assetTag)
          .filter((value): value is string => Boolean(value));

        if (new Set(serialNumbers).size !== serialNumbers.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Serial number tidak boleh duplikat dalam satu receipt",
          });
        }

        if (new Set(assetTags).size !== assetTags.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Asset tag tidak boleh duplikat dalam satu receipt",
          });
        }
      } else if (normalizedSerializedUnits.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Serialized units hanya boleh diisi untuk item dengan tracking mode SERIAL atau BOTH",
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
        const createdUnits = [] as Array<unknown>;
        const createdBatches = [] as Array<unknown>;
        const batchByBucket = new Map<InventoryBucketType, { id: string; batchNumber: string | null }>();

        for (const allocation of allocations) {
          const balance = await ensureInventoryBalance(tx, {
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

          const createdBatch = await tx.inventoryReceiptBatch.create({
            data: {
              inventoryItemId: item.id,
              warehouseId: warehouse.id,
              bucketType: allocation.bucketType,
              vendorName: normalizedVendorName,
              vendorReference: normalizedVendorReference,
              batchNumber: normalizedBatchNumber,
              unitCost: input.unitCost,
              receivedQty: allocation.quantity,
              remainingQty: allocation.quantity,
              receivedDate: input.movementDate ?? new Date(),
              referenceType: input.referenceType,
              referenceId: input.referenceId,
              notes: input.notes,
            },
            select: { id: true, batchNumber: true },
          });

          batchByBucket.set(allocation.bucketType, createdBatch);
          balances.push(updatedBalance);
          ledgers.push(ledger);
          createdBatches.push(createdBatch);
        }

        if (normalizedSerializedUnits.length > 0) {
          for (const unit of normalizedSerializedUnits) {
            if (unit.serialNumber) {
              const existingSerial = await tx.inventoryItemUnit.findFirst({
                where: withInventoryWhere({ serialNumber: unit.serialNumber }),
                select: { id: true },
              });
              if (existingSerial) {
                throw new TRPCError({
                  code: "CONFLICT",
                  message: `Serial number ${unit.serialNumber} sudah terdaftar`,
                });
              }
            }

            if (unit.assetTag) {
              const existingAssetTag = await tx.inventoryItemUnit.findFirst({
                where: withInventoryWhere({ assetTag: unit.assetTag }),
                select: { id: true },
              });
              if (existingAssetTag) {
                throw new TRPCError({
                  code: "CONFLICT",
                  message: `Asset tag ${unit.assetTag} sudah terdaftar`,
                });
              }
            }

            const receiptBatch = batchByBucket.get(unit.bucketType);

            const createdUnit = await tx.inventoryItemUnit.create({
              data: {
                inventoryItemId: item.id,
                warehouseId: warehouse.id,
                receiptBatchId: receiptBatch?.id,
                bucketType: unit.bucketType,
                serialNumber: unit.serialNumber,
                assetTag: unit.assetTag,
                batchNumber: unit.batchNumber ?? receiptBatch?.batchNumber ?? normalizedBatchNumber,
                status: InventoryUnitStatus.IN_STOCK,
                condition: unit.condition,
                receivedDate: unit.receivedDate ?? input.movementDate ?? new Date(),
                purchaseDate: unit.purchaseDate,
                warrantyExpiry: unit.warrantyExpiry,
                notes: unit.notes ?? input.notes,
              },
            });

            createdUnits.push(createdUnit);
          }
        }

        if (input.unitCost !== undefined) {
          await tx.inventoryItem.update({
            where: { id: item.id },
            data: { standardCost: input.unitCost },
          });
        }

        await tx.auditLog.create({
          data: {
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
                trackingMode: item.trackingMode,
                vendorName: normalizedVendorName,
                vendorReference: normalizedVendorReference,
                batchNumber: normalizedBatchNumber,
                serializedUnitCount: normalizedSerializedUnits.length,
                serializedUnits: normalizedSerializedUnits.map((unit) => ({
                  bucketType: unit.bucketType,
                  serialNumber: unit.serialNumber,
                  assetTag: unit.assetTag,
                  batchNumber: unit.batchNumber ?? normalizedBatchNumber,
                  condition: unit.condition,
                })),
              },
            },
          },
        });

        return { balances, ledgers, units: createdUnits, receiptBatches: createdBatches };
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
      const result = await ctx.db.$transaction(async (tx) => {
        const request = await tx.crmFulfillmentRequest.findFirst({
          where: withInventoryWhere({ id: input.fulfillmentRequestId }),
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
            where: withInventoryWhere({
              sourceType: "FULFILLMENT_REQUEST",
              sourceId: request.id,
              itemId: line.inventoryItemId,
              ...(line.warehouseId ? { warehouseId: line.warehouseId } : {}),
              status: { in: [InventoryReservationStatus.ACTIVE, InventoryReservationStatus.PARTIAL] },
            }),
            orderBy: [{ createdAt: "asc" }],
            include: {
              reservationUnits: {
                include: {
                  inventoryItemUnit: { select: { id: true, status: true } },
                },
              },
            },
          });

          let qtyToDeliver = Number(line.qtyReserved ?? 0);
          if (qtyToDeliver <= 0) {
            continue;
          }

          const item = await tx.inventoryItem.findFirst({
            where: withInventoryWhere({ id: line.inventoryItemId, deletedAt: null }),
          });
          if (!item) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Inventory item not found for fulfillment delivery" });
          }

          let deliveredForLine = 0;

          for (const reservation of reservations) {
            if (qtyToDeliver <= 0) break;

            if (!reservation.warehouseId) continue;

            const balance = await ensureInventoryBalance(tx, {
              itemId: reservation.itemId,
              warehouseId: reservation.warehouseId,
            });

            const remainingReserved = Number(reservation.qtyReserved ?? 0) - Number(reservation.qtyFulfilled ?? 0) - Number(reservation.qtyReleased ?? 0);
            if (remainingReserved <= 0) continue;

            let issueQty = Math.min(remainingReserved, qtyToDeliver);
            const reservedUnitIds = reservation.reservationUnits
              .filter((entry) => entry.inventoryItemUnit.status === InventoryUnitStatus.RESERVED)
              .slice(0, issueQty)
              .map((entry) => entry.inventoryItemUnit.id);

            if (isSerializedTrackingMode(item.trackingMode)) {
              issueQty = Math.min(issueQty, reservedUnitIds.length);
              if (issueQty <= 0) {
                continue;
              }
            }

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

            if (reservedUnitIds.length > 0) {
              const issuedUnits = await tx.inventoryItemUnit.findMany({
                where: { id: { in: reservedUnitIds.slice(0, issueQty) } },
                select: { id: true, receiptBatchId: true },
              });

              await tx.inventoryItemUnit.updateMany({
                where: { id: { in: issuedUnits.map((unit) => unit.id) } },
                data: {
                  status: InventoryUnitStatus.ISSUED,
                  warehouseId: null,
                },
              });

              const batchIssuedMap = new Map<string, number>();
              for (const unit of issuedUnits) {
                if (!unit.receiptBatchId) continue;
                batchIssuedMap.set(unit.receiptBatchId, (batchIssuedMap.get(unit.receiptBatchId) ?? 0) + 1);
              }

              for (const [receiptBatchId, qtyIssuedFromBatch] of batchIssuedMap.entries()) {
                const batch = await tx.inventoryReceiptBatch.findFirst({
                  where: { id: receiptBatchId },
                  select: { id: true, remainingQty: true },
                });
                if (!batch) continue;

                await tx.inventoryReceiptBatch.update({
                  where: { id: batch.id },
                  data: {
                    remainingQty: Math.max(Number(batch.remainingQty ?? 0) - qtyIssuedFromBatch, 0),
                  },
                });
              }
            } else {
              let qtyToConsumeFromBatches = issueQty;
              const fifoBatches = await tx.inventoryReceiptBatch.findMany({
                where: withInventoryWhere({
                  inventoryItemId: reservation.itemId,
                  warehouseId: reservation.warehouseId,
                  bucketType: InventoryBucketType.SALE_STOCK,
                  remainingQty: { gt: 0 },
                }),
                orderBy: [{ receivedDate: "asc" }, { createdAt: "asc" }],
                select: { id: true, remainingQty: true },
              });

              for (const batch of fifoBatches) {
                if (qtyToConsumeFromBatches <= 0) break;
                const batchRemaining = Number(batch.remainingQty ?? 0);
                if (batchRemaining <= 0) continue;
                const consumeQty = Math.min(batchRemaining, qtyToConsumeFromBatches);

                await tx.inventoryReceiptBatch.update({
                  where: { id: batch.id },
                  data: {
                    remainingQty: batchRemaining - consumeQty,
                  },
                });

                qtyToConsumeFromBatches -= consumeQty;
              }
            }

            const issueTotalCost = item.standardCost
              ? Number(item.standardCost) * issueQty
              : undefined;

            await tx.inventoryLedgerEntry.create({
              data: {
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

            qtyToDeliver -= issueQty;
            deliveredForLine += issueQty;
          }

          if (deliveredForLine > 0) {
            await tx.crmFulfillmentRequestLine.update({
              where: { id: line.id },
              data: {
                qtyDelivered: Number(line.qtyDelivered ?? 0) + deliveredForLine,
                qtyReserved: Math.max(Number(line.qtyReserved ?? 0) - deliveredForLine, 0),
              },
            });
          }
        }

        let cogsJournal: Awaited<ReturnType<typeof tx.journalEntry.create>> | null = null;

        if (cogsPostingMap.size > 0) {
          const journalNumber = await generateJournalEntryNumber(
            tx as unknown as Prisma.DefaultPrismaClient,
          );
          const postingEntries = [...cogsPostingMap.values()];

          cogsJournal = await tx.journalEntry.create({
            data: {
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
      const result = await ctx.db.$transaction(async (tx) => {
        const request = await tx.crmFulfillmentRequest.findFirst({
          where: withInventoryWhere({ id: input.fulfillmentRequestId }),
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
            where: withInventoryWhere({
              sourceType: "FULFILLMENT_REQUEST",
              sourceId: request.id,
              itemId: line.inventoryItemId,
              ...(line.warehouseId ? { warehouseId: line.warehouseId } : {}),
              status: { in: [InventoryReservationStatus.ACTIVE, InventoryReservationStatus.PARTIAL] },
            }),
            orderBy: [{ createdAt: "asc" }],
            include: {
              reservationUnits: {
                include: {
                  inventoryItemUnit: { select: { id: true, status: true } },
                },
              },
            },
          });

          let releasedForLine = 0;

          for (const reservation of reservations) {
            const remainingReserved =
              Number(reservation.qtyReserved ?? 0) -
              Number(reservation.qtyFulfilled ?? 0) -
              Number(reservation.qtyReleased ?? 0);

            if (remainingReserved <= 0 || !reservation.warehouseId) continue;

            const balance = await ensureInventoryBalance(tx, {
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

            const reservedUnitIds = reservation.reservationUnits
              .filter((entry) => entry.inventoryItemUnit.status === InventoryUnitStatus.RESERVED)
              .map((entry) => entry.inventoryItemUnit.id);

            if (reservedUnitIds.length > 0) {
              await tx.inventoryItemUnit.updateMany({
                where: { id: { in: reservedUnitIds } },
                data: { status: InventoryUnitStatus.IN_STOCK },
              });
            }

            const item = await tx.inventoryItem.findFirst({
              where: withInventoryWhere({ id: reservation.itemId, deletedAt: null }),
            });

            await tx.inventoryLedgerEntry.create({
              data: {
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
      const lead = await ctx.db.crmLead.findFirst({
        where: withInventoryWhere({ id: input.leadId, deletedAt: null }),
        include: { customer: { select: { id: true } } },
      });

      if (!lead) {
        throw new TRPCError({ code: "NOT_FOUND", message: "CRM lead not found" });
      }

      const requestNumber =
        input.requestNumber ?? await generateFulfillmentRequestNumber(ctx.db);

      const existing = await ctx.db.crmFulfillmentRequest.findFirst({
        where: withInventoryWhere({ requestNumber }),
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
        where: withInventoryWhere({
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
              is: withInventoryWhere({
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
            leadId: lead.id,
            customerId: input.customerId ?? lead.customer?.id,
            requestNumber,
            requestedDate: input.requestedDate,
            notes: input.notes,
            status: CrmFulfillmentStatus.DRAFT,
            lines: {
              create: input.lines.map((line) => ({
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
            where: withInventoryWhere({ id: line.inventoryItemId, deletedAt: null }),
          });
          if (!item) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Inventory item not found for fulfillment line",
            });
          }

          const candidateBalances = await tx.inventoryBalance.findMany({
            where: withInventoryWhere({
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
          if (isSerializedTrackingMode(item.trackingMode) && !Number.isInteger(requestedQty)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Serialized item ${item.sku} hanya bisa di-fulfill dengan quantity bilangan bulat`,
            });
          }

          let qtyToReserve = requestedQty;
          let reservedForLine = 0;
          let chosenWarehouseId = line.warehouseId;

          for (const balance of candidateBalances) {
            if (qtyToReserve <= 0) break;

            const available = Number(balance.qtyOnHand ?? 0) - Number(balance.qtyReserved ?? 0);
            if (available <= 0) continue;

            let reserveQty = Math.min(available, qtyToReserve);
            let reservedUnitIds: string[] = [];

            if (isSerializedTrackingMode(item.trackingMode)) {
              const availableUnits = await tx.inventoryItemUnit.findMany({
                where: withInventoryWhere({
                  inventoryItemId: line.inventoryItemId,
                  warehouseId: balance.warehouseId,
                  bucketType: InventoryBucketType.SALE_STOCK,
                  status: InventoryUnitStatus.IN_STOCK,
                }),
                orderBy: [{ receivedDate: "asc" }, { createdAt: "asc" }],
                take: qtyToReserve,
                select: { id: true },
              });

              reserveQty = Math.min(reserveQty, availableUnits.length);
              reservedUnitIds = availableUnits.slice(0, reserveQty).map((unit) => unit.id);
              if (reserveQty <= 0) {
                continue;
              }
            }

            const nextReserved = Number(balance.qtyReserved ?? 0) + reserveQty;

            await tx.inventoryBalance.update({
              where: { id: balance.id },
              data: { qtyReserved: nextReserved },
            });

            const reservation = await tx.inventoryReservation.create({
              data: {
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

            if (reservedUnitIds.length > 0) {
              await tx.inventoryItemUnit.updateMany({
                where: { id: { in: reservedUnitIds } },
                data: { status: InventoryUnitStatus.RESERVED },
              });

              await tx.inventoryReservationUnit.createMany({
                data: reservedUnitIds.map((unitId) => ({
                  reservationId: reservation.id,
                  inventoryItemUnitId: unitId,
                  fulfillmentRequestLineId: line.id,
                })),
              });
            }

            await tx.inventoryLedgerEntry.create({
              data: {
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
            chosenWarehouseId = chosenWarehouseId ?? balance.warehouseId;
          }

          await tx.crmFulfillmentRequestLine.update({
            where: { id: line.id },
            data: {
              qtyReserved: reservedForLine,
              warehouseId: chosenWarehouseId,
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
