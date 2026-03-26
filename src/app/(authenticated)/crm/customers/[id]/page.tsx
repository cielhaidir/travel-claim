"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/features/PageHeader";
import { EmptyState } from "@/components/features/EmptyState";
import { userHasPermission } from "@/lib/auth/role-check";
import { formatCurrency, formatDate, formatRelativeTime } from "@/lib/utils/format";
import { api } from "@/trpc/react";

const SEGMENT_LABELS: Record<string, string> = {
  ENTERPRISE: "Enterprise",
  SMB: "SMB",
  GOVERNMENT: "Government",
  EDUCATION: "Education",
};

const STATUS_VARIANT: Record<string, "default" | "success" | "warning"> = {
  ACTIVE: "success",
  INACTIVE: "default",
  VIP: "warning",
};

const LEAD_STAGE_VARIANT: Record<string, "default" | "info" | "warning" | "success" | "danger"> = {
  NEW: "default",
  QUALIFIED: "info",
  PROPOSAL: "warning",
  NEGOTIATION: "warning",
  WON: "success",
  LOST: "danger",
};

export default function CrmCustomerDetailPage() {
  const params = useParams();
  const { data: session } = useSession();
  const rawId = params?.id;
  const id = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : undefined;

  const isAllowed = session?.user ? userHasPermission(session.user, "crm", "read") : false;

  const { data, isLoading, refetch } = api.crm.getCustomerById.useQuery(
    { id: id ?? "" },
    {
      enabled: !!id && isAllowed,
      refetchOnWindowFocus: false,
    },
  );

  const customer = data;

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={customer ? customer.company : "Detail Customer CRM"}
        description="Lihat profil customer, lead terkait, dan histori aktivitas CRM."
        primaryAction={{ label: "Muat Ulang", onClick: () => void refetch() }}
        secondaryAction={{ label: "Kembali ke CRM", href: "/crm" }}
      />

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Memuat detail customer...
        </div>
      ) : !customer ? (
        <div className="rounded-lg border bg-white">
          <EmptyState
            icon="🏢"
            title="Customer tidak ditemukan"
            description="Customer CRM ini tidak tersedia pada tenant aktif atau sudah dihapus."
            action={{ label: "Kembali ke CRM", href: "/crm" }}
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Status" value={customer.status} helper="Status relasi customer" />
            <SummaryCard label="Segment" value={SEGMENT_LABELS[customer.segment] ?? customer.segment} helper="Segment customer" />
            <SummaryCard label="Total Value" value={formatCurrency(Number(customer.totalValue ?? 0))} helper="Total nilai relasi" />
            <SummaryCard label="Jumlah Lead" value={String(customer.leads.length)} helper="Lead terkait customer ini" />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Panel title="Informasi Customer" description="Data utama customer CRM">
              <InfoRow label="Company" value={customer.company} />
              <InfoRow label="PIC" value={customer.name} />
              <InfoRow label="Email" value={customer.email} />
              <InfoRow label="Telepon" value={customer.phone ?? "-"} />
              <InfoRow label="Kota" value={customer.city ?? "-"} />
              <InfoRow label="Owner" value={customer.ownerName} />
              <InfoRow label="Kontak Terakhir" value={customer.lastContactAt ? formatRelativeTime(customer.lastContactAt) : "-"} />
              <div className="pt-2">
                <Badge variant={STATUS_VARIANT[customer.status] ?? "default"}>{customer.status}</Badge>
              </div>
            </Panel>

            <Panel title="Catatan" description="Insight dan konteks hubungan customer">
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                {customer.notes ?? "Belum ada catatan untuk customer ini."}
              </div>
            </Panel>

            <Panel title="Ringkasan Aktivitas" description="Overview aktivitas follow-up customer">
              <MiniMetric label="Aktivitas Tercatat" value={String(customer.activities.length)} />
              <MiniMetric
                label="Aktivitas Selesai"
                value={String(customer.activities.filter((item) => item.completedAt).length)}
                tone="green"
              />
            </Panel>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Lead Terkait</h2>
              <p className="text-sm text-gray-500">Seluruh lead yang terhubung ke customer ini</p>
            </div>
            {customer.leads.length === 0 ? (
              <EmptyState icon="🎯" title="Belum ada lead terkait" description="Customer ini belum memiliki lead yang terhubung." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Lead</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Stage</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Owner</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Value</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {customer.leads.map((lead) => (
                      <tr key={lead.id}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{lead.company}</p>
                          <p className="text-xs text-gray-500">{lead.name}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={LEAD_STAGE_VARIANT[lead.stage] ?? "default"}>{lead.stage}</Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{lead.ownerName}</td>
                        <td className="px-4 py-3 text-gray-600">{formatCurrency(Number(lead.value ?? 0))}</td>
                        <td className="px-4 py-3">
                          <Link href={`/crm/leads/${lead.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-700">
                            Lihat detail
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Aktivitas Customer</h2>
              <p className="text-sm text-gray-500">Riwayat follow-up dan aktivitas operasional</p>
            </div>
            {customer.activities.length === 0 ? (
              <EmptyState icon="🗓️" title="Belum ada aktivitas" description="Belum ada aktivitas yang tercatat untuk customer ini." />
            ) : (
              <div className="space-y-3 p-5">
                {customer.activities.map((activity) => (
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
                      <InfoChip label="Lead" value={activity.lead?.company ?? "-"} />
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

function MiniMetric({ label, value, tone = "blue" }: { label: string; value: string; tone?: "blue" | "green" }) {
  return (
    <div className={`rounded-lg p-4 ${tone === "green" ? "bg-green-50" : "bg-blue-50"}`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}
