"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/features/EmptyState";
import { PageHeader } from "@/components/features/PageHeader";
import { StatCard } from "@/components/features/StatCard";
import { userHasPermission } from "@/lib/auth/role-check";

type WorkspaceLink = {
  label: string;
  href: string;
  description: string;
};

type BusinessWorkspacePageProps = {
  permissionModule: "purchases" | "sales";
  title: string;
  description: string;
  links: WorkspaceLink[];
};

type SummaryMetric = {
  label: string;
  value: string;
  delta: string;
  trend?: "up" | "down" | "neutral";
  variant?: "default" | "success" | "warning" | "info";
};

type PreviewColumn = {
  key: string;
  label: string;
  kind?: "text" | "badge";
};

type PreviewRow = Record<string, string>;

type BusinessListPlaceholderPageProps = {
  permissionModule: "purchases" | "sales";
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
  createLabel: string;
  notes: string[];
  metrics?: SummaryMetric[];
  stages?: string[];
  relatedLinks?: WorkspaceLink[];
  columns?: PreviewColumn[];
  rows?: PreviewRow[];
  searchPlaceholder?: string;
};

function useBusinessModuleAccess(permissionModule: "purchases" | "sales") {
  const { data: session } = useSession();
  const router = useRouter();
  const isAllowed = session?.user
    ? userHasPermission(session.user, permissionModule, "read")
    : false;

  useEffect(() => {
    if (session && !isAllowed) {
      void router.replace("/dashboard");
    }
  }, [session, isAllowed, router]);

  return { session, isAllowed };
}

function getBadgeVariant(value?: string): "default" | "success" | "warning" | "danger" | "info" {
  switch (value) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "danger":
      return "danger";
    case "info":
      return "info";
    default:
      return "default";
  }
}

export function BusinessWorkspacePage({
  permissionModule,
  title,
  description,
  links,
}: BusinessWorkspacePageProps) {
  const { session, isAllowed } = useBusinessModuleAccess(permissionModule);

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow"
          >
            <h2 className="text-base font-semibold text-gray-900">{link.label}</h2>
            <p className="mt-2 text-sm text-gray-600">{link.description}</p>
            <p className="mt-4 text-sm font-semibold text-blue-600">Buka menu →</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function BusinessListPlaceholderPage({
  permissionModule,
  title,
  description,
  backHref,
  backLabel,
  createLabel,
  notes,
  metrics = [],
  stages = [],
  relatedLinks = [],
  columns = [],
  rows = [],
  searchPlaceholder = "Cari data...",
}: BusinessListPlaceholderPageProps) {
  const { session, isAllowed } = useBusinessModuleAccess(permissionModule);
  const [search, setSearch] = useState("");

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const keyword = search.toLowerCase();
    return rows.filter((row) =>
      Object.values(row).some((value) => value.toLowerCase().includes(keyword)),
    );
  }, [rows, search]);

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        primaryAction={{ label: createLabel }}
        secondaryAction={{ label: backLabel, href: backHref }}
      />

      {metrics.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <StatCard
              key={metric.label}
              label={metric.label}
              value={metric.value}
              delta={metric.delta}
              trend={metric.trend}
              variant={metric.variant}
            />
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Preview Data</h2>
                <p className="mt-1 text-sm text-gray-600">Struktur list awal sudah disiapkan untuk modul ini.</p>
              </div>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-0 md:max-w-sm"
              />
            </div>

            {columns.length > 0 && filteredRows.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead>
                    <tr>
                      {columns.map((column) => (
                        <th
                          key={column.key}
                          className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredRows.map((row, index) => (
                      <tr key={`${row.id ?? row.code ?? row.name ?? title}-${index}`} className="hover:bg-gray-50">
                        {columns.map((column) => {
                          const value = row[column.key] ?? "-";
                          const badgeVariant = row[`${column.key}Variant`];
                          return (
                            <td key={column.key} className="whitespace-nowrap px-4 py-3 text-gray-700">
                              {column.kind === "badge" ? (
                                <Badge variant={getBadgeVariant(badgeVariant)}>{value}</Badge>
                              ) : (
                                value
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50">
                <EmptyState
                  icon="📋"
                  title={`${title} belum memiliki data transaksi`}
                  description="Halaman list sudah disiapkan. Tahap berikutnya kita bisa lanjut ke tabel data, filter, form create/edit, status workflow, dan integrasi dokumen terkait."
                />
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">Rencana Pengembangan</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-600">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-6">
          {stages.length > 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900">Alur Proses</h2>
              <div className="mt-4 space-y-3">
                {stages.map((stage, index) => (
                  <div key={stage} className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                      {index + 1}
                    </div>
                    <p className="pt-1 text-sm text-gray-600">{stage}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {relatedLinks.length > 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900">Modul Terkait</h2>
              <div className="mt-4 space-y-3">
                {relatedLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="block rounded-lg border border-gray-200 px-4 py-3 transition hover:border-blue-200 hover:bg-blue-50/50"
                  >
                    <p className="text-sm font-semibold text-gray-900">{link.label}</p>
                    <p className="mt-1 text-sm text-gray-600">{link.description}</p>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
