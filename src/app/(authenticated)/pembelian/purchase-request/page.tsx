"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { BusinessFlowBadge } from "@/components/features/business/BusinessFlowBadge";
import { PageHeader } from "@/components/features/PageHeader";
import { CrmEmptyHint, crmInputClassName, CrmMetricCard } from "@/components/features/crm/shared";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { userHasPermission } from "@/lib/auth/role-check";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";

type PurchaseRequestRecord = {
  id: string;
  requestNumber: string;
  requesterName: string | null;
  departmentName: string | null;
  neededDate: string | Date | null;
  budgetType: string | null;
  procurementMode?: string | null;
  totalAmount: number | string;
  status: string;
  vendor: { company: string } | null;
  department: { name: string } | null;
  lines: Array<{
    description?: string | null;
    inventoryItem?: { sku: string; name: string } | null;
  }>;
  purchaseOrders?: Array<{ id: string; orderNumber: string; status: string }>;
};

function toLabel(value?: string | null) {
  if (!value) return "-";
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function toBadgeVariant(status?: string | null): "default" | "success" | "warning" | "danger" | "info" {
  switch (status) {
    case "APPROVED":
    case "CONVERTED":
    case "CLOSED":
      return "success";
    case "SUBMITTED":
      return "info";
    case "REJECTED":
    case "CANCELED":
      return "danger";
    default:
      return "default";
  }
}

function summarizeItems(lines: PurchaseRequestRecord["lines"]) {
  const labels = lines
    .map((line) => line.inventoryItem?.name ?? line.description ?? null)
    .filter((value): value is string => Boolean(value));

  if (labels.length === 0) return "-";
  if (labels.length === 1) return labels[0];
  return `${labels[0]} +${labels.length - 1} item`;
}

export default function PurchaseRequestPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const utils = api.useUtils();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const isAllowed = session?.user ? userHasPermission(session.user, "purchases", "read") : false;
  const canConvert = session?.user ? userHasPermission(session.user, "purchases", "create") : false;

  const query = api.business.listPurchaseRequests.useQuery(
    { search: search || undefined, status: status ? (status as never) : undefined, limit: 100 },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  ) as unknown as { data?: PurchaseRequestRecord[]; isLoading: boolean };

  const convertMutation = api.business.convertPurchaseRequestToOrder.useMutation({
    onSuccess: async (data) => {
      await Promise.all([
        utils.business.listPurchaseRequests.invalidate(),
        utils.business.listPurchaseOrders.invalidate(),
        utils.business.purchaseSummary.invalidate(),
      ]);
      showToast({
        variant: "success",
        title: "Purchase order berhasil dibuat",
        message: `PR berhasil dikonversi menjadi ${String((data as { orderNumber?: string }).orderNumber ?? "purchase order")}.`,
      });
    },
    onError: (error) => {
      showToast({
        variant: "error",
        title: "Konversi gagal",
        message: error.message,
      });
    },
  });

  const rows = useMemo(() => query.data ?? [], [query.data]);
  const totalValue = rows.reduce((sum, row) => sum + Number(row.totalAmount ?? 0), 0);
  const draftCount = rows.filter((row) => row.status === "DRAFT").length;
  const submittedCount = rows.filter((row) => row.status === "SUBMITTED").length;
  const approvedCount = rows.filter((row) => row.status === "APPROVED").length;
  const convertedCount = rows.filter((row) => row.status === "CONVERTED").length;

  async function handleConvert(row: PurchaseRequestRecord) {
    const confirmed = window.confirm(`Konversi ${row.requestNumber} menjadi purchase order?`);
    if (!confirmed) return;

    await convertMutation.mutateAsync({
      purchaseRequestId: row.id,
      notes: `Auto converted from ${row.requestNumber}`,
    });
  }

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Purchase Request" description="Purchase request untuk kebutuhan barang IT, perangkat jaringan, lisensi, dan jasa internal sekarang dibaca dari data relasional inventory." badge={<Badge variant="info">Live Data</Badge>} secondaryAction={{ label: "Kembali ke Pembelian", href: "/pembelian" }} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><CrmMetricCard label="Draft" value={String(draftCount)} helper="Belum diajukan" /><CrmMetricCard label="Submitted" value={String(submittedCount)} helper="Menunggu approval" /><CrmMetricCard label="Approved" value={String(approvedCount)} helper="Siap jadi PO" /><CrmMetricCard label="Converted" value={String(convertedCount)} helper="Sudah ada PO" /><CrmMetricCard label="Total Nilai" value={formatCurrency(totalValue)} helper={`${rows.length} PR`} /></div>
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="grid gap-3 md:grid-cols-[1fr_220px]"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nomor PR, requester, departemen, atau catatan" className={crmInputClassName} /><select value={status} onChange={(event) => setStatus(event.target.value)} className={crmInputClassName}><option value="">Semua status</option><option value="DRAFT">Draft</option><option value="SUBMITTED">Submitted</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="CONVERTED">Converted</option><option value="CLOSED">Closed</option><option value="CANCELED">Canceled</option></select></div></div>
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm"><div className="border-b border-gray-200 px-5 py-4"><h2 className="text-lg font-semibold text-gray-900">Daftar Purchase Request</h2><p className="text-sm text-gray-500">Setiap PR diturunkan dari item inventory seperti hardware, network appliance, atau jasa pendukung proyek IT.</p></div>{query.isLoading ? <div className="p-5 text-sm text-gray-500">Memuat purchase request...</div> : rows.length === 0 ? <div className="p-5"><CrmEmptyHint text="Belum ada purchase request di database." /></div> : <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200 text-sm"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">PR</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Item Inventory</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Vendor</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Need Date</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Nilai</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th><th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Aksi</th></tr></thead><tbody className="divide-y divide-gray-100 bg-white">{rows.map((row) => { const canConvertRow = canConvert && ["APPROVED", "SUBMITTED", "DRAFT"].includes(row.status) && !(row.purchaseOrders?.length); return <tr key={row.id}><td className="px-4 py-3"><p className="font-semibold text-gray-900">{row.requestNumber}</p><p className="text-xs text-gray-500">{row.requesterName ?? "-"} • {toLabel(row.budgetType)}</p></td><td className="px-4 py-3"><p className="text-gray-900">{summarizeItems(row.lines)}</p><div className="mt-1 flex flex-wrap items-center gap-2"><p className="text-xs text-gray-500">{row.lines.length} line • {row.departmentName ?? row.department?.name ?? "-"}</p><BusinessFlowBadge value={row.procurementMode} /></div></td><td className="px-4 py-3 text-gray-600">{row.vendor?.company ?? "-"}</td><td className="px-4 py-3 text-gray-600">{row.neededDate ? formatDate(row.neededDate) : "-"}</td><td className="px-4 py-3 text-gray-600">{formatCurrency(Number(row.totalAmount ?? 0))}</td><td className="px-4 py-3"><div className="flex flex-col gap-1"><Badge variant={toBadgeVariant(row.status)}>{toLabel(row.status)}</Badge>{row.purchaseOrders?.[0] ? <span className="text-xs text-gray-500">PO: {row.purchaseOrders[0].orderNumber}</span> : null}</div></td><td className="px-4 py-3 text-right">{canConvertRow ? <Button size="sm" isLoading={convertMutation.isPending} onClick={() => void handleConvert(row)}>Convert to PO</Button> : <span className="text-xs text-gray-400">-</span>}</td></tr>;})}</tbody></table></div>}</div>
        <div className="space-y-6"><div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-gray-900">Relasi Data</h2><ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-600"><li>PR header tersimpan di tabel <span className="font-semibold">PurchaseRequest</span>.</li><li>Setiap item tersimpan di <span className="font-semibold">PurchaseRequestLine</span>.</li><li>PR yang dikonversi akan punya relasi ke <span className="font-semibold">PurchaseOrder</span>.</li></ul></div><div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><div className="mt-4 space-y-3"><Link href="/pembelian/purchase-order" className="block rounded-lg border border-gray-200 px-4 py-3 transition hover:border-blue-200 hover:bg-blue-50/50"><p className="text-sm font-semibold text-gray-900">Purchase Order</p><p className="mt-1 text-sm text-gray-600">PR approved / converted menjadi dasar pembuatan PO.</p></Link><Link href="/pembelian/vendor" className="block rounded-lg border border-gray-200 px-4 py-3 transition hover:border-blue-200 hover:bg-blue-50/50"><p className="text-sm font-semibold text-gray-900">Vendor CRM</p><p className="mt-1 text-sm text-gray-600">Vendor pada PR diambil dari master organization CRM.</p></Link></div></div></div>
      </div>
    </div>
  );
}
