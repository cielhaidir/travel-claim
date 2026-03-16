"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { MembershipStatus, Role } from "../../../../../generated/prisma";
import { EmptyState } from "@/components/features/EmptyState";
import { PageHeader } from "@/components/features/PageHeader";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/trpc/react";

type TenantSummary = {
  id: string;
  slug: string;
  name: string;
  isRoot: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  membershipCount: number;
  activeMembershipCount: number;
  defaultMembershipCount: number;
  suspendedMembershipCount: number;
  invitedMembershipCount: number;
  stats: {
    departments: number;
    projects: number;
    travelRequests: number;
    claims: number;
    bailouts: number;
  };
};

type TenantMember = {
  id: string;
  userId: string;
  tenantId: string;
  role: Role;
  status: MembershipStatus;
  isDefault: boolean;
  invitedAt: string | Date | null;
  activatedAt: string | Date | null;
  suspendedAt: string | Date | null;
  createdAt: string | Date;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    employeeId: string | null;
    image: string | null;
    role: Role;
    deletedAt: string | Date | null;
  };
};

type TenantDetail = {
  id: string;
  slug: string;
  name: string;
  isRoot: boolean;
  memberships: TenantMember[];
};

type UserOption = {
  id: string;
  name: string | null;
  email: string | null;
  employeeId: string | null;
  role: Role;
};

const ROLE_OPTIONS: Role[] = [
  "ROOT",
  "ADMIN",
  "FINANCE",
  "DIRECTOR",
  "MANAGER",
  "SALES_CHIEF",
  "SUPERVISOR",
  "SALES_EMPLOYEE",
  "EMPLOYEE",
];

const STATUS_OPTIONS: MembershipStatus[] = ["ACTIVE", "INVITED", "SUSPENDED"];

const ROLE_LABELS: Record<Role, string> = {
  ROOT: "Root",
  EMPLOYEE: "Employee",
  SUPERVISOR: "Supervisor",
  MANAGER: "Manager",
  DIRECTOR: "Director",
  FINANCE: "Finance",
  ADMIN: "Admin",
  SALES_EMPLOYEE: "Sales Employee",
  SALES_CHIEF: "Sales Chief",
};

const STATUS_STYLES: Record<MembershipStatus, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  INVITED: "bg-amber-50 text-amber-700 ring-amber-200",
  SUSPENDED: "bg-rose-50 text-rose-700 ring-rose-200",
};

