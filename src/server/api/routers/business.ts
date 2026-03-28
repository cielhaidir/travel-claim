import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  BusinessFlowType,
  DeliveryOrderStatus,
  GoodsReceiptStatus,
  InventoryBucketType,
  InventoryItemType,
  InventoryMovementType,
  PurchaseOrderStatus,
  PurchaseRequestStatus,
  SalesInvoiceStatus,
  SalesOrderStatus,
  SalesQuotationStatus,
  VendorInvoiceMatchType,
  VendorInvoiceStatus,
} from "../../../../generated/prisma";
import {
  generateDeliveryOrderNumber,
  generateGoodsReceiptNumber,
  generatePurchaseOrderNumber,
  generateSalesInvoiceNumber,
  generateSalesOrderNumber,
  generateSalesQuotationNumber,
  generateVendorInvoiceNumber,
} from "@/lib/utils/numberGenerators";
import { createTRPCRouter, permissionProcedure } from "@/server/api/trpc";
import { type Prisma } from "../../../../generated/prisma";

const purchaseRequestStatusSchema = z.nativeEnum(PurchaseRequestStatus);
const purchaseOrderStatusSchema = z.nativeEnum(PurchaseOrderStatus);
const goodsReceiptStatusSchema = z.nativeEnum(GoodsReceiptStatus);
const vendorInvoiceStatusSchema = z.nativeEnum(VendorInvoiceStatus);
const salesQuotationStatusSchema = z.nativeEnum(SalesQuotationStatus);
const salesOrderStatusSchema = z.nativeEnum(SalesOrderStatus);
const deliveryOrderStatusSchema = z.nativeEnum(DeliveryOrderStatus);
const salesInvoiceStatusSchema = z.nativeEnum(SalesInvoiceStatus);

const searchInput = z.object({
  search: z.string().optional(),
  limit: z.number().min(1).max(200).default(100),
});

const convertPurchaseRequestInput = z.object({
  purchaseRequestId: z.string().min(1),
  expectedDate: z.coerce.date().optional(),
  notes: z.string().trim().max(5000).optional(),
});

const salesQuotationUpsertInput = z.object({
  customerId: z.string().min(1),
  inventoryItemId: z.string().min(1),
  warehouseId: z.string().optional(),
  description: z.string().trim().max(5000).optional(),
  qtyQuoted: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative(),
  validUntil: z.coerce.date().optional(),
  notes: z.string().trim().max(5000).optional(),
});

const createSalesQuotationInput = salesQuotationUpsertInput;

const updateSalesQuotationInput = salesQuotationUpsertInput.extend({
  salesQuotationId: z.string().min(1),
});

const deleteSalesQuotationInput = z.object({
  salesQuotationId: z.string().min(1),
});

const convertSalesQuotationInput = z.object({
  salesQuotationId: z.string().min(1),
  plannedShipDate: z.coerce.date().optional(),
  notes: z.string().trim().max(5000).optional(),
});

const createVendorInvoiceFromOrderInput = z.object({
  purchaseOrderId: z.string().min(1),
  invoiceDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  notes: z.string().trim().max(5000).optional(),
});

const createSalesInvoiceFromOrderInput = z.object({
  salesOrderId: z.string().min(1),
  issueDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  notes: z.string().trim().max(5000).optional(),
});

const updateSalesOrderInput = z.object({
  salesOrderId: z.string().min(1),
  plannedShipDate: z.coerce.date().optional(),
  notes: z.string().trim().max(5000).optional(),
});

const deleteSalesOrderInput = z.object({
  salesOrderId: z.string().min(1),
});

const updateDeliveryOrderInput = z.object({
  deliveryOrderId: z.string().min(1),
  shipDate: z.coerce.date().optional(),
  carrierName: z.string().trim().max(150).optional(),
  notes: z.string().trim().max(5000).optional(),
});

const deleteDeliveryOrderInput = z.object({
  deliveryOrderId: z.string().min(1),
});

const updateSalesInvoiceInput = z.object({
  salesInvoiceId: z.string().min(1),
  issueDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  notes: z.string().trim().max(5000).optional(),
});

const deleteSalesInvoiceInput = z.object({
  salesInvoiceId: z.string().min(1),
});

const changeSalesOrderStatusInput = z.object({
  salesOrderId: z.string().min(1),
  status: salesOrderStatusSchema,
});

const changeDeliveryOrderStatusInput = z.object({
  deliveryOrderId: z.string().min(1),
  status: deliveryOrderStatusSchema,
});

const changeSalesInvoiceStatusInput = z.object({
  salesInvoiceId: z.string().min(1),
  status: salesInvoiceStatusSchema,
});

const createGoodsReceiptFromOrderInput = z.object({
  purchaseOrderId: z.string().min(1),
  receiptDate: z.coerce.date().optional(),
  notes: z.string().trim().max(5000).optional(),
});

const createDeliveryOrderFromSalesOrderInput = z.object({
  salesOrderId: z.string().min(1),
  shipDate: z.coerce.date().optional(),
  notes: z.string().trim().max(5000).optional(),
});

function classifyBusinessFlowFromItems(
  itemTypes: Array<InventoryItemType | null | undefined>,
): BusinessFlowType {
  const physicalTypes = new Set<InventoryItemType>([InventoryItemType.HARDWARE]);
  const nonPhysicalTypes = new Set<InventoryItemType>([
    InventoryItemType.SERVICE,
    InventoryItemType.SOFTWARE_LICENSE,
    InventoryItemType.MANAGED_SERVICE,
  ]);

  const resolvedTypes = itemTypes.filter(
    (value): value is InventoryItemType => value != null,
  );

  if (resolvedTypes.length === 0) {
    return BusinessFlowType.GOODS;
  }

  const hasPhysical = resolvedTypes.some((value) => physicalTypes.has(value));
  const hasNonPhysical = resolvedTypes.some((value) => nonPhysicalTypes.has(value));

  if (hasPhysical && hasNonPhysical) return BusinessFlowType.MIXED;
  if (hasNonPhysical) return BusinessFlowType.SERVICE;
  return BusinessFlowType.GOODS;
}

function nextDueDate(baseDate: Date, days = 14) {
  const value = new Date(baseDate);
  value.setDate(value.getDate() + days);
  return value;
}

async function ensureInventoryBalance(
  tx: Prisma.TransactionClient,
  input: { itemId: string; warehouseId: string; bucketType?: InventoryBucketType },
) {
  const bucketType = input.bucketType ?? InventoryBucketType.SALE_STOCK;
  const existing = await tx.inventoryBalance.findFirst({
    where: {
      itemId: input.itemId,
      warehouseId: input.warehouseId,
      bucketType,
    },
  });

  if (existing) return existing;

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

async function applyDeliveryInventoryIssue(
  tx: Prisma.TransactionClient,
  input: { deliveryOrderId: string; createdById?: string | null },
) {
  const deliveryOrder = await tx.deliveryOrder.findFirst({
    where: { id: input.deliveryOrderId, deletedAt: null },
    include: {
      lines: {
        include: {
          inventoryItem: {
            select: { id: true, name: true, isStockTracked: true, standardCost: true, trackingMode: true },
          },
          warehouse: { select: { id: true, name: true } },
        },
        orderBy: { lineNumber: "asc" },
      },
    },
  });

  if (!deliveryOrder) return;

  const existingIssue = await tx.inventoryLedgerEntry.count({
    where: {
      referenceType: "DELIVERY_ORDER",
      referenceId: deliveryOrder.id,
      movementType: InventoryMovementType.ISSUE,
      bucketType: InventoryBucketType.SALE_STOCK,
    },
  });

  if (existingIssue > 0) return;

  for (const line of deliveryOrder.lines) {
    if (!line.inventoryItemId || !line.warehouseId || !line.inventoryItem?.isStockTracked) continue;

    const quantity = Number(line.qtyDelivered ?? line.qtyShipped ?? 0);
    if (quantity <= 0) continue;

    const balance = await ensureInventoryBalance(tx, {
      itemId: line.inventoryItemId,
      warehouseId: line.warehouseId,
      bucketType: InventoryBucketType.SALE_STOCK,
    });
    const quantityBefore = Number(balance.qtyOnHand ?? 0);
    const quantityAfter = quantityBefore - quantity;

    if (quantityAfter < 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Stok sale stock untuk ${line.inventoryItem.name} di ${line.warehouse?.name ?? "gudang"} tidak mencukupi untuk delivery`,
      });
    }

    const isSerialized = line.inventoryItem.trackingMode === "SERIAL" || line.inventoryItem.trackingMode === "BOTH";
    const deliveryMarker = `[DELIVERY_ORDER:${deliveryOrder.id}]`;

    if (isSerialized) {
      const serializedUnits = await tx.inventoryItemUnit.findMany({
        where: {
          inventoryItemId: line.inventoryItemId,
          warehouseId: line.warehouseId,
          bucketType: InventoryBucketType.SALE_STOCK,
          status: "IN_STOCK",
        },
        orderBy: [{ receivedDate: "asc" }, { createdAt: "asc" }],
        take: quantity,
        select: { id: true, receiptBatchId: true, notes: true },
      });

      if (serializedUnits.length < quantity) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unit serial untuk ${line.inventoryItem.name} tidak mencukupi untuk delivery`,
        });
      }

      await tx.inventoryItemUnit.updateMany({
        where: { id: { in: serializedUnits.map((unit) => unit.id) } },
        data: {
          status: "ISSUED",
          warehouseId: null,
        },
      });

      for (const unit of serializedUnits) {
        await tx.inventoryItemUnit.update({
          where: { id: unit.id },
          data: {
            notes: unit.notes ? `${unit.notes}\n${deliveryMarker}` : deliveryMarker,
          },
        });
      }

      const batchIssuedMap = new Map<string, number>();
      for (const unit of serializedUnits) {
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
          data: { remainingQty: Math.max(Number(batch.remainingQty ?? 0) - qtyIssuedFromBatch, 0) },
        });
      }
    } else {
      let qtyToConsumeFromBatches = quantity;
      const fifoBatches = await tx.inventoryReceiptBatch.findMany({
        where: {
          inventoryItemId: line.inventoryItemId,
          warehouseId: line.warehouseId,
          bucketType: InventoryBucketType.SALE_STOCK,
          remainingQty: { gt: 0 },
        },
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
          data: { remainingQty: batchRemaining - consumeQty },
        });
        qtyToConsumeFromBatches -= consumeQty;
      }
    }

    await tx.inventoryBalance.update({
      where: { id: balance.id },
      data: { qtyOnHand: quantityAfter },
    });

    await tx.inventoryLedgerEntry.create({
      data: {
        itemId: line.inventoryItemId,
        warehouseId: line.warehouseId,
        bucketType: InventoryBucketType.SALE_STOCK,
        movementType: InventoryMovementType.ISSUE,
        referenceType: "DELIVERY_ORDER",
        referenceId: deliveryOrder.id,
        quantityBefore,
        quantityChange: -quantity,
        quantityAfter,
        unitCost: line.inventoryItem.standardCost ?? undefined,
        totalCost: line.inventoryItem.standardCost ? Number(line.inventoryItem.standardCost) * quantity : undefined,
        notes: `Stock keluar untuk ${deliveryOrder.deliveryOrderNumber}`,
        movementDate: deliveryOrder.deliveredAt ?? deliveryOrder.shipDate,
        createdById: input.createdById ?? undefined,
      },
    });
  }
}

