"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
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

type LeadTab = "activity" | "data" | "tasks" | "notes" | "attachments";

export default function CrmLeadDetailPage() {
  const params = useParams();
  const { data: session } = useSession();
  const { showToast } = useToast();
  const rawId = params?.id;
  const id = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : undefined;
  const isAllowed = session?.user ? userHasPermission(session.user, "crm", "read") : false;
  const [activeTab, setActiveTab] = useState<LeadTab>("activity");

  const utils = api.useUtils();
  const { data, isLoading, refetch } = api.crm.getLeadById.useQuery(
    { id: id ?? "" },
    { enabled: !!id && isAllowed, refetchOnWindowFocus: false },
  );
  const { data: options } = api.crm.formOptions.useQuery(undefined, {
    enabled: isAllowed,
    refetchOnWindowFocus: false,
  });
  const convertMutation = api.crm.createDealFromLead.useMutation({
    onSuccess: async () => {
      await utils.crm.getLeadById.invalidate({ id: id ?? "" });
      await utils.crm.listLeads.invalidate();
      await utils.crm.listDeals.invalidate();
      await utils.crm.dashboard.invalidate();
    },
  });

  async function handleConvert() {
    if (!id) return;

    try {
      await convertMutation.mutateAsync({ id });
      showToast({ title: "Deal created from lead", message: "The lead has been converted into a deal.", variant: "success" });
    } catch (error) {
      showToast({
        title: "Failed to convert lead",
        message: error instanceof Error ? error.message : "Unexpected error",
        variant: "error",
      });
    }
  }

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={data ? `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() || data.company : "Lead Detail"}
        description="Lead detail page with activity log, data, tasks, notes, and attachments."
        primaryAction={{ label: "Refresh", onClick: () => void refetch() }}
        secondaryAction={{ label: "Back to Leads", href: "/crm/leads" }}
      />

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Loading lead detail...
        </div>
      ) : !data ? (
        <div className="rounded-lg border bg-white">
          <EmptyState
            title="Lead not found"
            description="This CRM lead is unavailable in the active tenant."
            action={{ label: "Back to Leads", href: "/crm/leads" }}
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
            <CrmMetricCard label="Deals" value={String(data.deals.length)} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
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
            {data.status !== "CONVERTED" ? (
              <Button onClick={() => void handleConvert()} isLoading={convertMutation.isPending}>
                Create Deal
              </Button>
            ) : null}
          </div>

          {activeTab === "data" ? (
            <div className="grid gap-6 xl:grid-cols-3">
              <CrmPanel title="Lead Data">
                <CrmInfoRow label="First Name" value={data.firstName ?? "-"} />
                <CrmInfoRow label="Last Name" value={data.lastName ?? "-"} />
                <CrmInfoRow label="Email" value={data.email} />
                <CrmInfoRow label="Mobile No." value={data.mobileNo ?? "-"} />
                <CrmInfoRow label="Gender" value={getCrmLabel(data.gender)} />
                <CrmInfoRow
                  label="Status"
                  value={<Badge variant={getCrmBadgeVariant(data.status)}>{getCrmLabel(data.status)}</Badge>}
                />
                <CrmInfoRow label="Lead Owner" value={data.ownerName} />
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

              <CrmPanel title="Meta">
                <CrmInfoRow label="Expected Close Date" value={data.expectedCloseDate ? formatDate(data.expectedCloseDate) : "-"} />
                <CrmInfoRow label="Last Modified" value={formatDate(data.updatedAt)} />
                <CrmInfoRow label="Converted To Deal" value={data.convertedToDealAt ? formatDate(data.convertedToDealAt) : "-"} />
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                  {data.notes ?? "No lead notes in the data section."}
                </div>
              </CrmPanel>

              <CrmPanel title="Related Deals" description="Deals created from this lead." className="xl:col-span-3">
                {data.deals.length ? (
                  <div className="grid gap-3 xl:grid-cols-2">
                    {data.deals.map((deal) => (
                      <div key={deal.id} className="rounded-lg border border-gray-200 p-4">
                        <p className="font-semibold text-gray-900">{deal.title}</p>
                        <p className="mt-1 text-sm text-gray-500">{getCrmLabel(deal.status)}</p>
                        <Link href={`/crm/deals/${deal.id}`} className="mt-3 inline-block text-sm font-medium text-blue-600 hover:text-blue-700">
                          View deal
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No deals created from this lead yet.</p>
                )}
              </CrmPanel>
            </div>
          ) : null}

          {activeTab === "activity" ? <CrmActivitySection items={data.activities} /> : null}
          {activeTab === "tasks" ? (
            <CrmTasksSection subjectId={data.id} subjectType="lead" items={data.tasks} users={options?.users ?? []} />
          ) : null}
          {activeTab === "notes" ? (
            <CrmNotesSection subjectId={data.id} subjectType="lead" items={data.notesList} users={options?.users ?? []} />
          ) : null}
          {activeTab === "attachments" ? (
            <CrmAttachmentsSection subjectId={data.id} subjectType="lead" items={data.attachments} />
          ) : null}
        </>
      )}
    </div>
  );
}
