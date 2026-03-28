"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { BusinessFlowBadge } from "@/components/features/business/BusinessFlowBadge";
import { PageHeader } from "@/components/features/PageHeader";
import { CrmEmptyHint, crmInputClassName, CrmMetricCard } from "@/components/features/crm/shared";
import { Badge } from "@/components/ui/Badge";
import { userHasPermission } from "@/lib/auth/role-check";
import { formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";

const links = [
  { label: "Vendor", href: "/pembelian/vendor", description: "Master vendor distributor hardware, perangkat jaringan, dan partner procurement IT." },
  { label: "Purchase Request", href: "/pembelian/purchase-request", description: "Kebutuhan pembelian item inventory untuk proyek, stok, dan support internal." },
  { label: "Purchase Order", href: "/pembelian/purchase-order", description: "Eksekusi PO perangkat IT ke vendor." },
  { label: "Goods Receipt", href: "/pembelian/goods-receipt", description: "Penerimaan perangkat, appliance, dan barang IT berdasarkan PO." },
  { label: "Invoice Vendor", href: "/pembelian/vendor-invoice", description: "Matching invoice vendor terhadap PO dan receipt." },
] as const;

type PurchaseSummary = {
  purchaseRequestCount: number;
  purchaseOrderCount: number;
  goodsReceiptCount: number;
  vendorInvoiceCount: number;
};

type PurchaseFlowRecord = {
  id: string;
  requestNumber: string;
  requestDate: string | Date;
  status: string;
  procurementMode?: string | null;
  vendor: { company: string } | null;
  lines: Array<{ inventoryItem?: { name: string } | null; description?: string | null }>;
  purchaseOrders?: Array<{
    id: string;
    orderNumber: string;
    status: string;
    goodsReceipts?: Array<{ id: string; receiptNumber: string; status: string; receiptDate: string | Date }>;
    vendorInvoices?: Array<{ id: string; invoiceNumber: string; status: string; invoiceDate: string | Date }>;
  }>;
};

function summarizeItems(lines: PurchaseFlowRecord["lines"]) {
  const labels = lines
    .map((line) => line.inventoryItem?.name ?? line.description ?? null)
    .filter((value): value is string => Boolean(value));

  if (labels.length === 0) return "-";
  if (labels.length === 1) return labels[0];
  return `${labels[0]} +${labels.length - 1} item`;
}

function stageVariant(status?: string | null): "default" | "success" | "warning" | "danger" | "info" {
  switch (status) {
    case "APPROVED":
    case "CONVERTED":
    case "COMPLETED":
    case "RECEIVED":
    case "MATCHED":
    case "READY_TO_PAY":
    case "PAID":
      return "success";
    case "ISSUED":
    case "DELIVERED":
    case "SENT":
      return "info";
    case "PARTIAL_RECEIPT":
    case "PARTIAL":
    case "WAITING_MATCH":
      return "warning";
    case "REJECTED":
    case "CANCELED":
    case "DISPUTE":
    case "QC_HOLD":
      return "danger";
    default:
      return "default";
  }
}

function toLabel(value?: string | null) {
  if (!value) return "-";
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function PembelianPage() {
  const { data: session } = useSession();
  const [search, setSearch] = useState("");
  const [flowFilter, setFlowFilter] = useState<"ALL" | "OPEN" | "COMPLETED">("ALL");
  const [modeFilter, setModeFilter] = useState<"ALL" | "GOODS" | "SERVICE" | "MIXED">("ALL");
  const isAllowed = session?.user ? userHasPermission(session.user, "purchases", "read") : false;

  const summaryQuery = api.business.purchaseSummary.useQuery(undefined, { enabled: isAllowed, refetchOnWindowFocus: false }) as unknown as {
    data?: PurchaseSummary;
  };
  const flowQuery = api.business.listPurchaseFlows.useQuery(
    { search: search || undefined, limit: 50 },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  ) as unknown as { data?: PurchaseFlowRecord[]; isLoading: boolean };

  const summary = summaryQuery.data;
  const flows = useMemo(() => flowQuery.data ?? [], [flowQuery.data]);
  const filteredFlows = useMemo(() => {
    return flows.filter((flow) => {
      const isCompleted = Boolean(flow.purchaseOrders?.[0]?.vendorInvoices?.[0]);
      const matchesFlow =
        flowFilter === "ALL" ||
        (flowFilter === "OPEN" && !isCompleted) ||
        (flowFilter === "COMPLETED" && isCompleted);
      const matchesMode =
        modeFilter === "ALL" ||
        (flow.procurementMode ?? "GOODS") === modeFilter;

      return matchesFlow && matchesMode;
    });
  }, [flowFilter, flows, modeFilter]);
  const completedFlows = flows.filter((flow) => Boolean(flow.purchaseOrders?.[0]?.vendorInvoices?.[0])).length;
  const inProgressFlows = flows.filter((flow) => !flow.purchaseOrders?.[0]?.vendorInvoices?.[0]).length;

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Pembelian" description="Halaman pembelian sekarang ditampilkan berdasarkan alur dokumen nyata: Purchase Request -> Purchase Order -> Goods Receipt -> Vendor Invoice." badge={<Badge variant="info">Flow Workspace</Badge>} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CrmMetricCard label="Purchase Request" value={String(summary?.purchaseRequestCount ?? 0)} helper="Dokumen PR" />
        <CrmMetricCard label="Purchase Order" value={String(summary?.purchaseOrderCount ?? 0)} helper="Dokumen PO" />
        <CrmMetricCard label="Flow Berjalan" value={String(inProgressFlows)} helper="Sudah punya PO" />
        <CrmMetricCard label="Flow Selesai" value={String(completedFlows)} helper="Sudah sampai invoice" />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_160px]">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nomor PR, PO, vendor, atau item inventory" className={crmInputClassName} />
          <select value={flowFilter} onChange={(e) => setFlowFilter(e.target.value as "ALL" | "OPEN" | "COMPLETED")} className={crmInputClassName}>
            <option value="ALL">Semua Flow</option>
            <option value="OPEN">Open Flow</option>
            <option value="COMPLETED">Completed Flow</option>
          </select>
          <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value as "ALL" | "GOODS" | "SERVICE" | "MIXED")} className={crmInputClassName}>
            <option value="ALL">Semua Mode</option>
            <option value="GOODS">Goods</option>
            <option value="SERVICE">Service</option>
            <option value="MIXED">Mixed</option>
          </select>
          <div className="flex items-center justify-end text-sm text-gray-500">{filteredFlows.length} flow tampil</div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Alur Pembelian</h2>
            <p className="text-sm text-gray-500">Setiap baris diringkas per alur procurement dari PR sampai invoice vendor, bukan daftar seed terpisah.</p>
          </div>
          {flowQuery.isLoading ? (
            <div className="p-5 text-sm text-gray-500">Memuat alur pembelian...</div>
          ) : filteredFlows.length === 0 ? (
            <div className="p-5"><CrmEmptyHint text="Belum ada alur pembelian yang cocok dengan filter." /></div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredFlows.map((flow) => {
                const purchaseOrder = flow.purchaseOrders?.[0] ?? null;
                const goodsReceipt = purchaseOrder?.goodsReceipts?.[0] ?? null;
                const vendorInvoice = purchaseOrder?.vendorInvoices?.[0] ?? null;

                return (
                  <div key={flow.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-gray-900">{flow.requestNumber}</p>
                          <BusinessFlowBadge value={flow.procurementMode} />
                          <Badge variant={stageVariant(flow.status)}>{toLabel(flow.status)}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-gray-600">{flow.vendor?.company ?? "-"} • {summarizeItems(flow.lines)}</p>
                        <p className="mt-1 text-xs text-gray-500">Request date {formatDate(flow.requestDate)}</p>
                      </div>
                      <div className="text-right text-xs text-gray-500">{flow.lines.length} line</div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <Link href="/pembelian/purchase-request" className="rounded-lg border border-gray-200 p-3 transition hover:border-blue-200 hover:bg-blue-50/40">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Purchase Request</p>
                        <p className="mt-1 font-semibold text-gray-900">{flow.requestNumber}</p>
                        <Badge className="mt-2" variant={stageVariant(flow.status)}>{toLabel(flow.status)}</Badge>
                        <p className="mt-2 text-xs font-semibold text-blue-600">Buka tahap →</p>
                      </Link>
                      <Link href="/pembelian/purchase-order" className="rounded-lg border border-gray-200 p-3 transition hover:border-blue-200 hover:bg-blue-50/40">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Purchase Order</p>
                        <p className="mt-1 font-semibold text-gray-900">{purchaseOrder?.orderNumber ?? "Belum dibuat"}</p>
                        <Badge className="mt-2" variant={stageVariant(purchaseOrder?.status)}>{toLabel(purchaseOrder?.status)}</Badge>
                        <p className="mt-2 text-xs font-semibold text-blue-600">Buka tahap →</p>
                      </Link>
                      <Link href="/pembelian/goods-receipt" className="rounded-lg border border-gray-200 p-3 transition hover:border-blue-200 hover:bg-blue-50/40">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Goods Receipt</p>
                        <p className="mt-1 font-semibold text-gray-900">{goodsReceipt?.receiptNumber ?? "Belum diterima"}</p>
                        <Badge className="mt-2" variant={stageVariant(goodsReceipt?.status)}>{toLabel(goodsReceipt?.status)}</Badge>
                        <p className="mt-2 text-xs font-semibold text-blue-600">Buka tahap →</p>
                      </Link>
                      <Link href="/pembelian/vendor-invoice" className="rounded-lg border border-gray-200 p-3 transition hover:border-blue-200 hover:bg-blue-50/40">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Vendor Invoice</p>
                        <p className="mt-1 font-semibold text-gray-900">{vendorInvoice?.invoiceNumber ?? "Belum ditagihkan"}</p>
                        <Badge className="mt-2" variant={stageVariant(vendorInvoice?.status)}>{toLabel(vendorInvoice?.status)}</Badge>
                        <p className="mt-2 text-xs font-semibold text-blue-600">Buka tahap →</p>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Struktur Alur</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-600">
              <li>Barang: <span className="font-semibold">PR → PO → GR → Vendor Invoice</span></li>
              <li>Jasa: <span className="font-semibold">PR → PO → Vendor Invoice</span></li>
              <li>Flow ditampilkan per dokumen induk, bukan per seed list statis.</li>
            </ul>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            {links.map((link) => <Link key={link.href} href={link.href} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow"><h2 className="text-base font-semibold text-gray-900">{link.label}</h2><p className="mt-2 text-sm text-gray-600">{link.description}</p><p className="mt-4 text-sm font-semibold text-blue-600">Buka menu →</p></Link>)}
          </div>
        </div>
      </div>
    </div>
  );
}
