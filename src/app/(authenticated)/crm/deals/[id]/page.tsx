"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Eye } from "lucide-react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
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
  CrmActionIconLink,
  CrmInfoRow,
  CrmMetricCard,
  CrmPanel,
  CrmTabs,
} from "@/components/features/crm/shared";
import { userHasPermission } from "@/lib/auth/role-check";
import { CRM_DEAL_STATUS_OPTIONS, getCrmBadgeVariant, getCrmLabel } from "@/lib/constants/crm";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";

type DealTab = "activity" | "data" | "tasks" | "notes" | "attachments";
type DealStatusValue = (typeof CRM_DEAL_STATUS_OPTIONS)[number];

export default function CrmDealDetailPage() {
  const params = useParams();
  const { data: session } = useSession();
  const { showToast } = useToast();
  const rawId = params?.id;
  const id = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : undefined;
  const isAllowed = session?.user ? userHasPermission(session.user, "crm", "read") : false;
  const [activeTab, setActiveTab] = useState<DealTab>("activity");
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement | null>(null);

  const utils = api.useUtils();
  const { data, isLoading, refetch } = api.crm.getDealById.useQuery(
    { id: id ?? "" },
    { enabled: !!id && isAllowed, refetchOnWindowFocus: false },
  );
  const { data: options } = api.crm.formOptions.useQuery(undefined, {
    enabled: isAllowed,
    refetchOnWindowFocus: false,
  });
  const updateStatusMutation = api.crm.updateDealStatus.useMutation({
    onSuccess: async () => {
      await utils.crm.getDealById.invalidate({ id: id ?? "" });
      await utils.crm.listDeals.invalidate();
      await utils.crm.dashboard.invalidate();
    },
  });

  useEffect(() => {
    if (!isStatusMenuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!statusMenuRef.current?.contains(event.target as Node)) {
        setIsStatusMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsStatusMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isStatusMenuOpen]);

  async function handleStatusChange(status: DealStatusValue) {
    if (!data) return;

    if (status === data.status) {
      setIsStatusMenuOpen(false);
      return;
    }

    try {
      await updateStatusMutation.mutateAsync({
        id: data.id,
        status,
        lostReason: status === "LOST" ? data.lostReason : null,
      });
      showToast({
        title: "Status peluang diperbarui",
        message: `Status peluang diubah menjadi ${getCrmLabel(status)}.`,
        variant: "success",
      });
      setIsStatusMenuOpen(false);
    } catch (error) {
      showToast({
        title: "Gagal memperbarui status peluang",
        message: error instanceof Error ? error.message : "Terjadi kesalahan tak terduga",
        variant: "error",
      });
    }
  }

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={data?.title ?? "Detail Peluang"}
        description="Halaman detail peluang dengan log aktivitas, data, tugas, catatan, dan lampiran."
        primaryAction={{ label: "Muat Ulang", onClick: () => void refetch() }}
        secondaryAction={{ label: "Kembali ke Peluang", href: "/crm/deals" }}
      />

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Memuat detail peluang...
        </div>
      ) : !data ? (
        <div className="rounded-lg border bg-white">
          <EmptyState
            title="Peluang tidak ditemukan"
            description="Peluang CRM ini tidak tersedia."
            action={{ label: "Kembali ke Peluang", href: "/crm/deals" }}
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
            <CrmMetricCard label="Tugas" value={String(data.tasks.length)} />
          </div>

          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
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
            <div ref={statusMenuRef} className="relative">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={isStatusMenuOpen}
                onClick={() => setIsStatusMenuOpen((current) => !current)}
                disabled={updateStatusMutation.isPending}
                className="flex min-w-56 flex-col items-start gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Status Peluang</span>
                <span className="flex w-full items-center justify-between gap-3">
                  <Badge variant={getCrmBadgeVariant(data.status)}>{getCrmLabel(data.status)}</Badge>
                  <ChevronDown
                    className={`h-4 w-4 text-gray-500 transition-transform ${isStatusMenuOpen ? "rotate-180" : ""}`}
                  />
                </span>
              </button>

              {isStatusMenuOpen ? (
                <div className="absolute right-0 z-10 mt-2 w-64 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
                  {CRM_DEAL_STATUS_OPTIONS.map((option) => {
                    const isActive = option === data.status;

                    return (
                      <button
                        key={option}
                        type="button"
                        role="menuitem"
                        onClick={() => void handleStatusChange(option)}
                        disabled={updateStatusMutation.isPending}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                          isActive
                            ? "bg-blue-50 font-semibold text-blue-700"
                            : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <span>{getCrmLabel(option)}</span>
                        {isActive ? <Check className="h-4 w-4" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>

          {activeTab === "data" ? (
            <div className="grid gap-6 xl:grid-cols-3">
              <CrmPanel title="Data Peluang">
                <CrmInfoRow label="Judul Peluang" value={data.title} />
                <CrmInfoRow
                  label="Status"
                  value={<Badge variant={getCrmBadgeVariant(data.status)}>{getCrmLabel(data.status)}</Badge>}
                />
                <CrmInfoRow label="Pemilik Peluang" value={data.ownerName} />
                <CrmInfoRow label="Perkiraan Tanggal Penutupan" value={data.expectedCloseDate ? formatDate(data.expectedCloseDate) : "-"} />
                <CrmInfoRow label="Terakhir Diubah" value={formatDate(data.updatedAt)} />
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

              <CrmPanel title="Ringkasan Kontak">
                <CrmInfoRow label="Nama Depan" value={data.firstName ?? "-"} />
                <CrmInfoRow label="Nama Belakang" value={data.lastName ?? "-"} />
                <CrmInfoRow label="Email Utama" value={data.primaryEmail ?? "-"} />
                <CrmInfoRow label="No. Seluler Utama" value={data.primaryMobileNo ?? "-"} />
                <CrmInfoRow label="Jenis Kelamin" value={getCrmLabel(data.gender)} />
                {data.contact ? (
                  <CrmActionIconLink href={`/crm/contacts/${data.contact.id}`} label="Lihat kontak tertaut" tone="primary">
                    <Eye className="h-4 w-4" />
                  </CrmActionIconLink>
                ) : null}
              </CrmPanel>

              <CrmPanel title="Catatan Tambahan" className="xl:col-span-3">
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                  {data.notes ?? "Belum ada catatan tambahan untuk peluang ini."}
                </div>
                {data.lostReason ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    Alasan kalah: {data.lostReason}
                  </div>
                ) : null}
                {data.lead ? (
                  <CrmActionIconLink href={`/crm/leads/${data.lead.id}`} label="Lihat prospek sumber" tone="primary">
                    <Eye className="h-4 w-4" />
                  </CrmActionIconLink>
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
