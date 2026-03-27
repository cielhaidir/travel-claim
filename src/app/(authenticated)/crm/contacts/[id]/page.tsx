"use client";

import Link from "next/link";
import { Eye } from "lucide-react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { EmptyState } from "@/components/features/EmptyState";
import { PageHeader } from "@/components/features/PageHeader";
import { CrmActionIconLink, CrmInfoRow, CrmMetricCard, CrmPanel } from "@/components/features/crm/shared";
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
        title={data?.name ?? "Detail Kontak"}
        description="Data master kontak dan riwayat peluang terkait."
        primaryAction={{ label: "Muat Ulang", onClick: () => void refetch() }}
        secondaryAction={{ label: "Kembali ke Kontak", href: "/crm/contacts" }}
      />

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Memuat detail kontak...
        </div>
      ) : !data ? (
        <div className="rounded-lg border bg-white">
          <EmptyState
            title="Kontak tidak ditemukan"
            description="Kontak CRM ini tidak tersedia."
            action={{ label: "Kembali ke Kontak", href: "/crm/contacts" }}
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <CrmMetricCard label="Peluang" value={String(data.deals.length)} />
            <CrmMetricCard label="Kontak Utama" value={data.isPrimary ? "Ya" : "Tidak"} />
            <CrmMetricCard label="Terakhir Diubah" value={formatDate(data.updatedAt)} />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <CrmPanel title="Data Kontak">
              <CrmInfoRow label="Nama Depan" value={data.firstName ?? "-"} />
              <CrmInfoRow label="Nama Belakang" value={data.lastName ?? "-"} />
              <CrmInfoRow label="Email" value={data.email ?? "-"} />
              <CrmInfoRow label="Telepon Seluler" value={data.phone ?? "-"} />
              <CrmInfoRow label="Jenis Kelamin" value={getCrmLabel(data.gender)} />
              <CrmInfoRow label="Jabatan" value={data.designation ?? "-"} />
              <CrmInfoRow label="Alamat" value={data.address ?? "-"} />
            </CrmPanel>

            <CrmPanel title="Organisasi">
              {data.customer ? (
                <>
                  <CrmInfoRow label="Organisasi" value={data.customer.company} />
                  <CrmActionIconLink href={`/crm/organizations/${data.customer.id}`} label="Lihat organisasi" tone="primary">
                    <Eye className="h-4 w-4" />
                  </CrmActionIconLink>
                </>
              ) : (
                <p className="text-sm text-gray-500">Belum ada organisasi yang tertaut.</p>
              )}
            </CrmPanel>

            <CrmPanel title="Catatan">
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                {data.notes ?? "Belum ada catatan untuk kontak ini."}
              </div>
            </CrmPanel>
          </div>

          <CrmPanel title="Peluang Terkait" description="Peluang yang sudah ditangani bersama kontak ini.">
            {data.deals.length ? (
              data.deals.map((deal) => (
                <div key={deal.id} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">{deal.title}</p>
                      <p className="mt-1 text-sm text-gray-500">{getCrmLabel(deal.status)}</p>
                    </div>
                    <CrmActionIconLink href={`/crm/deals/${deal.id}`} label="Lihat peluang" tone="primary">
                      <Eye className="h-4 w-4" />
                    </CrmActionIconLink>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">Belum ada peluang yang terhubung ke kontak ini.</p>
            )}
          </CrmPanel>
        </>
      )}
    </div>
  );
}
