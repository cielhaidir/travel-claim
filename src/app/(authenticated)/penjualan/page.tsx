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
  { label: "Customer", href: "/penjualan/customer", description: "Master customer dari CRM untuk bisnis solusi IT." },
  { label: "Quotation", href: "/penjualan/quotation", description: "Penawaran barang IT, lisensi, dan jasa implementasi ke customer." },
  { label: "Sales Order", href: "/penjualan/sales-order", description: "Order penjualan hasil quotation berbasis item inventory." },
  { label: "Delivery Order", href: "/penjualan/delivery-order", description: "Fulfillment pengiriman perangkat dan hardware proyek." },
  { label: "Invoice Penjualan", href: "/penjualan/invoice", description: "Penagihan barang dan jasa ke customer." },
] as const;

type SalesSummary = {
  quotationCount: number;
  salesOrderCount: number;
  deliveryOrderCount: number;
  salesInvoiceCount: number;
};

type SalesFlowRecord = {
  id: string;
  quotationNumber: string;
  issueDate: string | Date;
  status: string;
  fulfillmentMode?: string | null;
  customer: { company: string };
  lines: Array<{ inventoryItem?: { name: string } | null; description?: string | null }>;
  salesOrders?: Array<{
    id: string;
    salesOrderNumber: string;
    status: string;
    deliveryOrders?: Array<{ id: string; deliveryOrderNumber: string; status: string; shipDate: string | Date }>;
    salesInvoices?: Array<{ id: string; salesInvoiceNumber: string; status: string; issueDate: string | Date }>;
  }>;
};

function summarizeItems(lines: SalesFlowRecord["lines"]) {
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
    case "CONFIRMED":
    case "DELIVERED":
    case "PAID":
      return "success";
    case "SENT":
    case "IN_TRANSIT":
      return "info";
    case "NEGOTIATION":
    case "READY_TO_SHIP":
    case "PARTIALLY_DELIVERED":
    case "PARTIALLY_PAID":
      return "warning";
    case "REJECTED":
    case "CANCELED":
    case "RETURNED":
    case "OVERDUE":
      return "danger";
    default:
      return "default";
  }
}

