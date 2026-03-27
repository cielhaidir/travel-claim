"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmModal, Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/features/PageHeader";
import {
  crmInputClassName,
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
        showToast({ title: "Contact updated", message: "Contact master data has been saved.", variant: "success" });
      } else {
        await createMutation.mutateAsync(payload);
        showToast({ title: "Contact created", message: "Contact master data has been added.", variant: "success" });
      }

      setIsModalOpen(false);
      setForm(initialFormState);
      setEditingId(null);
    } catch (error) {
      showToast({
        title: "Failed to save contact",
        message: error instanceof Error ? error.message : "Unexpected error",
        variant: "error",
      });
    }
  }

  async function handleDelete() {
    if (!deleteId) return;

    try {
      await deleteMutation.mutateAsync({ id: deleteId });
      showToast({ title: "Contact deleted", message: "Contact master data has been removed.", variant: "success" });
      setDeleteId(null);
    } catch (error) {
      showToast({
        title: "Failed to delete contact",
        message: error instanceof Error ? error.message : "Unexpected error",
        variant: "error",
      });
    }
  }

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM Contacts"
        description="Master contacts used across organizations and deals."
        primaryAction={{ label: "Add Contact", onClick: openCreateModal }}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <CrmMetricCard label="Contacts" value={String(contacts.length)} />
        <CrmMetricCard label="Primary Contacts" value={String(contacts.filter((item) => item.isPrimary).length)} />
        <CrmMetricCard label="Linked Deals" value={String(contacts.reduce((sum, item) => sum + item.deals.length, 0))} />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search contact, email, phone, designation, or organization"
          className={crmInputClassName}
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Contacts</h2>
          <p className="text-sm text-gray-500">{contacts.length} records</p>
        </div>

        {isLoading ? (
          <div className="p-5 text-sm text-gray-500">Loading contacts...</div>
        ) : contacts.length === 0 ? (
          <div className="p-5">
            <CrmEmptyHint text="No contacts available." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Mobile</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Gender</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Company</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Designation</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Last Modified</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{contact.name}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {contact.isPrimary ? <Badge variant="success">Primary</Badge> : null}
                        <Badge variant="warning">{contact.deals.length} deals</Badge>
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
                        <Link href={`/crm/contacts/${contact.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-700">
                          Detail
                        </Link>
                        <button
                          type="button"
                          onClick={() => openEditModal(contact)}
                          className="text-sm font-medium text-gray-700 hover:text-gray-900"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteId(contact.id)}
                          className="text-sm font-medium text-red-600 hover:text-red-700"
                        >
                          Delete
                        </button>
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
        title={editingId ? "Edit Contact" : "Create Contact"}
        size="xl"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-gray-700">Organization</span>
            <select
              value={form.customerId}
              onChange={(event) => setForm((current) => ({ ...current, customerId: event.target.value }))}
              className={crmInputClassName}
            >
              <option value="">Select organization</option>
              {options?.organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.company}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">First Name</span>
            <input
              value={form.firstName}
              onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))}
              className={crmInputClassName}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Last Name</span>
            <input
              value={form.lastName}
              onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))}
              className={crmInputClassName}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Email Address</span>
            <input
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              className={crmInputClassName}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Mobile Phone</span>
            <input
              value={form.mobilePhone}
              onChange={(event) => setForm((current) => ({ ...current, mobilePhone: event.target.value }))}
              className={crmInputClassName}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Gender</span>
            <select
              value={form.gender}
              onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value }))}
              className={crmInputClassName}
            >
              <option value="">Select gender</option>
              {CRM_GENDER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {getCrmLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Designation</span>
            <input
              value={form.designation}
              onChange={(event) => setForm((current) => ({ ...current, designation: event.target.value }))}
              className={crmInputClassName}
            />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-gray-700">Address</span>
            <textarea
              value={form.address}
              onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
              className={crmTextareaClassName}
            />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-gray-700">Notes</span>
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
            <span className="text-sm text-gray-700">Mark as primary contact</span>
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} isLoading={createMutation.isPending || updateMutation.isPending}>
            {editingId ? "Save Changes" : "Create Contact"}
          </Button>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => void handleDelete()}
        title="Delete Contact"
        message="This contact will be removed from the active CRM master data."
        confirmLabel="Delete"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
