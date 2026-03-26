"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/features/PageHeader";
import { userHasPermission } from "@/lib/auth/role-check";
import { formatDate, formatRelativeTime } from "@/lib/utils/format";
import { api, type RouterOutputs } from "@/trpc/react";

type Activity = RouterOutputs["crm"]["dashboard"]["activities"][number];
type SortKey = "scheduledAt" | "ownerName" | "type" | "status";
type SortDirection = "asc" | "desc";

function getReminder(activity: Activity) {
  if (activity.completedAt) return { label: "Completed", variant: "success" as const };
  if (new Date(activity.scheduledAt).getTime() < Date.now()) {
    return { label: "Overdue", variant: "danger" as const };
  }
  return { label: "Upcoming", variant: "info" as const };
}

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

export default function CrmActivitiesPage() {
  const { data: session } = useSession();
  const isAllowed = session?.user ? userHasPermission(session.user, "crm", "read") : false;

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("scheduledAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = api.crm.dashboard.useQuery(
    { search: search || undefined },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );

  const activities = useMemo(() => {
    const items = [...(data?.activities ?? [])];
    items.sort((a, b) => {
      switch (sortKey) {
        case "ownerName":
          return a.ownerName.localeCompare(b.ownerName);
        case "type":
          return a.type.localeCompare(b.type);
        case "status":
          return getReminder(a).label.localeCompare(getReminder(b).label);
        case "scheduledAt":
        default:
          return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      }
    });
    return sortDirection === "asc" ? items : items.reverse();
  }, [data?.activities, sortDirection, sortKey]);

  const paginated = useMemo(() => paginate(activities, page, 10), [activities, page]);

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM Activities"
        description="Modul aktivitas terpisah untuk reminder, follow-up, call, meeting, dan visit tracking."
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
            placeholder="Cari judul, owner, relasi"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500">
            <option value="scheduledAt">Urutkan: Jadwal</option>
            <option value="ownerName">Urutkan: Owner</option>
            <option value="type">Urutkan: Jenis</option>
            <option value="status">Urutkan: Status</option>
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
            <h2 className="text-lg font-semibold text-gray-900">Daftar Activities</h2>
            <p className="text-sm text-gray-500">{paginated.totalItems} aktivitas ditemukan</p>
          </div>
          <Badge variant="info">Activities</Badge>
        </div>

        {isLoading ? (
          <div className="p-5 text-sm text-gray-500">Memuat data aktivitas...</div>
        ) : (
          <div className="space-y-3 p-5">
            {paginated.items.map((activity) => {
              const reminder = getReminder(activity);
              return (
                <div key={activity.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">{activity.title}</p>
                      <p className="mt-1 text-sm text-gray-500">{activity.description ?? "-"}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={reminder.variant}>{reminder.label}</Badge>
                      <Badge variant="default">{activity.type}</Badge>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <InfoChip label="Owner" value={activity.ownerName} />
                    <InfoChip label="Jadwal" value={formatDate(activity.scheduledAt)} />
                    <InfoChip label="Relasi" value={activity.lead?.company ?? activity.customer?.company ?? "Tanpa relasi"} />
                    <InfoChip label="Completed" value={activity.completedAt ? formatRelativeTime(activity.completedAt) : "Belum"} />
                  </div>
                </div>
              );
            })}
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
