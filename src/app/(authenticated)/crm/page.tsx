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
        title="CRM Dashboard"
        description="Overview CRM untuk leads, deals, contacts, organizations, tasks, dan notes."
        badge={<Badge variant="info">CRM</Badge>}
        primaryAction={{ label: "Refresh", onClick: () => void refetch() }}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <CrmMetricCard label="Organizations" value={String(data?.counts.organizations ?? 0)} />
        <CrmMetricCard label="Contacts" value={String(data?.counts.contacts ?? 0)} />
        <CrmMetricCard label="Leads" value={String(data?.counts.leads ?? 0)} />
        <CrmMetricCard label="Deals" value={String(data?.counts.deals ?? 0)} />
        <CrmMetricCard label="Open Tasks" value={String(data?.counts.openTasks ?? 0)} />
        <CrmMetricCard label="Notes" value={String(data?.counts.notes ?? 0)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <CrmPanel title="Modules" description="CRM workspace routes available in this build.">
          <div className="grid gap-3 sm:grid-cols-2">
            {CRM_ACTIVE_MODULES.map((module) => (
              <Link
                key={module.href}
                href={module.href}
                className="rounded-xl border border-gray-200 p-4 transition hover:border-blue-300 hover:bg-blue-50"
              >
                <p className="font-semibold text-gray-900">{module.label}</p>
                <p className="mt-1 text-sm text-gray-500">Open {module.label.toLowerCase()}.</p>
              </Link>
            ))}
          </div>
        </CrmPanel>

        <CrmPanel title="Recent Tasks" description="Nearest due dates across leads and deals.">
          {isLoading ? (
            <CrmEmptyHint text="Loading tasks..." />
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
                  Due: {task.dueDate ? formatDate(task.dueDate) : "No due date"}
                </p>
              </div>
            ))
          ) : (
            <CrmEmptyHint text="No CRM tasks yet." />
          )}
        </CrmPanel>
      </div>

      <CrmPanel title="Recent Notes" description="Latest notes captured in the CRM detail tabs.">
        {isLoading ? (
          <CrmEmptyHint text="Loading notes..." />
        ) : data?.recentNotes.length ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {data.recentNotes.map((note) => (
              <div key={note.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{note.title}</p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">
                      {note.writerName ?? "Unknown writer"}
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
          <CrmEmptyHint text="No CRM notes yet." />
        )}
      </CrmPanel>
    </div>
  );
}
