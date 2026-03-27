"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { crmInputClassName } from "@/components/features/crm/shared";

type LeadConversionTarget = {
  id: string;
  company: string;
  name: string;
  customerId?: string | null;
};

type OrganizationOption = {
  id: string;
  company: string;
};

type ContactOption = {
  id: string;
  name: string;
  customerId: string;
  customer: {
    company: string | null;
  } | null;
};

type LeadConversionPayload = {
  id: string;
  existingOrganization: boolean;
  customerId: string | null;
  existingContact: boolean;
  contactId: string | null;
};

const initialFormState = {
  existingOrganization: false,
  customerId: "",
  existingContact: false,
  contactId: "",
};

export function CrmLeadConvertModal({
  isOpen,
  onClose,
  lead,
  organizations,
  contacts,
  isSubmitting,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  lead: LeadConversionTarget | null;
  organizations: OrganizationOption[];
  contacts: ContactOption[];
  isSubmitting?: boolean;
  onSubmit: (payload: LeadConversionPayload) => Promise<void>;
}) {
  const [form, setForm] = useState(initialFormState);

  useEffect(() => {
    if (!lead || !isOpen) return;

    setForm({
      existingOrganization: !!lead.customerId,
      customerId: lead.customerId ?? "",
      existingContact: false,
      contactId: "",
    });
  }, [isOpen, lead]);

  const filteredContacts = useMemo(() => {
    if (!form.existingContact) return [];
    if (form.existingOrganization && form.customerId) {
      return contacts.filter((contact) => contact.customerId === form.customerId);
    }

    return contacts;
  }, [contacts, form.customerId, form.existingContact, form.existingOrganization]);

  const selectedContact = useMemo(
    () => contacts.find((contact) => contact.id === form.contactId) ?? null,
    [contacts, form.contactId],
  );

  useEffect(() => {
    if (!form.existingContact || !form.contactId) return;

    const exists = filteredContacts.some((contact) => contact.id === form.contactId);
    if (!exists) {
      setForm((current) => ({ ...current, contactId: "" }));
    }
  }, [filteredContacts, form.contactId, form.existingContact]);

  const isSubmitDisabled =
    !lead ||
    (form.existingOrganization && !form.customerId) ||
    (form.existingContact && !form.contactId);

  async function handleSubmit() {
    if (!lead) return;

    await onSubmit({
      id: lead.id,
      existingOrganization: form.existingOrganization,
      customerId: form.existingOrganization ? form.customerId || null : null,
      existingContact: form.existingContact,
      contactId: form.existingContact ? form.contactId || null : null,
    });
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Konversi Prospek ke Peluang" size="lg">
      {lead ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Prospek</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{lead.name}</p>
            <p className="text-sm text-gray-600">{lead.company}</p>
          </div>

          <div className="rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-900">Organisasi</p>
            <div className="mt-3 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  checked={form.existingOrganization}
                  onChange={() =>
                    setForm((current) => ({
                      ...current,
                      existingOrganization: true,
                      customerId: current.customerId || lead.customerId || "",
                    }))
                  }
                />
                Gunakan organisasi yang sudah ada
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  checked={!form.existingOrganization}
                  onChange={() =>
                    setForm((current) => ({
                      ...current,
                      existingOrganization: false,
                      customerId: "",
                    }))
                  }
                />
                Buat organisasi baru dari prospek
              </label>
            </div>

            {form.existingOrganization ? (
              <label className="mt-4 block space-y-2">
                <span className="text-sm font-medium text-gray-700">Pilih Organisasi</span>
                <select
                  value={form.customerId}
                  onChange={(event) => setForm((current) => ({ ...current, customerId: event.target.value }))}
                  className={crmInputClassName}
                >
                  <option value="">Pilih organisasi</option>
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.company}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="mt-4 text-sm text-gray-500">Organisasi baru akan dibuat dari nama perusahaan pada prospek ini.</p>
            )}
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
                Gunakan kontak yang sudah ada
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  checked={!form.existingContact}
                  onChange={() =>
                    setForm((current) => ({
                      ...current,
                      existingContact: false,
                      contactId: "",
                    }))
                  }
                />
                Buat kontak baru dari prospek
              </label>
            </div>

            {form.existingContact ? (
              <label className="mt-4 block space-y-2">
                <span className="text-sm font-medium text-gray-700">Pilih Kontak</span>
                <select
                  value={form.contactId}
                  onChange={(event) => setForm((current) => ({ ...current, contactId: event.target.value }))}
                  className={crmInputClassName}
                >
                  <option value="">Pilih kontak</option>
                  {filteredContacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.name}
                      {contact.customer?.company ? ` - ${contact.customer.company}` : ""}
                    </option>
                  ))}
                </select>
                {!filteredContacts.length ? (
                  <p className="text-xs text-orange-600">Belum ada kontak yang cocok dengan pilihan organisasi saat ini.</p>
                ) : null}
                {!form.existingOrganization && selectedContact?.customer?.company ? (
                  <p className="text-xs text-gray-500">
                    Organisasi pada peluang akan mengikuti kontak terpilih: {selectedContact.customer.company}
                  </p>
                ) : null}
              </label>
            ) : (
              <p className="mt-4 text-sm text-gray-500">Kontak baru akan dibuat dari nama dan email prospek ini.</p>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button onClick={() => void handleSubmit()} isLoading={isSubmitting} disabled={isSubmitDisabled}>
              Konversi ke Peluang
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
