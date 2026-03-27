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
import {
  CRM_EMPLOYEE_RANGE_OPTIONS,
  CRM_GENDER_OPTIONS,
  CRM_INDUSTRY_OPTIONS,
  CRM_LEAD_STATUS_OPTIONS,
  getCrmBadgeVariant,
  getCrmLabel,
} from "@/lib/constants/crm";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";

type LeadFormState = {
  customerId: string;
  firstName: string;
  lastName: string;
  email: string;
  mobileNo: string;
  gender: string;
  organizationName: string;
  website: string;
  employeeCount: string;
  annualRevenue: string;
  industry: string;
  status: string;
  ownerId: string;
  expectedCloseDate: string;
  notes: string;
};

const initialFormState: LeadFormState = {
  customerId: "",
  firstName: "",
  lastName: "",
  email: "",
  mobileNo: "",
  gender: "",
  organizationName: "",
  website: "",
  employeeCount: "",
  annualRevenue: "",
  industry: "",
  status: "NEW",
  ownerId: "",
  expectedCloseDate: "",
  notes: "",
};

type LeadStatusValue = (typeof CRM_LEAD_STATUS_OPTIONS)[number];
type GenderValue = (typeof CRM_GENDER_OPTIONS)[number];
type EmployeeRangeValue = (typeof CRM_EMPLOYEE_RANGE_OPTIONS)[number];
type IndustryValue = (typeof CRM_INDUSTRY_OPTIONS)[number];