export default function MasterTenantPage() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const utils = api.useUtils();

  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isMembershipOpen, setIsMembershipOpen] = useState(false);
  const [membershipSearch, setMembershipSearch] = useState("");
  const [createForm, setCreateForm] = useState({ name: "", slug: "" });
  const [membershipForm, setMembershipForm] = useState<{
    userId: string;
    role: Role;
    status: MembershipStatus;
    isDefault: boolean;
  }>({
    userId: "",
    role: "EMPLOYEE",
    status: "ACTIVE",
    isDefault: false,
  });
  const [editingMembership, setEditingMembership] =
    useState<TenantMember | null>(null);
  const [formError, setFormError] = useState("");

  const userRole = session?.user.role ?? "EMPLOYEE";
  if (session && !session.user.isRoot && userRole !== "ROOT") {
    router.replace("/");
    return null;
  }

  const { data: tenantData, isLoading: isTenantsLoading } =
    api.tenant.getAll.useQuery(undefined, { refetchOnWindowFocus: false });
  const tenants = (tenantData as TenantSummary[] | undefined) ?? [];

  useEffect(() => {
    if (!selectedTenantId && tenants[0]) {
      setSelectedTenantId(tenants[0].id);
    }
    if (
      selectedTenantId &&
      tenants.length > 0 &&
      !tenants.some((tenant) => tenant.id === selectedTenantId)
    ) {
      setSelectedTenantId(tenants[0]?.id ?? "");
    }
  }, [selectedTenantId, tenants]);

  const selectedTenant = tenants.find(
    (tenant) => tenant.id === selectedTenantId,
  );

  const { data: tenantDetailData, isLoading: isDetailLoading } =
    api.tenant.getMembers.useQuery(
      { tenantId: selectedTenantId },
      {
        enabled: !!selectedTenantId,
        refetchOnWindowFocus: false,
      },
    );
  const tenantDetail = (tenantDetailData as TenantDetail | undefined) ?? null;

  const { data: usersData, isLoading: isUsersLoading } =
    api.user.getAll.useQuery(
      {
        search: membershipSearch || undefined,
        limit: 50,
      },
      {
        enabled: isMembershipOpen,
        refetchOnWindowFocus: false,
      },
    );
  const users = (
    (usersData as { users: UserOption[] } | undefined)?.users ?? []
  ).filter((user) => !user.email?.startsWith("deleted-"));

  const createMutation = api.tenant.create.useMutation({
    onSuccess: async (tenant) => {
      await utils.tenant.getAll.invalidate();
      setCreateForm({ name: "", slug: "" });
      setIsCreateOpen(false);
      setSelectedTenantId((tenant as { id: string }).id);
      setFormError("");
    },
    onError: (error) => setFormError(error.message),
  });

  const membershipMutation = api.tenant.upsertMembership.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.tenant.getAll.invalidate(),
        utils.tenant.getMembers.invalidate(),
        utils.user.getAll.invalidate(),
      ]);
      setIsMembershipOpen(false);
      setEditingMembership(null);
      setMembershipSearch("");
      setMembershipForm({
        userId: "",
        role: "EMPLOYEE",
        status: "ACTIVE",
        isDefault: false,
      });
      setFormError("");
    },
    onError: (error) => setFormError(error.message),
  });

  const totals = tenants.reduce(
    (acc, tenant) => {
      acc.memberships += tenant.membershipCount;
      acc.activeMemberships += tenant.activeMembershipCount;
      acc.suspendedMemberships += tenant.suspendedMembershipCount;
      return acc;
    },
    { memberships: 0, activeMemberships: 0, suspendedMemberships: 0 },
  );

  const openCreateModal = () => {
    setCreateForm({ name: "", slug: "" });
    setFormError("");
    setIsCreateOpen(true);
  };

  const openMembershipModal = (membership?: TenantMember) => {
    if (!selectedTenant) return;

    setEditingMembership(membership ?? null);
    setMembershipSearch(
      membership?.user.name ??
        membership?.user.email ??
        membership?.userId ??
        "",
    );
    setMembershipForm({
      userId: membership?.userId ?? "",
      role: selectedTenant.isRoot ? "ROOT" : (membership?.role ?? "EMPLOYEE"),
      status: membership?.status ?? "ACTIVE",
      isDefault: membership?.isDefault ?? false,
    });
    setFormError("");
    setIsMembershipOpen(true);
  };

  const handleCreateTenant = () => {
    if (!createForm.name.trim()) {
      setFormError("Tenant name is required.");
      return;
    }

    createMutation.mutate({
      name: createForm.name.trim(),
      slug: createForm.slug.trim() || undefined,
    });
  };

  const handleSaveMembership = () => {
    if (!selectedTenant) return;
    if (!membershipForm.userId) {
      setFormError("Select a user first.");
      return;
    }

    membershipMutation.mutate({
      tenantId: selectedTenant.id,
      userId: membershipForm.userId,
      role: selectedTenant.isRoot ? "ROOT" : membershipForm.role,
      status: membershipForm.status,
      isDefault: membershipForm.isDefault,
    });
  };

  const handleSwitchTenant = async () => {
    if (!selectedTenantId) return;
    await update({ activeTenantId: selectedTenantId });
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Master Tenant"
        description="Create tenant workspaces, review membership coverage, and move the active workspace for root operations."
        primaryAction={{ label: "Create Tenant", onClick: openCreateModal }}
        secondaryAction={
          selectedTenant
            ? { label: "Add Membership", onClick: () => openMembershipModal() }
            : undefined
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Tenants"
          value={String(tenants.length)}
          detail="Root and customer workspaces"
        />
        <SummaryCard
          label="Memberships"
          value={String(totals.memberships)}
          detail={`${totals.activeMemberships} active assignments`}
        />
        <SummaryCard
          label="Suspended"
          value={String(totals.suspendedMemberships)}
          detail="Memberships needing review"
        />
        <SummaryCard
          label="Current Workspace"
          value={
            session?.user.memberships?.find(
              (membership) =>
                membership.tenantId === session.user.activeTenantId,
            )?.tenantName ?? "Unset"
          }
          detail="Also available in the header switcher"
        />
      </section>

      {isTenantsLoading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
          Loading tenant registry...
        </div>
      ) : tenants.length === 0 ? (
        <EmptyState
          icon="🏢"
          title="No tenants yet"
          description="Create the first workspace to start using the multitenant model."
          action={{ label: "Create Tenant", onClick: openCreateModal }}
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="rounded-3xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <p className="text-xs font-semibold tracking-[0.2em] text-gray-500 uppercase">
                Tenant Registry
              </p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">
                Select a workspace
              </h2>
            </div>
            <div className="max-h-[720px] space-y-3 overflow-y-auto p-4">
              {tenants.map((tenant) => {
                const isActive = tenant.id === selectedTenantId;
                return (
                  <button
                    key={tenant.id}
                    type="button"
                    onClick={() => setSelectedTenantId(tenant.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      isActive
                        ? "border-blue-300 bg-blue-50 shadow-sm"
                        : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900">
                            {tenant.name}
                          </p>
                          {tenant.isRoot && (
                            <span className="rounded-full bg-black px-2 py-0.5 text-[10px] font-semibold tracking-[0.18em] text-white uppercase">
                              Root
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          {tenant.slug}
                        </p>
                      </div>
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                        {tenant.activeMembershipCount} active
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-gray-600">
                      <MiniStat label="Dept" value={tenant.stats.departments} />
                      <MiniStat
                        label="Projects"
                        value={tenant.stats.projects}
                      />
                      <MiniStat
                        label="Trips"
                        value={tenant.stats.travelRequests}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-gray-200 bg-white shadow-sm">
            {!selectedTenant ? (
              <div className="p-12 text-center text-sm text-gray-500">
                Select a tenant to inspect members and operational coverage.
              </div>
            ) : isDetailLoading || !tenantDetail ? (
              <div className="p-12 text-center text-sm text-gray-500">
                Loading tenant detail...
              </div>
            ) : (
              <>
                <div className="border-b border-gray-100 px-6 py-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-2xl font-semibold text-gray-900">
                          {tenantDetail.name}
                        </h2>
                        {tenantDetail.isRoot && (
                          <span className="rounded-full bg-black px-2 py-0.5 text-[10px] font-semibold tracking-[0.18em] text-white uppercase">
                            Root Tenant
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        Workspace slug:{" "}
                        <span className="font-medium">{tenantDetail.slug}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant="secondary"
                        onClick={handleSwitchTenant}
                        disabled={
                          session?.user.activeTenantId === tenantDetail.id
                        }
                      >
                        {session?.user.activeTenantId === tenantDetail.id
                          ? "Current Workspace"
                          : "Switch Workspace"}
                      </Button>
                      <Button onClick={() => openMembershipModal()}>
                        Add Membership
                      </Button>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-4">
                    <InlineMetric
                      label="Members"
                      value={String(tenantDetail.memberships.length)}
                    />
                    <InlineMetric
                      label="Active"
                      value={String(
                        tenantDetail.memberships.filter(
                          (membership) => membership.status === "ACTIVE",
                        ).length,
                      )}
                    />
                    <InlineMetric
                      label="Default"
                      value={String(
                        tenantDetail.memberships.filter(
                          (membership) => membership.isDefault,
                        ).length,
                      )}
                    />
                    <InlineMetric
                      label="Invited"
                      value={String(
                        tenantDetail.memberships.filter(
                          (membership) => membership.status === "INVITED",
                        ).length,
                      )}
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold tracking-[0.18em] text-gray-500 uppercase">
                      <tr>
                        <th className="px-6 py-3">Member</th>
                        <th className="px-6 py-3">Role</th>
                        <th className="px-6 py-3">Status</th>
                        <th className="px-6 py-3">Default</th>
                        <th className="px-6 py-3">Timeline</th>
                        <th className="px-6 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {tenantDetail.memberships.map((membership) => (
                        <tr key={membership.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <p className="font-medium text-gray-900">
                              {membership.user.name ??
                                membership.user.email ??
                                membership.userId}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              {membership.user.email ?? "No email"}
                              {membership.user.employeeId
                                ? ` • ${membership.user.employeeId}`
                                : ""}
                            </p>
                          </td>
                          <td className="px-6 py-4 text-gray-700">
                            {ROLE_LABELS[membership.role]}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${STATUS_STYLES[membership.status]}`}
                            >
                              {membership.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-gray-700">
                            {membership.isDefault ? "Yes" : "No"}
                          </td>
                          <td className="px-6 py-4 text-xs text-gray-500">
                            {membership.activatedAt
                              ? `Active ${formatDateTime(membership.activatedAt)}`
                              : membership.invitedAt
                                ? `Invited ${formatDateTime(membership.invitedAt)}`
                                : membership.suspendedAt
                                  ? `Suspended ${formatDateTime(membership.suspendedAt)}`
                                  : formatDateTime(membership.createdAt)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => openMembershipModal(membership)}
                            >
                              Edit
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create Tenant"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Root gets an active membership automatically so the tenant can be
            used immediately.
          </p>

          {formError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold tracking-[0.18em] text-gray-500 uppercase">
                Tenant Name
              </label>
              <input
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="Acme Indonesia"
              />
            </div>
            <div>
              <label className="text-xs font-semibold tracking-[0.18em] text-gray-500 uppercase">
                Slug
              </label>
              <input
                value={createForm.slug}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    slug: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="acme-indonesia"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <Button variant="secondary" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateTenant}
              isLoading={createMutation.isPending}
            >
              Create Tenant
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isMembershipOpen}
        onClose={() => {
          setIsMembershipOpen(false);
          setEditingMembership(null);
          setFormError("");
        }}
        title={editingMembership ? "Edit Membership" : "Add Membership"}
        size="lg"
      >
        <div className="space-y-4">
          {selectedTenant && (
            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              Managing access for <strong>{selectedTenant.name}</strong>.
            </div>
          )}

          {formError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          {!editingMembership && (
            <>
              <div>
                <label className="text-xs font-semibold tracking-[0.18em] text-gray-500 uppercase">
                  Find User
                </label>
                <input
                  value={membershipSearch}
                  onChange={(event) => setMembershipSearch(event.target.value)}
                  placeholder="Search by name, email, or employee ID"
                  className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold tracking-[0.18em] text-gray-500 uppercase">
                  User
                </label>
                <select
                  value={membershipForm.userId}
                  onChange={(event) =>
                    setMembershipForm((current) => ({
                      ...current,
                      userId: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">
                    {isUsersLoading ? "Loading users..." : "Select a user"}
                  </option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name ?? user.email ?? user.id}
                      {user.email ? ` • ${user.email}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {editingMembership && (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-sm font-medium text-gray-900">
                {editingMembership.user.name ??
                  editingMembership.user.email ??
                  editingMembership.userId}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {editingMembership.user.email ?? "No email"}
              </p>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-xs font-semibold tracking-[0.18em] text-gray-500 uppercase">
                Role
              </label>
              <select
                value={membershipForm.role}
                disabled={selectedTenant?.isRoot}
                onChange={(event) =>
                  setMembershipForm((current) => ({
                    ...current,
                    role: event.target.value as Role,
                  }))
                }
                className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100"
              >
                {(selectedTenant?.isRoot
                  ? (["ROOT"] as Role[])
                  : ROLE_OPTIONS
                ).map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold tracking-[0.18em] text-gray-500 uppercase">
                Status
              </label>
              <select
                value={membershipForm.status}
                onChange={(event) =>
                  setMembershipForm((current) => ({
                    ...current,
                    status: event.target.value as MembershipStatus,
                  }))
                }
                className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3">
              <input
                type="checkbox"
                checked={membershipForm.isDefault}
                onChange={(event) =>
                  setMembershipForm((current) => ({
                    ...current,
                    isDefault: event.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">
                  Default tenant
                </span>
                <span className="block text-xs text-gray-500">
                  Makes this the user&apos;s default workspace
                </span>
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setIsMembershipOpen(false);
                setEditingMembership(null);
                setFormError("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveMembership}
              isLoading={membershipMutation.isPending}
            >
              {editingMembership ? "Save Membership" : "Add Membership"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-5 shadow-sm">
      <p className="text-xs font-semibold tracking-[0.18em] text-gray-500 uppercase">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold text-gray-900">{value}</p>
      <p className="mt-2 text-sm text-gray-500">{detail}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2">
      <p className="text-[10px] font-semibold tracking-[0.18em] text-gray-400 uppercase">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-gray-800">{value}</p>
    </div>
  );
}

function InlineMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
      <p className="text-xs font-semibold tracking-[0.18em] text-gray-500 uppercase">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
