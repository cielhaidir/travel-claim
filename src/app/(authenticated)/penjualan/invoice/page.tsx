"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { BusinessFlowBadge } from "@/components/features/business/BusinessFlowBadge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/features/PageHeader";
import { CrmEmptyHint, crmInputClassName, CrmMetricCard } from "@/components/features/crm/shared";
import { userHasPermission } from "@/lib/auth/role-check";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";
import { useToast } from "@/components/ui/Toast";

type SalesInvoiceRecord = {
  id: string;
  salesInvoiceNumber: string;
  issueDate: string | Date;
  dueDate: string | Date | null;
  notes?: string | null;
  totalAmount: number | string;
  status: string;
  customer: { id: string; company: string };
  salesOrder: {
    id: string;
    salesOrderNumber: string;
    fulfillmentMode?: string;
    requiresDelivery?: boolean;
  } | null;
  deliveryOrder: { id: string; deliveryOrderNumber: string } | null;
  lines: Array<{
    description?: string | null;
    qtyInvoiced?: number | string;
    unitPrice?: number | string;
    inventoryItem?: { id: string; sku: string; name: string; unitOfMeasure?: string | null } | null;
  }>;
};

const toLabel = (value?: string | null) => value ? value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "-";
const toBadge = (status?: string | null): "default" | "success" | "warning" | "danger" | "info" => status === "PAID" ? "success" : status === "PARTIALLY_PAID" ? "warning" : status === "OVERDUE" || status === "CANCELED" ? "danger" : status === "SENT" ? "info" : "default";
const DEFAULT_FORM = { issueDate: "", dueDate: "", notes: "" };

const invoiceStatusActions: Record<string, string[]> = {
  DRAFT: ["SENT", "CANCELED"],
  SENT: ["PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELED"],
  PARTIALLY_PAID: ["PAID", "OVERDUE"],
  OVERDUE: ["PARTIALLY_PAID", "PAID"],
};

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>{children}</div>;
}

