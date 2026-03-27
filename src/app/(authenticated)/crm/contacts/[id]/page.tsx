"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { EmptyState } from "@/components/features/EmptyState";
import { PageHeader } from "@/components/features/PageHeader";
import { CrmInfoRow, CrmMetricCard, CrmPanel } from "@/components/features/crm/shared";
import { userHasPermission } from "@/lib/auth/role-check";
import { getCrmLabel } from "@/lib/constants/crm";
import { formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";

export default function CrmContactDetailPage() {
  const params = useParams();
  const { data: session } = useSession();
  const rawId = params?.id;
  const id = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : undefined;
  const isAllowed = session?.user ? userHasPermission(session.user, "crm", "read") : false;

  const { data, isLoading, refetch } = api.crm.getContactById.useQuery(
    { id: id ?? "" },
    { enabled: !!id && isAllowed, refetchOnWindowFocus: false },
  );

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={data?.name ?? "Contact Detail"}
        description="Contact master data and related deal history."
        primaryAction={{ label: "Refresh", onClick: () => void refetch() }}
        secondaryAction={{ label: "Back to Contacts", href: "/crm/contacts" }}
      />

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Loading contact detail...
        </div>
      ) : !data ? (
        <div className="rounded-lg border bg-white">
          <EmptyState
            title="Contact not found"
            description="This CRM contact is unavailable in the active tenant."
            action={{ label: "Back to Contacts", href: "/crm/contacts" }}
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <CrmMetricCard label="Deals" value={String(data.deals.length)} />
            <CrmMetricCard label="Primary Contact" value={data.isPrimary ? "Yes" : "No"} />
            <CrmMetricCard label="Last Modified" value={formatDate(data.updatedAt)} />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <CrmPanel title="Contact Data">
              <CrmInfoRow label="First Name" value={data.firstName ?? "-"} />
              <CrmInfoRow label="Last Name" value={data.lastName ?? "-"} />
              <CrmInfoRow label="Email" value={data.email ?? "-"} />
              <CrmInfoRow label="Mobile Phone" value={data.phone ?? "-"} />
              <CrmInfoRow label="Gender" value={getCrmLabel(data.gender)} />
              <CrmInfoRow label="Designation" value={data.designation ?? "-"} />
              <CrmInfoRow label="Address" value={data.address ?? "-"} />
            </CrmPanel>

            <CrmPanel title="Organization">
              {data.customer ? (
                <>
                  <CrmInfoRow label="Organization" value={data.customer.company} />
                  <Link
                    href={`/crm/organizations/${data.customer.id}`}
                    className="inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    View organization
                  </Link>
                </>
              ) : (
                <p className="text-sm text-gray-500">No linked organization.</p>
              )}
            </CrmPanel>

            <CrmPanel title="Notes">
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                {data.notes ?? "No notes for this contact."}
              </div>
            </CrmPanel>
          </div>

          <CrmPanel title="Related Deals" description="Deals already handled with this contact.">
            {data.deals.length ? (
              data.deals.map((deal) => (
                <div key={deal.id} className="rounded-lg border border-gray-200 p-4">
                  <p className="font-semibold text-gray-900">{deal.title}</p>
                  <p className="mt-1 text-sm text-gray-500">{getCrmLabel(deal.status)}</p>
                  <Link
                    href={`/crm/deals/${deal.id}`}
                    className="mt-3 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    View deal
                  </Link>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">No deals linked to this contact.</p>
            )}
          </CrmPanel>
        </>
      )}
    </div>
  );
}
