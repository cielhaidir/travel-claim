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
  CrmEmptyHint,
  CrmActionIconButton,
  CrmActionIconLink,
  crmInputClassName,
  CrmMetricCard,
  crmTextareaClassName,
} from "@/components/features/crm/shared";
import { userHasPermission } from "@/lib/auth/role-check";
import {
  CRM_EMPLOYEE_RANGE_OPTIONS,
  CRM_INDUSTRY_OPTIONS,
  getCrmLabel,
} from "@/lib/constants/crm";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";

type OrganizationFormState = {
  company: string;
  website: string;
  annualRevenue: string;
  employeeCount: string;
  industry: string;
  notes: string;
};

const initialFormState: OrganizationFormState = {
  company: "",
  website: "",
  annualRevenue: "",
  employeeCount: "",
  industry: "",
  notes: "",
};

type EmployeeRangeValue = (typeof CRM_EMPLOYEE_RANGE_OPTIONS)[number];
type IndustryValue = (typeof CRM_INDUSTRY_OPTIONS)[number];

export default function CrmOrganizationsPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const isAllowed = session?.user ? userHasPermission(session.user, "crm", "read") : false;

  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<OrganizationFormState>(initialFormState);

  const utils = api.useUtils();
  const { data, isLoading } = api.crm.listOrganizations.useQuery(
    { search: search || undefined },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );
  const createMutation = api.crm.createOrganization.useMutation({
    onSuccess: async () => {
      await utils.crm.listOrganizations.invalidate();
      await utils.crm.dashboard.invalidate();
    },
  });
  const updateMutation = api.crm.updateOrganization.useMutation({
    onSuccess: async () => {
      await utils.crm.listOrganizations.invalidate();
      await utils.crm.dashboard.invalidate();
    },
  });
  const deleteMutation = api.crm.deleteOrganization.useMutation({
    onSuccess: async () => {
      await utils.crm.listOrganizations.invalidate();
      await utils.crm.dashboard.invalidate();
    },
  });

  const organizations = data ?? [];
  const totalRevenue = useMemo(
    () => organizations.reduce((sum, organization) => sum + Number(organization.annualRevenue ?? 0), 0),
    [organizations],
  );

  function openCreateModal() {
    setEditingId(null);
    setForm(initialFormState);
    setIsModalOpen(true);
  }

  function openEditModal(organization: (typeof organizations)[number]) {
    setEditingId(organization.id);
    setForm({
      company: organization.company ?? "",
      website: organization.website ?? "",
      annualRevenue: organization.annualRevenue ? String(Number(organization.annualRevenue)) : "",
      employeeCount: organization.employeeCount ?? "",
      industry: organization.industry ?? "",
      notes: organization.notes ?? "",
    });
    setIsModalOpen(true);
  }

  async function handleSubmit() {
    const payload = {
      company: form.company.trim(),
      website: form.website.trim() || null,
      annualRevenue: form.annualRevenue ? Number(form.annualRevenue) : null,
      employeeCount: (form.employeeCount || null) as EmployeeRangeValue | null,
      industry: (form.industry || null) as IndustryValue | null,
      notes: form.notes.trim() || null,
    };

    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, ...payload });
        showToast({ title: "Organisasi diperbarui", message: "Data master organisasi berhasil disimpan.", variant: "success" });
      } else {
        await createMutation.mutateAsync(payload);
        showToast({ title: "Organisasi ditambahkan", message: "Data master organisasi berhasil ditambahkan.", variant: "success" });
      }

      setIsModalOpen(false);
      setForm(initialFormState);
      setEditingId(null);
    } catch (error) {
      showToast({
        title: "Gagal menyimpan organisasi",
        message: error instanceof Error ? error.message : "Terjadi kesalahan tak terduga",
        variant: "error",
      });
    }
  }

  async function handleDelete() {
    if (!deleteId) return;

    try {
      await deleteMutation.mutateAsync({ id: deleteId });
      showToast({ title: "Organisasi dihapus", message: "Data master organisasi berhasil dihapus.", variant: "success" });
      setDeleteId(null);
    } catch (error) {
      showToast({
        title: "Gagal menghapus organisasi",
        message: error instanceof Error ? error.message : "Terjadi kesalahan tak terduga",
        variant: "error",
      });
    }
  }

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organisasi CRM"
        description="Data master organisasi yang digunakan pada prospek, peluang, dan kontak CRM."
        primaryAction={{ label: "Tambah Organisasi", onClick: openCreateModal }}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <CrmMetricCard label="Organisasi" value={String(organizations.length)} />
        <CrmMetricCard label="Kontak" value={String(organizations.reduce((sum, item) => sum + item.contacts.length, 0))} />
        <CrmMetricCard label="Pendapatan Tahunan" value={formatCurrency(totalRevenue)} />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari organisasi, situs web, atau catatan"
          className={crmInputClassName}
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Organisasi</h2>
          <p className="text-sm text-gray-500">{organizations.length} data</p>
        </div>

        {isLoading ? (
          <div className="p-5 text-sm text-gray-500">Memuat organisasi...</div>
        ) : organizations.length === 0 ? (
          <div className="p-5">
            <CrmEmptyHint text="Belum ada organisasi." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Organisasi</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Situs Web</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Pendapatan</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Jumlah Karyawan</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Industri</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Terakhir Diubah</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {organizations.map((organization) => (
                  <tr key={organization.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{organization.company}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="info">{organization.contacts.length} kontak</Badge>
                        <Badge variant="warning">{organization.deals.length} peluang</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{organization.website ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {organization.annualRevenue ? formatCurrency(Number(organization.annualRevenue)) : "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{getCrmLabel(organization.employeeCount)}</td>
                    <td className="px-4 py-3 text-gray-600">{getCrmLabel(organization.industry)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(organization.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <CrmActionIconLink href={`/crm/organizations/${organization.id}`} label="Lihat detail organisasi" tone="primary">
                          <Eye className="h-4 w-4" />
                        </CrmActionIconLink>
                        <CrmActionIconButton label="Ubah organisasi" onClick={() => openEditModal(organization)}>
                          <Pencil className="h-4 w-4" />
                        </CrmActionIconButton>
                        <CrmActionIconButton label="Hapus organisasi" tone="danger" onClick={() => setDeleteId(organization.id)}>
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

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? "Ubah Organisasi" : "Tambah Organisasi"}
        size="lg"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Nama Organisasi</span>
            <input
              value={form.company}
              onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))}
              className={crmInputClassName}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Situs Web</span>
            <input
              value={form.website}
              onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))}
              className={crmInputClassName}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Pendapatan Tahunan</span>
            <input
              type="number"
              value={form.annualRevenue}
              onChange={(event) => setForm((current) => ({ ...current, annualRevenue: event.target.value }))}
              className={crmInputClassName}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Jumlah Karyawan</span>
            <select
              value={form.employeeCount}
              onChange={(event) => setForm((current) => ({ ...current, employeeCount: event.target.value }))}
              className={crmInputClassName}
            >
              <option value="">Pilih rentang karyawan</option>
              {CRM_EMPLOYEE_RANGE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {getCrmLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-gray-700">Industri</span>
            <select
              value={form.industry}
              onChange={(event) => setForm((current) => ({ ...current, industry: event.target.value }))}
              className={crmInputClassName}
            >
              <option value="">Pilih industri</option>
              {CRM_INDUSTRY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {getCrmLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-gray-700">Catatan</span>
            <textarea
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              className={crmTextareaClassName}
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
            Batal
          </Button>
          <Button onClick={() => void handleSubmit()} isLoading={createMutation.isPending || updateMutation.isPending}>
            {editingId ? "Simpan Perubahan" : "Tambah Organisasi"}
          </Button>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => void handleDelete()}
        title="Hapus Organisasi"
        message="Organisasi ini akan dihapus dari data master CRM aktif."
        confirmLabel="Hapus"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