export default function CrmLeadsPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const isAllowed = session?.user ? userHasPermission(session.user, "crm", "read") : false;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<LeadFormState>(initialFormState);

  const utils = api.useUtils();
  const { data, isLoading } = api.crm.listLeads.useQuery(
    {
      search: search || undefined,
      status: (statusFilter || undefined) as LeadStatusValue | undefined,
    },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );
  const { data: options } = api.crm.formOptions.useQuery(undefined, {
    enabled: isAllowed,
    refetchOnWindowFocus: false,
  });

  const createMutation = api.crm.createLead.useMutation({
    onSuccess: async () => {
      await utils.crm.listLeads.invalidate();
      await utils.crm.dashboard.invalidate();
    },
  });
  const updateMutation = api.crm.updateLead.useMutation({
    onSuccess: async () => {
      await utils.crm.listLeads.invalidate();
      await utils.crm.dashboard.invalidate();
    },
  });
  const deleteMutation = api.crm.deleteLead.useMutation({
    onSuccess: async () => {
      await utils.crm.listLeads.invalidate();
      await utils.crm.dashboard.invalidate();
    },
  });
  const convertMutation = api.crm.createDealFromLead.useMutation({
    onSuccess: async () => {
      await utils.crm.listLeads.invalidate();
      await utils.crm.listDeals.invalidate();
      await utils.crm.dashboard.invalidate();
    },
  });

  const leads = data ?? [];

  function fillOrganization(customerId: string) {
    const organization = options?.organizations.find((item) => item.id === customerId);
    if (!organization) return;

    setForm((current) => ({
      ...current,
      customerId,
      organizationName: organization.company,
    }));
  }

  function openCreateModal() {
    setEditingId(null);
    setForm(initialFormState);
    setIsModalOpen(true);
  }

  function openEditModal(lead: (typeof leads)[number]) {
    setEditingId(lead.id);
    setForm({
      customerId: lead.customerId ?? "",
      firstName: lead.firstName ?? "",
      lastName: lead.lastName ?? "",
      email: lead.email,
      mobileNo: lead.mobileNo ?? "",
      gender: lead.gender ?? "",
      organizationName: lead.company ?? "",
      website: lead.website ?? "",
      employeeCount: lead.employeeCount ?? "",
      annualRevenue: lead.annualRevenue ? String(Number(lead.annualRevenue)) : "",
      industry: lead.industry ?? "",
      status: lead.status,
      ownerId: lead.ownerId ?? "",
      expectedCloseDate: lead.expectedCloseDate
        ? new Date(lead.expectedCloseDate).toISOString().slice(0, 10)
        : "",
      notes: lead.notes ?? "",
    });
    setIsModalOpen(true);
  }

  async function handleSubmit() {
    const payload = {
      customerId: form.customerId || null,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      mobileNo: form.mobileNo.trim() || null,
      gender: (form.gender || null) as GenderValue | null,
      organizationName: form.organizationName.trim(),
      website: form.website.trim() || null,
      employeeCount: (form.employeeCount || null) as EmployeeRangeValue | null,
      annualRevenue: form.annualRevenue ? Number(form.annualRevenue) : null,
      industry: (form.industry || null) as IndustryValue | null,
      status: form.status as LeadStatusValue,
      ownerId: form.ownerId || null,
      expectedCloseDate: form.expectedCloseDate || null,
      notes: form.notes.trim() || null,
    };

    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, ...payload });
        showToast({ title: "Lead updated", message: "Lead data has been saved.", variant: "success" });
      } else {
        await createMutation.mutateAsync(payload);
        showToast({ title: "Lead created", message: "Lead has been added to CRM.", variant: "success" });
      }

      setIsModalOpen(false);
      setForm(initialFormState);
      setEditingId(null);
    } catch (error) {
      showToast({
        title: "Failed to save lead",
        message: error instanceof Error ? error.message : "Unexpected error",
        variant: "error",
      });
    }
  }

  async function handleDelete() {
    if (!deleteId) return;

    try {
      await deleteMutation.mutateAsync({ id: deleteId });
      showToast({ title: "Lead deleted", message: "Lead has been removed from CRM.", variant: "success" });
      setDeleteId(null);
    } catch (error) {
      showToast({
        title: "Failed to delete lead",
        message: error instanceof Error ? error.message : "Unexpected error",
        variant: "error",
      });
    }
  }

  async function handleConvert(leadId: string) {
    try {
      await convertMutation.mutateAsync({ id: leadId });
      showToast({ title: "Deal created from lead", message: "The lead has been converted into a deal.", variant: "success" });
    } catch (error) {
      showToast({
        title: "Failed to convert lead",
        message: error instanceof Error ? error.message : "Unexpected error",
        variant: "error",
      });
    }
  }

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM Leads"
        description="Lead management with detail tabs for activity, data, tasks, notes, and attachments."
        primaryAction={{ label: "Add Lead", onClick: openCreateModal }}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <CrmMetricCard label="Leads" value={String(leads.length)} />
        <CrmMetricCard label="Qualified" value={String(leads.filter((lead) => lead.status === "QUALIFIED").length)} />
        <CrmMetricCard
          label="Annual Revenue"
          value={formatCurrency(leads.reduce((sum, lead) => sum + Number(lead.annualRevenue ?? 0), 0))}
        />
      </div>

      <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, email, mobile, organization, or owner"
          className={crmInputClassName}
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className={crmInputClassName}
        >
          <option value="">All statuses</option>
          {CRM_LEAD_STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {getCrmLabel(option)}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Leads</h2>
          <p className="text-sm text-gray-500">{leads.length} records</p>
        </div>

        {isLoading ? (
          <div className="p-5 text-sm text-gray-500">Loading leads...</div>
        ) : leads.length === 0 ? (
          <div className="p-5">
            <CrmEmptyHint text="No leads available." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">First Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Last Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Mobile</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Gender</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Organization</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Lead Owner</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Last Modified</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td className="px-4 py-3 text-gray-700">{lead.firstName ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-700">{lead.lastName ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-700">{lead.email}</td>
                    <td className="px-4 py-3 text-gray-700">{lead.mobileNo ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-700">{getCrmLabel(lead.gender)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{lead.company}</p>
                      <p className="text-xs text-gray-500">{lead.customer?.company ?? "Manual organization"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={getCrmBadgeVariant(lead.status)}>{getCrmLabel(lead.status)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{lead.ownerName}</td>
                    <td className="px-4 py-3 text-gray-700">{formatDate(lead.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/crm/leads/${lead.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-700">
                          Detail
                        </Link>
                        <button
                          type="button"
                          onClick={() => openEditModal(lead)}
                          className="text-sm font-medium text-gray-700 hover:text-gray-900"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteId(lead.id)}
                          className="text-sm font-medium text-red-600 hover:text-red-700"
                        >
                          Delete
                        </button>
                        {lead.status !== "CONVERTED" ? (
                          <button
                            type="button"
                            onClick={() => void handleConvert(lead.id)}
                            className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
                          >
                            Create Deal
                          </button>
                        ) : null}
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
        title={editingId ? "Edit Lead" : "Create Lead"}
        size="xl"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-gray-700">Linked Organization</span>
            <select
              value={form.customerId}
              onChange={(event) => fillOrganization(event.target.value)}
              className={crmInputClassName}
            >
              <option value="">Manual organization</option>
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
            <span className="text-sm font-medium text-gray-700">Email</span>
            <input
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              className={crmInputClassName}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Mobile No.</span>
            <input
              value={form.mobileNo}
              onChange={(event) => setForm((current) => ({ ...current, mobileNo: event.target.value }))}
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
            <span className="text-sm font-medium text-gray-700">Organization</span>
            <input
              value={form.organizationName}
              onChange={(event) => setForm((current) => ({ ...current, organizationName: event.target.value }))}
              className={crmInputClassName}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Website</span>
            <input
              value={form.website}
              onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))}
              className={crmInputClassName}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">No. of Employees</span>
            <select
              value={form.employeeCount}
              onChange={(event) => setForm((current) => ({ ...current, employeeCount: event.target.value }))}
              className={crmInputClassName}
            >
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
            <input
              type="number"
              value={form.annualRevenue}
              onChange={(event) => setForm((current) => ({ ...current, annualRevenue: event.target.value }))}
              className={crmInputClassName}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Industry</span>
            <select
              value={form.industry}
              onChange={(event) => setForm((current) => ({ ...current, industry: event.target.value }))}
              className={crmInputClassName}
            >
              <option value="">Select industry</option>
              {CRM_INDUSTRY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {getCrmLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Status</span>
            <select
              value={form.status}
              onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
              className={crmInputClassName}
            >
              {CRM_LEAD_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {getCrmLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Lead Owner</span>
            <select
              value={form.ownerId}
              onChange={(event) => setForm((current) => ({ ...current, ownerId: event.target.value }))}
              className={crmInputClassName}
            >
              <option value="">Select owner</option>
              {options?.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name ?? user.email ?? user.id}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-gray-700">Expected Close Date</span>
            <input
              type="date"
              value={form.expectedCloseDate}
              onChange={(event) => setForm((current) => ({ ...current, expectedCloseDate: event.target.value }))}
              className={crmInputClassName}
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
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} isLoading={createMutation.isPending || updateMutation.isPending}>
            {editingId ? "Save Changes" : "Create Lead"}
          </Button>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => void handleDelete()}
        title="Delete Lead"
        message="This lead will be removed from the active CRM list."
        confirmLabel="Delete"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
