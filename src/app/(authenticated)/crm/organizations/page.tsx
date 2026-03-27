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
  CrmEmptyHint,
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
        showToast({ title: "Organization updated", message: "Organization master data has been saved.", variant: "success" });
      } else {
        await createMutation.mutateAsync(payload);
        showToast({ title: "Organization created", message: "Organization master data has been added.", variant: "success" });
      }

      setIsModalOpen(false);
      setForm(initialFormState);
      setEditingId(null);
    } catch (error) {
      showToast({
        title: "Failed to save organization",
        message: error instanceof Error ? error.message : "Unexpected error",
        variant: "error",
      });
    }
  }

  async function handleDelete() {
    if (!deleteId) return;

    try {
      await deleteMutation.mutateAsync({ id: deleteId });
      showToast({ title: "Organization deleted", message: "Organization master data has been removed.", variant: "success" });
      setDeleteId(null);
    } catch (error) {
      showToast({
        title: "Failed to delete organization",
        message: error instanceof Error ? error.message : "Unexpected error",
        variant: "error",
      });
    }
  }

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM Organizations"
        description="Master data organizations used across CRM leads, deals, and contacts."
        primaryAction={{ label: "Add Organization", onClick: openCreateModal }}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <CrmMetricCard label="Organizations" value={String(organizations.length)} />
        <CrmMetricCard label="Contacts" value={String(organizations.reduce((sum, item) => sum + item.contacts.length, 0))} />
        <CrmMetricCard label="Annual Revenue" value={formatCurrency(totalRevenue)} />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search organization, website, or notes"
          className={crmInputClassName}
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Organizations</h2>
          <p className="text-sm text-gray-500">{organizations.length} records</p>
        </div>

        {isLoading ? (
          <div className="p-5 text-sm text-gray-500">Loading organizations...</div>
        ) : organizations.length === 0 ? (
          <div className="p-5">
            <CrmEmptyHint text="No organizations available." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Organization</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Website</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Revenue</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Employees</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Industry</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Last Modified</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {organizations.map((organization) => (
                  <tr key={organization.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{organization.company}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="info">{organization.contacts.length} contacts</Badge>
                        <Badge variant="warning">{organization.deals.length} deals</Badge>
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
                        <Link href={`/crm/organizations/${organization.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-700">
                          Detail
                        </Link>
                        <button
                          type="button"
                          onClick={() => openEditModal(organization)}
                          className="text-sm font-medium text-gray-700 hover:text-gray-900"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteId(organization.id)}
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
        title={editingId ? "Edit Organization" : "Create Organization"}
        size="lg"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Organization Name</span>
            <input
              value={form.company}
              onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))}
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
            <span className="text-sm font-medium text-gray-700">Annual Revenue</span>
            <input
              type="number"
              value={form.annualRevenue}
              onChange={(event) => setForm((current) => ({ ...current, annualRevenue: event.target.value }))}
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
          <label className="space-y-2 md:col-span-2">
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
            {editingId ? "Save Changes" : "Create Organization"}
          </Button>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => void handleDelete()}
        title="Delete Organization"
        message="This organization will be removed from the active CRM master data."
        confirmLabel="Delete"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
