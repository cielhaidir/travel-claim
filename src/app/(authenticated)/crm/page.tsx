"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/features/PageHeader";
import { CrmEmptyHint, CrmMetricCard, CrmPanel } from "@/components/features/crm/shared";
import { userHasPermission } from "@/lib/auth/role-check";
import { CRM_ACTIVE_MODULES, getCrmLabel } from "@/lib/constants/crm";
import { formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";

export default function CrmDashboardPage() {
  const { data: session } = useSession();
  const isAllowed = session?.user ? userHasPermission(session.user, "crm", "read") : false;

  const { data, isLoading, refetch } = api.crm.dashboard.useQuery(
    {},
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dasbor CRM"
        description="Ringkasan CRM untuk prospek, peluang, kontak, organisasi, tugas, dan catatan."
        badge={<Badge variant="info">CRM</Badge>}
        primaryAction={{ label: "Muat Ulang", onClick: () => void refetch() }}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <CrmMetricCard label="Organisasi" value={String(data?.counts.organizations ?? 0)} />
        <CrmMetricCard label="Kontak" value={String(data?.counts.contacts ?? 0)} />
        <CrmMetricCard label="Prospek" value={String(data?.counts.leads ?? 0)} />
        <CrmMetricCard label="Peluang" value={String(data?.counts.deals ?? 0)} />
        <CrmMetricCard label="Tugas Terbuka" value={String(data?.counts.openTasks ?? 0)} />
        <CrmMetricCard label="Catatan" value={String(data?.counts.notes ?? 0)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <CrmPanel title="Modul" description="Rute ruang kerja CRM yang tersedia pada build ini.">
          <div className="grid gap-3 sm:grid-cols-2">
            {CRM_ACTIVE_MODULES.map((module) => (
              <Link
                key={module.href}
                href={module.href}
                className="rounded-xl border border-gray-200 p-4 transition hover:border-blue-300 hover:bg-blue-50"
              >
                <p className="font-semibold text-gray-900">{module.label}</p>
                <p className="mt-1 text-sm text-gray-500">Buka modul {module.label.toLowerCase()}.</p>
              </Link>
            ))}
          </div>
        </CrmPanel>

        <CrmPanel title="Tugas Terbaru" description="Jatuh tempo terdekat dari seluruh prospek dan peluang.">
          {isLoading ? (
            <CrmEmptyHint text="Memuat tugas..." />
          ) : data?.recentTasks.length ? (
            data.recentTasks.map((task) => (
              <div key={task.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{task.title}</p>
                    <p className="mt-1 text-sm text-gray-500">
                      {task.lead ? (
                        <Link href={`/crm/leads/${task.lead.id}`} className="text-blue-600 hover:text-blue-700">
                          {task.lead.company}
                        </Link>
                      ) : task.deal ? (
                        <Link href={`/crm/deals/${task.deal.id}`} className="text-blue-600 hover:text-blue-700">
                          {task.deal.title}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </p>
                  </div>
                  <Badge variant="warning">{getCrmLabel(task.status)}</Badge>
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  Jatuh tempo: {task.dueDate ? formatDate(task.dueDate) : "Belum ada"}
                </p>
              </div>
            ))
          ) : (
            <CrmEmptyHint text="Belum ada tugas CRM." />
          )}
        </CrmPanel>
      </div>

      <CrmPanel title="Catatan Terbaru" description="Catatan terbaru yang tersimpan pada tab detail CRM.">
        {isLoading ? (
          <CrmEmptyHint text="Memuat catatan..." />
        ) : data?.recentNotes.length ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {data.recentNotes.map((note) => (
              <div key={note.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{note.title}</p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">
                      {note.writerName ?? "Penulis tidak diketahui"}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500">{formatDate(note.updatedAt)}</p>
                </div>
                <p className="mt-3 text-sm text-gray-600">
                  {note.lead ? (
                    <Link href={`/crm/leads/${note.lead.id}`} className="text-blue-600 hover:text-blue-700">
                      {note.lead.company}
                    </Link>
                  ) : note.deal ? (
                    <Link href={`/crm/deals/${note.deal.id}`} className="text-blue-600 hover:text-blue-700">
                      {note.deal.title}
                    </Link>
                  ) : (
                    "-"
                  )}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <CrmEmptyHint text="Belum ada catatan CRM." />
        )}
      </CrmPanel>
    </div>
  );
}
