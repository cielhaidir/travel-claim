"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmModal, Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/features/PageHeader";
import {
  crmInputClassName,
  CrmActionIconButton,
  CrmActionIconLink,
  CrmEmptyHint,
  CrmMetricCard,
  crmTextareaClassName,
} from "@/components/features/crm/shared";
import { userHasPermission } from "@/lib/auth/role-check";
import {
  CRM_DEAL_STATUS_OPTIONS,
  CRM_EMPLOYEE_RANGE_OPTIONS,
  CRM_GENDER_OPTIONS,
  CRM_INDUSTRY_OPTIONS,
  getCrmBadgeVariant,
  getCrmLabel,
} from "@/lib/constants/crm";
import { formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";

type DealFormState = {
  existingOrganization: boolean;
  customerId: string;
  organizationName: string;
  website: string;
  employeeCount: string;
  annualRevenue: string;
  industry: string;
  existingContact: boolean;
  contactId: string;
  firstName: string;
  lastName: string;
  primaryEmail: string;
  primaryMobileNo: string;
  gender: string;
  title: string;
  status: string;
  ownerId: string;
  expectedCloseDate: string;
  lostReason: string;
  notes: string;
};

const initialFormState: DealFormState = {
  existingOrganization: false,
  customerId: "",
  organizationName: "",
  website: "",
  employeeCount: "",
  annualRevenue: "",
  industry: "",
  existingContact: false,
  contactId: "",
  firstName: "",
  lastName: "",
  primaryEmail: "",
  primaryMobileNo: "",
  gender: "",
  title: "",
  status: "QUALIFICATION",
  ownerId: "",
  expectedCloseDate: "",
  lostReason: "",
  notes: "",
};

type DealStatusValue = (typeof CRM_DEAL_STATUS_OPTIONS)[number];
type GenderValue = (typeof CRM_GENDER_OPTIONS)[number];
type EmployeeRangeValue = (typeof CRM_EMPLOYEE_RANGE_OPTIONS)[number];
type IndustryValue = (typeof CRM_INDUSTRY_OPTIONS)[number];

export default function CrmDealsPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const isAllowed = session?.user ? userHasPermission(session.user, "crm", "read") : false;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<DealFormState>(initialFormState);

  const utils = api.useUtils();
  const { data, isLoading } = api.crm.listDeals.useQuery(
    {
      search: search || undefined,
      status: (statusFilter || undefined) as DealStatusValue | undefined,
    },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );
  const { data: options } = api.crm.formOptions.useQuery(undefined, {
    enabled: isAllowed,
    refetchOnWindowFocus: false,
  });

  const createMutation = api.crm.createDeal.useMutation({
    onSuccess: async () => {
      await utils.crm.listDeals.invalidate();
      await utils.crm.dashboard.invalidate();
    },
  });
  const updateMutation = api.crm.updateDeal.useMutation({
    onSuccess: async () => {
      await utils.crm.listDeals.invalidate();
      await utils.crm.dashboard.invalidate();
    },
  });
  const deleteMutation = api.crm.deleteDeal.useMutation({
    onSuccess: async () => {
      await utils.crm.listDeals.invalidate();
      await utils.crm.dashboard.invalidate();
    },
  });

  const deals = data ?? [];
  const filteredContacts = useMemo(() => {
    if (!form.customerId) return options?.contacts ?? [];
    return (options?.contacts ?? []).filter((contact) => contact.customerId === form.customerId);
  }, [form.customerId, options?.contacts]);

  function fillOrganization(customerId: string) {
    const organization = options?.organizations.find((item) => item.id === customerId);
    if (!organization) return;

    setForm((current) => ({
      ...current,
      customerId,
      organizationName: organization.company,
    }));
  }

  function fillContact(contactId: string) {
    setForm((current) => ({
      ...current,
      contactId,
    }));
  }

  function openCreateModal() {
    setEditingId(null);
    setForm(initialFormState);
    setIsModalOpen(true);
  }

  function openEditModal(deal: (typeof deals)[number]) {
    setEditingId(deal.id);
    setForm({
      existingOrganization: !!deal.customerId,
      customerId: deal.customerId ?? "",
      organizationName: deal.company ?? "",
      website: deal.website ?? "",
      employeeCount: deal.employeeCount ?? "",
      annualRevenue: deal.annualRevenue ? String(Number(deal.annualRevenue)) : "",
      industry: deal.industry ?? "",
      existingContact: !!deal.contactId,
      contactId: deal.contactId ?? "",
      firstName: deal.firstName ?? "",
      lastName: deal.lastName ?? "",
      primaryEmail: deal.primaryEmail ?? "",
      primaryMobileNo: deal.primaryMobileNo ?? "",
      gender: deal.gender ?? "",
      title: deal.title,
      status: deal.status,
      ownerId: deal.ownerId ?? "",
      expectedCloseDate: deal.expectedCloseDate ? new Date(deal.expectedCloseDate).toISOString().slice(0, 10) : "",
      lostReason: deal.lostReason ?? "",
      notes: deal.notes ?? "",
    });
    setIsModalOpen(true);
  }

  async function handleSubmit() {
    const payload = {
      leadId: null,
      existingOrganization: form.existingOrganization,
      customerId: form.existingOrganization ? form.customerId || null : null,
      organizationName: form.existingOrganization ? null : form.organizationName.trim(),
      website: form.website.trim() || null,
      employeeCount: (form.employeeCount || null) as EmployeeRangeValue | null,
      annualRevenue: form.annualRevenue ? Number(form.annualRevenue) : null,
      industry: (form.industry || null) as IndustryValue | null,
      existingContact: form.existingContact,
      contactId: form.existingContact ? form.contactId || null : null,
      firstName: form.existingContact ? null : form.firstName.trim(),
      lastName: form.existingContact ? null : form.lastName.trim(),
      primaryEmail: form.existingContact ? null : form.primaryEmail.trim() || null,
      primaryMobileNo: form.existingContact ? null : form.primaryMobileNo.trim() || null,
      gender: (form.existingContact ? null : form.gender || null) as GenderValue | null,
      title: form.title.trim() || null,
      status: form.status as DealStatusValue,
      ownerId: form.ownerId || null,
      expectedCloseDate: form.expectedCloseDate || null,
      lostReason: form.lostReason.trim() || null,
      notes: form.notes.trim() || null,
    };

    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, ...payload });
        showToast({ title: "Peluang diperbarui", message: "Data peluang berhasil disimpan.", variant: "success" });
      } else {
        await createMutation.mutateAsync(payload);
        showToast({ title: "Peluang ditambahkan", message: "Peluang berhasil ditambahkan ke CRM.", variant: "success" });
      }

      setIsModalOpen(false);
      setForm(initialFormState);
      setEditingId(null);
    } catch (error) {
      showToast({
        title: "Gagal menyimpan peluang",
        message: error instanceof Error ? error.message : "Terjadi kesalahan tak terduga",
        variant: "error",
      });
    }
  }

  async function handleDelete() {
    if (!deleteId) return;

    try {
      await deleteMutation.mutateAsync({ id: deleteId });
      showToast({ title: "Peluang dihapus", message: "Peluang berhasil dihapus dari CRM.", variant: "success" });
      setDeleteId(null);
    } catch (error) {
      showToast({
        title: "Gagal menghapus peluang",
        message: error instanceof Error ? error.message : "Terjadi kesalahan tak terduga",
        variant: "error",
      });
    }
  }

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Peluang CRM"
        description="Peluang dengan pilihan organisasi/kontak manual atau dari data master."
        primaryAction={{ label: "Tambah Peluang", onClick: openCreateModal }}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <CrmMetricCard label="Peluang" value={String(deals.length)} />
        <CrmMetricCard label="Peluang Menang" value={String(deals.filter((deal) => deal.status === "WON").length)} />
        <CrmMetricCard label="Peluang Kalah" value={String(deals.filter((deal) => deal.status === "LOST").length)} />
      </div>

      <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari judul, organisasi, kontak, email, atau pemilik peluang"
          className={crmInputClassName}
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className={crmInputClassName}
        >
          <option value="">Semua status</option>
          {CRM_DEAL_STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {getCrmLabel(option)}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Peluang</h2>
          <p className="text-sm text-gray-500">{deals.length} data</p>
        </div>

        {isLoading ? (
          <div className="p-5 text-sm text-gray-500">Memuat peluang...</div>
        ) : deals.length === 0 ? (
          <div className="p-5">
            <CrmEmptyHint text="Belum ada peluang." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Peluang</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Organisasi</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Kontak</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Pemilik Peluang</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Terakhir Diubah</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {deals.map((deal) => (
                  <tr key={deal.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{deal.title}</p>
                      <p className="text-xs text-gray-500">{deal.primaryEmail ?? "-"}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{deal.company}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {deal.contact?.name ?? (`${deal.firstName ?? ""} ${deal.lastName ?? ""}`.trim() || "-")}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={getCrmBadgeVariant(deal.status)}>{getCrmLabel(deal.status)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{deal.ownerName}</td>
                    <td className="px-4 py-3 text-gray-700">{formatDate(deal.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <CrmActionIconLink href={`/crm/deals/${deal.id}`} label="Lihat detail peluang" tone="primary">
                          <Eye className="h-4 w-4" />
                        </CrmActionIconLink>
                        <CrmActionIconButton label="Ubah peluang" onClick={() => openEditModal(deal)}>
                          <Pencil className="h-4 w-4" />
                        </CrmActionIconButton>
                        <CrmActionIconButton label="Hapus peluang" tone="danger" onClick={() => setDeleteId(deal.id)}>
                          <Trash2 className="h-4 w-4" />
                        </CrmActionIconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? "Ubah Peluang" : "Tambah Peluang"} size="xl">
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-900">Organisasi</p>
            <div className="mt-3 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  checked={form.existingOrganization}
                  onChange={() => setForm((current) => ({ ...current, existingOrganization: true }))}
                />
                Organisasi yang sudah ada
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  checked={!form.existingOrganization}
                  onChange={() => setForm((current) => ({ ...current, existingOrganization: false, customerId: "" }))}
                />
                Organisasi manual
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {form.existingOrganization ? (
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium text-gray-700">Organisasi</span>
                  <select value={form.customerId} onChange={(event) => fillOrganization(event.target.value)} className={crmInputClassName}>
                    <option value="">Pilih organisasi</option>
                    {options?.organizations.map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.company}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-medium text-gray-700">Nama Organisasi</span>
                    <input value={form.organizationName} onChange={(event) => setForm((current) => ({ ...current, organizationName: event.target.value }))} className={crmInputClassName} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-gray-700">Situs Web</span>
                    <input value={form.website} onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))} className={crmInputClassName} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-gray-700">Jumlah Karyawan</span>
                    <select value={form.employeeCount} onChange={(event) => setForm((current) => ({ ...current, employeeCount: event.target.value }))} className={crmInputClassName}>
                      <option value="">Pilih rentang karyawan</option>
                      {CRM_EMPLOYEE_RANGE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {getCrmLabel(option)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-gray-700">Pendapatan Tahunan</span>
                    <input type="number" value={form.annualRevenue} onChange={(event) => setForm((current) => ({ ...current, annualRevenue: event.target.value }))} className={crmInputClassName} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-gray-700">Industri</span>
                    <select value={form.industry} onChange={(event) => setForm((current) => ({ ...current, industry: event.target.value }))} className={crmInputClassName}>
                      <option value="">Pilih industri</option>
                      {CRM_INDUSTRY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {getCrmLabel(option)}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-900">Kontak</p>
            <div className="mt-3 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  checked={form.existingContact}
                  onChange={() => setForm((current) => ({ ...current, existingContact: true }))}
                />
                Kontak yang sudah ada
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  checked={!form.existingContact}
                  onChange={() => setForm((current) => ({ ...current, existingContact: false, contactId: "" }))}
                />
                Kontak manual
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {form.existingContact ? (
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium text-gray-700">Kontak</span>
                  <select value={form.contactId} onChange={(event) => fillContact(event.target.value)} className={crmInputClassName}>
                    <option value="">Pilih kontak</option>
                    {filteredContacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.name} {contact.customer?.company ? `- ${contact.customer.company}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-gray-700">Nama Depan</span>
                    <input value={form.firstName} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} className={crmInputClassName} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-gray-700">Nama Belakang</span>
                    <input value={form.lastName} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} className={crmInputClassName} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-gray-700">Email Utama</span>
                    <input value={form.primaryEmail} onChange={(event) => setForm((current) => ({ ...current, primaryEmail: event.target.value }))} className={crmInputClassName} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-gray-700">No. Seluler Utama</span>
                    <input value={form.primaryMobileNo} onChange={(event) => setForm((current) => ({ ...current, primaryMobileNo: event.target.value }))} className={crmInputClassName} />
                  </label>
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-medium text-gray-700">Jenis Kelamin</span>
                    <select value={form.gender} onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value }))} className={crmInputClassName}>
                      <option value="">Pilih jenis kelamin</option>
                      {CRM_GENDER_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {getCrmLabel(option)}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-gray-700">Judul Peluang</span>
              <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className={crmInputClassName} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-gray-700">Status</span>
              <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className={crmInputClassName}>
                {CRM_DEAL_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {getCrmLabel(option)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-gray-700">Pemilik Peluang</span>
              <select value={form.ownerId} onChange={(event) => setForm((current) => ({ ...current, ownerId: event.target.value }))} className={crmInputClassName}>
                <option value="">Pilih pemilik</option>
                {options?.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name ?? user.email ?? user.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-gray-700">Perkiraan Tanggal Penutupan</span>
              <input type="date" value={form.expectedCloseDate} onChange={(event) => setForm((current) => ({ ...current, expectedCloseDate: event.target.value }))} className={crmInputClassName} />
            </label>
            {form.status === "LOST" ? (
              <label className="space-y-2">
                <span className="text-sm font-medium text-gray-700">Alasan Kalah</span>
                <input value={form.lostReason} onChange={(event) => setForm((current) => ({ ...current, lostReason: event.target.value }))} className={crmInputClassName} />
              </label>
            ) : null}
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-gray-700">Catatan</span>
              <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className={crmTextareaClassName} />
            </label>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
            Batal
          </Button>
          <Button onClick={() => void handleSubmit()} isLoading={createMutation.isPending || updateMutation.isPending}>
            {editingId ? "Simpan Perubahan" : "Tambah Peluang"}
          </Button>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => void handleDelete()}
        title="Hapus Peluang"
        message="Peluang ini akan dihapus dari daftar CRM aktif."
        confirmLabel="Hapus"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
