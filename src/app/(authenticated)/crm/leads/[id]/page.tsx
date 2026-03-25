"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/features/PageHeader";
import { EmptyState } from "@/components/features/EmptyState";
import { CRM_ROLES, hasAnyRole, normalizeRoles } from "@/lib/constants/roles";
import { formatCurrency, formatDate, formatRelativeTime } from "@/lib/utils/format";
import { api } from "@/trpc/react";

const STAGE_VARIANT: Record<string, "default" | "info" | "warning" | "success" | "danger"> = {
  NEW: "default",
  QUALIFIED: "info",
  PROPOSAL: "warning",
  NEGOTIATION: "warning",
  WON: "success",
  LOST: "danger",
};

const PRIORITY_VARIANT: Record<string, "default" | "warning" | "danger"> = {
  LOW: "default",
  MEDIUM: "warning",
  HIGH: "danger",
};

const SOURCE_LABELS: Record<string, string> = {
  REFERRAL: "Referral",
  WEBSITE: "Website",
  EVENT: "Event",
  OUTBOUND: "Outbound",
  PARTNER: "Partner",
};

export default function CrmLeadDetailPage() {
  const params = useParams();
  const { data: session } = useSession();
  const rawId = params?.id;
  const id = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : undefined;

  const userRoles = normalizeRoles({
    roles: session?.user?.roles,
    role: session?.user?.role,
  });
  const isAllowed = session?.user?.isRoot === true || hasAnyRole(userRoles, CRM_ROLES);

  const { data, isLoading, refetch } = api.crm.getLeadById.useQuery(
    { id: id ?? "" },
    {
      enabled: !!id && isAllowed,
      refetchOnWindowFocus: false,
    },
  );

  const lead = data;

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={lead ? lead.company : "Detail Lead CRM"}
        description="Lihat profil lead, opportunity, customer terkait, dan histori aktivitas."
        primaryAction={{ label: "Muat Ulang", onClick: () => void refetch() }}
        secondaryAction={{ label: "Kembali ke CRM", href: "/crm" }}
      />

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Memuat detail lead...
        </div>
      ) : !lead ? (
        <div className="rounded-lg border bg-white">
          <EmptyState
            icon="🎯"
            title="Lead tidak ditemukan"
            description="Lead CRM ini tidak tersedia pada tenant aktif atau sudah dihapus."
            action={{ label: "Kembali ke CRM", href: "/crm" }}
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Stage" value={lead.stage} helper="Posisi lead saat ini" />
            <SummaryCard label="Value" value={formatCurrency(Number(lead.value ?? 0))} helper="Nilai opportunity" />
            <SummaryCard label="Probability" value={`${lead.probability}%`} helper="Kemungkinan closing" />
            <SummaryCard label="Aktivitas" value={String(lead.activities.length)} helper="Aktivitas follow-up lead ini" />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Panel title="Informasi Lead" description="Profil dan owner lead CRM">
              <InfoRow label="Company" value={lead.company} />
              <InfoRow label="PIC" value={lead.name} />
              <InfoRow label="Email" value={lead.email} />
              <InfoRow label="Telepon" value={lead.phone ?? "-"} />
              <InfoRow label="Owner" value={lead.ownerName} />
              <InfoRow label="Source" value={SOURCE_LABELS[lead.source] ?? lead.source} />
              <InfoRow label="Target Close" value={lead.expectedCloseDate ? formatDate(lead.expectedCloseDate) : "-"} />
              <InfoRow label="Aktivitas Terakhir" value={lead.lastActivityAt ? formatRelativeTime(lead.lastActivityAt) : "-"} />
            </Panel>

            <Panel title="Status Opportunity" description="Stage dan tingkat prioritas">
              <div className="flex flex-wrap gap-2">
                <Badge variant={STAGE_VARIANT[lead.stage] ?? "default"}>{lead.stage}</Badge>
                <Badge variant={PRIORITY_VARIANT[lead.priority] ?? "default"}>{lead.priority}</Badge>
              </div>
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                {lead.notes ?? "Belum ada catatan untuk lead ini."}
              </div>
            </Panel>

            <Panel title="Customer Terkait" description="Lead dapat dikaitkan ke customer eksisting">
              {lead.customer ? (
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="font-semibold text-gray-900">{lead.customer.company}</p>
                  <Link href={`/crm/customers/${lead.customer.id}`} className="mt-2 inline-block text-sm font-medium text-blue-600 hover:text-blue-700">
                    Lihat detail customer
                  </Link>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                  Lead ini belum terhubung ke customer.
                </div>
              )}
            </Panel>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Aktivitas Lead</h2>
              <p className="text-sm text-gray-500">Riwayat follow-up dan engagement yang terkait</p>
            </div>
            {lead.activities.length === 0 ? (
              <EmptyState icon="🗓️" title="Belum ada aktivitas" description="Belum ada aktivitas yang tercatat untuk lead ini." />
            ) : (
              <div className="space-y-3 p-5">
                {lead.activities.map((activity) => (
                  <div key={activity.id} className="rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900">{activity.title}</p>
                        <p className="mt-1 text-sm text-gray-500">{activity.description ?? "-"}</p>
                      </div>
                      <Badge variant={activity.completedAt ? "success" : "info"}>
                        {activity.completedAt ? "Completed" : "Open"}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 text-sm text-gray-600">
                      <InfoChip label="Type" value={activity.type} />
                      <InfoChip label="Owner" value={activity.ownerName} />
                      <InfoChip label="Scheduled" value={formatDate(activity.scheduledAt)} />
                      <InfoChip label="Customer" value={activity.customer?.company ?? "-"} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-2 text-xs text-gray-500">{helper}</p>
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-sm text-gray-700">{value}</p>
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
