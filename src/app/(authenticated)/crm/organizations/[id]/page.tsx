"use client";

import Link from "next/link";
import { Eye } from "lucide-react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/features/EmptyState";
import { PageHeader } from "@/components/features/PageHeader";
import { CrmActionIconLink, CrmInfoRow, CrmMetricCard, CrmPanel } from "@/components/features/crm/shared";
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
        title={data?.company ?? "Detail Organisasi"}
        description="Data master organisasi beserta kontak, prospek, dan peluang terkait."
        primaryAction={{ label: "Muat Ulang", onClick: () => void refetch() }}
        secondaryAction={{ label: "Kembali ke Organisasi", href: "/crm/organizations" }}
      />

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Memuat detail organisasi...
        </div>
      ) : !data ? (
        <div className="rounded-lg border bg-white">
          <EmptyState
            title="Organisasi tidak ditemukan"
            description="Organisasi CRM ini tidak tersedia."
            action={{ label: "Kembali ke Organisasi", href: "/crm/organizations" }}
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <CrmMetricCard label="Kontak" value={String(data.contacts.length)} />
            <CrmMetricCard label="Prospek" value={String(data.leads.length)} />
            <CrmMetricCard label="Peluang" value={String(data.deals.length)} />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <CrmPanel title="Data Organisasi">
              <CrmInfoRow label="Nama Organisasi" value={data.company} />
              <CrmInfoRow label="Situs Web" value={data.website ?? "-"} />
              <CrmInfoRow
                label="Pendapatan Tahunan"
                value={data.annualRevenue ? formatCurrency(Number(data.annualRevenue)) : "-"}
              />
              <CrmInfoRow label="Jumlah Karyawan" value={getCrmLabel(data.employeeCount)} />
              <CrmInfoRow label="Industri" value={getCrmLabel(data.industry)} />
              <CrmInfoRow label="Terakhir Diubah" value={formatDate(data.updatedAt)} />
            </CrmPanel>

            <CrmPanel title="Kontak">
              {data.contacts.length ? (
                data.contacts.map((contact) => (
                  <div key={contact.id} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900">{contact.name}</p>
                        <p className="text-sm text-gray-500">{contact.designation ?? "-"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {contact.isPrimary ? <Badge variant="success">Utama</Badge> : null}
                        <CrmActionIconLink href={`/crm/contacts/${contact.id}`} label="Lihat detail kontak" tone="primary">
                          <Eye className="h-4 w-4" />
                        </CrmActionIconLink>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">Belum ada kontak untuk organisasi ini.</p>
              )}
            </CrmPanel>

            <CrmPanel title="Catatan">
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                {data.notes ?? "Belum ada catatan untuk organisasi ini."}
              </div>
            </CrmPanel>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <CrmPanel title="Peluang" description="Peluang yang terhubung ke organisasi ini.">
              {data.deals.length ? (
                data.deals.map((deal) => (
                  <div key={deal.id} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900">{deal.title}</p>
                        <p className="mt-1 text-sm text-gray-500">{getCrmLabel(deal.status)}</p>
                      </div>
                      <CrmActionIconLink href={`/crm/deals/${deal.id}`} label="Lihat detail peluang" tone="primary">
                        <Eye className="h-4 w-4" />
                      </CrmActionIconLink>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">Belum ada peluang yang terhubung ke organisasi ini.</p>
              )}
            </CrmPanel>

            <CrmPanel title="Prospek" description="Prospek yang terhubung ke organisasi ini.">
              {data.leads.length ? (
                data.leads.map((lead) => (
                  <div key={lead.id} className="rounded-lg border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900">{lead.company}</p>
                        <p className="mt-1 text-sm text-gray-500">{lead.name}</p>
                      </div>
                      <CrmActionIconLink href={`/crm/leads/${lead.id}`} label="Lihat detail prospek" tone="primary">
                        <Eye className="h-4 w-4" />
                      </CrmActionIconLink>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">Belum ada prospek yang terhubung ke organisasi ini.</p>
              )}
            </CrmPanel>
          </div>
        </>
      )}
    </div>
  );
}
