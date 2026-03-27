"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/features/EmptyState";
import { PageHeader } from "@/components/features/PageHeader";
import { CrmInfoRow, CrmMetricCard, CrmPanel } from "@/components/features/crm/shared";
import { userHasPermission } from "@/lib/auth/role-check";
import { getCrmLabel } from "@/lib/constants/crm";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";

export default function CrmOrganizationDetailPage() {
  const params = useParams();
  const { data: session } = useSession();
  const rawId = params?.id;
  const id = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : undefined;
  const isAllowed = session?.user ? userHasPermission(session.user, "crm", "read") : false;

  const { data, isLoading, refetch } = api.crm.getOrganizationById.useQuery(
    { id: id ?? "" },
    { enabled: !!id && isAllowed, refetchOnWindowFocus: false },
  );

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={data?.company ?? "Organization Detail"}
        description="Organization master data, related contacts, leads, and deals."
        primaryAction={{ label: "Refresh", onClick: () => void refetch() }}
        secondaryAction={{ label: "Back to Organizations", href: "/crm/organizations" }}
      />

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Loading organization detail...
        </div>
      ) : !data ? (
        <div className="rounded-lg border bg-white">
          <EmptyState
            title="Organization not found"
            description="This CRM organization is unavailable in the active tenant."
            action={{ label: "Back to Organizations", href: "/crm/organizations" }}
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <CrmMetricCard label="Contacts" value={String(data.contacts.length)} />
            <CrmMetricCard label="Leads" value={String(data.leads.length)} />
            <CrmMetricCard label="Deals" value={String(data.deals.length)} />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <CrmPanel title="Organization Data">
              <CrmInfoRow label="Organization Name" value={data.company} />
              <CrmInfoRow label="Website" value={data.website ?? "-"} />
              <CrmInfoRow
                label="Annual Revenue"
                value={data.annualRevenue ? formatCurrency(Number(data.annualRevenue)) : "-"}
              />
              <CrmInfoRow label="Employees" value={getCrmLabel(data.employeeCount)} />
              <CrmInfoRow label="Industry" value={getCrmLabel(data.industry)} />
              <CrmInfoRow label="Last Modified" value={formatDate(data.updatedAt)} />
            </CrmPanel>

            <CrmPanel title="Contacts">
              {data.contacts.length ? (
                data.contacts.map((contact) => (
                  <div key={contact.id} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900">{contact.name}</p>
                        <p className="text-sm text-gray-500">{contact.designation ?? "-"}</p>
                      </div>
                      {contact.isPrimary ? <Badge variant="success">Primary</Badge> : null}
                    </div>
                    <Link
                      href={`/crm/contacts/${contact.id}`}
                      className="mt-3 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
                    >
                      View detail
                    </Link>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">No organization contacts yet.</p>
              )}
            </CrmPanel>

            <CrmPanel title="Notes">
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                {data.notes ?? "No notes for this organization."}
              </div>
            </CrmPanel>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <CrmPanel title="Deals" description="Deals linked to this organization.">
              {data.deals.length ? (
                data.deals.map((deal) => (
                  <div key={deal.id} className="rounded-lg border border-gray-200 p-4">
                    <p className="font-semibold text-gray-900">{deal.title}</p>
                    <p className="mt-1 text-sm text-gray-500">{getCrmLabel(deal.status)}</p>
                    <Link
                      href={`/crm/deals/${deal.id}`}
                      className="mt-3 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
                    >
                      View detail
                    </Link>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">No deals linked to this organization.</p>
              )}
            </CrmPanel>

            <CrmPanel title="Leads" description="Leads linked to this organization.">
              {data.leads.length ? (
                data.leads.map((lead) => (
                  <div key={lead.id} className="rounded-lg border border-gray-200 p-4">
                    <p className="font-semibold text-gray-900">{lead.company}</p>
                    <p className="mt-1 text-sm text-gray-500">{lead.name}</p>
                    <Link
                      href={`/crm/leads/${lead.id}`}
                      className="mt-3 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
                    >
                      View detail
                    </Link>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">No leads linked to this organization.</p>
              )}
            </CrmPanel>
          </div>
        </>
      )}
    </div>
  );
}
