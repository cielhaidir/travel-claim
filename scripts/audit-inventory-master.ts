import { PrismaClient, InventoryItemType } from "../generated/prisma";

const db = new PrismaClient({ log: ["error"] });

function printSection(title: string) {
  console.log(`\n=== ${title} ===`);
}

function printRows(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    console.log("OK: no findings");
    return;
  }

  console.table(rows);
}

async function main() {
  const nonStockItemTypes = [
    InventoryItemType.SERVICE,
    InventoryItemType.SOFTWARE_LICENSE,
    InventoryItemType.MANAGED_SERVICE,
  ];

  const suspiciousItems = await db.inventoryItem.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      OR: [
        { itemType: { in: nonStockItemTypes }, isStockTracked: true },
        {
          itemType: { in: nonStockItemTypes },
          OR: [
            { inventoryCoaId: { not: null } },
            { temporaryAssetCoaId: { not: null } },
            { cogsCoaId: { not: null } },
          ],
        },
        { itemType: { in: nonStockItemTypes }, usageType: { not: "SALE" } },
        { isStockTracked: true, standardCost: null },
        { isStockTracked: true, inventoryCoaId: null },
        { isStockTracked: true, cogsCoaId: null },
      ],
    },
    include: {
      inventoryCoa: { select: { code: true } },
      cogsCoa: { select: { code: true } },
    },
    orderBy: { sku: "asc" },
  });

  printSection("Active item master with suspicious accounting / classification");
  printRows(
    suspiciousItems.map((item) => ({
      sku: item.sku,
      name: item.name,
      itemType: item.itemType,
      usageType: item.usageType,
      isStockTracked: item.isStockTracked,
      standardCost: item.standardCost?.toString() ?? "-",
      inventoryCoa: item.inventoryCoa?.code ?? "-",
      cogsCoa: item.cogsCoa?.code ?? "-",
    })),
  );

  const inconsistentBalances = await db.inventoryBalance.findMany({
    where: {
      OR: [
        { item: { isActive: false } },
        { item: { deletedAt: { not: null } } },
        { warehouse: { isActive: false } },
        { warehouse: { deletedAt: { not: null } } },
      ],
    },
    include: {
      item: { select: { sku: true, name: true, isActive: true, deletedAt: true } },
      warehouse: { select: { code: true, name: true, isActive: true, deletedAt: true } },
    },
    orderBy: [{ item: { sku: "asc" } }, { warehouse: { code: "asc" } }],
  });

  printSection("Warehouse / item consistency: balances pointing to inactive master");
  printRows(
    inconsistentBalances.map((row) => ({
      sku: row.item.sku,
      item: row.item.name,
      itemActive: row.item.isActive,
      warehouse: row.warehouse.code,
      warehouseActive: row.warehouse.isActive,
      bucketType: row.bucketType,
      qtyOnHand: row.qtyOnHand.toString(),
      qtyReserved: row.qtyReserved.toString(),
    })),
  );

  const allActiveItems = await db.inventoryItem.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true, sku: true, name: true, itemType: true, usageType: true, isStockTracked: true, standardCost: true },
    orderBy: { sku: "asc" },
  });

  const unusedItems: Array<Record<string, unknown>> = [];
  for (const item of allActiveItems) {
    const [pr, po, gr, vi, sq, so, dO, si, balances, ledger, units, batches] = await Promise.all([
      db.purchaseRequestLine.count({ where: { inventoryItemId: item.id } }),
      db.purchaseOrderLine.count({ where: { inventoryItemId: item.id } }),
      db.goodsReceiptLine.count({ where: { inventoryItemId: item.id } }),
      db.vendorInvoiceLine.count({ where: { inventoryItemId: item.id } }),
      db.salesQuotationLine.count({ where: { inventoryItemId: item.id } }),
      db.salesOrderLine.count({ where: { inventoryItemId: item.id } }),
      db.deliveryOrderLine.count({ where: { inventoryItemId: item.id } }),
      db.salesInvoiceLine.count({ where: { inventoryItemId: item.id } }),
      db.inventoryBalance.count({ where: { itemId: item.id, OR: [{ qtyOnHand: { not: 0 } }, { qtyReserved: { not: 0 } }] } }),
      db.inventoryLedgerEntry.count({ where: { itemId: item.id } }),
      db.inventoryItemUnit.count({ where: { inventoryItemId: item.id } }),
      db.inventoryReceiptBatch.count({ where: { inventoryItemId: item.id } }),
    ]);

    const totalRefs = pr + po + gr + vi + sq + so + dO + si;
    if (totalRefs === 0 && balances === 0 && ledger === 0 && units === 0 && batches === 0) {
      unusedItems.push({
        sku: item.sku,
        name: item.name,
        itemType: item.itemType,
        usageType: item.usageType,
        isStockTracked: item.isStockTracked,
        standardCost: item.standardCost?.toString() ?? "-",
      });
    }
  }

  printSection("Legacy / unused active items with no docs, balances, or history");
  printRows(unusedItems);

  const typeUsageMismatches = await db.inventoryItem.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      OR: [
        {
          itemType: "HARDWARE",
          usageType: "SALE",
          temporaryAssetCoaId: { not: null },
        },
        {
          itemType: "HARDWARE",
          usageType: "OPERATIONAL",
          inventoryCoaId: { not: null },
        },
        {
          itemType: { in: nonStockItemTypes },
          usageType: { not: "SALE" },
        },
      ],
    },
    orderBy: { sku: "asc" },
  });

  printSection("Item type vs usage type mismatch candidates");
  printRows(
    typeUsageMismatches.map((item) => ({
      sku: item.sku,
      name: item.name,
      itemType: item.itemType,
      usageType: item.usageType,
      isStockTracked: item.isStockTracked,
    })),
  );

  const inactiveReferenced = await db.inventoryItem.findMany({
    where: {
      AND: [
        { OR: [{ deletedAt: { not: null } }, { isActive: false }] },
        {
          OR: [
            { purchaseRequestLines: { some: {} } },
            { purchaseOrderLines: { some: {} } },
            { goodsReceiptLines: { some: {} } },
            { vendorInvoiceLines: { some: {} } },
            { salesQuotationLines: { some: {} } },
            { salesOrderLines: { some: {} } },
            { deliveryOrderLines: { some: {} } },
            { salesInvoiceLines: { some: {} } },
          ],
        },
      ],
    },
    select: {
      sku: true,
      name: true,
      purchaseRequestLines: { select: { id: true } },
      purchaseOrderLines: { select: { id: true } },
      goodsReceiptLines: { select: { id: true } },
      vendorInvoiceLines: { select: { id: true } },
      salesQuotationLines: { select: { id: true } },
      salesOrderLines: { select: { id: true } },
      deliveryOrderLines: { select: { id: true } },
      salesInvoiceLines: { select: { id: true } },
    },
    orderBy: { sku: "asc" },
  });

  printSection("Inactive inventory items still referenced by documents");
  printRows(
    inactiveReferenced.map((item) => ({
      sku: item.sku,
      name: item.name,
      refs:
        item.purchaseRequestLines.length +
        item.purchaseOrderLines.length +
        item.goodsReceiptLines.length +
        item.vendorInvoiceLines.length +
        item.salesQuotationLines.length +
        item.salesOrderLines.length +
        item.deliveryOrderLines.length +
        item.salesInvoiceLines.length,
    })),
  );
}

main()
  .catch((error) => {
    console.error("Inventory master audit failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
