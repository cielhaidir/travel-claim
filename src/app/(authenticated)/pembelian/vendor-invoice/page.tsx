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

type VendorInvoiceRecord = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string | Date;
  dueDate: string | Date | null;
  totalAmount: number | string;
  status: string;
  matchType: string;
  vendor: { company: string };
  purchaseOrder: {
    orderNumber: string;
    procurementMode?: string;
    requiresReceipt?: boolean;
  } | null;
  goodsReceipt: { receiptNumber: string } | null;
};

const toLabel = (value?: string | null) => value ? value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "-";
const toBadge = (status?: string | null): "default" | "success" | "warning" | "danger" | "info" => { switch (status) { case "MATCHED": case "READY_TO_PAY": case "PAID": return "success"; case "WAITING_MATCH": return "warning"; case "DISPUTE": return "danger"; default: return "default"; } };

export default function VendorInvoicePage() {
  const { data: session, status: sessionStatus } = useSession();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const isAllowed = session?.user ? userHasPermission(session.user, "purchases", "read") : false;

  const query = api.business.listVendorInvoices.useQuery(
    { search: search || undefined, status: status ? (status as never) : undefined, limit: 100 },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  ) as unknown as { data?: VendorInvoiceRecord[]; isLoading: boolean };

  const rows = useMemo(() => query.data ?? [], [query.data]);
  const totalAmount = rows.reduce((sum, row) => sum + Number(row.totalAmount ?? 0), 0);
  const waitingMatch = rows.filter((row) => row.status === "WAITING_MATCH").length;
  const readyToPay = rows.filter((row) => row.status === "READY_TO_PAY").length;
  const dispute = rows.filter((row) => row.status === "DISPUTE").length;

  if (sessionStatus === "loading") {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
        Memuat sesi dan data invoice vendor...
      </div>
    );
  }

  if (sessionStatus !== "authenticated" || !session?.user) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 shadow-sm">
        Sesi login tidak ditemukan. Silakan login ulang untuk mengakses invoice vendor.
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-900 shadow-sm">
        Anda tidak memiliki akses untuk melihat invoice vendor.
      </div>
    );
  }

  return <div className="space-y-6"><PageHeader title="Invoice Vendor" description="Invoice vendor sekarang konsisten dengan flow barang vs jasa: PO barang memakai receipt, sedangkan PO jasa dapat langsung ditagihkan ke vendor." badge={<Badge variant="warning">Live Data</Badge>} secondaryAction={{ label: "Kembali ke Pembelian", href: "/pembelian" }} /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><CrmMetricCard label="Invoice" value={String(rows.length)} helper="Tagihan vendor" /><CrmMetricCard label="Waiting Match" value={String(waitingMatch)} helper="Belum clean match" /><CrmMetricCard label="Ready to Pay" value={String(readyToPay)} helper="Siap dibayar" /><CrmMetricCard label="Total Nilai" value={formatCurrency(totalAmount)} helper={`${dispute} dispute`} /></div><div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="grid gap-3 md:grid-cols-[1fr_220px]"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari invoice vendor, vendor, PO, atau GR" className={crmInputClassName} /><select value={status} onChange={(e) => setStatus(e.target.value)} className={crmInputClassName}><option value="">Semua status</option><option value="DRAFT">Draft</option><option value="WAITING_MATCH">Waiting Match</option><option value="MATCHED">Matched</option><option value="DISPUTE">Dispute</option><option value="READY_TO_PAY">Ready to Pay</option><option value="PAID">Paid</option><option value="CANCELED">Canceled</option></select></div></div><div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]"><div className="rounded-xl border border-gray-200 bg-white shadow-sm"><div className="border-b border-gray-200 px-5 py-4"><h2 className="text-lg font-semibold text-gray-900">Monitoring Invoice Vendor</h2><p className="text-sm text-gray-500">Tagihan vendor sekarang menunjukkan apakah dokumen berasal dari flow barang dengan receipt atau flow jasa tanpa receipt.</p></div>{query.isLoading ? <div className="p-5 text-sm text-gray-500">Memuat invoice vendor...</div> : rows.length === 0 ? <div className="p-5"><CrmEmptyHint text="Belum ada invoice vendor di database." /></div> : <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200 text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Invoice</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Vendor</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Flow / Referensi</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Nilai</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th></tr></thead><tbody className="divide-y divide-gray-100 bg-white">{rows.map((row) => { const flowLabel = row.purchaseOrder?.requiresReceipt === false ? "Service invoice" : row.purchaseOrder?.procurementMode === "MIXED" ? "Mixed invoice" : "Goods invoice"; return <tr key={row.id}><td className="px-4 py-3"><p className="font-semibold text-gray-900">{row.invoiceNumber}</p><p className="text-xs text-gray-500">{formatDate(row.invoiceDate)} • Due {row.dueDate ? formatDate(row.dueDate) : "-"}</p></td><td className="px-4 py-3 text-gray-600">{row.vendor.company}</td><td className="px-4 py-3 text-gray-600"><div className="flex flex-wrap items-center gap-2"><p>{flowLabel}</p><BusinessFlowBadge value={row.purchaseOrder?.procurementMode} /></div><p className="text-xs text-gray-500">{row.purchaseOrder?.orderNumber ?? "-"} • {row.goodsReceipt?.receiptNumber ?? "No GR"} • {toLabel(row.matchType)}</p></td><td className="px-4 py-3 text-gray-600">{formatCurrency(Number(row.totalAmount ?? 0))}</td><td className="px-4 py-3"><Badge variant={toBadge(row.status)}>{toLabel(row.status)}</Badge></td></tr>;})}</tbody></table></div>}</div><div className="space-y-6"><div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-gray-900">Relasi Dokumen</h2><ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-600"><li>Invoice vendor terhubung ke vendor CRM dan purchase order.</li><li>PO barang biasanya memakai goods receipt untuk 3-way matching.</li><li>PO jasa dapat langsung ditagihkan dengan 2-way matching tanpa receipt.</li></ul></div><div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><Link href="/pembelian/goods-receipt" className="block rounded-lg border border-gray-200 px-4 py-3 transition hover:border-blue-200 hover:bg-blue-50/50"><p className="text-sm font-semibold text-gray-900">Periksa Goods Receipt</p><p className="mt-1 text-sm text-gray-600">Gunakan receipt untuk flow barang dan matching 3-way.</p></Link></div></div></div></div>;
}
