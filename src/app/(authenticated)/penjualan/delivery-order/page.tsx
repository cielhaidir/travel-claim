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
import { formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";
import { useToast } from "@/components/ui/Toast";

type DeliveryOrderLineRecord = {
  qtyOrdered?: number | string;
  qtyShipped?: number | string;
  qtyDelivered?: number | string;
  notes?: string | null;
  warehouse?: { id: string; code: string; name: string } | null;
  inventoryItem?: { id: string; sku: string; name: string; unitOfMeasure?: string | null } | null;
};
type DeliveryOrderRecord = {
  id: string;
  deliveryOrderNumber: string;
  shipDate: string | Date;
  carrierName: string | null;
  notes?: string | null;
  status: string;
  customer: { id: string; company: string };
  salesOrder: { id: string; salesOrderNumber: string; fulfillmentMode?: string; requiresDelivery?: boolean } | null;
  salesInvoices?: Array<{ id: string; salesInvoiceNumber: string; status: string }>;
  warehouse: { id: string; code: string; name: string } | null;
  lines: DeliveryOrderLineRecord[];
  serialUnits?: Array<{
    id: string;
    serialNumber?: string | null;
    assetTag?: string | null;
    batchNumber?: string | null;
    inventoryItemId: string;
  }>;
};

const toLabel = (value?: string | null) => value ? value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "-";
const toBadge = (status?: string | null): "default" | "success" | "warning" | "danger" | "info" => status === "DELIVERED" ? "success" : status === "IN_TRANSIT" ? "info" : status === "READY" ? "warning" : status === "RETURNED" || status === "CANCELED" ? "danger" : "default";
const summarizeItems = (lines: DeliveryOrderLineRecord[]) => {
  const labels = lines.map((line) => line.inventoryItem?.name ?? line.notes ?? null).filter((value): value is string => Boolean(value));
  if (labels.length === 0) return "-";
  if (labels.length === 1) return labels[0];
  return `${labels[0]} +${labels.length - 1} item`;
};

function summarizeSerials(row: DeliveryOrderRecord) {
  const values = (row.serialUnits ?? [])
    .map((unit) => unit.serialNumber ?? unit.assetTag ?? unit.batchNumber ?? null)
    .filter((value): value is string => Boolean(value));

  if (values.length === 0) return null;
  if (values.length <= 3) return values.join(", ");
  return `${values.slice(0, 3).join(", ")} +${values.length - 3} serial`;
}

const DEFAULT_FORM = { shipDate: "", carrierName: "", notes: "" };

const deliveryStatusActions: Record<string, string[]> = {
  DRAFT: ["READY", "CANCELED"],
  READY: ["IN_TRANSIT", "CANCELED"],
  IN_TRANSIT: ["DELIVERED", "RETURNED"],
};

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>{children}</div>;
}

