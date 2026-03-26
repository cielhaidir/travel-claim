"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/features/PageHeader";
import { userHasPermission } from "@/lib/auth/role-check";
import { formatCurrency, formatRelativeTime } from "@/lib/utils/format";
import { api } from "@/trpc/react";
type SortKey = "company" | "ownerName" | "totalValue" | "status";
type SortDirection = "asc" | "desc";

const STATUS_VARIANT: Record<string, "default" | "success" | "warning"> = {
  ACTIVE: "success",
  INACTIVE: "default",
  VIP: "warning",
};

const SEGMENT_LABELS: Record<string, string> = {
  ENTERPRISE: "Enterprise",
  SMB: "SMB",
  GOVERNMENT: "Government",
  EDUCATION: "Education",
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

export default function CrmCustomersPage() {
  const { data: session } = useSession();
  const isAllowed = session?.user ? userHasPermission(session.user, "crm", "read") : false;

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("company");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = api.crm.dashboard.useQuery(
    { search: search || undefined },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );

  const customers = useMemo(() => {
    const items = [...(data?.customers ?? [])];
    items.sort((a, b) => {
      switch (sortKey) {
        case "ownerName":
          return a.ownerName.localeCompare(b.ownerName);
        case "totalValue":
          return Number(a.totalValue ?? 0) - Number(b.totalValue ?? 0);
        case "status":
          return a.status.localeCompare(b.status);
        case "company":
        default:
          return a.company.localeCompare(b.company);
      }
    });
    return sortDirection === "asc" ? items : items.reverse();
  }, [data?.customers, sortDirection, sortKey]);

  const paginated = useMemo(() => paginate(customers, page, 10), [customers, page]);

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM Customers"
        description="Daftar customer terpisah untuk contacts, segmentasi, dan monitoring account owner."
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
            placeholder="Cari company, email, owner"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          >
            <option value="company">Urutkan: Company</option>
            <option value="ownerName">Urutkan: Owner</option>
            <option value="totalValue">Urutkan: Nilai</option>
            <option value="status">Urutkan: Status</option>
          </select>
          <select
            value={sortDirection}
            onChange={(event) => setSortDirection(event.target.value as SortDirection)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Daftar Customer</h2>
            <p className="text-sm text-gray-500">{paginated.totalItems} customer ditemukan</p>
          </div>
          <Badge variant="success">Customers</Badge>
        </div>

        {isLoading ? (
          <div className="p-5 text-sm text-gray-500">Memuat data customer...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Segment</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Owner</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Nilai</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Kontak Terakhir</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {paginated.items.map((customer) => (
                  <tr key={customer.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{customer.company}</p>
                      <p className="text-xs text-gray-500">{customer.name}</p>
                      <p className="mt-1 text-xs text-gray-500">{customer.email}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant={STATUS_VARIANT[customer.status] ?? "default"}>{customer.status}</Badge>
                        <span className="text-xs text-gray-400">{customer.city ?? "-"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{SEGMENT_LABELS[customer.segment] ?? customer.segment}</td>
                    <td className="px-4 py-3 text-gray-600">{customer.ownerName}</td>
                    <td className="px-4 py-3 text-gray-600">{formatCurrency(Number(customer.totalValue ?? 0))}</td>
                    <td className="px-4 py-3 text-gray-600">{customer.lastContactAt ? formatRelativeTime(customer.lastContactAt) : "-"}</td>
                    <td className="px-4 py-3">
                      <Link href={`/crm/customers/${customer.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-700">
                        Lihat detail
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
