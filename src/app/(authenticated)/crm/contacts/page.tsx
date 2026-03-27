"use client";

import { useState } from "react";
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
import { CRM_GENDER_OPTIONS, getCrmLabel } from "@/lib/constants/crm";
import { formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";

type ContactFormState = {
  customerId: string;
  firstName: string;
  lastName: string;
  email: string;
  mobilePhone: string;
  gender: string;
  designation: string;
  address: string;
  isPrimary: boolean;
  notes: string;
};

const initialFormState: ContactFormState = {
  customerId: "",
  firstName: "",
  lastName: "",
  email: "",
  mobilePhone: "",
  gender: "",
  designation: "",
  address: "",
  isPrimary: false,
  notes: "",
};

type GenderValue = (typeof CRM_GENDER_OPTIONS)[number];

export default function CrmContactsPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const isAllowed = session?.user ? userHasPermission(session.user, "crm", "read") : false;

  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<ContactFormState>(initialFormState);

  const utils = api.useUtils();
  const { data, isLoading } = api.crm.listContacts.useQuery(
    { search: search || undefined },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );
  const { data: options } = api.crm.formOptions.useQuery(undefined, {
    enabled: isAllowed,
    refetchOnWindowFocus: false,
  });

  const createMutation = api.crm.createContact.useMutation({
    onSuccess: async () => {
      await utils.crm.listContacts.invalidate();
      await utils.crm.dashboard.invalidate();
    },
  });
  const updateMutation = api.crm.updateContact.useMutation({
    onSuccess: async () => {
      await utils.crm.listContacts.invalidate();
      await utils.crm.dashboard.invalidate();
    },
  });
  const deleteMutation = api.crm.deleteContact.useMutation({
    onSuccess: async () => {
      await utils.crm.listContacts.invalidate();
      await utils.crm.dashboard.invalidate();
    },
  });

  const contacts = data ?? [];

  function openCreateModal() {
    setEditingId(null);
    setForm(initialFormState);
    setIsModalOpen(true);
  }

  function openEditModal(contact: (typeof contacts)[number]) {
    setEditingId(contact.id);
    setForm({
      customerId: contact.customerId,
      firstName: contact.firstName ?? "",
      lastName: contact.lastName ?? "",
      email: contact.email ?? "",
      mobilePhone: contact.phone ?? "",
      gender: contact.gender ?? "",
      designation: contact.designation ?? "",
      address: contact.address ?? "",
      isPrimary: contact.isPrimary,
      notes: contact.notes ?? "",
    });
    setIsModalOpen(true);
  }

  async function handleSubmit() {
    const payload = {
      customerId: form.customerId,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim() || null,
      mobilePhone: form.mobilePhone.trim() || null,
      gender: (form.gender || null) as GenderValue | null,
      designation: form.designation.trim() || null,
      address: form.address.trim() || null,
      isPrimary: form.isPrimary,
      notes: form.notes.trim() || null,
    };

    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, ...payload });
        showToast({ title: "Kontak diperbarui", message: "Data master kontak berhasil disimpan.", variant: "success" });
      } else {
        await createMutation.mutateAsync(payload);
        showToast({ title: "Kontak ditambahkan", message: "Data master kontak berhasil ditambahkan.", variant: "success" });
      }

      setIsModalOpen(false);
      setForm(initialFormState);
      setEditingId(null);
    } catch (error) {
      showToast({
        title: "Gagal menyimpan kontak",
        message: error instanceof Error ? error.message : "Terjadi kesalahan tak terduga",
        variant: "error",
      });
    }
  }

  async function handleDelete() {
    if (!deleteId) return;

    try {
      await deleteMutation.mutateAsync({ id: deleteId });
      showToast({ title: "Kontak dihapus", message: "Data master kontak berhasil dihapus.", variant: "success" });
      setDeleteId(null);
    } catch (error) {
      showToast({
        title: "Gagal menghapus kontak",
        message: error instanceof Error ? error.message : "Terjadi kesalahan tak terduga",
        variant: "error",
      });
    }
  }

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kontak CRM"
        description="Data master kontak yang digunakan pada organisasi dan peluang."
        primaryAction={{ label: "Tambah Kontak", onClick: openCreateModal }}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <CrmMetricCard label="Kontak" value={String(contacts.length)} />
        <CrmMetricCard label="Kontak Utama" value={String(contacts.filter((item) => item.isPrimary).length)} />
        <CrmMetricCard label="Peluang Terkait" value={String(contacts.reduce((sum, item) => sum + item.deals.length, 0))} />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari kontak, email, telepon, jabatan, atau organisasi"
          className={crmInputClassName}
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Kontak</h2>
          <p className="text-sm text-gray-500">{contacts.length} data</p>
        </div>

        {isLoading ? (
          <div className="p-5 text-sm text-gray-500">Memuat kontak...</div>
        ) : contacts.length === 0 ? (
          <div className="p-5">
            <CrmEmptyHint text="Belum ada kontak." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Kontak</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Seluler</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Jenis Kelamin</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Perusahaan</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Jabatan</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Terakhir Diubah</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{contact.name}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {contact.isPrimary ? <Badge variant="success">Utama</Badge> : null}
                        <Badge variant="warning">{contact.deals.length} peluang</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{contact.email ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-600">{contact.phone ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-600">{getCrmLabel(contact.gender)}</td>
                    <td className="px-4 py-3 text-gray-600">{contact.customer?.company ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-600">{contact.designation ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(contact.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <CrmActionIconLink href={`/crm/contacts/${contact.id}`} label="Lihat detail kontak" tone="primary">
                          <Eye className="h-4 w-4" />
                        </CrmActionIconLink>
                        <CrmActionIconButton label="Ubah kontak" onClick={() => openEditModal(contact)}>
                          <Pencil className="h-4 w-4" />
                        </CrmActionIconButton>
                        <CrmActionIconButton label="Hapus kontak" tone="danger" onClick={() => setDeleteId(contact.id)}>
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
        title={editingId ? "Ubah Kontak" : "Tambah Kontak"}
        size="xl"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-gray-700">Organisasi</span>
            <select
              value={form.customerId}
              onChange={(event) => setForm((current) => ({ ...current, customerId: event.target.value }))}
              className={crmInputClassName}
            >
              <option value="">Pilih organisasi</option>
              {options?.organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.company}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Nama Depan</span>
            <input
              value={form.firstName}
              onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))}
              className={crmInputClassName}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Nama Belakang</span>
            <input
              value={form.lastName}
              onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))}
              className={crmInputClassName}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Alamat Email</span>
            <input
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              className={crmInputClassName}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Telepon Seluler</span>
            <input
              value={form.mobilePhone}
              onChange={(event) => setForm((current) => ({ ...current, mobilePhone: event.target.value }))}
              className={crmInputClassName}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Jenis Kelamin</span>
            <select
              value={form.gender}
              onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value }))}
              className={crmInputClassName}
            >
              <option value="">Pilih jenis kelamin</option>
              {CRM_GENDER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {getCrmLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Jabatan</span>
            <input
              value={form.designation}
              onChange={(event) => setForm((current) => ({ ...current, designation: event.target.value }))}
              className={crmInputClassName}
            />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-gray-700">Alamat</span>
            <textarea
              value={form.address}
              onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
              className={crmTextareaClassName}
            />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-gray-700">Catatan</span>
            <textarea
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              className={crmTextareaClassName}
            />
          </label>
          <label className="flex items-center gap-3 md:col-span-2">
            <input
              type="checkbox"
              checked={form.isPrimary}
              onChange={(event) => setForm((current) => ({ ...current, isPrimary: event.target.checked }))}
            />
            <span className="text-sm text-gray-700">Tandai sebagai kontak utama</span>
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
            Batal
          </Button>
          <Button onClick={() => void handleSubmit()} isLoading={createMutation.isPending || updateMutation.isPending}>
            {editingId ? "Simpan Perubahan" : "Tambah Kontak"}
          </Button>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => void handleDelete()}
        title="Hapus Kontak"
        message="Kontak ini akan dihapus dari data master CRM aktif."
        confirmLabel="Hapus"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
