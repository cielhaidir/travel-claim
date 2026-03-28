"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { BusinessFlowBadge } from "@/components/features/business/BusinessFlowBadge";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/features/PageHeader";
import { CrmEmptyHint, crmInputClassName, CrmMetricCard } from "@/components/features/crm/shared";
import { userHasPermission } from "@/lib/auth/role-check";
import { formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";

type GoodsReceiptLineRecord = {
  qtyOrdered: number | string;
  qtyReceived: number | string;
  qtyAccepted?: number | string;
  description?: string | null;
  inventoryItem?: { sku: string; name: string } | null;
};
type GoodsReceiptRecord = {
  id: string;
  receiptNumber: string;
  receiptDate: string | Date;
  status: string;
  vendor: { company: string };
  purchaseOrder: { orderNumber: string; procurementMode?: string; requiresReceipt?: boolean } | null;
  warehouse: { name: string } | null;
  lines: GoodsReceiptLineRecord[];
};

const toLabel = (value?: string | null) => value ? value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "-";
const toBadge = (status?: string | null): "default" | "success" | "warning" | "danger" | "info" => status === "RECEIVED" ? "success" : status === "PARTIAL" ? "warning" : status === "QC_HOLD" ? "danger" : "default";
const summarizeItems = (lines: GoodsReceiptLineRecord[]) => {
  const labels = lines
    .map((line) => line.inventoryItem?.name ?? line.description ?? null)
    .filter((value): value is string => Boolean(value));

  if (labels.length === 0) return "-";
  if (labels.length === 1) return labels[0];
  return `${labels[0]} +${labels.length - 1} item`;
};

export default function GoodsReceiptPage() {
  const { data: session } = useSession();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const isAllowed = session?.user ? userHasPermission(session.user, "purchases", "read") : false;

  const query = api.business.listGoodsReceipts.useQuery(
    { search: search || undefined, status: status ? (status as never) : undefined, limit: 100 },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  ) as unknown as { data?: GoodsReceiptRecord[]; isLoading: boolean };

  const rows = useMemo(() => query.data ?? [], [query.data]);
  const expectedQty = rows.reduce((sum, row) => sum + row.lines.reduce((lineSum, line) => lineSum + Number(line.qtyOrdered ?? 0), 0), 0);
  const receivedQty = rows.reduce((sum, row) => sum + row.lines.reduce((lineSum, line) => lineSum + Number(line.qtyReceived ?? 0), 0), 0);
  const partialCount = rows.filter((row) => row.status === "PARTIAL").length;
  const holdCount = rows.filter((row) => row.status === "QC_HOLD").length;

  if (!session || !isAllowed) return null;

  return <div className="space-y-6"><PageHeader title="Goods Receipt" description="Goods receipt sekarang konsisten dengan flow barang perusahaan IT dan menampilkan item inventory fisik yang benar-benar diterima dari vendor." badge={<Badge variant="info">Live Data</Badge>} secondaryAction={{ label: "Kembali ke Pembelian", href: "/pembelian" }} /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><CrmMetricCard label="Receipt" value={String(rows.length)} helper="Dokumen penerimaan" /><CrmMetricCard label="Qty Ordered" value={String(expectedQty)} helper="Dari line PO barang" /><CrmMetricCard label="Qty Received" value={String(receivedQty)} helper="Perangkat sudah diterima" /><CrmMetricCard label="QC / Partial" value={String(partialCount + holdCount)} helper="Perlu tindak lanjut" /></div><div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="grid gap-3 md:grid-cols-[1fr_220px]"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nomor GR, nomor PO, item inventory, atau vendor" className={crmInputClassName} /><select value={status} onChange={(e) => setStatus(e.target.value)} className={crmInputClassName}><option value="">Semua status</option><option value="DRAFT">Draft</option><option value="PARTIAL">Partial</option><option value="RECEIVED">Received</option><option value="QC_HOLD">QC Hold</option><option value="CANCELED">Canceled</option></select></div></div><div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]"><div className="rounded-xl border border-gray-200 bg-white shadow-sm"><div className="border-b border-gray-200 px-5 py-4"><h2 className="text-lg font-semibold text-gray-900">Monitoring Goods Receipt</h2><p className="text-sm text-gray-500">Receipt menampilkan perangkat fisik seperti switch, access point, firewall, dan item inventory IT lain yang masuk ke gudang.</p></div>{query.isLoading ? <div className="p-5 text-sm text-gray-500">Memuat goods receipt...</div> : rows.length === 0 ? <div className="p-5"><CrmEmptyHint text="Belum ada goods receipt di database." /></div> : <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200 text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">GR</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Item Inventory</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Vendor / Gudang</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Qty</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th></tr></thead><tbody className="divide-y divide-gray-100 bg-white">{rows.map((row) => { const qtyOrdered = row.lines.reduce((sum, line) => sum + Number(line.qtyOrdered ?? 0), 0); const qtyReceivedLine = row.lines.reduce((sum, line) => sum + Number(line.qtyReceived ?? 0), 0); const flowLabel = row.purchaseOrder?.requiresReceipt === false ? "Service PO" : row.purchaseOrder?.procurementMode === "MIXED" ? "Mixed goods receipt" : "Goods receipt"; return <tr key={row.id}><td className="px-4 py-3"><p className="font-semibold text-gray-900">{row.receiptNumber}</p><p className="text-xs text-gray-500">{formatDate(row.receiptDate)} • {row.purchaseOrder?.orderNumber ?? "-"}</p></td><td className="px-4 py-3"><p className="text-gray-900">{summarizeItems(row.lines)}</p><div className="mt-1 flex flex-wrap items-center gap-2"><p className="text-xs text-gray-500">{row.lines.length} line • {flowLabel}</p><BusinessFlowBadge value={row.purchaseOrder?.procurementMode} /></div></td><td className="px-4 py-3 text-gray-600">{row.vendor.company} • {row.warehouse?.name ?? "-"}</td><td className="px-4 py-3 text-gray-600">{qtyReceivedLine} / {qtyOrdered}</td><td className="px-4 py-3"><Badge variant={toBadge(row.status)}>{toLabel(row.status)}</Badge></td></tr>; })}</tbody></table></div>}</div><div className="space-y-6"><div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-gray-900">Relasi Dokumen</h2><ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-600"><li>GR dipakai untuk purchase order barang yang memang memerlukan penerimaan fisik.</li><li>Line GR dapat refer ke line PO, gudang, dan item inventory perangkat IT.</li><li>GR yang valid menjadi dasar vendor invoice untuk flow 3-way matching.</li></ul></div><div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><Link href="/pembelian/vendor-invoice" className="block rounded-lg border border-gray-200 px-4 py-3 transition hover:border-blue-200 hover:bg-blue-50/50"><p className="text-sm font-semibold text-gray-900">Vendor Invoice</p><p className="mt-1 text-sm text-gray-600">Lanjutkan matching invoice berdasarkan receipt perangkat yang sudah diterima.</p></Link></div></div></div></div>;
}