async function reverseDeliveryInventoryIssue(
  tx: Prisma.TransactionClient,
  input: { deliveryOrderId: string; createdById?: string | null; reason: "RETURNED" | "CANCELED" },
) {
  const deliveryOrder = await tx.deliveryOrder.findFirst({
    where: { id: input.deliveryOrderId },
    include: {
      lines: {
        include: {
          inventoryItem: {
            select: { id: true, name: true, isStockTracked: true, standardCost: true, trackingMode: true },
          },
          warehouse: { select: { id: true, name: true } },
        },
        orderBy: { lineNumber: "asc" },
      },
    },
  });

  if (!deliveryOrder) return;

  const existingIssue = await tx.inventoryLedgerEntry.count({
    where: {
      referenceType: "DELIVERY_ORDER",
      referenceId: deliveryOrder.id,
      movementType: InventoryMovementType.ISSUE,
      bucketType: InventoryBucketType.SALE_STOCK,
    },
  });
  const existingReversal = await tx.inventoryLedgerEntry.count({
    where: {
      referenceType: `DELIVERY_ORDER_${input.reason}`,
      referenceId: deliveryOrder.id,
      movementType: InventoryMovementType.RECEIPT,
      bucketType: InventoryBucketType.SALE_STOCK,
    },
  });

  if (existingIssue === 0 || existingReversal > 0) return;

  for (const line of deliveryOrder.lines) {
    if (!line.inventoryItemId || !line.warehouseId || !line.inventoryItem?.isStockTracked) continue;

    const quantity = Number(line.qtyDelivered ?? line.qtyShipped ?? 0);
    if (quantity <= 0) continue;

    const balance = await ensureInventoryBalance(tx, {
      itemId: line.inventoryItemId,
      warehouseId: line.warehouseId,
      bucketType: InventoryBucketType.SALE_STOCK,
    });
    const quantityBefore = Number(balance.qtyOnHand ?? 0);
    const quantityAfter = quantityBefore + quantity;
    const isSerialized = line.inventoryItem.trackingMode === "SERIAL" || line.inventoryItem.trackingMode === "BOTH";
    const deliveryMarker = `[DELIVERY_ORDER:${deliveryOrder.id}]`;

    if (isSerialized) {
      const issuedUnits = await tx.inventoryItemUnit.findMany({
        where: {
          inventoryItemId: line.inventoryItemId,
          status: "ISSUED",
          bucketType: InventoryBucketType.SALE_STOCK,
          notes: { contains: deliveryMarker },
        },
        orderBy: [{ updatedAt: "desc" }],
        take: quantity,
        select: { id: true, receiptBatchId: true, notes: true },
      });

      await tx.inventoryItemUnit.updateMany({
        where: { id: { in: issuedUnits.map((unit) => unit.id) } },
        data: {
          status: "IN_STOCK",
          warehouseId: line.warehouseId,
        },
      });

      for (const unit of issuedUnits) {
        await tx.inventoryItemUnit.update({
          where: { id: unit.id },
          data: {
            notes: unit.notes?.replace(`\n${deliveryMarker}`, "").replace(deliveryMarker, "") ?? null,
          },
        });
      }

      const batchReturnedMap = new Map<string, number>();
      for (const unit of issuedUnits) {
        if (!unit.receiptBatchId) continue;
        batchReturnedMap.set(unit.receiptBatchId, (batchReturnedMap.get(unit.receiptBatchId) ?? 0) + 1);
      }

      for (const [receiptBatchId, qtyReturnedToBatch] of batchReturnedMap.entries()) {
        const batch = await tx.inventoryReceiptBatch.findFirst({
          where: { id: receiptBatchId },
          select: { id: true, remainingQty: true },
        });
        if (!batch) continue;
        await tx.inventoryReceiptBatch.update({
          where: { id: batch.id },
          data: { remainingQty: Number(batch.remainingQty ?? 0) + qtyReturnedToBatch },
        });
      }
    }

    await tx.inventoryBalance.update({
      where: { id: balance.id },
      data: { qtyOnHand: quantityAfter },
    });

    await tx.inventoryLedgerEntry.create({
      data: {
        itemId: line.inventoryItemId,
        warehouseId: line.warehouseId,
        bucketType: InventoryBucketType.SALE_STOCK,
        movementType: InventoryMovementType.RECEIPT,
        referenceType: `DELIVERY_ORDER_${input.reason}`,
        referenceId: deliveryOrder.id,
        quantityBefore,
        quantityChange: quantity,
        quantityAfter,
        unitCost: line.inventoryItem.standardCost ?? undefined,
        totalCost: line.inventoryItem.standardCost ? Number(line.inventoryItem.standardCost) * quantity : undefined,
        notes: `Pengembalian stock untuk ${deliveryOrder.deliveryOrderNumber}`,
        movementDate: new Date(),
        createdById: input.createdById ?? undefined,
      },
    });
  }
}

function canTransitionSalesOrderStatus(current: SalesOrderStatus, next: SalesOrderStatus) {
  const allowed: Record<SalesOrderStatus, SalesOrderStatus[]> = {
    DRAFT: [SalesOrderStatus.CONFIRMED, SalesOrderStatus.CANCELED],
    CONFIRMED: [SalesOrderStatus.READY_TO_SHIP, SalesOrderStatus.CANCELED],
    READY_TO_SHIP: [SalesOrderStatus.PARTIALLY_DELIVERED, SalesOrderStatus.DELIVERED, SalesOrderStatus.CANCELED],
    PARTIALLY_DELIVERED: [SalesOrderStatus.DELIVERED, SalesOrderStatus.CANCELED],
    DELIVERED: [SalesOrderStatus.CLOSED],
    CLOSED: [],
    CANCELED: [],
  };

  return current === next || allowed[current].includes(next);
}

function canTransitionDeliveryOrderStatus(current: DeliveryOrderStatus, next: DeliveryOrderStatus) {
  const allowed: Record<DeliveryOrderStatus, DeliveryOrderStatus[]> = {
    DRAFT: [DeliveryOrderStatus.READY, DeliveryOrderStatus.CANCELED],
    READY: [DeliveryOrderStatus.IN_TRANSIT, DeliveryOrderStatus.CANCELED],
    IN_TRANSIT: [DeliveryOrderStatus.DELIVERED, DeliveryOrderStatus.RETURNED],
    DELIVERED: [],
    RETURNED: [],
    CANCELED: [],
  };

  return current === next || allowed[current].includes(next);
}

function canTransitionSalesInvoiceStatus(current: SalesInvoiceStatus, next: SalesInvoiceStatus) {
  const allowed: Record<SalesInvoiceStatus, SalesInvoiceStatus[]> = {
    DRAFT: [SalesInvoiceStatus.SENT, SalesInvoiceStatus.CANCELED],
    SENT: [SalesInvoiceStatus.PARTIALLY_PAID, SalesInvoiceStatus.PAID, SalesInvoiceStatus.OVERDUE, SalesInvoiceStatus.CANCELED],
    PARTIALLY_PAID: [SalesInvoiceStatus.PAID, SalesInvoiceStatus.OVERDUE],
    PAID: [],
    OVERDUE: [SalesInvoiceStatus.PARTIALLY_PAID, SalesInvoiceStatus.PAID],
    CANCELED: [],
  };

  return current === next || allowed[current].includes(next);
}

