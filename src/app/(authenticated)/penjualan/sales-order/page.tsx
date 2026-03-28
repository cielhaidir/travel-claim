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

type SalesOrderRecord = {
  id: string;
  salesOrderNumber: string;
  orderDate: string | Date;
  plannedShipDate: string | Date | null;
  salesOwnerName: string | null;
  notes?: string | null;
  totalAmount: number | string;
  status: string;
  requiresDelivery?: boolean;
  fulfillmentMode?: string;
  customer: { id: string; company: string };
  quotation: { id: string; quotationNumber: string } | null;
  deliveryOrders?: Array<{ id: string; deliveryOrderNumber: string; status: string }>;
  salesInvoices?: Array<{ id: string; salesInvoiceNumber: string; status: string }>;
  lines: Array<{
    description?: string | null;
    qtyOrdered?: number | string;
    unitPrice?: number | string;
    warehouse?: { id: string; code: string; name: string } | null;
    inventoryItem?: { id: string; sku: string; name: string; unitOfMeasure?: string | null } | null;
  }>;
};

const toLabel = (value?: string | null) => value ? value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "-";
const toBadge = (status?: string | null): "default" | "success" | "warning" | "danger" | "info" => status === "CLOSED" ? "success" : status === "DELIVERED" ? "info" : status === "READY_TO_SHIP" || status === "PARTIALLY_DELIVERED" ? "warning" : status === "CANCELED" ? "danger" : "default";
const summarizeItems = (lines: SalesOrderRecord["lines"]) => {
  const labels = lines.map((line) => line.inventoryItem?.name ?? line.description ?? null).filter((value): value is string => Boolean(value));
  if (labels.length === 0) return "-";
  if (labels.length === 1) return labels[0];
  return `${labels[0]} +${labels.length - 1} item`;
};

const DEFAULT_FORM = { plannedShipDate: "", notes: "" };

const salesOrderStatusActions: Record<string, string[]> = {
  DRAFT: ["CONFIRMED", "CANCELED"],
  CONFIRMED: ["READY_TO_SHIP", "CANCELED"],
  READY_TO_SHIP: ["PARTIALLY_DELIVERED", "DELIVERED", "CANCELED"],
  PARTIALLY_DELIVERED: ["DELIVERED", "CANCELED"],
  DELIVERED: ["CLOSED"],
};

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>{children}</div>;
}