export default function DeliveryOrderPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { showToast } = useToast();
  const utils = api.useUtils();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [editingRow, setEditingRow] = useState<DeliveryOrderRecord | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const isAllowed = session?.user ? userHasPermission(session.user, "sales", "read") : false;
  const canWrite = session?.user ? userHasPermission(session.user, "sales", "create") : false;

  const query = api.business.listDeliveryOrders.useQuery(
    { search: search || undefined, status: status ? (status as never) : undefined, limit: 100 },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  ) as unknown as { data?: DeliveryOrderRecord[]; isLoading: boolean };

  const refreshData = async () => {
    await Promise.all([
      utils.business.listDeliveryOrders.invalidate(),
      utils.business.listSalesOrders.invalidate(),
      utils.business.listSalesInvoices.invalidate(),
      utils.business.salesSummary.invalidate(),
    ]);
  };

  const updateMutation = api.business.updateDeliveryOrder.useMutation({
    onSuccess: async () => {
      await refreshData();
      setEditingRow(null);
      setForm(DEFAULT_FORM);
      showToast({ title: "Delivery order berhasil diubah", message: "Data delivery order berhasil diperbarui.", variant: "success" });
    },
    onError: (error) => showToast({ title: "Gagal mengubah delivery order", message: error.message, variant: "error" }),
  });

  const deleteMutation = api.business.deleteDeliveryOrder.useMutation({
    onSuccess: async () => {
      await refreshData();
      showToast({ title: "Delivery order berhasil dihapus", message: "Delivery order sudah dihapus dari daftar aktif.", variant: "success" });
    },
    onError: (error) => showToast({ title: "Gagal menghapus delivery order", message: error.message, variant: "error" }),
  });

  const changeStatusMutation = api.business.changeDeliveryOrderStatus.useMutation({
    onSuccess: async () => {
      await refreshData();
      showToast({ title: "Status delivery order diperbarui", message: "Workflow delivery order berhasil diubah.", variant: "success" });
    },
    onError: (error) => showToast({ title: "Gagal mengubah status DO", message: error.message, variant: "error" }),
  });

  const rows = useMemo(() => query.data ?? [], [query.data]);
  const deliveredCount = rows.filter((row) => row.status === "DELIVERED").length;
  const transitCount = rows.filter((row) => row.status === "IN_TRANSIT").length;
  const returnCount = rows.filter((row) => row.status === "RETURNED").length;
  const totalLines = rows.reduce((sum, row) => sum + row.lines.length, 0);

  function openEdit(row: DeliveryOrderRecord) {
    setEditingRow(row);
    setForm({ shipDate: new Date(row.shipDate).toISOString().slice(0, 10), carrierName: row.carrierName ?? "", notes: row.notes ?? "" });
  }

  async function handleUpdate() {
    if (!editingRow) return;
    await updateMutation.mutateAsync({ deliveryOrderId: editingRow.id, shipDate: form.shipDate || undefined, carrierName: form.carrierName || undefined, notes: form.notes || undefined });
  }

  async function handleDelete(row: DeliveryOrderRecord) {
    if (!window.confirm(`Hapus delivery order ${row.deliveryOrderNumber}?`)) return;
    await deleteMutation.mutateAsync({ deliveryOrderId: row.id });
  }

  async function handleChangeStatus(row: DeliveryOrderRecord, nextStatus: string) {
    if (!window.confirm(`Ubah status ${row.deliveryOrderNumber} menjadi ${toLabel(nextStatus)}?`)) return;
    await changeStatusMutation.mutateAsync({ deliveryOrderId: row.id, status: nextStatus as never });
  }

  function handlePrint(row: DeliveryOrderRecord) {
    const printWindow = window.open("", "_blank", "width=1100,height=820");
    if (!printWindow) {
      showToast({ title: "Print gagal", message: "Popup browser diblokir. Izinkan popup untuk mencetak delivery order.", variant: "error" });
      return;
    }

    const linesHtml = row.lines.map((line, index) => {
      const serials = (row.serialUnits ?? [])
        .filter((unit) => unit.inventoryItemId === line.inventoryItem?.id)
        .map((unit) => unit.serialNumber ?? unit.assetTag ?? unit.batchNumber ?? "-")
        .join(", ");

      return `<tr><td>${index + 1}</td><td>${line.inventoryItem ? `${line.inventoryItem.sku} · ${line.inventoryItem.name}` : (line.notes ?? "-")}${serials ? `<div style="margin-top:4px;color:#64748b;font-size:11px">Serial: ${serials}</div>` : ""}</td><td>${line.warehouse ? `${line.warehouse.code} · ${line.warehouse.name}` : (row.warehouse ? `${row.warehouse.code} · ${row.warehouse.name}` : "-")}</td><td class="text-right">${Number(line.qtyOrdered ?? 0)}</td><td class="text-right">${Number(line.qtyDelivered ?? line.qtyShipped ?? 0)}</td></tr>`;
    }).join("");

    printWindow.document.write(`<!doctype html><html><head><title>${row.deliveryOrderNumber}</title><style>@page{size:A4;margin:16mm}body{font-family:Arial,sans-serif;color:#0f172a;font-size:12px}.header{display:flex;justify-content:space-between;border-bottom:3px solid #1d4ed8;padding-bottom:18px}.doc{border:1px solid #cbd5e1;border-radius:12px;padding:14px 16px;background:#f8fafc}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px}.card{border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px}.title{font-size:11px;text-transform:uppercase;color:#64748b;margin-bottom:10px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #cbd5e1;padding:10px}th{background:#eff6ff;color:#1e3a8a;text-align:left}.text-right{text-align:right}.notes{border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;min-height:88px;white-space:pre-wrap}</style></head><body><div class="header"><div><h1 style="margin:0">PT Travel Claim Teknologi</h1><div style="margin-top:4px;color:#475569">IT Solution, Infrastructure & Professional Services</div><div style="margin-top:10px;color:#334155">Jl. Contoh Bisnis No. 88, Jakarta<br/>+62 21 5555 8888 · sales@travelclaim.local</div></div><div class="doc"><div style="color:#64748b;text-transform:uppercase;font-size:11px">Document</div><h2 style="margin:6px 0 0;color:#1e3a8a">Delivery Order</h2><div style="margin-top:4px;font-weight:600">${row.deliveryOrderNumber}</div></div></div><div class="grid"><div class="card"><div class="title">Customer</div><div>${row.customer.company}</div><div style="margin-top:6px;color:#64748b">Sales Order: ${row.salesOrder?.salesOrderNumber ?? "-"}</div><div style="margin-top:6px;color:#64748b">Flow: ${toLabel(row.salesOrder?.fulfillmentMode)}</div></div><div class="card"><div class="title">Delivery Info</div><div>Ship Date: ${formatDate(row.shipDate)}</div><div style="margin-top:6px">Carrier: ${row.carrierName ?? "-"}</div><div style="margin-top:6px">Warehouse: ${row.warehouse?.name ?? "-"}</div><div style="margin-top:6px">Status: ${toLabel(row.status)}</div></div></div><table><thead><tr><th>No</th><th>Item</th><th>Warehouse</th><th class="text-right">Qty Ordered</th><th class="text-right">Qty Delivered</th></tr></thead><tbody>${linesHtml}</tbody></table><div class="grid"><div><div class="title">Notes</div><div class="notes">${row.notes ?? "Dokumen delivery ini digunakan sebagai bukti pengiriman barang ke customer."}</div></div><div><div class="title">Acknowledgement</div><div class="notes">Mohon customer memeriksa jumlah dan kondisi barang saat penerimaan delivery order ini.</div></div></div></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  if (sessionStatus === "loading") {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
        Memuat sesi dan data delivery order...
      </div>
    );
  }

  if (sessionStatus !== "authenticated" || !session?.user) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 shadow-sm">
        Sesi login tidak ditemukan. Silakan login ulang untuk mengakses delivery order.
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-900 shadow-sm">
        Anda tidak memiliki akses untuk melihat delivery order.
      </div>
    );
  }

  return <div className="space-y-6"><PageHeader title="Delivery Order" description="Delivery order sekarang konsisten dengan flow barang perusahaan IT dan menampilkan item inventory fisik yang benar-benar dikirim ke customer." badge={<Badge variant="success">Live Data</Badge>} secondaryAction={{ label: "Kembali ke Penjualan", href: "/penjualan" }} /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><CrmMetricCard label="DO" value={String(rows.length)} helper="Dokumen pengiriman" /><CrmMetricCard label="In Transit" value={String(transitCount)} helper="Sedang dikirim" /><CrmMetricCard label="Delivered" value={String(deliveredCount)} helper="Perangkat sudah diterima" /><CrmMetricCard label="Total Line" value={String(totalLines)} helper={`${returnCount} return`} /></div><div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="grid gap-3 md:grid-cols-[1fr_220px]"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari delivery order, customer, item inventory, carrier, atau SO" className={crmInputClassName} /><select value={status} onChange={(e) => setStatus(e.target.value)} className={crmInputClassName}><option value="">Semua status</option><option value="DRAFT">Draft</option><option value="READY">Ready</option><option value="IN_TRANSIT">In Transit</option><option value="DELIVERED">Delivered</option><option value="RETURNED">Returned</option><option value="CANCELED">Canceled</option></select></div></div><div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]"><div className="rounded-xl border border-gray-200 bg-white shadow-sm"><div className="border-b border-gray-200 px-5 py-4"><h2 className="text-lg font-semibold text-gray-900">Monitoring Delivery Order</h2><p className="text-sm text-gray-500">Delivery sekarang sudah memiliki aksi print, edit, dan hapus seperti dokumen quotation.</p></div>{query.isLoading ? <div className="p-5 text-sm text-gray-500">Memuat delivery order...</div> : rows.length === 0 ? <div className="p-5"><CrmEmptyHint text="Belum ada delivery order di database." /></div> : <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200 text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">DO</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Item Inventory</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Customer / Gudang</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Carrier / Qty</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th><th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Aksi</th></tr></thead><tbody className="divide-y divide-gray-100 bg-white">{rows.map((row) => { const qtyOrdered = row.lines.reduce((sum, line) => sum + Number(line.qtyOrdered ?? 0), 0); const qtyDelivered = row.lines.reduce((sum, line) => sum + Number(line.qtyDelivered ?? 0), 0); const flowLabel = row.salesOrder?.requiresDelivery === false ? "Service order" : row.salesOrder?.fulfillmentMode === "MIXED" ? "Mixed delivery" : "Goods delivery"; const canManage = canWrite && !(row.salesInvoices?.length); return <tr key={row.id}><td className="px-4 py-3"><p className="font-semibold text-gray-900">{row.deliveryOrderNumber}</p><p className="text-xs text-gray-500">{formatDate(row.shipDate)} • {row.salesOrder?.salesOrderNumber ?? "-"}</p></td><td className="px-4 py-3"><p className="text-gray-900">{summarizeItems(row.lines)}</p><div className="mt-1 flex flex-wrap items-center gap-2"><p className="text-xs text-gray-500">{row.lines.length} line • {flowLabel}</p><BusinessFlowBadge value={row.salesOrder?.fulfillmentMode} /></div>{summarizeSerials(row) ? <p className="mt-1 text-xs text-gray-500">Serial: {summarizeSerials(row)}</p> : null}</td><td className="px-4 py-3 text-gray-600">{row.customer.company} • {row.warehouse?.name ?? "-"}</td><td className="px-4 py-3 text-gray-600">{row.carrierName ?? "-"} • {qtyDelivered} / {qtyOrdered}</td><td className="px-4 py-3"><Badge variant={toBadge(row.status)}>{toLabel(row.status)}</Badge><div className="mt-2 flex flex-wrap gap-2">{canWrite ? (deliveryStatusActions[row.status] ?? []).map((nextStatus) => <Button key={nextStatus} size="sm" variant="ghost" isLoading={changeStatusMutation.isPending} onClick={() => void handleChangeStatus(row, nextStatus)}>{toLabel(nextStatus)}</Button>) : null}</div></td><td className="px-4 py-3"><div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="secondary" onClick={() => handlePrint(row)}>Print</Button><Button size="sm" variant="ghost" disabled={!canManage} onClick={() => openEdit(row)}>Edit</Button><Button size="sm" variant="destructive" disabled={!canManage} isLoading={deleteMutation.isPending} onClick={() => void handleDelete(row)}>Hapus</Button></div></td></tr>; })}</tbody></table></div>}</div><div className="space-y-6"><div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-gray-900">Relasi Dokumen</h2><ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-600"><li>DO dipakai untuk sales order barang yang memang membutuhkan pengiriman fisik.</li><li>Line DO dapat refer ke line SO, gudang, dan item inventory perangkat IT.</li><li>DO delivered dapat menjadi dasar invoice penjualan barang.</li><li>Untuk item serial/BOTH, serial number unit yang terkirim juga ditampilkan di list dan print DO.</li></ul></div><div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><Link href="/penjualan/invoice" className="block rounded-lg border border-gray-200 px-4 py-3 transition hover:border-blue-200 hover:bg-blue-50/50"><p className="text-sm font-semibold text-gray-900">Invoice Penjualan</p><p className="mt-1 text-sm text-gray-600">Tagihkan delivery perangkat yang sudah delivered.</p></Link></div></div></div><Modal isOpen={Boolean(editingRow)} onClose={() => { setEditingRow(null); setForm(DEFAULT_FORM); }} title="Edit Delivery Order"><div className="grid gap-4 md:grid-cols-2"><Field label="Ship Date"><input type="date" value={form.shipDate} onChange={(e) => setForm((prev) => ({ ...prev, shipDate: e.target.value }))} className={crmInputClassName} /></Field><Field label="Carrier Name"><input value={form.carrierName} onChange={(e) => setForm((prev) => ({ ...prev, carrierName: e.target.value }))} className={crmInputClassName} /></Field><Field label="Catatan" className="md:col-span-2"><textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} className={`${crmInputClassName} min-h-[100px]`} /></Field></div><div className="mt-6 flex justify-end gap-3"><Button variant="secondary" onClick={() => { setEditingRow(null); setForm(DEFAULT_FORM); }}>Batal</Button><Button isLoading={updateMutation.isPending} onClick={() => void handleUpdate()}>Simpan Perubahan</Button></div></Modal></div>;
}
