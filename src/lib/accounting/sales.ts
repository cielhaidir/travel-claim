import { TRPCError } from "@trpc/server";
import {
  COAType,
  InventoryItemType,
  JournalSourceType,
  JournalStatus,
  type Prisma,
} from "../../../generated/prisma";
import { generateJournalEntryNumber } from "@/lib/utils/numberGenerators";

const SALES_RECEIVABLE_COA_CODE = "1160";
const SALES_GOODS_REVENUE_COA_CODE = "4100";
const SALES_SERVICE_REVENUE_COA_CODE = "4200";

type DbTx = Prisma.TransactionClient;

type JournalLineInput = {
  chartOfAccountId: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
};

function assertBalancedJournalLines(lines: JournalLineInput[]) {
  if (lines.length < 2) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Jurnal penjualan harus memiliki minimal 2 baris",
    });
  }

  const totalDebit = lines.reduce((sum, line) => sum + Number(line.debitAmount ?? 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + Number(line.creditAmount ?? 0), 0);

  for (const [index, line] of lines.entries()) {
    const debit = Number(line.debitAmount ?? 0);
    const credit = Number(line.creditAmount ?? 0);
    if ((debit <= 0 && credit <= 0) || (debit > 0 && credit > 0)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Baris jurnal penjualan ke-${index + 1} harus memiliki salah satu debit atau kredit`,
      });
    }
  }

  if (Math.abs(totalDebit - totalCredit) > 0.0001) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Jurnal penjualan tidak balance",
    });
  }
}

async function findActiveCoaByCode(tx: DbTx, code: string) {
  const coa = await tx.chartOfAccount.findFirst({
    where: { code, isActive: true },
    select: { id: true, code: true, name: true, accountType: true },
  });

  if (!coa) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `COA ${code} tidak ditemukan atau tidak aktif`,
    });
  }

  return coa;
}

function getRevenueCoaCodeByItemType(itemType?: InventoryItemType | null) {
  switch (itemType) {
    case InventoryItemType.HARDWARE:
      return SALES_GOODS_REVENUE_COA_CODE;
    case InventoryItemType.SERVICE:
    case InventoryItemType.SOFTWARE_LICENSE:
    case InventoryItemType.MANAGED_SERVICE:
    default:
      return SALES_SERVICE_REVENUE_COA_CODE;
  }
}

export async function postDeliveryCogsJournal(
  tx: DbTx,
  input: { deliveryOrderId: string; createdById: string },
) {
  const existing = await tx.journalEntry.findFirst({
    where: {
      sourceType: JournalSourceType.SALES_DELIVERY_COGS,
      sourceId: input.deliveryOrderId,
      description: { startsWith: "COGS posting for " },
      status: { in: [JournalStatus.DRAFT, JournalStatus.POSTED] },
    },
    select: { id: true, journalNumber: true },
  });

  if (existing) return existing;

  const deliveryOrder = await tx.deliveryOrder.findFirst({
    where: { id: input.deliveryOrderId, deletedAt: null },
    include: {
      lines: {
        include: {
          inventoryItem: {
            select: {
              id: true,
              name: true,
              isStockTracked: true,
              inventoryCoaId: true,
              cogsCoaId: true,
              standardCost: true,
            },
          },
        },
        orderBy: { lineNumber: "asc" },
      },
    },
  });

  if (!deliveryOrder) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Delivery order tidak ditemukan untuk posting COGS" });
  }

  const grouped = new Map<string, { cogsCoaId: string; inventoryCoaId: string; total: number; itemNames: string[] }>();

  for (const line of deliveryOrder.lines) {
    const item = line.inventoryItem;
    if (!line.inventoryItemId || !item?.isStockTracked) continue;

    const quantity = Number(line.qtyDelivered ?? line.qtyShipped ?? 0);
    if (quantity <= 0) continue;

    if (!item.inventoryCoaId || !item.cogsCoaId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Item ${item.name} belum memiliki mapping COA persediaan / COGS`,
      });
    }

    const standardCost = Number(item.standardCost ?? 0);
    if (standardCost <= 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Standard cost item ${item.name} harus diisi sebelum DO diposting ke jurnal`,
      });
    }

    const postingKey = `${item.cogsCoaId}:${item.inventoryCoaId}`;
    const current = grouped.get(postingKey);
    grouped.set(postingKey, {
      cogsCoaId: item.cogsCoaId,
      inventoryCoaId: item.inventoryCoaId,
      total: (current?.total ?? 0) + standardCost * quantity,
      itemNames: [...(current?.itemNames ?? []), item.name],
    });
  }

  if (grouped.size === 0) {
    return null;
  }

  const lines: JournalLineInput[] = [];
  for (const entry of grouped.values()) {
    const itemLabel = [...new Set(entry.itemNames)].join(", ");
    lines.push({
      chartOfAccountId: entry.cogsCoaId,
      description: `COGS - ${itemLabel}`,
      debitAmount: entry.total,
      creditAmount: 0,
    });
    lines.push({
      chartOfAccountId: entry.inventoryCoaId,
      description: `Inventory reduction - ${itemLabel}`,
      debitAmount: 0,
      creditAmount: entry.total,
    });
  }

  assertBalancedJournalLines(lines);
  const journalNumber = await generateJournalEntryNumber(tx as never);

  return tx.journalEntry.create({
    data: {
      journalNumber,
      transactionDate: deliveryOrder.deliveredAt ?? deliveryOrder.shipDate,
      description: `COGS posting for ${deliveryOrder.deliveryOrderNumber}`,
      sourceType: JournalSourceType.SALES_DELIVERY_COGS,
      sourceId: deliveryOrder.id,
      referenceNumber: deliveryOrder.deliveryOrderNumber,
      status: JournalStatus.POSTED,
      createdById: input.createdById,
      postedById: input.createdById,
      postedAt: new Date(),
      notes: `Automatic COGS journal for delivery order ${deliveryOrder.deliveryOrderNumber}`,
      lines: {
        create: lines.map((line, index) => ({
          lineNumber: index + 1,
          chartOfAccountId: line.chartOfAccountId,
          description: line.description,
          debitAmount: line.debitAmount,
          creditAmount: line.creditAmount,
        })),
      },
    },
  });
}

export async function reverseDeliveryCogsJournal(
  tx: DbTx,
  input: { deliveryOrderId: string; createdById: string; reason: "RETURNED" | "CANCELED" },
) {
  const originalJournal = await tx.journalEntry.findFirst({
    where: {
      sourceType: JournalSourceType.SALES_DELIVERY_COGS,
      sourceId: input.deliveryOrderId,
      description: { startsWith: "COGS posting for " },
      status: { in: [JournalStatus.DRAFT, JournalStatus.POSTED] },
    },
    select: { id: true, journalNumber: true },
  });

  if (!originalJournal) return null;

  const existingReversal = await tx.journalEntry.findFirst({
    where: {
      sourceType: JournalSourceType.SALES_DELIVERY_COGS_REVERSAL,
      sourceId: input.deliveryOrderId,
      description: { startsWith: `COGS reversal (${input.reason}) for ` },
      status: { in: [JournalStatus.DRAFT, JournalStatus.POSTED] },
    },
    select: { id: true, journalNumber: true },
  });

  if (existingReversal) return existingReversal;

  const deliveryOrder = await tx.deliveryOrder.findFirst({
    where: { id: input.deliveryOrderId },
    include: {
      lines: {
        include: {
          inventoryItem: {
            select: {
              id: true,
              name: true,
              isStockTracked: true,
              inventoryCoaId: true,
              cogsCoaId: true,
              standardCost: true,
            },
          },
        },
        orderBy: { lineNumber: "asc" },
      },
    },
  });

  if (!deliveryOrder) return null;

  const grouped = new Map<string, { cogsCoaId: string; inventoryCoaId: string; total: number; itemNames: string[] }>();

  for (const line of deliveryOrder.lines) {
    const item = line.inventoryItem;
    if (!line.inventoryItemId || !item?.isStockTracked || !item.inventoryCoaId || !item.cogsCoaId) continue;

    const quantity = Number(line.qtyDelivered ?? line.qtyShipped ?? 0);
    const standardCost = Number(item.standardCost ?? 0);
    if (quantity <= 0 || standardCost <= 0) continue;

    const postingKey = `${item.cogsCoaId}:${item.inventoryCoaId}`;
    const current = grouped.get(postingKey);
    grouped.set(postingKey, {
      cogsCoaId: item.cogsCoaId,
      inventoryCoaId: item.inventoryCoaId,
      total: (current?.total ?? 0) + standardCost * quantity,
      itemNames: [...(current?.itemNames ?? []), item.name],
    });
  }

  if (grouped.size === 0) return null;

  const lines: JournalLineInput[] = [];
  for (const entry of grouped.values()) {
    const itemLabel = [...new Set(entry.itemNames)].join(", ");
    lines.push({
      chartOfAccountId: entry.inventoryCoaId,
      description: `Inventory return - ${itemLabel}`,
      debitAmount: entry.total,
      creditAmount: 0,
    });
    lines.push({
      chartOfAccountId: entry.cogsCoaId,
      description: `COGS reversal - ${itemLabel}`,
      debitAmount: 0,
      creditAmount: entry.total,
    });
  }

  assertBalancedJournalLines(lines);
  const journalNumber = await generateJournalEntryNumber(tx as never);

  return tx.journalEntry.create({
    data: {
      journalNumber,
      transactionDate: new Date(),
      description: `COGS reversal (${input.reason}) for ${deliveryOrder.deliveryOrderNumber}`,
      sourceType: JournalSourceType.SALES_DELIVERY_COGS_REVERSAL,
      sourceId: deliveryOrder.id,
      referenceNumber: deliveryOrder.deliveryOrderNumber,
      status: JournalStatus.POSTED,
      createdById: input.createdById,
      postedById: input.createdById,
      postedAt: new Date(),
      notes: `Automatic COGS reversal journal for delivery order ${deliveryOrder.deliveryOrderNumber}`,
      lines: {
        create: lines.map((line, index) => ({
          lineNumber: index + 1,
          chartOfAccountId: line.chartOfAccountId,
          description: line.description,
          debitAmount: line.debitAmount,
          creditAmount: line.creditAmount,
        })),
      },
    },
  });
}

export async function postSalesInvoiceJournal(
  tx: DbTx,
  input: { salesInvoiceId: string; createdById: string },
) {
  const existing = await tx.journalEntry.findFirst({
    where: {
      sourceType: JournalSourceType.SALES_INVOICE_AR,
      sourceId: input.salesInvoiceId,
      description: { startsWith: "AR posting for " },
      status: { in: [JournalStatus.DRAFT, JournalStatus.POSTED] },
    },
    select: { id: true, journalNumber: true },
  });

  if (existing) return existing;

  const salesInvoice = await tx.salesInvoice.findFirst({
    where: { id: input.salesInvoiceId, deletedAt: null },
    include: {
      lines: {
        include: {
          inventoryItem: {
            select: { id: true, name: true, itemType: true },
          },
        },
        orderBy: { lineNumber: "asc" },
      },
    },
  });

  if (!salesInvoice) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Sales invoice tidak ditemukan untuk posting jurnal" });
  }

  if (salesInvoice.lines.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Sales invoice belum memiliki line item" });
  }

  const receivableCoa = await findActiveCoaByCode(tx, SALES_RECEIVABLE_COA_CODE);
  if (receivableCoa.accountType !== COAType.ASSET) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "COA piutang usaha harus bertipe ASSET" });
  }

  const revenueGroups = new Map<string, { coaId: string; coaCode: string; total: number; labels: string[] }>();

  for (const line of salesInvoice.lines) {
    const revenueCoaCode = getRevenueCoaCodeByItemType(line.inventoryItem?.itemType ?? null);
    const revenueCoa = await findActiveCoaByCode(tx, revenueCoaCode);

    if (revenueCoa.accountType !== COAType.REVENUE) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `COA ${revenueCoa.code} harus bertipe REVENUE` });
    }

    const lineTotal = Number(line.lineTotal ?? 0);
    if (lineTotal <= 0) continue;

    const current = revenueGroups.get(revenueCoa.id);
    revenueGroups.set(revenueCoa.id, {
      coaId: revenueCoa.id,
      coaCode: revenueCoa.code,
      total: (current?.total ?? 0) + lineTotal,
      labels: [...(current?.labels ?? []), line.inventoryItem?.name ?? line.description ?? `Line ${line.lineNumber}`],
    });
  }

  if (revenueGroups.size === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Sales invoice tidak memiliki nilai revenue yang bisa diposting" });
  }

  const totalInvoice = [...revenueGroups.values()].reduce((sum, entry) => sum + entry.total, 0);
  const lines: JournalLineInput[] = [
    {
      chartOfAccountId: receivableCoa.id,
      description: `Piutang usaha ${salesInvoice.salesInvoiceNumber}`,
      debitAmount: totalInvoice,
      creditAmount: 0,
    },
  ];

  for (const entry of revenueGroups.values()) {
    lines.push({
      chartOfAccountId: entry.coaId,
      description: `Revenue ${entry.coaCode} - ${[...new Set(entry.labels)].join(", ")}`,
      debitAmount: 0,
      creditAmount: entry.total,
    });
  }

  assertBalancedJournalLines(lines);
  const journalNumber = await generateJournalEntryNumber(tx as never);

  return tx.journalEntry.create({
    data: {
      journalNumber,
      transactionDate: salesInvoice.issueDate,
      description: `AR posting for ${salesInvoice.salesInvoiceNumber}`,
      sourceType: JournalSourceType.SALES_INVOICE_AR,
      sourceId: salesInvoice.id,
      referenceNumber: salesInvoice.salesInvoiceNumber,
      status: JournalStatus.POSTED,
      createdById: input.createdById,
      postedById: input.createdById,
      postedAt: new Date(),
      notes: `Automatic AR/revenue journal for sales invoice ${salesInvoice.salesInvoiceNumber}`,
      lines: {
        create: lines.map((line, index) => ({
          lineNumber: index + 1,
          chartOfAccountId: line.chartOfAccountId,
          description: line.description,
          debitAmount: line.debitAmount,
          creditAmount: line.creditAmount,
        })),
      },
    },
  });
}

export async function reverseSalesInvoiceJournal(
  tx: DbTx,
  input: { salesInvoiceId: string; createdById: string; reason: "CANCELED" | "DELETED" },
) {
  const originalJournal = await tx.journalEntry.findFirst({
    where: {
      sourceType: JournalSourceType.SALES_INVOICE_AR,
      sourceId: input.salesInvoiceId,
      description: { startsWith: "AR posting for " },
      status: { in: [JournalStatus.DRAFT, JournalStatus.POSTED] },
    },
    include: {
      lines: {
        orderBy: { lineNumber: "asc" },
        select: {
          chartOfAccountId: true,
          description: true,
          debitAmount: true,
          creditAmount: true,
        },
      },
    },
  });

  if (!originalJournal) return null;

  const existingReversal = await tx.journalEntry.findFirst({
    where: {
      sourceType: JournalSourceType.SALES_INVOICE_AR_REVERSAL,
      sourceId: input.salesInvoiceId,
      description: { startsWith: `AR reversal (${input.reason}) for ` },
      status: { in: [JournalStatus.DRAFT, JournalStatus.POSTED] },
    },
    select: { id: true, journalNumber: true },
  });

  if (existingReversal) return existingReversal;

  const salesInvoice = await tx.salesInvoice.findFirst({
    where: { id: input.salesInvoiceId },
    select: { id: true, salesInvoiceNumber: true, issueDate: true },
  });
  if (!salesInvoice) return null;

  const lines: JournalLineInput[] = originalJournal.lines.map((line) => ({
    chartOfAccountId: line.chartOfAccountId,
    description: `Reversal - ${line.description}`,
    debitAmount: Number(line.creditAmount ?? 0),
    creditAmount: Number(line.debitAmount ?? 0),
  }));

  assertBalancedJournalLines(lines);
  const journalNumber = await generateJournalEntryNumber(tx as never);

  return tx.journalEntry.create({
    data: {
      journalNumber,
      transactionDate: new Date(),
      description: `AR reversal (${input.reason}) for ${salesInvoice.salesInvoiceNumber}`,
      sourceType: JournalSourceType.SALES_INVOICE_AR_REVERSAL,
      sourceId: salesInvoice.id,
      referenceNumber: salesInvoice.salesInvoiceNumber,
      status: JournalStatus.POSTED,
      createdById: input.createdById,
      postedById: input.createdById,
      postedAt: new Date(),
      notes: `Automatic AR/revenue reversal journal for sales invoice ${salesInvoice.salesInvoiceNumber}`,
      lines: {
        create: lines.map((line, index) => ({
          lineNumber: index + 1,
          chartOfAccountId: line.chartOfAccountId,
          description: line.description,
          debitAmount: line.debitAmount,
          creditAmount: line.creditAmount,
        })),
      },
    },
  });
}