export default function SalesOrderPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { showToast } = useToast();
  const utils = api.useUtils();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [editingRow, setEditingRow] = useState<SalesOrderRecord | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const isAllowed = session?.user ? userHasPermission(session.user, "sales", "read") : false;
  const canWrite = session?.user ? userHasPermission(session.user, "sales", "create") : false;

  const query = api.business.listSalesOrders.useQuery(
    { search: search || undefined, status: status ? (status as never) : undefined, limit: 100 },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  ) as unknown as { data?: SalesOrderRecord[]; isLoading: boolean };

  const refreshData = async () => {
    await Promise.all([
      utils.business.listSalesOrders.invalidate(),
      utils.business.listDeliveryOrders.invalidate(),
      utils.business.listSalesInvoices.invalidate(),
      utils.business.salesSummary.invalidate(),
    ]);
  };

  const updateMutation = api.business.updateSalesOrder.useMutation({
    onSuccess: async () => {
      await refreshData();
      setEditingRow(null);
      setForm(DEFAULT_FORM);
      showToast({ title: "Sales order berhasil diubah", message: "Data sales order berhasil diperbarui.", variant: "success" });
    },
    onError: (error) => showToast({ title: "Gagal mengubah sales order", message: error.message, variant: "error" }),
  });

  const deleteMutation = api.business.deleteSalesOrder.useMutation({
    onSuccess: async () => {
      await refreshData();
      showToast({ title: "Sales order berhasil dihapus", message: "Sales order sudah dihapus dari daftar aktif.", variant: "success" });
    },
    onError: (error) => showToast({ title: "Gagal menghapus sales order", message: error.message, variant: "error" }),
  });

  const createDeliveryMutation = api.business.createDeliveryOrderFromSalesOrder.useMutation({
    onSuccess: async (data) => {
      await refreshData();
      showToast({ variant: "success", title: "Delivery order berhasil dibuat", message: `SO berhasil dikirim menjadi ${String((data as { deliveryOrderNumber?: string }).deliveryOrderNumber ?? "delivery order")}.` });
    },
    onError: (error) => showToast({ variant: "error", title: "Buat delivery gagal", message: error.message }),
  });

  const createInvoiceMutation = api.business.createSalesInvoiceFromOrder.useMutation({
    onSuccess: async (data) => {
      await refreshData();
      showToast({ variant: "success", title: "Sales invoice berhasil dibuat", message: `SO berhasil ditagihkan menjadi ${String((data as { salesInvoiceNumber?: string }).salesInvoiceNumber ?? "sales invoice")}.` });
    },
    onError: (error) => showToast({ variant: "error", title: "Buat invoice gagal", message: error.message }),
  });

  const changeStatusMutation = api.business.changeSalesOrderStatus.useMutation({
    onSuccess: async () => {
      await refreshData();
      showToast({ title: "Status sales order diperbarui", message: "Workflow sales order berhasil diubah.", variant: "success" });
    },
    onError: (error) => showToast({ title: "Gagal mengubah status SO", message: error.message, variant: "error" }),
  });

  const rows = useMemo(() => query.data ?? [], [query.data]);
  const totalValue = rows.reduce((sum, row) => sum + Number(row.totalAmount ?? 0), 0);
  const readyCount = rows.filter((row) => row.status === "READY_TO_SHIP").length;
  const deliveredCount = rows.filter((row) => row.status === "DELIVERED").length;
  const closedCount = rows.filter((row) => row.status === "CLOSED").length;

  function openEdit(row: SalesOrderRecord) {
    setEditingRow(row);
    setForm({ plannedShipDate: row.plannedShipDate ? new Date(row.plannedShipDate).toISOString().slice(0, 10) : "", notes: row.notes ?? "" });
  }

  async function handleUpdate() {
    if (!editingRow) return;
    await updateMutation.mutateAsync({ salesOrderId: editingRow.id, plannedShipDate: form.plannedShipDate || undefined, notes: form.notes || undefined });
  }

  async function handleDelete(row: SalesOrderRecord) {
    if (!window.confirm(`Hapus sales order ${row.salesOrderNumber}?`)) return;
    await deleteMutation.mutateAsync({ salesOrderId: row.id });
  }

  async function handleCreateDelivery(row: SalesOrderRecord) {
    if (!window.confirm(`Buat delivery order dari ${row.salesOrderNumber}?`)) return;
    await createDeliveryMutation.mutateAsync({ salesOrderId: row.id, notes: `Auto delivered from ${row.salesOrderNumber}` });
  }

  async function handleCreateInvoice(row: SalesOrderRecord) {
    if (!window.confirm(`Buat sales invoice dari ${row.salesOrderNumber}?`)) return;
    await createInvoiceMutation.mutateAsync({ salesOrderId: row.id, notes: `Auto invoiced from ${row.salesOrderNumber}` });
  }

  async function handleChangeStatus(row: SalesOrderRecord, nextStatus: string) {
    if (!window.confirm(`Ubah status ${row.salesOrderNumber} menjadi ${toLabel(nextStatus)}?`)) return;
    await changeStatusMutation.mutateAsync({ salesOrderId: row.id, status: nextStatus as never });
  }

  function handlePrint(row: SalesOrderRecord) {
    const printWindow = window.open("", "_blank", "width=1100,height=820");
    if (!printWindow) {
      showToast({ title: "Print gagal", message: "Popup browser diblokir. Izinkan popup untuk mencetak sales order.", variant: "error" });
      return;
    }

    const companyProfile = { name: "PT Travel Claim Teknologi", tagline: "IT Solution, Infrastructure & Professional Services", address: "Jl. Contoh Bisnis No. 88, Jakarta", phone: "+62 21 5555 8888", email: "sales@travelclaim.local" };
    const linesHtml = row.lines.map((line, index) => {
      const qty = Number(line.qtyOrdered ?? 0);
      const unitPrice = Number(line.unitPrice ?? 0);
      const unit = line.inventoryItem?.unitOfMeasure ?? "unit";
      return `<tr><td>${index + 1}</td><td><div class="item-name">${line.inventoryItem ? `${line.inventoryItem.sku} · ${line.inventoryItem.name}` : (line.description ?? "-")}</div><div class="item-note">${line.description ?? "-"}</div></td><td>${line.warehouse ? `${line.warehouse.code} · ${line.warehouse.name}` : "-"}</td><td class="text-right">${qty.toLocaleString("id-ID")} ${unit}</td><td class="text-right">${formatCurrency(unitPrice)}</td><td class="text-right">${formatCurrency(qty * unitPrice)}</td></tr>`;
    }).join("");
    const totalLabel = formatCurrency(Number(row.totalAmount ?? 0));

    printWindow.document.write(`<!doctype html><html><head><title>${row.salesOrderNumber}</title><style>@page{size:A4;margin:16mm}body{font-family:Arial,sans-serif;color:#0f172a;font-size:12px}.header{display:flex;justify-content:space-between;border-bottom:3px solid #1d4ed8;padding-bottom:18px}.doc{border:1px solid #cbd5e1;border-radius:12px;padding:14px 16px;background:#f8fafc}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px}.card{border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px}.title{font-size:11px;text-transform:uppercase;color:#64748b;margin-bottom:10px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #cbd5e1;padding:10px}th{background:#eff6ff;color:#1e3a8a;text-align:left}.text-right{text-align:right}.item-name{font-weight:600}.item-note{margin-top:4px;color:#64748b;font-size:11px}.summary{width:320px;margin-left:auto;margin-top:14px;border:1px solid #cbd5e1;border-radius:12px;overflow:hidden}.row{display:flex;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #e2e8f0}.row.total{background:#eff6ff;font-weight:700;color:#1e3a8a}.notes{border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;min-height:88px;white-space:pre-wrap}.sign{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:26px}.line{border-top:1px solid #94a3b8;padding-top:8px;min-height:80px}</style></head><body><div class="header"><div><h1 style="margin:0">${companyProfile.name}</h1><div style="margin-top:4px;color:#475569">${companyProfile.tagline}</div><div style="margin-top:10px;color:#334155">${companyProfile.address}<br/>${companyProfile.phone} · ${companyProfile.email}</div></div><div class="doc"><div style="color:#64748b;text-transform:uppercase;font-size:11px">Document</div><h2 style="margin:6px 0 0;color:#1e3a8a">Sales Order</h2><div style="margin-top:4px;font-weight:600">${row.salesOrderNumber}</div></div></div><div class="grid"><div class="card"><div class="title">Customer</div><div>${row.customer.company}</div><div style="margin-top:6px;color:#64748b">Quotation: ${row.quotation?.quotationNumber ?? "-"}</div><div style="margin-top:6px;color:#64748b">Flow: ${toLabel(row.fulfillmentMode)}</div></div><div class="card"><div class="title">Order Info</div><div>Order Date: ${formatDate(row.orderDate)}</div><div style="margin-top:6px">Planned Ship: ${row.plannedShipDate ? formatDate(row.plannedShipDate) : "-"}</div><div style="margin-top:6px">Sales Owner: ${row.salesOwnerName ?? "-"}</div><div style="margin-top:6px">Status: ${toLabel(row.status)}</div></div></div><table><thead><tr><th>No</th><th>Item / Description</th><th>Gudang</th><th class="text-right">Qty</th><th class="text-right">Unit Price</th><th class="text-right">Line Total</th></tr></thead><tbody>${linesHtml}</tbody></table><div class="summary"><div class="row"><span>Subtotal</span><strong>${totalLabel}</strong></div><div class="row"><span>Tax</span><strong>${formatCurrency(0)}</strong></div><div class="row total"><span>Grand Total</span><strong>${totalLabel}</strong></div></div><div class="grid"><div><div class="title">Notes</div><div class="notes">${row.notes ?? "Sales order ini dibuat dari flow penjualan aktif perusahaan."}</div></div><div><div class="title">Terms</div><div class="notes">Pengiriman mengikuti jadwal yang disepakati. Untuk service-only order, dokumen ini dapat langsung ditindaklanjuti ke invoice tanpa delivery order.</div></div></div><div class="sign"><div><div class="title">Prepared By</div><div class="line"><strong>${row.salesOwnerName ?? "Sales Team"}</strong><div style="color:#64748b;margin-top:4px">Sales Representative</div></div></div><div><div class="title">Approved / Accepted By</div><div class="line"><strong>${row.customer.company}</strong><div style="color:#64748b;margin-top:4px">Customer</div></div></div></div></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  if (sessionStatus === "loading") {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
        Memuat sesi dan data sales order...
      </div>
    );
  }

  if (sessionStatus !== "authenticated" || !session?.user) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 shadow-sm">
        Sesi login tidak ditemukan. Silakan login ulang untuk mengakses sales order.
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-900 shadow-sm">
        Anda tidak memiliki akses untuk melihat sales order.
      </div>
    );
  }

  return <div className="space-y-6"><PageHeader title="Sales Order" description="Sales order membaca data real dari schema sales dan mengikuti item inventory barang serta jasa perusahaan IT." badge={<Badge variant="success">Live Data</Badge>} secondaryAction={{ label: "Kembali ke Penjualan", href: "/penjualan" }} /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><CrmMetricCard label="Sales Order" value={String(rows.length)} helper="Dokumen order" /><CrmMetricCard label="Ready to Ship" value={String(readyCount)} helper="Siap fulfillment" /><CrmMetricCard label="Delivered" value={String(deliveredCount)} helper="Sudah terkirim" /><CrmMetricCard label="Nilai Order" value={formatCurrency(totalValue)} helper={`${closedCount} closed`} /></div><div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="grid gap-3 md:grid-cols-[1fr_220px]"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari sales order, customer, sales owner, atau quotation" className={crmInputClassName} /><select value={status} onChange={(e) => setStatus(e.target.value)} className={crmInputClassName}><option value="">Semua status</option><option value="DRAFT">Draft</option><option value="CONFIRMED">Confirmed</option><option value="READY_TO_SHIP">Ready to Ship</option><option value="PARTIALLY_DELIVERED">Partially Delivered</option><option value="DELIVERED">Delivered</option><option value="CLOSED">Closed</option><option value="CANCELED">Canceled</option></select></div></div><div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]"><div className="rounded-xl border border-gray-200 bg-white shadow-sm"><div className="border-b border-gray-200 px-5 py-4"><h2 className="text-lg font-semibold text-gray-900">Monitoring Sales Order</h2><p className="text-sm text-gray-500">SO sekarang sudah memiliki aksi print, edit, hapus, create DO, dan create invoice.</p></div>{query.isLoading ? <div className="p-5 text-sm text-gray-500">Memuat sales order...</div> : rows.length === 0 ? <div className="p-5"><CrmEmptyHint text="Belum ada sales order di database." /></div> : <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200 text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">SO</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Item / Service</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Customer</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Nilai</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th><th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Aksi</th></tr></thead><tbody className="divide-y divide-gray-100 bg-white">{rows.map((row) => { const canDelivery = canWrite && row.status !== "CANCELED" && (row.requiresDelivery ?? true) && !(row.deliveryOrders?.length); const canInvoice = canWrite && row.status !== "CANCELED" && !(row.salesInvoices?.length) && ((row.requiresDelivery ?? true) ? Boolean(row.deliveryOrders?.length) : true); const canManage = canWrite && !(row.deliveryOrders?.length) && !(row.salesInvoices?.length); const flowLabel = row.requiresDelivery === false ? "Service / no delivery" : row.fulfillmentMode === "MIXED" ? "Mixed flow" : "Goods / delivery"; return <tr key={row.id}><td className="px-4 py-3"><p className="font-semibold text-gray-900">{row.salesOrderNumber}</p><p className="text-xs text-gray-500">{formatDate(row.orderDate)} • {row.quotation?.quotationNumber ?? "-"}</p></td><td className="px-4 py-3"><p className="text-gray-900">{summarizeItems(row.lines)}</p><div className="mt-1 flex flex-wrap items-center gap-2"><p className="text-xs text-gray-500">{row.lines.length} line • {row.plannedShipDate ? formatDate(row.plannedShipDate) : "-"}</p><BusinessFlowBadge value={row.fulfillmentMode} /></div></td><td className="px-4 py-3 text-gray-600">{row.customer.company}</td><td className="px-4 py-3 text-gray-600">{formatCurrency(Number(row.totalAmount ?? 0))}</td><td className="px-4 py-3"><div className="flex flex-col gap-1"><Badge variant={toBadge(row.status)}>{toLabel(row.status)}</Badge><span className="text-xs text-gray-500">{flowLabel}</span>{row.deliveryOrders?.[0] ? <span className="text-xs text-gray-500">DO: {row.deliveryOrders[0].deliveryOrderNumber}</span> : null}{row.salesInvoices?.[0] ? <span className="text-xs text-gray-500">Invoice: {row.salesInvoices[0].salesInvoiceNumber}</span> : null}</div><div className="mt-2 flex flex-wrap gap-2">{canWrite ? (salesOrderStatusActions[row.status] ?? []).map((nextStatus) => <Button key={nextStatus} size="sm" variant="ghost" isLoading={changeStatusMutation.isPending} onClick={() => void handleChangeStatus(row, nextStatus)}>{toLabel(nextStatus)}</Button>) : null}</div></td><td className="px-4 py-3"><div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="secondary" onClick={() => handlePrint(row)}>Print</Button><Button size="sm" variant="ghost" disabled={!canManage} onClick={() => openEdit(row)}>Edit</Button><Button size="sm" variant="destructive" disabled={!canManage} isLoading={deleteMutation.isPending} onClick={() => void handleDelete(row)}>Hapus</Button>{canDelivery ? <Button size="sm" variant="secondary" isLoading={createDeliveryMutation.isPending} onClick={() => void handleCreateDelivery(row)}>Create DO</Button> : null}{canInvoice ? <Button size="sm" isLoading={createInvoiceMutation.isPending} onClick={() => void handleCreateInvoice(row)}>Create Invoice</Button> : null}</div></td></tr>;})}</tbody></table></div>}</div><div className="space-y-6"><div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-gray-900">Relasi Dokumen</h2><ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-600"><li>SO dapat dibuat dari quotation approved.</li><li>SO line menjadi dasar delivery order line untuk barang fisik.</li><li>SO jasa dapat langsung ditagihkan lewat sales invoice tanpa delivery order.</li></ul></div><div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="space-y-3"><Link href="/penjualan/delivery-order" className="block rounded-lg border border-gray-200 px-4 py-3 transition hover:border-blue-200 hover:bg-blue-50/50"><p className="text-sm font-semibold text-gray-900">Delivery Order</p><p className="mt-1 text-sm text-gray-600">Proses fulfillment perangkat berdasarkan sales order.</p></Link><Link href="/penjualan/invoice" className="block rounded-lg border border-gray-200 px-4 py-3 transition hover:border-blue-200 hover:bg-blue-50/50"><p className="text-sm font-semibold text-gray-900">Invoice Penjualan</p><p className="mt-1 text-sm text-gray-600">Tagihkan barang dan jasa dari SO yang sudah berjalan.</p></Link></div></div></div></div><Modal isOpen={Boolean(editingRow)} onClose={() => { setEditingRow(null); setForm(DEFAULT_FORM); }} title="Edit Sales Order"><div className="grid gap-4 md:grid-cols-2"><Field label="Planned Ship Date"><input type="date" value={form.plannedShipDate} onChange={(e) => setForm((prev) => ({ ...prev, plannedShipDate: e.target.value }))} className={crmInputClassName} /></Field><Field label="Status Saat Ini"><input value={editingRow ? toLabel(editingRow.status) : "-"} readOnly className={crmInputClassName} /></Field><Field label="Catatan" className="md:col-span-2"><textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} className={`${crmInputClassName} min-h-[100px]`} /></Field></div><div className="mt-6 flex justify-end gap-3"><Button variant="secondary" onClick={() => { setEditingRow(null); setForm(DEFAULT_FORM); }}>Batal</Button><Button isLoading={updateMutation.isPending} onClick={() => void handleUpdate()}>Simpan Perubahan</Button></div></Modal></div>;
}
