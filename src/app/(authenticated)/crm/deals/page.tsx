"use client";

import { useMemo, useState } from "react";
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
        showToast({ title: "Deal updated", message: "Deal data has been saved.", variant: "success" });
      } else {
        await createMutation.mutateAsync(payload);
        showToast({ title: "Deal created", message: "Deal has been added to CRM.", variant: "success" });
      }

      setIsModalOpen(false);
      setForm(initialFormState);
      setEditingId(null);
    } catch (error) {
      showToast({
        title: "Failed to save deal",
        message: error instanceof Error ? error.message : "Unexpected error",
        variant: "error",
      });
    }
  }

  async function handleDelete() {
    if (!deleteId) return;

    try {
      await deleteMutation.mutateAsync({ id: deleteId });
      showToast({ title: "Deal deleted", message: "Deal has been removed from CRM.", variant: "success" });
      setDeleteId(null);
    } catch (error) {
      showToast({
        title: "Failed to delete deal",
        message: error instanceof Error ? error.message : "Unexpected error",
        variant: "error",
      });
    }
  }

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM Deals"
        description="Deals with manual or master-data organization/contact selection."
        primaryAction={{ label: "Add Deal", onClick: openCreateModal }}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <CrmMetricCard label="Deals" value={String(deals.length)} />
        <CrmMetricCard label="Won Deals" value={String(deals.filter((deal) => deal.status === "WON").length)} />
        <CrmMetricCard label="Lost Deals" value={String(deals.filter((deal) => deal.status === "LOST").length)} />
      </div>

      <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search title, organization, contact, email, or owner"
          className={crmInputClassName}
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className={crmInputClassName}
        >
          <option value="">All statuses</option>
          {CRM_DEAL_STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {getCrmLabel(option)}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Deals</h2>
          <p className="text-sm text-gray-500">{deals.length} records</p>
        </div>

        {isLoading ? (
          <div className="p-5 text-sm text-gray-500">Loading deals...</div>
        ) : deals.length === 0 ? (
          <div className="p-5">
            <CrmEmptyHint text="No deals available." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Deal</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Organization</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Deal Owner</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Last Modified</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
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
                        <Link href={`/crm/deals/${deal.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-700">
                          Detail
                        </Link>
                        <button
                          type="button"
                          onClick={() => openEditModal(deal)}
                          className="text-sm font-medium text-gray-700 hover:text-gray-900"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteId(deal.id)}
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

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? "Edit Deal" : "Create Deal"} size="xl">
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-900">Organization</p>
            <div className="mt-3 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  checked={form.existingOrganization}
                  onChange={() => setForm((current) => ({ ...current, existingOrganization: true }))}
                />
                Existing organization
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  checked={!form.existingOrganization}
                  onChange={() => setForm((current) => ({ ...current, existingOrganization: false, customerId: "" }))}
                />
                Manual organization
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {form.existingOrganization ? (
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium text-gray-700">Organization</span>
                  <select value={form.customerId} onChange={(event) => fillOrganization(event.target.value)} className={crmInputClassName}>
                    <option value="">Select organization</option>
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
                    <span className="text-sm font-medium text-gray-700">Organization Name</span>
                    <input value={form.organizationName} onChange={(event) => setForm((current) => ({ ...current, organizationName: event.target.value }))} className={crmInputClassName} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-gray-700">Website</span>
                    <input value={form.website} onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))} className={crmInputClassName} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-gray-700">No. of Employees</span>
                    <select value={form.employeeCount} onChange={(event) => setForm((current) => ({ ...current, employeeCount: event.target.value }))} className={crmInputClassName}>
                      <option value="">Select employee range</option>
                      {CRM_EMPLOYEE_RANGE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {getCrmLabel(option)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-gray-700">Annual Revenue</span>
                    <input type="number" value={form.annualRevenue} onChange={(event) => setForm((current) => ({ ...current, annualRevenue: event.target.value }))} className={crmInputClassName} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-gray-700">Industry</span>
                    <select value={form.industry} onChange={(event) => setForm((current) => ({ ...current, industry: event.target.value }))} className={crmInputClassName}>
                      <option value="">Select industry</option>
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
            <p className="text-sm font-semibold text-gray-900">Contact</p>
            <div className="mt-3 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  checked={form.existingContact}
                  onChange={() => setForm((current) => ({ ...current, existingContact: true }))}
                />
                Existing contact
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  checked={!form.existingContact}
                  onChange={() => setForm((current) => ({ ...current, existingContact: false, contactId: "" }))}
                />
                Manual contact
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {form.existingContact ? (
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium text-gray-700">Contact</span>
                  <select value={form.contactId} onChange={(event) => fillContact(event.target.value)} className={crmInputClassName}>
                    <option value="">Select contact</option>
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
                    <span className="text-sm font-medium text-gray-700">First Name</span>
                    <input value={form.firstName} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} className={crmInputClassName} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-gray-700">Last Name</span>
                    <input value={form.lastName} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} className={crmInputClassName} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-gray-700">Primary Email</span>
                    <input value={form.primaryEmail} onChange={(event) => setForm((current) => ({ ...current, primaryEmail: event.target.value }))} className={crmInputClassName} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-gray-700">Primary Mobile No.</span>
                    <input value={form.primaryMobileNo} onChange={(event) => setForm((current) => ({ ...current, primaryMobileNo: event.target.value }))} className={crmInputClassName} />
                  </label>
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-medium text-gray-700">Gender</span>
                    <select value={form.gender} onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value }))} className={crmInputClassName}>
                      <option value="">Select gender</option>
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
              <span className="text-sm font-medium text-gray-700">Deal Title</span>
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
              <span className="text-sm font-medium text-gray-700">Deal Owner</span>
              <select value={form.ownerId} onChange={(event) => setForm((current) => ({ ...current, ownerId: event.target.value }))} className={crmInputClassName}>
                <option value="">Select owner</option>
                {options?.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name ?? user.email ?? user.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-gray-700">Expected Close Date</span>
              <input type="date" value={form.expectedCloseDate} onChange={(event) => setForm((current) => ({ ...current, expectedCloseDate: event.target.value }))} className={crmInputClassName} />
            </label>
            {form.status === "LOST" ? (
              <label className="space-y-2">
                <span className="text-sm font-medium text-gray-700">Lost Reason</span>
                <input value={form.lostReason} onChange={(event) => setForm((current) => ({ ...current, lostReason: event.target.value }))} className={crmInputClassName} />
              </label>
            ) : null}
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-gray-700">Notes</span>
              <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className={crmTextareaClassName} />
            </label>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} isLoading={createMutation.isPending || updateMutation.isPending}>
            {editingId ? "Save Changes" : "Create Deal"}
          </Button>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => void handleDelete()}
        title="Delete Deal"
        message="This deal will be removed from the active CRM list."
        confirmLabel="Delete"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
