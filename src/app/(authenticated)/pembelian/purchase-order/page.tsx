"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { BusinessFlowBadge } from "@/components/features/business/BusinessFlowBadge";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/features/PageHeader";
import { CrmEmptyHint, crmInputClassName, CrmMetricCard } from "@/components/features/crm/shared";
import { userHasPermission } from "@/lib/auth/role-check";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type PurchaseOrderRecord = {
  id: string;
  orderNumber: string;
  orderDate: string | Date;
  buyerName: string | null;
  totalAmount: number | string;
  status: string;
  requiresReceipt?: boolean;
  procurementMode?: string;
  vendor: { company: string };
  purchaseRequest: { requestNumber: string } | null;
  goodsReceipts?: Array<{ id: string; receiptNumber: string; status: string }>;
  vendorInvoices?: Array<{ id: string; invoiceNumber: string; status: string }>;
  lines: Array<{
    description?: string | null;
    inventoryItem?: { sku: string; name: string } | null;
  }>;
};

const toLabel = (value?: string | null) => value ? value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "-";
const toBadge = (status?: string | null): "default" | "success" | "warning" | "danger" | "info" => status === "COMPLETED" ? "success" : status === "PARTIAL_RECEIPT" ? "warning" : status === "ISSUED" ? "info" : status === "CANCELED" ? "danger" : "default";
const summarizeItems = (lines: PurchaseOrderRecord["lines"]) => {
  const labels = lines
    .map((line) => line.inventoryItem?.name ?? line.description ?? null)
    .filter((value): value is string => Boolean(value));

  if (labels.length === 0) return "-";
  if (labels.length === 1) return labels[0];
  return `${labels[0]} +${labels.length - 1} item`;
};

