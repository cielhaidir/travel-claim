"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/features/PageHeader";
import { userHasPermission } from "@/lib/auth/role-check";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";

type SortKey = "company" | "ownerName" | "value" | "stage" | "probability";
type SortDirection = "asc" | "desc";

const STAGE_VARIANT: Record<string, "default" | "info" | "warning" | "success" | "danger"> = {
  NEW: "default",
  QUALIFIED: "info",
  PROPOSAL: "warning",
  NEGOTIATION: "warning",
  WON: "success",
  LOST: "danger",
};

function paginate<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    totalItems: items.length,
  };
}

export default function CrmDealsPage() {
  const { data: session } = useSession();
  const isAllowed = session?.user ? userHasPermission(session.user, "crm", "read") : false;

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = api.crm.dashboard.useQuery(
    { search: search || undefined },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );

  const deals = useMemo(() => {
    const items = [...(data?.leads ?? [])].filter((lead) => lead.stage !== "LOST");
    items.sort((a, b) => {
      switch (sortKey) {
        case "company":
          return a.company.localeCompare(b.company);
        case "ownerName":
          return a.ownerName.localeCompare(b.ownerName);
        case "stage":
          return a.stage.localeCompare(b.stage);
        case "probability":
          return a.probability - b.probability;
        case "value":
        default:
          return Number(a.value ?? 0) - Number(b.value ?? 0);
      }
    });
    return sortDirection === "asc" ? items : items.reverse();
  }, [data?.leads, sortDirection, sortKey]);

  const paginated = useMemo(() => paginate(deals, page, 10), [deals, page]);
  const totalValue = useMemo(
    () => deals.reduce((sum, deal) => sum + Number(deal.value ?? 0), 0),
    [deals],
  );

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM Deals"
        description="Modul deals/opportunities terpisah untuk memantau peluang penjualan dan nilai transaksi potensial."
        primaryAction={{ label: "CRM Dashboard", href: "/crm" }}
        secondaryAction={{ label: "Muat Ulang", onClick: () => void refetch() }}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Total Deals" value={String(deals.length)} />
        <MetricCard label="Total Opportunity Value" value={formatCurrency(totalValue)} />
        <MetricCard label="Closing Deals" value={String(deals.filter((deal) => deal.stage === "WON").length)} />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Cari company, owner, customer"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500">
            <option value="value">Urutkan: Value</option>
            <option value="company">Urutkan: Company</option>
            <option value="ownerName">Urutkan: Owner</option>
            <option value="stage">Urutkan: Stage</option>
            <option value="probability">Urutkan: Probability</option>
          </select>
          <select value={sortDirection} onChange={(event) => setSortDirection(event.target.value as SortDirection)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500">
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Daftar Deals</h2>
            <p className="text-sm text-gray-500">{paginated.totalItems} deal aktif ditemukan</p>
          </div>
          <Badge variant="warning">Deals</Badge>
        </div>

        {isLoading ? (
          <div className="p-5 text-sm text-gray-500">Memuat data deals...</div>
        ) : (
          <div className="space-y-3 p-5">
            {paginated.items.map((deal) => (
              <div key={deal.id} className="rounded-xl border border-gray-200 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900">{deal.company}</p>
                      <Badge variant={STAGE_VARIANT[deal.stage] ?? "default"}>{deal.stage}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">{deal.name} · Owner: {deal.ownerName}</p>
                  </div>
                  <div className="text-sm text-gray-600 lg:text-right">
                    <p className="font-semibold text-gray-900">{formatCurrency(Number(deal.value ?? 0))}</p>
                    <p>{deal.probability}% probability</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <InfoChip label="Customer" value={deal.customer?.company ?? "Belum terkait"} />
                  <InfoChip label="Target Close" value={deal.expectedCloseDate ? formatDate(deal.expectedCloseDate) : "-"} />
                  <InfoChip label="Source" value={deal.source} />
                  <InfoChip label="Deal Value" value={formatCurrency(Number(deal.value ?? 0))} />
                </div>

                <div className="mt-4">
                  <Link href={`/crm/deals/${deal.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-700">
                    Lihat detail deal
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4">
          <p className="text-sm text-gray-500">
            {paginated.totalItems} item · halaman {paginated.page}/{paginated.totalPages}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={paginated.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
              Sebelumnya
            </Button>
            <Button size="sm" variant="secondary" disabled={paginated.page >= paginated.totalPages} onClick={() => setPage((current) => Math.min(paginated.totalPages, current + 1))}>
              Berikutnya
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-700">{value}</p>
    </div>
  );
}
