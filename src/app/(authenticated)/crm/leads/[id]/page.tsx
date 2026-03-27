"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/features/EmptyState";
import { PageHeader } from "@/components/features/PageHeader";
import { CrmLeadConvertModal } from "@/components/features/crm/lead-convert-modal";
import {
  CrmActivitySection,
  CrmAttachmentsSection,
  CrmNotesSection,
  CrmTasksSection,
} from "@/components/features/crm/detail-managers";
import {
  CrmActionIconLink,
  CrmInfoRow,
  CrmMetricCard,
  CrmPanel,
  CrmTabs,
} from "@/components/features/crm/shared";
import { userHasPermission } from "@/lib/auth/role-check";
import {
  canConvertLeadStatus,
  getCrmBadgeVariant,
  getCrmLabel,
  getLeadConversionBlockedReason,
} from "@/lib/constants/crm";
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
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);

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
  const canConvert = data ? canConvertLeadStatus(data.status) : false;
  const convertBlockedReason = data ? getLeadConversionBlockedReason(data.status) : null;

  async function handleConvert(input: {
    id: string;
    existingOrganization: boolean;
    customerId: string | null;
    existingContact: boolean;
    contactId: string | null;
  }) {

    try {
      await convertMutation.mutateAsync(input);
      showToast({ title: "Peluang dibuat dari prospek", message: "Prospek berhasil dikonversi menjadi peluang.", variant: "success" });
      setIsConvertModalOpen(false);
    } catch (error) {
      showToast({
        title: "Gagal mengonversi prospek",
        message: error instanceof Error ? error.message : "Terjadi kesalahan tak terduga",
        variant: "error",
      });
    }
  }

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={data ? `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() || data.company : "Detail Prospek"}
        description="Halaman detail prospek dengan log aktivitas, data, tugas, catatan, dan lampiran."
        primaryAction={{ label: "Muat Ulang", onClick: () => void refetch() }}
        secondaryAction={{ label: "Kembali ke Prospek", href: "/crm/leads" }}
      />

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Memuat detail prospek...
        </div>
      ) : !data ? (
        <div className="rounded-lg border bg-white">
          <EmptyState
            title="Prospek tidak ditemukan"
            description="Prospek CRM ini tidak tersedia."
            action={{ label: "Kembali ke Prospek", href: "/crm/leads" }}
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <CrmMetricCard label="Status" value={getCrmLabel(data.status)} />
            <CrmMetricCard label="Organisasi" value={data.company} />
            <CrmMetricCard
              label="Pendapatan Tahunan"
              value={data.annualRevenue ? formatCurrency(Number(data.annualRevenue)) : "-"}
            />
            <CrmMetricCard label="Peluang" value={String(data.deals.length)} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <CrmTabs
              value={activeTab}
              onChange={setActiveTab}
              items={[
                { id: "activity", label: "Log Aktivitas", count: data.activities.length },
                { id: "data", label: "Data" },
                { id: "tasks", label: "Tugas", count: data.tasks.length },
                { id: "notes", label: "Catatan", count: data.notesList.length },
                { id: "attachments", label: "Lampiran", count: data.attachments.length },
              ]}
            />
            {data.status !== "CONVERTED" ? (
              <div className="flex max-w-sm flex-col items-end gap-2">
                <Button
                  onClick={() => setIsConvertModalOpen(true)}
                  isLoading={convertMutation.isPending}
                  disabled={!canConvert}
                  title={convertBlockedReason ?? "Buat peluang dari prospek"}
                >
                  Buat Peluang
                </Button>
                {!canConvert && convertBlockedReason ? (
                  <p className="text-right text-xs text-gray-500">{convertBlockedReason}</p>
                ) : null}
              </div>
            ) : null}
          </div>

          {activeTab === "data" ? (
            <div className="grid gap-6 xl:grid-cols-3">
              <CrmPanel title="Data Prospek">
                <CrmInfoRow label="Nama Depan" value={data.firstName ?? "-"} />
                <CrmInfoRow label="Nama Belakang" value={data.lastName ?? "-"} />
                <CrmInfoRow label="Email" value={data.email} />
                <CrmInfoRow label="No. Seluler" value={data.mobileNo ?? "-"} />
                <CrmInfoRow label="Jenis Kelamin" value={getCrmLabel(data.gender)} />
                <CrmInfoRow
                  label="Status"
                  value={<Badge variant={getCrmBadgeVariant(data.status)}>{getCrmLabel(data.status)}</Badge>}
                />
                <CrmInfoRow label="Pemilik Prospek" value={data.ownerName} />
              </CrmPanel>

              <CrmPanel title="Ringkasan Organisasi">
                <CrmInfoRow label="Organisasi" value={data.company} />
                <CrmInfoRow label="Situs Web" value={data.website ?? "-"} />
                <CrmInfoRow label="Jumlah Karyawan" value={getCrmLabel(data.employeeCount)} />
                <CrmInfoRow
                  label="Pendapatan Tahunan"
                  value={data.annualRevenue ? formatCurrency(Number(data.annualRevenue)) : "-"}
                />
                <CrmInfoRow label="Industri" value={getCrmLabel(data.industry)} />
                {data.customer ? (
                  <CrmActionIconLink href={`/crm/organizations/${data.customer.id}`} label="Lihat organisasi tertaut" tone="primary">
                    <Eye className="h-4 w-4" />
                  </CrmActionIconLink>
                ) : null}
              </CrmPanel>

              <CrmPanel title="Informasi Tambahan">
                <CrmInfoRow label="Perkiraan Tanggal Penutupan" value={data.expectedCloseDate ? formatDate(data.expectedCloseDate) : "-"} />
                <CrmInfoRow label="Terakhir Diubah" value={formatDate(data.updatedAt)} />
                <CrmInfoRow label="Dikonversi Menjadi Peluang" value={data.convertedToDealAt ? formatDate(data.convertedToDealAt) : "-"} />
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                  {data.notes ?? "Belum ada catatan prospek pada bagian data."}
                </div>
              </CrmPanel>

              <CrmPanel title="Peluang Terkait" description="Peluang yang dibuat dari prospek ini." className="xl:col-span-3">
                {data.deals.length ? (
                  <div className="grid gap-3 xl:grid-cols-2">
                    {data.deals.map((deal) => (
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
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Belum ada peluang yang dibuat dari prospek ini.</p>
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

          <CrmLeadConvertModal
            isOpen={isConvertModalOpen}
            onClose={() => setIsConvertModalOpen(false)}
            lead={{
              id: data.id,
              company: data.company,
              name: data.name,
              customerId: data.customerId,
            }}
            organizations={options?.organizations ?? []}
            contacts={options?.contacts ?? []}
            isSubmitting={convertMutation.isPending}
            onSubmit={handleConvert}
          />
        </>
      )}
    </div>
  );
}