export default function PurchaseOrderPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const utils = api.useUtils();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const isAllowed = session?.user ? userHasPermission(session.user, "purchases", "read") : false;
  const canCreateInvoice = session?.user ? userHasPermission(session.user, "purchases", "create") : false;

  const query = api.business.listPurchaseOrders.useQuery(
    { search: search || undefined, status: status ? (status as never) : undefined, limit: 100 },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  ) as unknown as { data?: PurchaseOrderRecord[]; isLoading: boolean };

  const createReceiptMutation = api.business.createGoodsReceiptFromOrder.useMutation({
    onSuccess: async (data) => {
      await Promise.all([
        utils.business.listPurchaseOrders.invalidate(),
        utils.business.listGoodsReceipts.invalidate(),
        utils.business.purchaseSummary.invalidate(),
      ]);
      showToast({
        variant: "success",
        title: "Goods receipt berhasil dibuat",
        message: `PO berhasil diterima menjadi ${String((data as { receiptNumber?: string }).receiptNumber ?? "goods receipt")}.`,
      });
    },
    onError: (error) => {
      showToast({
        variant: "error",
        title: "Buat receipt gagal",
        message: error.message,
      });
    },
  });

  const createInvoiceMutation = api.business.createVendorInvoiceFromOrder.useMutation({
    onSuccess: async (data) => {
      await Promise.all([
        utils.business.listPurchaseOrders.invalidate(),
        utils.business.listVendorInvoices.invalidate(),
        utils.business.purchaseSummary.invalidate(),
      ]);
      showToast({
        variant: "success",
        title: "Vendor invoice berhasil dibuat",
        message: `PO berhasil ditagihkan menjadi ${String((data as { invoiceNumber?: string }).invoiceNumber ?? "vendor invoice")}.`,
      });
    },
    onError: (error) => {
      showToast({
        variant: "error",
        title: "Buat invoice gagal",
        message: error.message,
      });
    },
  });

  const rows = useMemo(() => query.data ?? [], [query.data]);
  const totalAmount = rows.reduce((sum, row) => sum + Number(row.totalAmount ?? 0), 0);
  const issuedCount = rows.filter((row) => row.status === "ISSUED").length;
  const partialCount = rows.filter((row) => row.status === "PARTIAL_RECEIPT").length;
  const completedCount = rows.filter((row) => row.status === "COMPLETED").length;

  async function handleCreateReceipt(row: PurchaseOrderRecord) {
    const confirmed = window.confirm(`Buat goods receipt dari ${row.orderNumber}?`);
    if (!confirmed) return;

    await createReceiptMutation.mutateAsync({
      purchaseOrderId: row.id,
      notes: `Auto received from ${row.orderNumber}`,
    });
  }

  async function handleCreateInvoice(row: PurchaseOrderRecord) {
    const confirmed = window.confirm(`Buat vendor invoice dari ${row.orderNumber}?`);
    if (!confirmed) return;

    await createInvoiceMutation.mutateAsync({
      purchaseOrderId: row.id,
      notes: `Auto invoiced from ${row.orderNumber}`,
    });
  }

  if (!session || !isAllowed) return null;

  return <div className="space-y-6"><PageHeader title="Purchase Order" description="Purchase order sekarang mengikuti item inventory perusahaan IT dan terhubung ke PR, receipt, serta invoice vendor." badge={<Badge variant="info">Live Data</Badge>} secondaryAction={{ label: "Kembali ke Pembelian", href: "/pembelian" }} /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><CrmMetricCard label="PO Aktif" value={String(rows.length)} helper="Dokumen purchase order" /><CrmMetricCard label="Issued" value={String(issuedCount)} helper="Sudah dikirim ke vendor" /><CrmMetricCard label="Partial Receipt" value={String(partialCount)} helper="Belum diterima penuh" /><CrmMetricCard label="Total Nilai" value={formatCurrency(totalAmount)} helper={`${completedCount} PO selesai`} /></div><div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="grid gap-3 md:grid-cols-[1fr_220px]"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nomor PO, vendor, buyer, atau PR" className={crmInputClassName} /><select value={status} onChange={(e) => setStatus(e.target.value)} className={crmInputClassName}><option value="">Semua status</option><option value="DRAFT">Draft</option><option value="ISSUED">Issued</option><option value="PARTIAL_RECEIPT">Partial Receipt</option><option value="COMPLETED">Completed</option><option value="CANCELED">Canceled</option></select></div></div><div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]"><div className="rounded-xl border border-gray-200 bg-white shadow-sm"><div className="border-b border-gray-200 px-5 py-4"><h2 className="text-lg font-semibold text-gray-900">Monitoring Purchase Order</h2><p className="text-sm text-gray-500">Setiap PO menampilkan item inventory utama seperti switch, access point, firewall, atau perangkat proyek lain.</p></div>{query.isLoading ? <div className="p-5 text-sm text-gray-500">Memuat purchase order...</div> : rows.length === 0 ? <div className="p-5"><CrmEmptyHint text="Belum ada purchase order di database." /></div> : <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200 text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">PO</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Item Inventory</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Vendor</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Nilai</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th><th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Aksi</th></tr></thead><tbody className="divide-y divide-gray-100 bg-white">{rows.map((row) => { const canReceipt = canCreateInvoice && row.status !== "CANCELED" && (row.requiresReceipt ?? true) && !(row.goodsReceipts?.length); const canInvoice = canCreateInvoice && row.status !== "CANCELED" && !(row.vendorInvoices?.length) && ((row.requiresReceipt ?? true) ? Boolean(row.goodsReceipts?.length) : true); const flowLabel = row.requiresReceipt === false ? "Service / no receipt" : row.procurementMode === "MIXED" ? "Mixed flow" : "Goods / receipt"; return <tr key={row.id}><td className="px-4 py-3"><p className="font-semibold text-gray-900">{row.orderNumber}</p><p className="text-xs text-gray-500">{formatDate(row.orderDate)} • {row.purchaseRequest?.requestNumber ?? "-"}</p></td><td className="px-4 py-3"><p className="text-gray-900">{summarizeItems(row.lines)}</p><div className="mt-1 flex flex-wrap items-center gap-2"><p className="text-xs text-gray-500">{row.lines.length} line • {row.buyerName ?? "-"}</p><BusinessFlowBadge value={row.procurementMode} /></div></td><td className="px-4 py-3 text-gray-600">{row.vendor.company}</td><td className="px-4 py-3 text-gray-600">{formatCurrency(Number(row.totalAmount ?? 0))}</td><td className="px-4 py-3"><div className="flex flex-col gap-1"><Badge variant={toBadge(row.status)}>{toLabel(row.status)}</Badge><span className="text-xs text-gray-500">{flowLabel}</span>{row.goodsReceipts?.[0] ? <span className="text-xs text-gray-500">GR: {row.goodsReceipts[0].receiptNumber}</span> : null}{row.vendorInvoices?.[0] ? <span className="text-xs text-gray-500">Invoice: {row.vendorInvoices[0].invoiceNumber}</span> : null}</div></td><td className="px-4 py-3 text-right"><div className="flex justify-end gap-2">{canReceipt ? <Button size="sm" variant="secondary" isLoading={createReceiptMutation.isPending} onClick={() => void handleCreateReceipt(row)}>Create GR</Button> : null}{canInvoice ? <Button size="sm" isLoading={createInvoiceMutation.isPending} onClick={() => void handleCreateInvoice(row)}>Create Invoice</Button> : null}{!canReceipt && !canInvoice ? <span className="text-xs text-gray-400">{row.vendorInvoices?.[0] ? "Sudah invoiced" : row.goodsReceipts?.[0] ? "Sudah received" : row.requiresReceipt === false ? "No receipt needed" : "-"}</span> : null}</div></td></tr>;})}</tbody></table></div>}</div><div className="space-y-6"><div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-gray-900">Relasi Dokumen</h2><ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-600"><li>PO dapat berasal dari satu purchase request.</li><li>Line PO diturunkan dari item inventory dan line PR.</li><li>PO barang wajib melalui goods receipt, sedangkan PO jasa dapat langsung dibuat invoice vendor.</li></ul></div><div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="space-y-3"><Link href="/pembelian/goods-receipt" className="block rounded-lg border border-gray-200 px-4 py-3 transition hover:border-blue-200 hover:bg-blue-50/50"><p className="text-sm font-semibold text-gray-900">Goods Receipt</p><p className="mt-1 text-sm text-gray-600">Terima perangkat dan barang berdasarkan line PO.</p></Link><Link href="/pembelian/vendor-invoice" className="block rounded-lg border border-gray-200 px-4 py-3 transition hover:border-blue-200 hover:bg-blue-50/50"><p className="text-sm font-semibold text-gray-900">Vendor Invoice</p><p className="mt-1 text-sm text-gray-600">Lakukan matching invoice vendor ke PO dan receipt atau langsung invoice untuk jasa.</p></Link></div></div></div></div></div>;
}
