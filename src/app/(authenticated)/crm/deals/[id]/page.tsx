"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/features/EmptyState";
import { PageHeader } from "@/components/features/PageHeader";
import { userHasPermission } from "@/lib/auth/role-check";
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

export default function CrmDealDetailPage() {
  const params = useParams();
  const { data: session } = useSession();
  const rawId = params?.id;
  const id = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : undefined;

  const isAllowed = session?.user ? userHasPermission(session.user, "crm", "read") : false;

  const { data: deal, isLoading, refetch } = api.crm.getDealById.useQuery(
    { id: id ?? "" },
    {
      enabled: !!id && isAllowed,
      refetchOnWindowFocus: false,
    },
  );

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={deal ? deal.dealTitle : "Detail Deal CRM"}
        description="Lihat opportunity, stage deal, relasi customer, dan aktivitas terkait."
        primaryAction={{ label: "Muat Ulang", onClick: () => void refetch() }}
        secondaryAction={{ label: "Kembali ke Deals", href: "/crm/deals" }}
      />

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Memuat detail deal...
        </div>
      ) : !deal ? (
        <div className="rounded-lg border bg-white">
          <EmptyState
            icon="💼"
            title="Deal tidak ditemukan"
            description="Deal CRM ini tidak tersedia pada tenant aktif atau sudah dihapus."
            action={{ label: "Kembali ke Deals", href: "/crm/deals" }}
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Deal Stage" value={deal.dealStage} helper="Tahapan opportunity saat ini" />
            <SummaryCard label="Deal Value" value={formatCurrency(Number(deal.dealValue ?? 0))} helper="Nilai transaksi potensial" />
            <SummaryCard label="Probability" value={`${deal.probability}%`} helper="Potensi closing" />
            <SummaryCard label="Activities" value={String(deal.activities.length)} helper="Aktivitas terkait deal" />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Panel title="Informasi Deal" description="Ringkasan utama opportunity CRM">
              <InfoRow label="Company" value={deal.company} />
              <InfoRow label="PIC" value={deal.name} />
              <InfoRow label="Owner" value={deal.ownerName} />
              <InfoRow label="Source" value={deal.source} />
              <InfoRow label="Target Close" value={deal.expectedCloseDate ? formatDate(deal.expectedCloseDate) : "-"} />
              <InfoRow label="Last Activity" value={deal.lastActivityAt ? formatRelativeTime(deal.lastActivityAt) : "-"} />
              <div className="pt-2">
                <Badge variant={STAGE_VARIANT[deal.dealStage] ?? "default"}>{deal.dealStage}</Badge>
              </div>
            </Panel>

            <Panel title="Customer Terkait" description="Relasi deal dengan customer existing">
              {deal.customer ? (
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="font-semibold text-gray-900">{deal.customer.company}</p>
                  <Link href={`/crm/customers/${deal.customer.id}`} className="mt-2 inline-block text-sm font-medium text-blue-600 hover:text-blue-700">
                    Lihat detail customer
                  </Link>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                  Deal ini belum terhubung ke customer.
                </div>
              )}
            </Panel>

            <Panel title="Catatan Opportunity" description="Konteks dan insight deal saat ini">
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                {deal.notes ?? "Belum ada catatan untuk deal ini."}
              </div>
            </Panel>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Aktivitas Deal</h2>
              <p className="text-sm text-gray-500">Riwayat follow-up dan engagement deal</p>
            </div>
            {deal.activities.length === 0 ? (
              <EmptyState icon="🗓️" title="Belum ada aktivitas" description="Belum ada aktivitas yang tercatat untuk deal ini." />
            ) : (
              <div className="space-y-3 p-5">
                {deal.activities.map((activity) => (
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