async function syncSalesOrderWorkflowState(tx: Prisma.TransactionClient, salesOrderId: string) {
  const salesOrder = await tx.salesOrder.findFirst({
    where: { id: salesOrderId, deletedAt: null },
    include: {
      deliveryOrders: {
        where: { deletedAt: null },
        select: { id: true, status: true, deliveredAt: true },
      },
      salesInvoices: {
        where: { deletedAt: null },
        select: { id: true, status: true, paidAt: true },
      },
    },
  });

  if (!salesOrder) return null;

  const activeDeliveries = salesOrder.deliveryOrders.filter((row) => row.status !== DeliveryOrderStatus.CANCELED);
  const activeInvoices = salesOrder.salesInvoices.filter((row) => row.status !== SalesInvoiceStatus.CANCELED);
  const hasPaidInvoice = activeInvoices.some((row) => row.status === SalesInvoiceStatus.PAID);
  const hasPartialInvoice = activeInvoices.some((row) => row.status === SalesInvoiceStatus.PARTIALLY_PAID);
  const hasInvoice = activeInvoices.length > 0;
  const hasDeliveredDo = activeDeliveries.some((row) => row.status === DeliveryOrderStatus.DELIVERED);
  const hasTransitDo = activeDeliveries.some((row) => row.status === DeliveryOrderStatus.IN_TRANSIT);
  const hasReadyDo = activeDeliveries.some((row) => row.status === DeliveryOrderStatus.READY);

  let nextStatus = salesOrder.status;
  if (salesOrder.status === SalesOrderStatus.CANCELED) {
    nextStatus = SalesOrderStatus.CANCELED;
  } else if (hasPaidInvoice) {
    nextStatus = SalesOrderStatus.CLOSED;
  } else if (hasDeliveredDo) {
    nextStatus = SalesOrderStatus.DELIVERED;
  } else if (hasTransitDo) {
    nextStatus = SalesOrderStatus.PARTIALLY_DELIVERED;
  } else if (salesOrder.requiresDelivery && hasReadyDo) {
    nextStatus = SalesOrderStatus.READY_TO_SHIP;
  } else if (salesOrder.requiresDelivery) {
    nextStatus = salesOrder.status === SalesOrderStatus.DRAFT ? SalesOrderStatus.DRAFT : SalesOrderStatus.CONFIRMED;
  } else if (hasInvoice || hasPartialInvoice) {
    nextStatus = hasPaidInvoice ? SalesOrderStatus.CLOSED : SalesOrderStatus.CONFIRMED;
  }

  return tx.salesOrder.update({
    where: { id: salesOrder.id },
    data: {
      status: nextStatus,
      deliveredAt: hasDeliveredDo ? (salesOrder.deliveredAt ?? new Date()) : null,
      closedAt: hasPaidInvoice ? (salesOrder.closedAt ?? new Date()) : null,
      canceledAt: nextStatus === SalesOrderStatus.CANCELED ? (salesOrder.canceledAt ?? new Date()) : null,
    },
  });
}

