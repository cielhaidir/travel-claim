"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/features/PageHeader";
import { CrmEmptyHint, CrmMetricCard, crmInputClassName } from "@/components/features/crm/shared";
import { userHasPermission } from "@/lib/auth/role-check";
import { CRM_TASK_STATUS_OPTIONS, getCrmBadgeVariant, getCrmLabel } from "@/lib/constants/crm";
import { formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";

export default function CrmTasksPage() {
  const { data: session } = useSession();
  const isAllowed = session?.user ? userHasPermission(session.user, "crm", "read") : false;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  type TaskStatusValue = (typeof CRM_TASK_STATUS_OPTIONS)[number];

  const { data, isLoading, refetch } = api.crm.listTasks.useQuery(
    { search: search || undefined, status: (status || undefined) as TaskStatusValue | undefined },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );

  const tasks = data ?? [];

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM Tasks"
        description="Aggregate tasks across all leads and deals."
        primaryAction={{ label: "Refresh", onClick: () => void refetch() }}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <CrmMetricCard label="Tasks" value={String(tasks.length)} />
        <CrmMetricCard label="Open" value={String(tasks.filter((task) => task.status === "OPEN").length)} />
        <CrmMetricCard label="Completed" value={String(tasks.filter((task) => task.status === "COMPLETED").length)} />
      </div>

      <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search task title, assignee, lead, or deal"
          className={crmInputClassName}
        />
        <select value={status} onChange={(event) => setStatus(event.target.value)} className={crmInputClassName}>
          <option value="">All statuses</option>
          {CRM_TASK_STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {getCrmLabel(option)}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">All Tasks</h2>
        </div>

        {isLoading ? (
          <div className="p-5 text-sm text-gray-500">Loading tasks...</div>
        ) : tasks.length === 0 ? (
          <div className="p-5">
            <CrmEmptyHint text="No CRM tasks available." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Assignee</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Due Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{task.title}</p>
                      <p className="text-xs text-gray-500">{task.description ?? "-"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={getCrmBadgeVariant(task.status)}>{getCrmLabel(task.status)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{task.assigneeName ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-700">{task.dueDate ? formatDate(task.dueDate) : "-"}</td>
                    <td className="px-4 py-3 text-gray-700">{getCrmLabel(task.priority)}</td>
                    <td className="px-4 py-3">
                      {task.lead ? (
                        <Link href={`/crm/leads/${task.lead.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-700">
                          {task.lead.company}
                        </Link>
                      ) : task.deal ? (
                        <Link href={`/crm/deals/${task.deal.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-700">
                          {task.deal.title}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