export default function SalesInvoicePage() {
  const { data: session, status: sessionStatus } = useSession();
  const { showToast } = useToast();
  const utils = api.useUtils();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [editingRow, setEditingRow] = useState<SalesInvoiceRecord | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const isAllowed = session?.user ? userHasPermission(session.user, "sales", "read") : false;
  const canWrite = session?.user ? userHasPermission(session.user, "sales", "create") : false;

  const query = api.business.listSalesInvoices.useQuery(
    { search: search || undefined, status: status ? (status as never) : undefined, limit: 100 },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  ) as unknown as { data?: SalesInvoiceRecord[]; isLoading: boolean };

  const refreshData = async () => {
    await Promise.all([
      utils.business.listSalesInvoices.invalidate(),
      utils.business.listSalesOrders.invalidate(),
      utils.business.salesSummary.invalidate(),
    ]);
  };

  const updateMutation = api.business.updateSalesInvoice.useMutation({
    onSuccess: async () => {
      await refreshData();
      setEditingRow(null);
      setForm(DEFAULT_FORM);
      showToast({ title: "Invoice berhasil diubah", message: "Data invoice penjualan berhasil diperbarui.", variant: "success" });
    },
    onError: (error) => showToast({ title: "Gagal mengubah invoice", message: error.message, variant: "error" }),
  });

  const deleteMutation = api.business.deleteSalesInvoice.useMutation({
    onSuccess: async () => {
      await refreshData();
      showToast({ title: "Invoice berhasil dihapus", message: "Invoice penjualan sudah dihapus dari daftar aktif.", variant: "success" });
    },
    onError: (error) => showToast({ title: "Gagal menghapus invoice", message: error.message, variant: "error" }),
  });

  const changeStatusMutation = api.business.changeSalesInvoiceStatus.useMutation({
    onSuccess: async () => {
      await refreshData();
      showToast({ title: "Status invoice diperbarui", message: "Workflow invoice penjualan berhasil diubah.", variant: "success" });
    },
    onError: (error) => showToast({ title: "Gagal mengubah status invoice", message: error.message, variant: "error" }),
  });

  const rows = useMemo(() => query.data ?? [], [query.data]);
  const totalAmount = rows.reduce((sum, row) => sum + Number(row.totalAmount ?? 0), 0);
  const outstanding = rows.filter((row) => ["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(row.status)).length;
  const paidCount = rows.filter((row) => row.status === "PAID").length;
  const overdueCount = rows.filter((row) => row.status === "OVERDUE").length;

  function openEdit(row: SalesInvoiceRecord) {
    setEditingRow(row);
    setForm({ issueDate: new Date(row.issueDate).toISOString().slice(0, 10), dueDate: row.dueDate ? new Date(row.dueDate).toISOString().slice(0, 10) : "", notes: row.notes ?? "" });
  }

  async function handleUpdate() {
    if (!editingRow) return;
    await updateMutation.mutateAsync({ salesInvoiceId: editingRow.id, issueDate: form.issueDate || undefined, dueDate: form.dueDate || undefined, notes: form.notes || undefined });
  }

  async function handleDelete(row: SalesInvoiceRecord) {
    if (!window.confirm(`Hapus invoice ${row.salesInvoiceNumber}?`)) return;
    await deleteMutation.mutateAsync({ salesInvoiceId: row.id });
  }

  async function handleChangeStatus(row: SalesInvoiceRecord, nextStatus: string) {
    if (!window.confirm(`Ubah status ${row.salesInvoiceNumber} menjadi ${toLabel(nextStatus)}?`)) return;
    await changeStatusMutation.mutateAsync({ salesInvoiceId: row.id, status: nextStatus as never });
  }

  function handlePrint(row: SalesInvoiceRecord) {
    const printWindow = window.open("", "_blank", "width=1100,height=820");
    if (!printWindow) {
      showToast({ title: "Print gagal", message: "Popup browser diblokir. Izinkan popup untuk mencetak invoice.", variant: "error" });
      return;
    }

    const linesHtml = row.lines.map((line, index) => {
      const qty = Number(line.qtyInvoiced ?? 0);
      const unitPrice = Number(line.unitPrice ?? 0);
      const unit = line.inventoryItem?.unitOfMeasure ?? "unit";
      return `<tr><td>${index + 1}</td><td>${line.inventoryItem ? `${line.inventoryItem.sku} · ${line.inventoryItem.name}` : (line.description ?? "-")}</td><td class="text-right">${qty} ${unit}</td><td class="text-right">${formatCurrency(unitPrice)}</td><td class="text-right">${formatCurrency(qty * unitPrice)}</td></tr>`;
    }).join("");
    const totalLabel = formatCurrency(Number(row.totalAmount ?? 0));

    printWindow.document.write(`<!doctype html><html><head><title>${row.salesInvoiceNumber}</title><style>@page{size:A4;margin:16mm}body{font-family:Arial,sans-serif;color:#0f172a;font-size:12px}.header{display:flex;justify-content:space-between;border-bottom:3px solid #1d4ed8;padding-bottom:18px}.doc{border:1px solid #cbd5e1;border-radius:12px;padding:14px 16px;background:#f8fafc}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px}.card{border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px}.title{font-size:11px;text-transform:uppercase;color:#64748b;margin-bottom:10px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #cbd5e1;padding:10px}th{background:#eff6ff;color:#1e3a8a;text-align:left}.text-right{text-align:right}.summary{width:320px;margin-left:auto;margin-top:14px;border:1px solid #cbd5e1;border-radius:12px;overflow:hidden}.row{display:flex;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #e2e8f0}.row.total{background:#eff6ff;font-weight:700;color:#1e3a8a}.notes{border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;min-height:88px;white-space:pre-wrap}</style></head><body><div class="header"><div><h1 style="margin:0">PT Travel Claim Teknologi</h1><div style="margin-top:4px;color:#475569">IT Solution, Infrastructure & Professional Services</div><div style="margin-top:10px;color:#334155">Jl. Contoh Bisnis No. 88, Jakarta<br/>+62 21 5555 8888 · sales@travelclaim.local</div></div><div class="doc"><div style="color:#64748b;text-transform:uppercase;font-size:11px">Document</div><h2 style="margin:6px 0 0;color:#1e3a8a">Sales Invoice</h2><div style="margin-top:4px;font-weight:600">${row.salesInvoiceNumber}</div></div></div><div class="grid"><div class="card"><div class="title">Bill To</div><div>${row.customer.company}</div><div style="margin-top:6px;color:#64748b">SO: ${row.salesOrder?.salesOrderNumber ?? "-"}</div><div style="margin-top:6px;color:#64748b">DO: ${row.deliveryOrder?.deliveryOrderNumber ?? "No DO"}</div></div><div class="card"><div class="title">Invoice Info</div><div>Issue Date: ${formatDate(row.issueDate)}</div><div style="margin-top:6px">Due Date: ${row.dueDate ? formatDate(row.dueDate) : "-"}</div><div style="margin-top:6px">Status: ${toLabel(row.status)}</div><div style="margin-top:6px">Flow: ${toLabel(row.salesOrder?.fulfillmentMode)}</div></div></div><table><thead><tr><th>No</th><th>Item</th><th class="text-right">Qty</th><th class="text-right">Unit Price</th><th class="text-right">Line Total</th></tr></thead><tbody>${linesHtml}</tbody></table><div class="summary"><div class="row"><span>Subtotal</span><strong>${totalLabel}</strong></div><div class="row"><span>Tax</span><strong>${formatCurrency(0)}</strong></div><div class="row total"><span>Grand Total</span><strong>${totalLabel}</strong></div></div><div class="grid"><div><div class="title">Notes</div><div class="notes">${row.notes ?? "Invoice ini diterbitkan berdasarkan dokumen penjualan yang telah berjalan."}</div></div><div><div class="title">Payment Terms</div><div class="notes">Mohon lakukan pembayaran sebelum jatuh tempo. Untuk pertanyaan billing silakan hubungi tim finance atau sales representative terkait.</div></div></div></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  if (sessionStatus === "loading") {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
        Memuat sesi dan data invoice penjualan...
      </div>
    );
  }

  if (sessionStatus !== "authenticated" || !session?.user) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 shadow-sm">
        Sesi login tidak ditemukan. Silakan login ulang untuk mengakses invoice penjualan.
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-900 shadow-sm">
        Anda tidak memiliki akses untuk melihat invoice penjualan.
      </div>
    );
  }

  return <div className="space-y-6"><PageHeader title="Invoice Penjualan" description="Invoice penjualan sekarang konsisten dengan flow barang vs jasa: order barang lewat delivery, sedangkan order jasa bisa langsung ditagihkan ke customer." badge={<Badge variant="warning">Live Data</Badge>} secondaryAction={{ label: "Kembali ke Penjualan", href: "/penjualan" }} /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><CrmMetricCard label="Invoice" value={String(rows.length)} helper="Tagihan customer" /><CrmMetricCard label="Outstanding" value={String(outstanding)} helper="Belum lunas" /><CrmMetricCard label="Paid" value={String(paidCount)} helper="Sudah lunas" /><CrmMetricCard label="Total Nilai" value={formatCurrency(totalAmount)} helper={`${overdueCount} overdue`} /></div><div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="grid gap-3 md:grid-cols-[1fr_220px]"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari invoice, customer, SO, atau DO" className={crmInputClassName} /><select value={status} onChange={(e) => setStatus(e.target.value)} className={crmInputClassName}><option value="">Semua status</option><option value="DRAFT">Draft</option><option value="SENT">Sent</option><option value="PARTIALLY_PAID">Partially Paid</option><option value="PAID">Paid</option><option value="OVERDUE">Overdue</option><option value="CANCELED">Canceled</option></select></div></div><div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]"><div className="rounded-xl border border-gray-200 bg-white shadow-sm"><div className="border-b border-gray-200 px-5 py-4"><h2 className="text-lg font-semibold text-gray-900">Monitoring Invoice Penjualan</h2><p className="text-sm text-gray-500">Invoice sekarang sudah memiliki aksi print, edit, dan hapus seperti dokumen quotation.</p></div>{query.isLoading ? <div className="p-5 text-sm text-gray-500">Memuat invoice penjualan...</div> : rows.length === 0 ? <div className="p-5"><CrmEmptyHint text="Belum ada invoice penjualan di database." /></div> : <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200 text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Invoice</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Customer</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Flow / Referensi</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Nilai</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th><th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Aksi</th></tr></thead><tbody className="divide-y divide-gray-100 bg-white">{rows.map((row) => { const flowLabel = row.salesOrder?.requiresDelivery === false ? "Service invoice" : row.salesOrder?.fulfillmentMode === "MIXED" ? "Mixed invoice" : "Goods invoice"; const canManage = canWrite && !["PAID", "PARTIALLY_PAID"].includes(row.status); return <tr key={row.id}><td className="px-4 py-3"><p className="font-semibold text-gray-900">{row.salesInvoiceNumber}</p><p className="text-xs text-gray-500">{formatDate(row.issueDate)} • Due {row.dueDate ? formatDate(row.dueDate) : "-"}</p></td><td className="px-4 py-3 text-gray-600">{row.customer.company}</td><td className="px-4 py-3 text-gray-600"><div className="flex flex-wrap items-center gap-2"><p>{flowLabel}</p><BusinessFlowBadge value={row.salesOrder?.fulfillmentMode} /></div><p className="text-xs text-gray-500">{row.salesOrder?.salesOrderNumber ?? "-"} • {row.deliveryOrder?.deliveryOrderNumber ?? "No DO"}</p></td><td className="px-4 py-3 text-gray-600">{formatCurrency(Number(row.totalAmount ?? 0))}</td><td className="px-4 py-3"><Badge variant={toBadge(row.status)}>{toLabel(row.status)}</Badge><div className="mt-2 flex flex-wrap gap-2">{canWrite ? (invoiceStatusActions[row.status] ?? []).map((nextStatus) => <Button key={nextStatus} size="sm" variant="ghost" isLoading={changeStatusMutation.isPending} onClick={() => void handleChangeStatus(row, nextStatus)}>{toLabel(nextStatus)}</Button>) : null}</div></td><td className="px-4 py-3"><div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="secondary" onClick={() => handlePrint(row)}>Print</Button><Button size="sm" variant="ghost" disabled={!canManage} onClick={() => openEdit(row)}>Edit</Button><Button size="sm" variant="destructive" disabled={!canManage} isLoading={deleteMutation.isPending} onClick={() => void handleDelete(row)}>Hapus</Button></div></td></tr>;})}</tbody></table></div>}</div><div className="space-y-6"><div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-gray-900">Relasi Dokumen</h2><ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-600"><li>Invoice terhubung ke customer CRM dan sales order.</li><li>SO barang biasanya memakai delivery order sebelum billing.</li><li>SO jasa dapat langsung ditagihkan tanpa delivery order.</li></ul></div><div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><Link href="/penjualan/delivery-order" className="block rounded-lg border border-gray-200 px-4 py-3 transition hover:border-blue-200 hover:bg-blue-50/50"><p className="text-sm font-semibold text-gray-900">Delivery Order</p><p className="mt-1 text-sm text-gray-600">Pastikan delivery valid untuk flow barang sebelum penagihan.</p></Link></div></div></div><Modal isOpen={Boolean(editingRow)} onClose={() => { setEditingRow(null); setForm(DEFAULT_FORM); }} title="Edit Invoice Penjualan"><div className="grid gap-4 md:grid-cols-2"><Field label="Issue Date"><input type="date" value={form.issueDate} onChange={(e) => setForm((prev) => ({ ...prev, issueDate: e.target.value }))} className={crmInputClassName} /></Field><Field label="Due Date"><input type="date" value={form.dueDate} onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))} className={crmInputClassName} /></Field><Field label="Catatan" className="md:col-span-2"><textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} className={`${crmInputClassName} min-h-[100px]`} /></Field></div><div className="mt-6 flex justify-end gap-3"><Button variant="secondary" onClick={() => { setEditingRow(null); setForm(DEFAULT_FORM); }}>Batal</Button><Button isLoading={updateMutation.isPending} onClick={() => void handleUpdate()}>Simpan Perubahan</Button></div></Modal></div>;
}