export const businessRouter = createTRPCRouter({
  purchaseSummary: permissionProcedure("purchases", "read")
    .output(z.any())
    .query(async ({ ctx }) => {
      const [purchaseRequestCount, purchaseOrderCount, goodsReceiptCount, vendorInvoiceCount] = await Promise.all([
        ctx.db.purchaseRequest.count({ where: { deletedAt: null } }),
        ctx.db.purchaseOrder.count({ where: { deletedAt: null } }),
        ctx.db.goodsReceipt.count({ where: { deletedAt: null } }),
        ctx.db.vendorInvoice.count({ where: { deletedAt: null } }),
      ]);

      return {
        purchaseRequestCount,
        purchaseOrderCount,
        goodsReceiptCount,
        vendorInvoiceCount,
      };
    }),

  salesSummary: permissionProcedure("sales", "read")
    .output(z.any())
    .query(async ({ ctx }) => {
      const [quotationCount, salesOrderCount, deliveryOrderCount, salesInvoiceCount] = await Promise.all([
        ctx.db.salesQuotation.count({ where: { deletedAt: null } }),
        ctx.db.salesOrder.count({ where: { deletedAt: null } }),
        ctx.db.deliveryOrder.count({ where: { deletedAt: null } }),
        ctx.db.salesInvoice.count({ where: { deletedAt: null } }),
      ]);

      return {
        quotationCount,
        salesOrderCount,
        deliveryOrderCount,
        salesInvoiceCount,
      };
    }),

  listPurchaseFlows: permissionProcedure("purchases", "read")
    .input(searchInput)
    .output(z.any())
    .query(async ({ ctx, input }) => {
      return ctx.db.purchaseRequest.findMany({
        where: {
          deletedAt: null,
          ...(input.search
            ? {
                OR: [
                  { requestNumber: { contains: input.search, mode: "insensitive" } },
                  { requesterName: { contains: input.search, mode: "insensitive" } },
                  { vendor: { company: { contains: input.search, mode: "insensitive" } } },
                  { purchaseOrders: { some: { orderNumber: { contains: input.search, mode: "insensitive" } } } },
                ],
              }
            : {}),
        },
        include: {
          vendor: { select: { id: true, company: true } },
          lines: {
            include: {
              inventoryItem: { select: { id: true, sku: true, name: true } },
            },
            orderBy: { lineNumber: "asc" },
          },
          purchaseOrders: {
            where: { deletedAt: null },
            include: {
              goodsReceipts: {
                where: { deletedAt: null },
                select: { id: true, receiptNumber: true, status: true, receiptDate: true },
                orderBy: { createdAt: "desc" },
              },
              vendorInvoices: {
                where: { deletedAt: null },
                select: { id: true, invoiceNumber: true, status: true, invoiceDate: true },
                orderBy: { createdAt: "desc" },
              },
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  listSalesFlows: permissionProcedure("sales", "read")
    .input(searchInput)
    .output(z.any())
    .query(async ({ ctx, input }) => {
      return ctx.db.salesQuotation.findMany({
        where: {
          deletedAt: null,
          ...(input.search
            ? {
                OR: [
                  { quotationNumber: { contains: input.search, mode: "insensitive" } },
                  { customer: { company: { contains: input.search, mode: "insensitive" } } },
                  { salesOwnerName: { contains: input.search, mode: "insensitive" } },
                  { salesOrders: { some: { salesOrderNumber: { contains: input.search, mode: "insensitive" } } } },
                ],
              }
            : {}),
        },
        include: {
          customer: { select: { id: true, company: true } },
          lines: {
            include: {
              inventoryItem: { select: { id: true, sku: true, name: true } },
            },
            orderBy: { lineNumber: "asc" },
          },
          salesOrders: {
            where: { deletedAt: null },
            include: {
              deliveryOrders: {
                where: { deletedAt: null },
                select: { id: true, deliveryOrderNumber: true, status: true, shipDate: true },
                orderBy: { createdAt: "desc" },
              },
              salesInvoices: {
                where: { deletedAt: null },
                select: { id: true, salesInvoiceNumber: true, status: true, issueDate: true },
                orderBy: { createdAt: "desc" },
              },
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  listPurchaseRequests: permissionProcedure("purchases", "read")
    .input(searchInput.extend({ status: purchaseRequestStatusSchema.optional() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      return ctx.db.purchaseRequest.findMany({
        where: {
          deletedAt: null,
          ...(input.status ? { status: input.status } : {}),
          ...(input.search
            ? {
                OR: [
                  { requestNumber: { contains: input.search, mode: "insensitive" } },
                  { requesterName: { contains: input.search, mode: "insensitive" } },
                  { departmentName: { contains: input.search, mode: "insensitive" } },
                  { notes: { contains: input.search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        include: {
          vendor: { select: { id: true, company: true } },
          department: { select: { id: true, name: true, code: true } },
          lines: {
            include: {
              inventoryItem: { select: { id: true, sku: true, name: true } },
              warehouse: { select: { id: true, code: true, name: true } },
            },
            orderBy: { lineNumber: "asc" },
          },
          purchaseOrders: { select: { id: true, orderNumber: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  listPurchaseOrders: permissionProcedure("purchases", "read")
    .input(searchInput.extend({ status: purchaseOrderStatusSchema.optional() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      return ctx.db.purchaseOrder.findMany({
        where: {
          deletedAt: null,
          ...(input.status ? { status: input.status } : {}),
          ...(input.search
            ? {
                OR: [
                  { orderNumber: { contains: input.search, mode: "insensitive" } },
                  { buyerName: { contains: input.search, mode: "insensitive" } },
                  { vendor: { company: { contains: input.search, mode: "insensitive" } } },
                  { purchaseRequest: { requestNumber: { contains: input.search, mode: "insensitive" } } },
                ],
              }
            : {}),
        },
        include: {
          vendor: { select: { id: true, company: true } },
          purchaseRequest: { select: { id: true, requestNumber: true, status: true } },
          lines: {
            include: {
              inventoryItem: { select: { id: true, sku: true, name: true } },
              warehouse: { select: { id: true, code: true, name: true } },
            },
            orderBy: { lineNumber: "asc" },
          },
          goodsReceipts: { select: { id: true, receiptNumber: true, status: true } },
          vendorInvoices: { select: { id: true, invoiceNumber: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  listGoodsReceipts: permissionProcedure("purchases", "read")
    .input(searchInput.extend({ status: goodsReceiptStatusSchema.optional() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      return ctx.db.goodsReceipt.findMany({
        where: {
          deletedAt: null,
          ...(input.status ? { status: input.status } : {}),
          ...(input.search
            ? {
                OR: [
                  { receiptNumber: { contains: input.search, mode: "insensitive" } },
                  { vendor: { company: { contains: input.search, mode: "insensitive" } } },
                  { purchaseOrder: { orderNumber: { contains: input.search, mode: "insensitive" } } },
                ],
              }
            : {}),
        },
        include: {
          vendor: { select: { id: true, company: true } },
          purchaseOrder: { select: { id: true, orderNumber: true, status: true, procurementMode: true, requiresReceipt: true } },
          warehouse: { select: { id: true, code: true, name: true } },
          lines: {
            include: {
              inventoryItem: { select: { id: true, sku: true, name: true } },
              warehouse: { select: { id: true, code: true, name: true } },
            },
            orderBy: { lineNumber: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  listVendorInvoices: permissionProcedure("purchases", "read")
    .input(searchInput.extend({ status: vendorInvoiceStatusSchema.optional() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      return ctx.db.vendorInvoice.findMany({
        where: {
          deletedAt: null,
          ...(input.status ? { status: input.status } : {}),
          ...(input.search
            ? {
                OR: [
                  { invoiceNumber: { contains: input.search, mode: "insensitive" } },
                  { vendor: { company: { contains: input.search, mode: "insensitive" } } },
                  { purchaseOrder: { orderNumber: { contains: input.search, mode: "insensitive" } } },
                  { goodsReceipt: { receiptNumber: { contains: input.search, mode: "insensitive" } } },
                ],
              }
            : {}),
        },
        include: {
          vendor: { select: { id: true, company: true } },
          purchaseOrder: { select: { id: true, orderNumber: true, status: true, procurementMode: true, requiresReceipt: true } },
          goodsReceipt: { select: { id: true, receiptNumber: true, status: true } },
          lines: {
            include: {
              inventoryItem: { select: { id: true, sku: true, name: true } },
            },
            orderBy: { lineNumber: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  salesQuotationFormOptions: permissionProcedure("sales", "read")
    .output(z.any())
    .query(async ({ ctx }) => {
      const [customers, items, warehouses] = await Promise.all([
        ctx.db.crmCustomer.findMany({
          where: {
            deletedAt: null,
            isCustomer: true,
          },
          select: { id: true, company: true },
          orderBy: { company: "asc" },
        }),
        ctx.db.inventoryItem.findMany({
          where: {
            deletedAt: null,
            isActive: true,
            usageType: { in: ["SALE", "BOTH"] },
            OR: [
              { isStockTracked: false },
              { balances: { some: { bucketType: "SALE_STOCK" } } },
            ],
          },
          select: {
            id: true,
            sku: true,
            name: true,
            itemType: true,
            isStockTracked: true,
            standardCost: true,
            unitOfMeasure: true,
            balances: {
              where: {
                bucketType: "SALE_STOCK",
                warehouse: { deletedAt: null, isActive: true },
              },
              select: {
                warehouseId: true,
                qtyOnHand: true,
                qtyReserved: true,
                warehouse: { select: { id: true, code: true, name: true } },
              },
              orderBy: [{ warehouse: { name: "asc" } }],
            },
          },
          orderBy: { name: "asc" },
        }),
        ctx.db.warehouse.findMany({
          where: { deletedAt: null, isActive: true },
          select: { id: true, code: true, name: true },
          orderBy: { name: "asc" },
        }),
      ]);

      return { customers, items, warehouses };
    }),

  listSalesQuotations: permissionProcedure("sales", "read")
    .input(searchInput.extend({ status: salesQuotationStatusSchema.optional() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      return ctx.db.salesQuotation.findMany({
        where: {
          deletedAt: null,
          ...(input.status ? { status: input.status } : {}),
          ...(input.search
            ? {
                OR: [
                  { quotationNumber: { contains: input.search, mode: "insensitive" } },
                  { salesOwnerName: { contains: input.search, mode: "insensitive" } },
                  { customer: { company: { contains: input.search, mode: "insensitive" } } },
                ],
              }
            : {}),
        },
        include: {
          customer: { select: { id: true, company: true } },
          lines: {
            include: {
              inventoryItem: { select: { id: true, sku: true, name: true, itemType: true, unitOfMeasure: true } },
              warehouse: { select: { id: true, code: true, name: true } },
            },
            orderBy: { lineNumber: "asc" },
          },
          salesOrders: { select: { id: true, salesOrderNumber: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  listSalesOrders: permissionProcedure("sales", "read")
    .input(searchInput.extend({ status: salesOrderStatusSchema.optional() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      return ctx.db.salesOrder.findMany({
        where: {
          deletedAt: null,
          ...(input.status ? { status: input.status } : {}),
          ...(input.search
            ? {
                OR: [
                  { salesOrderNumber: { contains: input.search, mode: "insensitive" } },
                  { salesOwnerName: { contains: input.search, mode: "insensitive" } },
                  { customer: { company: { contains: input.search, mode: "insensitive" } } },
                  { quotation: { quotationNumber: { contains: input.search, mode: "insensitive" } } },
                ],
              }
            : {}),
        },
        include: {
          customer: { select: { id: true, company: true } },
          quotation: { select: { id: true, quotationNumber: true, status: true } },
          lines: {
            include: {
              inventoryItem: { select: { id: true, sku: true, name: true, unitOfMeasure: true } },
              warehouse: { select: { id: true, code: true, name: true } },
            },
            orderBy: { lineNumber: "asc" },
          },
          deliveryOrders: { select: { id: true, deliveryOrderNumber: true, status: true } },
          salesInvoices: { select: { id: true, salesInvoiceNumber: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  listDeliveryOrders: permissionProcedure("sales", "read")
    .input(searchInput.extend({ status: deliveryOrderStatusSchema.optional() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.deliveryOrder.findMany({
        where: {
          deletedAt: null,
          ...(input.status ? { status: input.status } : {}),
          ...(input.search
            ? {
                OR: [
                  { deliveryOrderNumber: { contains: input.search, mode: "insensitive" } },
                  { carrierName: { contains: input.search, mode: "insensitive" } },
                  { customer: { company: { contains: input.search, mode: "insensitive" } } },
                  { salesOrder: { salesOrderNumber: { contains: input.search, mode: "insensitive" } } },
                ],
              }
            : {}),
        },
        include: {
          customer: { select: { id: true, company: true } },
          salesOrder: { select: { id: true, salesOrderNumber: true, status: true, fulfillmentMode: true, requiresDelivery: true } },
          warehouse: { select: { id: true, code: true, name: true } },
          salesInvoices: { select: { id: true, salesInvoiceNumber: true, status: true } },
          lines: {
            include: {
              inventoryItem: { select: { id: true, sku: true, name: true, unitOfMeasure: true } },
              warehouse: { select: { id: true, code: true, name: true } },
            },
            orderBy: { lineNumber: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });

      const rowsWithSerials = await Promise.all(
        rows.map(async (row) => {
          const serialUnits = await ctx.db.inventoryItemUnit.findMany({
            where: {
              notes: { contains: `[DELIVERY_ORDER:${row.id}]` },
            },
            select: {
              id: true,
              serialNumber: true,
              assetTag: true,
              batchNumber: true,
              inventoryItemId: true,
            },
            orderBy: [{ updatedAt: "desc" }],
          });

          return {
            ...row,
            serialUnits,
          };
        }),
      );

      return rowsWithSerials;
    }),

  listSalesInvoices: permissionProcedure("sales", "read")
    .input(searchInput.extend({ status: salesInvoiceStatusSchema.optional() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      return ctx.db.salesInvoice.findMany({
        where: {
          deletedAt: null,
          ...(input.status ? { status: input.status } : {}),
          ...(input.search
            ? {
                OR: [
                  { salesInvoiceNumber: { contains: input.search, mode: "insensitive" } },
                  { customer: { company: { contains: input.search, mode: "insensitive" } } },
                  { salesOrder: { salesOrderNumber: { contains: input.search, mode: "insensitive" } } },
                  { deliveryOrder: { deliveryOrderNumber: { contains: input.search, mode: "insensitive" } } },
                ],
              }
            : {}),
        },
        include: {
          customer: { select: { id: true, company: true } },
          salesOrder: { select: { id: true, salesOrderNumber: true, status: true, fulfillmentMode: true, requiresDelivery: true } },
          deliveryOrder: { select: { id: true, deliveryOrderNumber: true, status: true } },
          lines: {
            include: {
              inventoryItem: { select: { id: true, sku: true, name: true, unitOfMeasure: true } },
            },
            orderBy: { lineNumber: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  convertPurchaseRequestToOrder: permissionProcedure("purchases", "create")
    .input(convertPurchaseRequestInput)
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const buyerName = ctx.session.user.name ?? ctx.session.user.email ?? "System";

      return ctx.db.$transaction(async (tx) => {
        const purchaseRequest = await tx.purchaseRequest.findFirst({
          where: {
            id: input.purchaseRequestId,
            deletedAt: null,
          },
          include: {
            lines: {
              include: {
                inventoryItem: {
                  select: {
                    id: true,
                    itemType: true,
                  },
                },
              },
              orderBy: { lineNumber: "asc" },
            },
            purchaseOrders: {
              where: { deletedAt: null },
              select: { id: true, orderNumber: true },
            },
          },
        });

        if (!purchaseRequest) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Purchase request tidak ditemukan",
          });
        }

        if (purchaseRequest.purchaseOrders.length > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Purchase request sudah dikonversi ke PO ${purchaseRequest.purchaseOrders[0]?.orderNumber ?? "lainnya"}`,
          });
        }

        if (!purchaseRequest.vendorId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Purchase request harus memiliki vendor sebelum dikonversi",
          });
        }

        if (purchaseRequest.lines.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Purchase request belum memiliki line item",
          });
        }

        if (
          purchaseRequest.status === PurchaseRequestStatus.REJECTED ||
          purchaseRequest.status === PurchaseRequestStatus.CANCELED ||
          purchaseRequest.status === PurchaseRequestStatus.CLOSED
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Purchase request dengan status ${purchaseRequest.status} tidak bisa dikonversi`,
          });
        }

        const orderNumber = await generatePurchaseOrderNumber(tx);
        const expectedDate = input.expectedDate ?? purchaseRequest.neededDate ?? undefined;
        const procurementMode = classifyBusinessFlowFromItems(
          purchaseRequest.lines.map((line) => line.inventoryItem?.itemType),
        );
        const requiresReceipt = procurementMode !== BusinessFlowType.SERVICE;

        const purchaseOrder = await tx.purchaseOrder.create({
          data: {
            orderNumber,
            purchaseRequestId: purchaseRequest.id,
            vendorId: purchaseRequest.vendorId,
            buyerId: ctx.session.user.id,
            buyerName,
            orderDate: new Date(),
            expectedDate,
            status: PurchaseOrderStatus.ISSUED,
            procurementMode,
            requiresReceipt,
            subtotalAmount: purchaseRequest.subtotalAmount,
            taxAmount: purchaseRequest.taxAmount,
            totalAmount: purchaseRequest.totalAmount,
            notes: input.notes ?? purchaseRequest.notes,
            issuedAt: new Date(),
            lines: {
              create: purchaseRequest.lines.map((line) => ({
                purchaseRequestLineId: line.id,
                inventoryItemId: line.inventoryItemId,
                warehouseId: line.warehouseId,
                lineNumber: line.lineNumber,
                description: line.description,
                qtyOrdered: line.qtyRequested,
                qtyReceived: 0,
                qtyInvoiced: 0,
                unitPrice: line.unitPriceEstimate,
                lineTotal: line.lineTotalEstimate,
                notes: line.notes,
              })),
            },
          },
          include: {
            vendor: { select: { id: true, company: true } },
            purchaseRequest: { select: { id: true, requestNumber: true, status: true } },
            lines: true,
          },
        });

        await Promise.all([
          tx.purchaseRequest.update({
            where: { id: purchaseRequest.id },
            data: {
              status: PurchaseRequestStatus.CONVERTED,
              procurementMode,
              convertedAt: new Date(),
            },
          }),
          ...purchaseRequest.lines.map((line) =>
            tx.purchaseRequestLine.update({
              where: { id: line.id },
              data: { qtyOrdered: line.qtyRequested },
            }),
          ),
        ]);

        return purchaseOrder;
      });
    }),

  createSalesQuotation: permissionProcedure("sales", "create")
    .input(createSalesQuotationInput)
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const salesOwnerName = ctx.session.user.name ?? ctx.session.user.email ?? "System";

      return ctx.db.$transaction(async (tx) => {
        const [customer, inventoryItem, warehouse] = await Promise.all([
          tx.crmCustomer.findFirst({
            where: { id: input.customerId, deletedAt: null, isCustomer: true },
            select: { id: true, company: true },
          }),
          tx.inventoryItem.findFirst({
            where: {
              id: input.inventoryItemId,
              deletedAt: null,
              isActive: true,
              usageType: { in: ["SALE", "BOTH"] },
            },
            select: {
              id: true,
              name: true,
              itemType: true,
              isStockTracked: true,
              balances: {
                where: { bucketType: "SALE_STOCK" },
                select: { warehouseId: true, qtyOnHand: true, qtyReserved: true },
              },
            },
          }),
          input.warehouseId
            ? tx.warehouse.findFirst({
                where: { id: input.warehouseId, deletedAt: null, isActive: true },
                select: { id: true, code: true, name: true },
              })
            : Promise.resolve(null),
        ]);

        if (!customer) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Customer tidak ditemukan" });
        }
        if (!inventoryItem) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Item inventory tidak ditemukan" });
        }
        if (input.warehouseId && !warehouse) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Gudang tidak ditemukan" });
        }

        if (inventoryItem.isStockTracked) {
          if (!input.warehouseId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Gudang wajib dipilih untuk item yang memakai stok inventory",
            });
          }

          const balance = inventoryItem.balances.find(
            (entry) => entry.warehouseId === input.warehouseId,
          );
          const availableQty = Number(balance?.qtyOnHand ?? 0) - Number(balance?.qtyReserved ?? 0);

          if (input.qtyQuoted > availableQty) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Qty quotation melebihi stok tersedia (${availableQty}) di gudang terpilih`,
            });
          }
        }

        const quotationNumber = await generateSalesQuotationNumber(tx);
        const fulfillmentMode = classifyBusinessFlowFromItems([inventoryItem.itemType]);
        const lineTotal = input.qtyQuoted * input.unitPrice;

        return tx.salesQuotation.create({
          data: {
            quotationNumber,
            customerId: customer.id,
            salesOwnerId: ctx.session.user.id,
            salesOwnerName,
            issueDate: new Date(),
            validUntil: input.validUntil,
            status: SalesQuotationStatus.DRAFT,
            fulfillmentMode,
            subtotalAmount: lineTotal,
            taxAmount: 0,
            totalAmount: lineTotal,
            notes: input.notes,
            lines: {
              create: {
                inventoryItemId: inventoryItem.id,
                warehouseId: input.warehouseId ?? undefined,
                lineNumber: 1,
                description: input.description ?? inventoryItem.name,
                qtyQuoted: input.qtyQuoted,
                unitPrice: input.unitPrice,
                discountAmount: 0,
                lineTotal,
                notes: input.notes,
              },
            },
          },
          include: {
            customer: { select: { id: true, company: true } },
            lines: {
              include: {
                inventoryItem: { select: { id: true, sku: true, name: true } },
                warehouse: { select: { id: true, code: true, name: true } },
              },
            },
          },
        });
      });
    }),

  updateSalesQuotation: permissionProcedure("sales", "create")
    .input(updateSalesQuotationInput)
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const [salesQuotation, customer, inventoryItem, warehouse] = await Promise.all([
          tx.salesQuotation.findFirst({
            where: { id: input.salesQuotationId, deletedAt: null },
            include: {
              salesOrders: { select: { id: true, salesOrderNumber: true } },
              lines: { select: { id: true } },
            },
          }),
          tx.crmCustomer.findFirst({
            where: { id: input.customerId, deletedAt: null, isCustomer: true },
            select: { id: true, company: true },
          }),
          tx.inventoryItem.findFirst({
            where: {
              id: input.inventoryItemId,
              deletedAt: null,
              isActive: true,
              usageType: { in: ["SALE", "BOTH"] },
            },
            select: {
              id: true,
              name: true,
              itemType: true,
              isStockTracked: true,
              balances: {
                where: { bucketType: "SALE_STOCK" },
                select: { warehouseId: true, qtyOnHand: true, qtyReserved: true },
              },
            },
          }),
          input.warehouseId
            ? tx.warehouse.findFirst({
                where: { id: input.warehouseId, deletedAt: null, isActive: true },
                select: { id: true, code: true, name: true },
              })
            : Promise.resolve(null),
        ]);

        if (!salesQuotation) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Sales quotation tidak ditemukan" });
        }
        if (salesQuotation.salesOrders.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Sales quotation sudah dikonversi ke SO ${salesQuotation.salesOrders[0]?.salesOrderNumber ?? "lainnya"}`,
          });
        }
        if (!customer) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Customer tidak ditemukan" });
        }
        if (!inventoryItem) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Item inventory sale stock tidak ditemukan" });
        }
        if (input.warehouseId && !warehouse) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Gudang tidak ditemukan" });
        }

        if (inventoryItem.isStockTracked) {
          if (!input.warehouseId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Gudang wajib dipilih untuk item yang memakai stok inventory",
            });
          }

          const balance = inventoryItem.balances.find((entry) => entry.warehouseId === input.warehouseId);
          const availableQty = Number(balance?.qtyOnHand ?? 0) - Number(balance?.qtyReserved ?? 0);
          if (input.qtyQuoted > availableQty) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Qty quotation melebihi stok tersedia (${availableQty}) di gudang terpilih`,
            });
          }
        }

        const fulfillmentMode = classifyBusinessFlowFromItems([inventoryItem.itemType]);
        const lineTotal = input.qtyQuoted * input.unitPrice;

        await tx.salesQuotationLine.deleteMany({ where: { salesQuotationId: salesQuotation.id } });

        return tx.salesQuotation.update({
          where: { id: salesQuotation.id },
          data: {
            customerId: customer.id,
            validUntil: input.validUntil,
            notes: input.notes,
            fulfillmentMode,
            subtotalAmount: lineTotal,
            taxAmount: 0,
            totalAmount: lineTotal,
            lines: {
              create: {
                inventoryItemId: inventoryItem.id,
                warehouseId: input.warehouseId ?? undefined,
                lineNumber: 1,
                description: input.description ?? inventoryItem.name,
                qtyQuoted: input.qtyQuoted,
                unitPrice: input.unitPrice,
                discountAmount: 0,
                lineTotal,
                notes: input.notes,
              },
            },
          },
          include: {
            customer: { select: { id: true, company: true } },
            lines: {
              include: {
                inventoryItem: { select: { id: true, sku: true, name: true } },
                warehouse: { select: { id: true, code: true, name: true } },
              },
            },
          },
        });
      });
    }),

  deleteSalesQuotation: permissionProcedure("sales", "create")
    .input(deleteSalesQuotationInput)
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const salesQuotation = await tx.salesQuotation.findFirst({
          where: { id: input.salesQuotationId, deletedAt: null },
          include: { salesOrders: { select: { id: true, salesOrderNumber: true } } },
        });

        if (!salesQuotation) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Sales quotation tidak ditemukan" });
        }
        if (salesQuotation.salesOrders.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Sales quotation sudah dikonversi ke SO ${salesQuotation.salesOrders[0]?.salesOrderNumber ?? "lainnya"} dan tidak bisa dihapus`,
          });
        }

        return tx.salesQuotation.update({
          where: { id: salesQuotation.id },
          data: { deletedAt: new Date(), status: SalesQuotationStatus.CANCELED },
        });
      });
    }),

  convertSalesQuotationToOrder: permissionProcedure("sales", "create")
    .input(convertSalesQuotationInput)
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const salesOwnerName = ctx.session.user.name ?? ctx.session.user.email ?? "System";

      return ctx.db.$transaction(async (tx) => {
        const salesQuotation = await tx.salesQuotation.findFirst({
          where: {
            id: input.salesQuotationId,
            deletedAt: null,
          },
          include: {
            lines: {
              include: {
                inventoryItem: {
                  select: {
                    id: true,
                    itemType: true,
                  },
                },
              },
              orderBy: { lineNumber: "asc" },
            },
            salesOrders: {
              where: { deletedAt: null },
              select: { id: true, salesOrderNumber: true },
            },
          },
        });

        if (!salesQuotation) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Sales quotation tidak ditemukan",
          });
        }

        if (salesQuotation.salesOrders.length > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Sales quotation sudah dikonversi ke SO ${salesQuotation.salesOrders[0]?.salesOrderNumber ?? "lainnya"}`,
          });
        }

        if (salesQuotation.lines.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Sales quotation belum memiliki line item",
          });
        }

        if (
          salesQuotation.status === SalesQuotationStatus.REJECTED ||
          salesQuotation.status === SalesQuotationStatus.CANCELED ||
          salesQuotation.status === SalesQuotationStatus.EXPIRED
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Sales quotation dengan status ${salesQuotation.status} tidak bisa dikonversi`,
          });
        }

        const salesOrderNumber = await generateSalesOrderNumber(tx);
        const fulfillmentMode = classifyBusinessFlowFromItems(
          salesQuotation.lines.map((line) => line.inventoryItem?.itemType),
        );
        const requiresDelivery = fulfillmentMode !== BusinessFlowType.SERVICE;

        const salesOrder = await tx.salesOrder.create({
          data: {
            salesOrderNumber,
            quotationId: salesQuotation.id,
            customerId: salesQuotation.customerId,
            salesOwnerId: ctx.session.user.id,
            salesOwnerName,
            orderDate: new Date(),
            plannedShipDate: requiresDelivery ? input.plannedShipDate : undefined,
            status: SalesOrderStatus.CONFIRMED,
            fulfillmentMode,
            requiresDelivery,
            subtotalAmount: salesQuotation.subtotalAmount,
            taxAmount: salesQuotation.taxAmount,
            totalAmount: salesQuotation.totalAmount,
            notes: input.notes ?? salesQuotation.notes,
            lines: {
              create: salesQuotation.lines.map((line) => ({
                salesQuotationLineId: line.id,
                inventoryItemId: line.inventoryItemId,
                warehouseId: line.warehouseId,
                lineNumber: line.lineNumber,
                description: line.description,
                qtyOrdered: line.qtyQuoted,
                qtyDelivered: 0,
                qtyInvoiced: 0,
                unitPrice: line.unitPrice,
                lineTotal: line.lineTotal,
                notes: line.notes,
              })),
            },
          },
          include: {
            customer: { select: { id: true, company: true } },
            quotation: { select: { id: true, quotationNumber: true, status: true } },
            lines: true,
          },
        });

        await tx.salesQuotation.update({
          where: { id: salesQuotation.id },
          data: {
            status: SalesQuotationStatus.APPROVED,
            fulfillmentMode,
            approvedAt: salesQuotation.approvedAt ?? new Date(),
          },
        });

        return salesOrder;
      });
    }),

  createGoodsReceiptFromOrder: permissionProcedure("purchases", "create")
    .input(createGoodsReceiptFromOrderInput)
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const purchaseOrder = await tx.purchaseOrder.findFirst({
          where: { id: input.purchaseOrderId, deletedAt: null },
          include: {
            lines: { orderBy: { lineNumber: "asc" } },
            goodsReceipts: {
              where: { deletedAt: null },
              select: { id: true, receiptNumber: true },
            },
          },
        });

        if (!purchaseOrder) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Purchase order tidak ditemukan" });
        }
        if (purchaseOrder.goodsReceipts.length > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Purchase order sudah memiliki goods receipt ${purchaseOrder.goodsReceipts[0]?.receiptNumber ?? "lainnya"}`,
          });
        }
        if (!purchaseOrder.requiresReceipt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "PO jasa tidak memerlukan goods receipt",
          });
        }
        if (purchaseOrder.lines.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Purchase order belum memiliki line item" });
        }

        const receiptDate = input.receiptDate ?? new Date();
        const receiptNumber = await generateGoodsReceiptNumber(tx);

        const goodsReceipt = await tx.goodsReceipt.create({
          data: {
            receiptNumber,
            purchaseOrderId: purchaseOrder.id,
            vendorId: purchaseOrder.vendorId,
            warehouseId: purchaseOrder.lines[0]?.warehouseId ?? undefined,
            receiptDate,
            status: GoodsReceiptStatus.RECEIVED,
            notes: input.notes ?? purchaseOrder.notes,
            receivedAt: new Date(),
            lines: {
              create: purchaseOrder.lines.map((line) => ({
                purchaseOrderLineId: line.id,
                inventoryItemId: line.inventoryItemId,
                warehouseId: line.warehouseId,
                lineNumber: line.lineNumber,
                qtyOrdered: line.qtyOrdered,
                qtyReceived: line.qtyOrdered,
                qtyAccepted: line.qtyOrdered,
                qtyRejected: 0,
                unitCost: line.unitPrice,
                notes: line.notes,
              })),
            },
          },
          include: {
            vendor: { select: { id: true, company: true } },
            purchaseOrder: { select: { id: true, orderNumber: true, status: true } },
            lines: true,
          },
        });

        await Promise.all([
          tx.purchaseOrder.update({
            where: { id: purchaseOrder.id },
            data: { status: PurchaseOrderStatus.COMPLETED },
          }),
          ...purchaseOrder.lines.map((line) =>
            tx.purchaseOrderLine.update({
              where: { id: line.id },
              data: { qtyReceived: line.qtyOrdered },
            }),
          ),
        ]);

        return goodsReceipt;
      });
    }),

  createVendorInvoiceFromOrder: permissionProcedure("purchases", "create")
    .input(createVendorInvoiceFromOrderInput)
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const purchaseOrder = await tx.purchaseOrder.findFirst({
          where: {
            id: input.purchaseOrderId,
            deletedAt: null,
          },
          include: {
            lines: {
              orderBy: { lineNumber: "asc" },
            },
            vendorInvoices: {
              where: { deletedAt: null },
              select: { id: true, invoiceNumber: true },
            },
            goodsReceipts: {
              where: { deletedAt: null, status: { not: GoodsReceiptStatus.CANCELED } },
              include: {
                lines: {
                  orderBy: { lineNumber: "asc" },
                },
              },
              orderBy: { createdAt: "desc" },
            },
          },
        });

        if (!purchaseOrder) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Purchase order tidak ditemukan" });
        }

        if (purchaseOrder.vendorInvoices.length > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Purchase order sudah memiliki vendor invoice ${purchaseOrder.vendorInvoices[0]?.invoiceNumber ?? "lainnya"}`,
          });
        }

        if (purchaseOrder.lines.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Purchase order belum memiliki line item" });
        }

        if (purchaseOrder.status === PurchaseOrderStatus.CANCELED) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Purchase order yang dibatalkan tidak bisa ditagihkan" });
        }

        if (purchaseOrder.requiresReceipt && purchaseOrder.goodsReceipts.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "PO barang wajib memiliki goods receipt sebelum vendor invoice dibuat",
          });
        }

        const invoiceDate = input.invoiceDate ?? new Date();
        const dueDate = input.dueDate ?? nextDueDate(invoiceDate);
        const invoiceNumber = await generateVendorInvoiceNumber(tx);
        const latestReceipt = purchaseOrder.goodsReceipts[0] ?? null;
        const receiptLineMap = new Map(
          (latestReceipt?.lines ?? [])
            .filter((line) => line.purchaseOrderLineId)
            .map((line) => [line.purchaseOrderLineId as string, line]),
        );

        const vendorInvoice = await tx.vendorInvoice.create({
          data: {
            invoiceNumber,
            vendorId: purchaseOrder.vendorId,
            purchaseOrderId: purchaseOrder.id,
            goodsReceiptId: purchaseOrder.requiresReceipt ? latestReceipt?.id : undefined,
            invoiceDate,
            dueDate,
            status: purchaseOrder.requiresReceipt ? VendorInvoiceStatus.MATCHED : VendorInvoiceStatus.READY_TO_PAY,
            matchType: purchaseOrder.requiresReceipt ? VendorInvoiceMatchType.THREE_WAY : VendorInvoiceMatchType.TWO_WAY,
            subtotalAmount: purchaseOrder.subtotalAmount,
            taxAmount: purchaseOrder.taxAmount,
            totalAmount: purchaseOrder.totalAmount,
            notes: input.notes ?? purchaseOrder.notes,
            matchedAt: purchaseOrder.requiresReceipt ? new Date() : undefined,
            readyToPayAt: new Date(),
            lines: {
              create: purchaseOrder.lines.map((line) => {
                const receiptLine = receiptLineMap.get(line.id);
                const qtyBilled = purchaseOrder.requiresReceipt
                  ? (receiptLine?.qtyAccepted ?? receiptLine?.qtyReceived ?? line.qtyOrdered)
                  : line.qtyOrdered;

                return {
                  purchaseOrderLineId: line.id,
                  goodsReceiptLineId: receiptLine?.id,
                  inventoryItemId: line.inventoryItemId,
                  lineNumber: line.lineNumber,
                  description: line.description,
                  qtyBilled,
                  unitPrice: line.unitPrice,
                  lineTotal: line.lineTotal,
                  notes: line.notes,
                };
              }),
            },
          },
          include: {
            vendor: { select: { id: true, company: true } },
            purchaseOrder: { select: { id: true, orderNumber: true, status: true } },
            goodsReceipt: { select: { id: true, receiptNumber: true, status: true } },
            lines: true,
          },
        });

        await Promise.all(
          purchaseOrder.lines.map((line) =>
            tx.purchaseOrderLine.update({
              where: { id: line.id },
              data: {
                qtyInvoiced: purchaseOrder.requiresReceipt
                  ? (receiptLineMap.get(line.id)?.qtyAccepted ?? receiptLineMap.get(line.id)?.qtyReceived ?? line.qtyOrdered)
                  : line.qtyOrdered,
              },
            }),
          ),
        );

        return vendorInvoice;
      });
    }),

  changeSalesOrderStatus: permissionProcedure("sales", "create")
    .input(changeSalesOrderStatusInput)
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const salesOrder = await tx.salesOrder.findFirst({
          where: { id: input.salesOrderId, deletedAt: null },
          include: {
            deliveryOrders: { where: { deletedAt: null }, select: { id: true, status: true } },
            salesInvoices: { where: { deletedAt: null }, select: { id: true, status: true } },
          },
        });

        if (!salesOrder) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Sales order tidak ditemukan" });
        }
        if (!canTransitionSalesOrderStatus(salesOrder.status, input.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Transisi status SO dari ${salesOrder.status} ke ${input.status} tidak valid` });
        }
        if (input.status === SalesOrderStatus.CLOSED && salesOrder.salesInvoices.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Sales order hanya bisa ditutup setelah memiliki invoice" });
        }
        if ((input.status === SalesOrderStatus.PARTIALLY_DELIVERED || input.status === SalesOrderStatus.DELIVERED) && salesOrder.deliveryOrders.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Sales order memerlukan delivery order untuk status delivered" });
        }

        await tx.salesOrder.update({
          where: { id: salesOrder.id },
          data: {
            status: input.status,
            deliveredAt: input.status === SalesOrderStatus.DELIVERED || input.status === SalesOrderStatus.CLOSED ? (salesOrder.deliveredAt ?? new Date()) : salesOrder.deliveredAt,
            closedAt: input.status === SalesOrderStatus.CLOSED ? (salesOrder.closedAt ?? new Date()) : null,
            canceledAt: input.status === SalesOrderStatus.CANCELED ? (salesOrder.canceledAt ?? new Date()) : null,
          },
        });

        if (input.status === SalesOrderStatus.CLOSED) {
          await tx.salesInvoice.updateMany({
            where: { salesOrderId: salesOrder.id, deletedAt: null, status: { not: SalesInvoiceStatus.CANCELED } },
            data: { status: SalesInvoiceStatus.PAID, paidAt: new Date() },
          });
        }

        return syncSalesOrderWorkflowState(tx, salesOrder.id);
      });
    }),

  changeDeliveryOrderStatus: permissionProcedure("sales", "create")
    .input(changeDeliveryOrderStatusInput)
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const deliveryOrder = await tx.deliveryOrder.findFirst({
          where: { id: input.deliveryOrderId, deletedAt: null },
          include: {
            salesOrder: true,
            salesInvoices: { where: { deletedAt: null }, select: { id: true, status: true } },
          },
        });

        if (!deliveryOrder) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Delivery order tidak ditemukan" });
        }
        if (!canTransitionDeliveryOrderStatus(deliveryOrder.status, input.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Transisi status DO dari ${deliveryOrder.status} ke ${input.status} tidak valid` });
        }
        if ((input.status === DeliveryOrderStatus.RETURNED || input.status === DeliveryOrderStatus.CANCELED) && deliveryOrder.salesInvoices.length > 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "DO yang sudah dipakai invoice tidak bisa di-return/cancel" });
        }

        const updated = await tx.deliveryOrder.update({
          where: { id: deliveryOrder.id },
          data: {
            status: input.status,
            deliveredAt: input.status === DeliveryOrderStatus.DELIVERED ? (deliveryOrder.deliveredAt ?? new Date()) : null,
          },
        });

        if (input.status === DeliveryOrderStatus.DELIVERED) {
          await applyDeliveryInventoryIssue(tx, {
            deliveryOrderId: deliveryOrder.id,
            createdById: ctx.session.user.id,
          });
        }

        if (input.status === DeliveryOrderStatus.RETURNED || input.status === DeliveryOrderStatus.CANCELED) {
          await reverseDeliveryInventoryIssue(tx, {
            deliveryOrderId: deliveryOrder.id,
            createdById: ctx.session.user.id,
            reason: input.status,
          });
        }

        if (input.status === DeliveryOrderStatus.DELIVERED && deliveryOrder.salesInvoices.length > 0) {
          await tx.salesInvoice.updateMany({
            where: { deliveryOrderId: deliveryOrder.id, deletedAt: null, status: SalesInvoiceStatus.DRAFT },
            data: { status: SalesInvoiceStatus.SENT, sentAt: new Date() },
          });
        }

        if (input.status === DeliveryOrderStatus.RETURNED || input.status === DeliveryOrderStatus.CANCELED) {
          await tx.salesInvoice.updateMany({
            where: {
              deliveryOrderId: deliveryOrder.id,
              deletedAt: null,
              status: { in: [SalesInvoiceStatus.DRAFT, SalesInvoiceStatus.SENT, SalesInvoiceStatus.OVERDUE] },
            },
            data: { status: SalesInvoiceStatus.CANCELED },
          });
        }

        await syncSalesOrderWorkflowState(tx, deliveryOrder.salesOrderId);
        return updated;
      });
    }),

  changeSalesInvoiceStatus: permissionProcedure("sales", "create")
    .input(changeSalesInvoiceStatusInput)
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const salesInvoice = await tx.salesInvoice.findFirst({
          where: { id: input.salesInvoiceId, deletedAt: null },
        });

        if (!salesInvoice) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Sales invoice tidak ditemukan" });
        }
        if (!canTransitionSalesInvoiceStatus(salesInvoice.status, input.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Transisi status invoice dari ${salesInvoice.status} ke ${input.status} tidak valid` });
        }
        if (input.status === SalesInvoiceStatus.CANCELED && Number(salesInvoice.paidAmount ?? 0) > 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice yang sudah memiliki pembayaran tidak bisa dibatalkan" });
        }

        const updated = await tx.salesInvoice.update({
          where: { id: salesInvoice.id },
          data: {
            status: input.status,
            sentAt: input.status === SalesInvoiceStatus.SENT ? (salesInvoice.sentAt ?? new Date()) : salesInvoice.sentAt,
            paidAt: input.status === SalesInvoiceStatus.PAID ? (salesInvoice.paidAt ?? new Date()) : input.status === SalesInvoiceStatus.CANCELED ? null : salesInvoice.paidAt,
          },
        });

        if (salesInvoice.salesOrderId) {
          await syncSalesOrderWorkflowState(tx, salesInvoice.salesOrderId);
        }

        return updated;
      });
    }),

  updateSalesOrder: permissionProcedure("sales", "create")
    .input(updateSalesOrderInput)
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const salesOrder = await ctx.db.salesOrder.findFirst({
        where: { id: input.salesOrderId, deletedAt: null },
        include: {
          deliveryOrders: { where: { deletedAt: null }, select: { id: true } },
          salesInvoices: { where: { deletedAt: null }, select: { id: true } },
        },
      });

      if (!salesOrder) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sales order tidak ditemukan" });
      }
      if (salesOrder.deliveryOrders.length > 0 || salesOrder.salesInvoices.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Sales order yang sudah punya delivery atau invoice tidak bisa diedit",
        });
      }

      return ctx.db.salesOrder.update({
        where: { id: salesOrder.id },
        data: {
          plannedShipDate: salesOrder.requiresDelivery ? input.plannedShipDate : null,
          notes: input.notes,
        },
      });
    }),

  deleteSalesOrder: permissionProcedure("sales", "create")
    .input(deleteSalesOrderInput)
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const salesOrder = await ctx.db.salesOrder.findFirst({
        where: { id: input.salesOrderId, deletedAt: null },
        include: {
          deliveryOrders: { where: { deletedAt: null }, select: { id: true } },
          salesInvoices: { where: { deletedAt: null }, select: { id: true } },
        },
      });

      if (!salesOrder) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sales order tidak ditemukan" });
      }
      if (salesOrder.deliveryOrders.length > 0 || salesOrder.salesInvoices.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Sales order yang sudah punya delivery atau invoice tidak bisa dihapus",
        });
      }

      return ctx.db.salesOrder.update({
        where: { id: salesOrder.id },
        data: { deletedAt: new Date(), status: SalesOrderStatus.CANCELED },
      });
    }),

  updateDeliveryOrder: permissionProcedure("sales", "create")
    .input(updateDeliveryOrderInput)
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const deliveryOrder = await ctx.db.deliveryOrder.findFirst({
        where: { id: input.deliveryOrderId, deletedAt: null },
        include: { salesInvoices: { where: { deletedAt: null }, select: { id: true } } },
      });

      if (!deliveryOrder) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Delivery order tidak ditemukan" });
      }
      if (deliveryOrder.salesInvoices.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Delivery order yang sudah ditagihkan tidak bisa diedit",
        });
      }

      return ctx.db.deliveryOrder.update({
        where: { id: deliveryOrder.id },
        data: {
          shipDate: input.shipDate,
          carrierName: input.carrierName,
          notes: input.notes,
        },
      });
    }),

  deleteDeliveryOrder: permissionProcedure("sales", "create")
    .input(deleteDeliveryOrderInput)
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const deliveryOrder = await tx.deliveryOrder.findFirst({
          where: { id: input.deliveryOrderId, deletedAt: null },
          include: {
            salesInvoices: { where: { deletedAt: null }, select: { id: true } },
            salesOrder: { include: { lines: true } },
            lines: true,
          },
        });

        if (!deliveryOrder) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Delivery order tidak ditemukan" });
        }
        if (deliveryOrder.salesInvoices.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Delivery order yang sudah ditagihkan tidak bisa dihapus",
          });
        }

        await reverseDeliveryInventoryIssue(tx, {
          deliveryOrderId: deliveryOrder.id,
          createdById: ctx.session.user.id,
          reason: "CANCELED",
        });

        await Promise.all([
          tx.deliveryOrder.update({
            where: { id: deliveryOrder.id },
            data: { deletedAt: new Date(), status: DeliveryOrderStatus.CANCELED, deliveredAt: null },
          }),
          ...deliveryOrder.salesOrder.lines.map((line) =>
            tx.salesOrderLine.update({
              where: { id: line.id },
              data: { qtyDelivered: 0 },
            }),
          ),
        ]);

        await syncSalesOrderWorkflowState(tx, deliveryOrder.salesOrderId);
        return deliveryOrder;
      });
    }),

  updateSalesInvoice: permissionProcedure("sales", "create")
    .input(updateSalesInvoiceInput)
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const salesInvoice = await ctx.db.salesInvoice.findFirst({
        where: { id: input.salesInvoiceId, deletedAt: null },
      });

      if (!salesInvoice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sales invoice tidak ditemukan" });
      }
      if (Number(salesInvoice.paidAmount ?? 0) > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invoice yang sudah memiliki pembayaran tidak bisa diedit",
        });
      }

      return ctx.db.salesInvoice.update({
        where: { id: salesInvoice.id },
        data: {
          issueDate: input.issueDate,
          dueDate: input.dueDate,
          notes: input.notes,
        },
      });
    }),

  deleteSalesInvoice: permissionProcedure("sales", "create")
    .input(deleteSalesInvoiceInput)
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const salesInvoice = await tx.salesInvoice.findFirst({
          where: { id: input.salesInvoiceId, deletedAt: null },
          include: {
            salesOrder: { include: { lines: true } },
            lines: true,
          },
        });

        if (!salesInvoice) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Sales invoice tidak ditemukan" });
        }
        if (Number(salesInvoice.paidAmount ?? 0) > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invoice yang sudah memiliki pembayaran tidak bisa dihapus",
          });
        }

        await Promise.all([
          tx.salesInvoice.update({
            where: { id: salesInvoice.id },
            data: { deletedAt: new Date(), status: SalesInvoiceStatus.CANCELED, paidAt: null },
          }),
          ...(salesInvoice.salesOrder
            ? salesInvoice.salesOrder.lines.map((line) =>
                tx.salesOrderLine.update({
                  where: { id: line.id },
                  data: { qtyInvoiced: 0 },
                }),
              )
            : []),
        ]);

        if (salesInvoice.salesOrderId) {
          await syncSalesOrderWorkflowState(tx, salesInvoice.salesOrderId);
        }

        return salesInvoice;
      });
    }),

  createDeliveryOrderFromSalesOrder: permissionProcedure("sales", "create")
    .input(createDeliveryOrderFromSalesOrderInput)
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const salesOrder = await tx.salesOrder.findFirst({
          where: { id: input.salesOrderId, deletedAt: null },
          include: {
            customer: { select: { company: true } },
            lines: { orderBy: { lineNumber: "asc" } },
            deliveryOrders: {
              where: { deletedAt: null },
              select: { id: true, deliveryOrderNumber: true },
            },
          },
        });

        if (!salesOrder) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Sales order tidak ditemukan" });
        }
        if (salesOrder.deliveryOrders.length > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Sales order sudah memiliki delivery order ${salesOrder.deliveryOrders[0]?.deliveryOrderNumber ?? "lainnya"}`,
          });
        }
        if (!salesOrder.requiresDelivery) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "SO jasa tidak memerlukan delivery order",
          });
        }
        if (salesOrder.lines.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Sales order belum memiliki line item" });
        }

        const shipDate = input.shipDate ?? new Date();
        const deliveryOrderNumber = await generateDeliveryOrderNumber(tx);

        const deliveryOrder = await tx.deliveryOrder.create({
          data: {
            deliveryOrderNumber,
            salesOrderId: salesOrder.id,
            customerId: salesOrder.customerId,
            warehouseId: salesOrder.lines[0]?.warehouseId ?? undefined,
            shipDate,
            deliveredAt: new Date(),
            status: DeliveryOrderStatus.DELIVERED,
            carrierName: "Internal Delivery Team",
            destinationAddress: salesOrder.customer.company ?? undefined,
            notes: input.notes ?? salesOrder.notes,
            lines: {
              create: salesOrder.lines.map((line) => ({
                salesOrderLineId: line.id,
                inventoryItemId: line.inventoryItemId,
                warehouseId: line.warehouseId,
                lineNumber: line.lineNumber,
                qtyOrdered: line.qtyOrdered,
                qtyShipped: line.qtyOrdered,
                qtyDelivered: line.qtyOrdered,
                notes: line.notes,
              })),
            },
          },
          include: {
            customer: { select: { id: true, company: true } },
            salesOrder: { select: { id: true, salesOrderNumber: true, status: true } },
            lines: true,
          },
        });

        await Promise.all([
          ...salesOrder.lines.map((line) =>
            tx.salesOrderLine.update({
              where: { id: line.id },
              data: { qtyDelivered: line.qtyOrdered },
            }),
          ),
        ]);

        await applyDeliveryInventoryIssue(tx, {
          deliveryOrderId: deliveryOrder.id,
          createdById: ctx.session.user.id,
        });
        await syncSalesOrderWorkflowState(tx, salesOrder.id);
        return deliveryOrder;
      });
    }),

  createSalesInvoiceFromOrder: permissionProcedure("sales", "create")
    .input(createSalesInvoiceFromOrderInput)
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const salesOrder = await tx.salesOrder.findFirst({
          where: {
            id: input.salesOrderId,
            deletedAt: null,
          },
          include: {
            lines: {
              orderBy: { lineNumber: "asc" },
            },
            salesInvoices: {
              where: { deletedAt: null },
              select: { id: true, salesInvoiceNumber: true },
            },
            deliveryOrders: {
              where: { deletedAt: null, status: { not: DeliveryOrderStatus.CANCELED } },
              include: {
                lines: { orderBy: { lineNumber: "asc" } },
              },
              orderBy: { createdAt: "desc" },
            },
          },
        });

        if (!salesOrder) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Sales order tidak ditemukan" });
        }

        if (salesOrder.salesInvoices.length > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Sales order sudah memiliki invoice ${salesOrder.salesInvoices[0]?.salesInvoiceNumber ?? "lainnya"}`,
          });
        }

        if (salesOrder.lines.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Sales order belum memiliki line item" });
        }

        if (salesOrder.status === SalesOrderStatus.CANCELED) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Sales order yang dibatalkan tidak bisa ditagihkan" });
        }

        if (salesOrder.requiresDelivery && salesOrder.deliveryOrders.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Order barang wajib memiliki delivery order sebelum sales invoice dibuat",
          });
        }

        const issueDate = input.issueDate ?? new Date();
        const dueDate = input.dueDate ?? nextDueDate(issueDate);
        const salesInvoiceNumber = await generateSalesInvoiceNumber(tx);
        const latestDelivery = salesOrder.deliveryOrders[0] ?? null;
        const deliveryLineMap = new Map(
          (latestDelivery?.lines ?? [])
            .filter((line) => line.salesOrderLineId)
            .map((line) => [line.salesOrderLineId as string, line]),
        );

        const salesInvoice = await tx.salesInvoice.create({
          data: {
            salesInvoiceNumber,
            customerId: salesOrder.customerId,
            salesOrderId: salesOrder.id,
            deliveryOrderId: salesOrder.requiresDelivery ? latestDelivery?.id : undefined,
            issueDate,
            dueDate,
            status: SalesInvoiceStatus.SENT,
            subtotalAmount: salesOrder.subtotalAmount,
            taxAmount: salesOrder.taxAmount,
            totalAmount: salesOrder.totalAmount,
            notes: input.notes ?? salesOrder.notes,
            sentAt: new Date(),
            lines: {
              create: salesOrder.lines.map((line) => {
                const deliveryLine = deliveryLineMap.get(line.id);
                const qtyInvoiced = salesOrder.requiresDelivery
                  ? (deliveryLine?.qtyDelivered ?? deliveryLine?.qtyShipped ?? line.qtyOrdered)
                  : line.qtyOrdered;

                return {
                  salesOrderLineId: line.id,
                  deliveryOrderLineId: deliveryLine?.id,
                  inventoryItemId: line.inventoryItemId,
                  lineNumber: line.lineNumber,
                  description: line.description,
                  qtyInvoiced,
                  unitPrice: line.unitPrice,
                  lineTotal: line.lineTotal,
                  notes: line.notes,
                };
              }),
            },
          },
          include: {
            customer: { select: { id: true, company: true } },
            salesOrder: { select: { id: true, salesOrderNumber: true, status: true } },
            deliveryOrder: { select: { id: true, deliveryOrderNumber: true, status: true } },
            lines: true,
          },
        });

        await Promise.all(
          salesOrder.lines.map((line) =>
            tx.salesOrderLine.update({
              where: { id: line.id },
              data: {
                qtyInvoiced: salesOrder.requiresDelivery
                  ? (deliveryLineMap.get(line.id)?.qtyDelivered ?? deliveryLineMap.get(line.id)?.qtyShipped ?? line.qtyOrdered)
                  : line.qtyOrdered,
              },
            }),
          ),
        );

        await syncSalesOrderWorkflowState(tx, salesOrder.id);
        return salesInvoice;
      });
    }),
});
