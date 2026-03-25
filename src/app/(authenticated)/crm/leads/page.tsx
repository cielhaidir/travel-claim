"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/features/PageHeader";
import { CRM_ROLES, hasAnyRole, normalizeRoles } from "@/lib/constants/roles";
import { formatCurrency, formatDate, formatRelativeTime } from "@/lib/utils/format";
import { api } from "@/trpc/react";
type SortKey = "company" | "ownerName" | "value" | "probability" | "stage";
type SortDirection = "asc" | "desc";

const STAGE_VARIANT: Record<string, "default" | "info" | "warning" | "success" | "danger"> = {
  NEW: "default",
  QUALIFIED: "info",
  PROPOSAL: "warning",
  NEGOTIATION: "warning",
  WON: "success",
  LOST: "danger",
};

const PRIORITY_VARIANT: Record<string, "default" | "warning" | "danger"> = {
  LOW: "default",
  MEDIUM: "warning",
  HIGH: "danger",
};

const SOURCE_LABELS: Record<string, string> = {
  REFERRAL: "Referral",
  WEBSITE: "Website",
  EVENT: "Event",
  OUTBOUND: "Outbound",
  PARTNER: "Partner",
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

export default function CrmLeadsPage() {
  const { data: session } = useSession();
  const userRoles = normalizeRoles({
    roles: session?.user?.roles,
    role: session?.user?.role,
  });
  const isAllowed = session?.user?.isRoot === true || hasAnyRole(userRoles, CRM_ROLES);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("company");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = api.crm.dashboard.useQuery(
    { search: search || undefined },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );

  const leads = useMemo(() => {
    const items = [...(data?.leads ?? [])];
    items.sort((a, b) => {
      switch (sortKey) {
        case "ownerName":
          return a.ownerName.localeCompare(b.ownerName);
        case "value":
          return Number(a.value ?? 0) - Number(b.value ?? 0);
        case "probability":
          return a.probability - b.probability;
        case "stage":
          return a.stage.localeCompare(b.stage);
        case "company":
        default:
          return a.company.localeCompare(b.company);
      }
    });
    return sortDirection === "asc" ? items : items.reverse();
  }, [data?.leads, sortDirection, sortKey]);

  const paginated = useMemo(() => paginate(leads, page, 10), [leads, page]);

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM Leads"
        description="Daftar lead terpisah untuk tracking source, status, owner, dan peluang closing."
        primaryAction={{ label: "CRM Dashboard", href: "/crm" }}
        secondaryAction={{ label: "Muat Ulang", onClick: () => void refetch() }}
      />

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Cari company, PIC, owner"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500">
            <option value="company">Urutkan: Company</option>
            <option value="ownerName">Urutkan: Owner</option>
            <option value="value">Urutkan: Nilai</option>
            <option value="probability">Urutkan: Probability</option>
            <option value="stage">Urutkan: Stage</option>
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
            <h2 className="text-lg font-semibold text-gray-900">Daftar Leads</h2>
            <p className="text-sm text-gray-500">{paginated.totalItems} lead ditemukan</p>
          </div>
          <Badge variant="warning">Leads</Badge>
        </div>

        {isLoading ? (
          <div className="p-5 text-sm text-gray-500">Memuat data lead...</div>
        ) : (
          <div className="space-y-3 p-5">
            {paginated.items.map((lead) => (
              <div key={lead.id} className="rounded-xl border border-gray-200 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900">{lead.company}</p>
                      <Badge variant={STAGE_VARIANT[lead.stage] ?? "default"}>{lead.stage}</Badge>
                      <Badge variant={PRIORITY_VARIANT[lead.priority] ?? "default"}>{lead.priority}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">{lead.name} · {lead.email} · {lead.phone ?? "-"}</p>
                  </div>
                  <div className="text-sm text-gray-600 lg:text-right">
                    <p className="font-semibold text-gray-900">{formatCurrency(Number(lead.value ?? 0))}</p>
                    <p>{lead.probability}% probability</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <InfoChip label="Owner" value={lead.ownerName} />
                  <InfoChip label="Source" value={SOURCE_LABELS[lead.source] ?? lead.source} />
                  <InfoChip label="Customer" value={lead.customer?.company ?? "Belum terkait"} />
                  <InfoChip label="Target Close" value={lead.expectedCloseDate ? formatDate(lead.expectedCloseDate) : "-"} />
                  <InfoChip label="Aktivitas Terakhir" value={lead.lastActivityAt ? formatRelativeTime(lead.lastActivityAt) : "-"} />
                </div>

                <div className="mt-4">
                  <Link href={`/crm/leads/${lead.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-700">
                    Lihat detail lead
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

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-700">{value}</p>
    </div>
  );
}
