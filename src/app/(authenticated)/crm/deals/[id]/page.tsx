"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/features/EmptyState";
import { PageHeader } from "@/components/features/PageHeader";
import {
  CrmActivitySection,
  CrmAttachmentsSection,
  CrmNotesSection,
  CrmTasksSection,
} from "@/components/features/crm/detail-managers";
import {
  CrmInfoRow,
  CrmMetricCard,
  CrmPanel,
  CrmTabs,
} from "@/components/features/crm/shared";
import { userHasPermission } from "@/lib/auth/role-check";
import { getCrmBadgeVariant, getCrmLabel } from "@/lib/constants/crm";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";

type DealTab = "activity" | "data" | "tasks" | "notes" | "attachments";

export default function CrmDealDetailPage() {
  const params = useParams();
  const { data: session } = useSession();
  const rawId = params?.id;
  const id = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : undefined;
  const isAllowed = session?.user ? userHasPermission(session.user, "crm", "read") : false;
  const [activeTab, setActiveTab] = useState<DealTab>("activity");

  const { data, isLoading, refetch } = api.crm.getDealById.useQuery(
    { id: id ?? "" },
    { enabled: !!id && isAllowed, refetchOnWindowFocus: false },
  );
  const { data: options } = api.crm.formOptions.useQuery(undefined, {
    enabled: isAllowed,
    refetchOnWindowFocus: false,
  });

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={data?.title ?? "Deal Detail"}
        description="Deal detail page with activity log, data, tasks, notes, and attachments."
        primaryAction={{ label: "Refresh", onClick: () => void refetch() }}
        secondaryAction={{ label: "Back to Deals", href: "/crm/deals" }}
      />

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Loading deal detail...
        </div>
      ) : !data ? (
        <div className="rounded-lg border bg-white">
          <EmptyState
            title="Deal not found"
            description="This CRM deal is unavailable in the active tenant."
            action={{ label: "Back to Deals", href: "/crm/deals" }}
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <CrmMetricCard label="Status" value={getCrmLabel(data.status)} />
            <CrmMetricCard label="Organization" value={data.company} />
            <CrmMetricCard
              label="Annual Revenue"
              value={data.annualRevenue ? formatCurrency(Number(data.annualRevenue)) : "-"}
            />
            <CrmMetricCard label="Tasks" value={String(data.tasks.length)} />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <CrmTabs
              value={activeTab}
              onChange={setActiveTab}
              items={[
                { id: "activity", label: "Activity Log", count: data.activities.length },
                { id: "data", label: "Data" },
                { id: "tasks", label: "Tasks", count: data.tasks.length },
                { id: "notes", label: "Notes", count: data.notesList.length },
                { id: "attachments", label: "Attachments", count: data.attachments.length },
              ]}
            />
          </div>

          {activeTab === "data" ? (
            <div className="grid gap-6 xl:grid-cols-3">
              <CrmPanel title="Deal Data">
                <CrmInfoRow label="Deal Title" value={data.title} />
                <CrmInfoRow
                  label="Status"
                  value={<Badge variant={getCrmBadgeVariant(data.status)}>{getCrmLabel(data.status)}</Badge>}
                />
                <CrmInfoRow label="Deal Owner" value={data.ownerName} />
                <CrmInfoRow label="Expected Close Date" value={data.expectedCloseDate ? formatDate(data.expectedCloseDate) : "-"} />
                <CrmInfoRow label="Last Modified" value={formatDate(data.updatedAt)} />
              </CrmPanel>

              <CrmPanel title="Organization Snapshot">
                <CrmInfoRow label="Organization" value={data.company} />
                <CrmInfoRow label="Website" value={data.website ?? "-"} />
                <CrmInfoRow label="Employees" value={getCrmLabel(data.employeeCount)} />
                <CrmInfoRow
                  label="Annual Revenue"
                  value={data.annualRevenue ? formatCurrency(Number(data.annualRevenue)) : "-"}
                />
                <CrmInfoRow label="Industry" value={getCrmLabel(data.industry)} />
                {data.customer ? (
                  <Link href={`/crm/organizations/${data.customer.id}`} className="inline-block text-sm font-medium text-blue-600 hover:text-blue-700">
                    View linked organization
                  </Link>
                ) : null}
              </CrmPanel>

              <CrmPanel title="Contact Snapshot">
                <CrmInfoRow label="First Name" value={data.firstName ?? "-"} />
                <CrmInfoRow label="Last Name" value={data.lastName ?? "-"} />
                <CrmInfoRow label="Primary Email" value={data.primaryEmail ?? "-"} />
                <CrmInfoRow label="Primary Mobile No." value={data.primaryMobileNo ?? "-"} />
                <CrmInfoRow label="Gender" value={getCrmLabel(data.gender)} />
                {data.contact ? (
                  <Link href={`/crm/contacts/${data.contact.id}`} className="inline-block text-sm font-medium text-blue-600 hover:text-blue-700">
                    View linked contact
                  </Link>
                ) : null}
              </CrmPanel>

              <CrmPanel title="Additional Notes" className="xl:col-span-3">
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                  {data.notes ?? "No additional deal notes."}
                </div>
                {data.lostReason ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    Lost Reason: {data.lostReason}
                  </div>
                ) : null}
                {data.lead ? (
                  <Link href={`/crm/leads/${data.lead.id}`} className="inline-block text-sm font-medium text-blue-600 hover:text-blue-700">
                    View source lead
                  </Link>
                ) : null}
              </CrmPanel>
            </div>
          ) : null}

          {activeTab === "activity" ? <CrmActivitySection items={data.activities} /> : null}
          {activeTab === "tasks" ? (
            <CrmTasksSection subjectId={data.id} subjectType="deal" items={data.tasks} users={options?.users ?? []} />
          ) : null}
          {activeTab === "notes" ? (
            <CrmNotesSection subjectId={data.id} subjectType="deal" items={data.notesList} users={options?.users ?? []} />
          ) : null}
          {activeTab === "attachments" ? (
            <CrmAttachmentsSection subjectId={data.id} subjectType="deal" items={data.attachments} />
          ) : null}
        </>
      )}
    </div>
  );
}