function toLabel(value?: string | null) {
  if (!value) return "-";
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function PenjualanPage() {
  const { data: session } = useSession();
  const [search, setSearch] = useState("");
  const [flowFilter, setFlowFilter] = useState<"ALL" | "OPEN" | "COMPLETED">("ALL");
  const [modeFilter, setModeFilter] = useState<"ALL" | "GOODS" | "SERVICE" | "MIXED">("ALL");
  const isAllowed = session?.user ? userHasPermission(session.user, "sales", "read") : false;
  const summaryQuery = api.business.salesSummary.useQuery(undefined, { enabled: isAllowed, refetchOnWindowFocus: false }) as unknown as {
    data?: SalesSummary;
  };
  const flowQuery = api.business.listSalesFlows.useQuery(
    { search: search || undefined, limit: 50 },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  ) as unknown as { data?: SalesFlowRecord[]; isLoading: boolean };

  const summary = summaryQuery.data;
  const flows = useMemo(() => flowQuery.data ?? [], [flowQuery.data]);
  const filteredFlows = useMemo(() => {
    return flows.filter((flow) => {
      const isCompleted = Boolean(flow.salesOrders?.[0]?.salesInvoices?.[0]);
      const matchesFlow =
        flowFilter === "ALL" ||
        (flowFilter === "OPEN" && !isCompleted) ||
        (flowFilter === "COMPLETED" && isCompleted);
      const matchesMode =
        modeFilter === "ALL" ||
        (flow.fulfillmentMode ?? "GOODS") === modeFilter;

      return matchesFlow && matchesMode;
    });
  }, [flowFilter, flows, modeFilter]);
  const completedFlows = flows.filter((flow) => Boolean(flow.salesOrders?.[0]?.salesInvoices?.[0])).length;
  const inProgressFlows = flows.filter((flow) => !flow.salesOrders?.[0]?.salesInvoices?.[0]).length;

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Penjualan" description="Halaman penjualan sekarang ditampilkan berdasarkan alur dokumen nyata: Quotation -> Sales Order -> Delivery Order -> Sales Invoice." badge={<Badge variant="success">Flow Workspace</Badge>} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CrmMetricCard label="Quotation" value={String(summary?.quotationCount ?? 0)} helper="Dokumen quotation" />
        <CrmMetricCard label="Sales Order" value={String(summary?.salesOrderCount ?? 0)} helper="Dokumen SO" />
        <CrmMetricCard label="Flow Berjalan" value={String(inProgressFlows)} helper="Sudah punya SO" />
        <CrmMetricCard label="Flow Selesai" value={String(completedFlows)} helper="Sudah sampai invoice" />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_160px]">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari quotation, SO, customer, atau item inventory" className={crmInputClassName} />
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
            <h2 className="text-lg font-semibold text-gray-900">Alur Penjualan</h2>
            <p className="text-sm text-gray-500">Setiap baris diringkas per alur penjualan dari quotation sampai invoice customer, bukan daftar seed terpisah.</p>
          </div>
          {flowQuery.isLoading ? (
            <div className="p-5 text-sm text-gray-500">Memuat alur penjualan...</div>
          ) : filteredFlows.length === 0 ? (
            <div className="p-5"><CrmEmptyHint text="Belum ada alur penjualan yang cocok dengan filter." /></div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredFlows.map((flow) => {
                const salesOrder = flow.salesOrders?.[0] ?? null;
                const deliveryOrder = salesOrder?.deliveryOrders?.[0] ?? null;
                const salesInvoice = salesOrder?.salesInvoices?.[0] ?? null;

                return (
                  <div key={flow.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-gray-900">{flow.quotationNumber}</p>
                          <BusinessFlowBadge value={flow.fulfillmentMode} />
                          <Badge variant={stageVariant(flow.status)}>{toLabel(flow.status)}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-gray-600">{flow.customer.company} • {summarizeItems(flow.lines)}</p>
                        <p className="mt-1 text-xs text-gray-500">Issue date {formatDate(flow.issueDate)}</p>
                      </div>
                      <div className="text-right text-xs text-gray-500">{flow.lines.length} line</div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <Link href="/penjualan/quotation" className="rounded-lg border border-gray-200 p-3 transition hover:border-blue-200 hover:bg-blue-50/40">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Quotation</p>
                        <p className="mt-1 font-semibold text-gray-900">{flow.quotationNumber}</p>
                        <Badge className="mt-2" variant={stageVariant(flow.status)}>{toLabel(flow.status)}</Badge>
                        <p className="mt-2 text-xs font-semibold text-blue-600">Buka tahap →</p>
                      </Link>
                      <Link href="/penjualan/sales-order" className="rounded-lg border border-gray-200 p-3 transition hover:border-blue-200 hover:bg-blue-50/40">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Sales Order</p>
                        <p className="mt-1 font-semibold text-gray-900">{salesOrder?.salesOrderNumber ?? "Belum dibuat"}</p>
                        <Badge className="mt-2" variant={stageVariant(salesOrder?.status)}>{toLabel(salesOrder?.status)}</Badge>
                        <p className="mt-2 text-xs font-semibold text-blue-600">Buka tahap →</p>
                      </Link>
                      <Link href="/penjualan/delivery-order" className="rounded-lg border border-gray-200 p-3 transition hover:border-blue-200 hover:bg-blue-50/40">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Delivery Order</p>
                        <p className="mt-1 font-semibold text-gray-900">{deliveryOrder?.deliveryOrderNumber ?? "Belum dikirim"}</p>
                        <Badge className="mt-2" variant={stageVariant(deliveryOrder?.status)}>{toLabel(deliveryOrder?.status)}</Badge>
                        <p className="mt-2 text-xs font-semibold text-blue-600">Buka tahap →</p>
                      </Link>
                      <Link href="/penjualan/invoice" className="rounded-lg border border-gray-200 p-3 transition hover:border-blue-200 hover:bg-blue-50/40">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Sales Invoice</p>
                        <p className="mt-1 font-semibold text-gray-900">{salesInvoice?.salesInvoiceNumber ?? "Belum ditagihkan"}</p>
                        <Badge className="mt-2" variant={stageVariant(salesInvoice?.status)}>{toLabel(salesInvoice?.status)}</Badge>
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
              <li>Barang: <span className="font-semibold">Quotation → SO → DO → Sales Invoice</span></li>
              <li>Jasa: <span className="font-semibold">Quotation → SO → Sales Invoice</span></li>
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
