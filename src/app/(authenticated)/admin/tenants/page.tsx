"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { MembershipStatus, Role } from "../../../../../generated/prisma";
import { EmptyState } from "@/components/features/EmptyState";
import { PageHeader } from "@/components/features/PageHeader";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { hasPermissionMap } from "@/lib/auth/permissions";
import { api } from "@/trpc/react";

type TenantSummary = {
  id: string;
  slug: string;
  name: string;
  isRoot: boolean;
  membershipCount: number;
  activeMembershipCount: number;
};

type TenantMember = {
  id: string;
  userId: string;
  role: Role;
  status: MembershipStatus;
  isDefault: boolean;
  invitedAt: string | Date | null;
  activatedAt: string | Date | null;
  suspendedAt: string | Date | null;
  createdAt: string | Date;
  user: {
    name: string | null;
    email: string | null;
    employeeId: string | null;
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
};

type SessionMembership = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  status: string;
  isDefault: boolean;
  isRootTenant: boolean;
};

const EMPTY_TENANTS: TenantSummary[] = [];
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

function pickTenant(
  tenants: TenantSummary[],
  activeTenantId?: string | null,
): TenantSummary | null {
  if (activeTenantId) {
    const active = tenants.find((tenant) => tenant.id === activeTenantId);
    if (active) return active;
  }
  return tenants.find((tenant) => !tenant.isRoot) ?? tenants[0] ?? null;
}

function formatDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function MasterTenantPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const utils = api.useUtils();

  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isMembershipOpen, setIsMembershipOpen] = useState(false);
  const [membershipSearch, setMembershipSearch] = useState("");
  const [createForm, setCreateForm] = useState({ name: "", slug: "" });
  const [editingMembership, setEditingMembership] =
    useState<TenantMember | null>(null);
  const [formError, setFormError] = useState("");
  const [membershipForm, setMembershipForm] = useState<{
    userId: string;
    role: Role;
    status: MembershipStatus;
    isDefault: boolean;
  }>({ userId: "", role: "EMPLOYEE", status: "ACTIVE", isDefault: false });

  const isRoot = session?.user.isRoot ?? false;
  const canRead = isRoot || hasPermissionMap(session?.user.permissions, "tenants", "read");
  const canCreate = isRoot;
  const canUpdate = isRoot || hasPermissionMap(session?.user.permissions, "tenants", "update");
  const canReadUsers = isRoot || hasPermissionMap(session?.user.permissions, "users", "read");

  useEffect(() => {
    if (status !== "loading" && session && !canRead) {
      router.replace("/");
    }
  }, [canRead, router, session, status]);

  const tenantListQuery = api.tenant.getAll.useQuery(undefined, {
    enabled: isRoot,
    refetchOnWindowFocus: false,
  });

  const memberships = (session?.user.memberships ?? []) as SessionMembership[];
  const tenants = useMemo(() => {
    if (!session?.user) return EMPTY_TENANTS;
    if (session.user.isRoot) {
      return (tenantListQuery.data as TenantSummary[] | undefined) ?? EMPTY_TENANTS;
    }
    const activeMemberships = memberships.filter((item) => item.status === "ACTIVE");
    const current =
      activeMemberships.find((item) => item.tenantId === session.user.activeTenantId) ??
      activeMemberships.find((item) => item.isDefault) ??
      activeMemberships[0];
    if (!current) return EMPTY_TENANTS;
    return [
      {
        id: current.tenantId,
        slug: current.tenantSlug,
        name: current.tenantName,
        isRoot: current.isRootTenant,
        membershipCount: 1,
        activeMembershipCount: 1,
      },
    ];
  }, [memberships, session?.user, tenantListQuery.data]);

  const preferredTenant = useMemo(
    () => pickTenant(tenants, session?.user.activeTenantId),
    [session?.user.activeTenantId, tenants],
  );

  useEffect(() => {
    if (!selectedTenantId && preferredTenant) {
      setSelectedTenantId(preferredTenant.id);
    }
  }, [preferredTenant, selectedTenantId]);

  const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId);
  const tenantDetailQuery = api.tenant.getMembers.useQuery(
    { tenantId: selectedTenantId },
    { enabled: !!selectedTenantId && canRead, refetchOnWindowFocus: false },
  );
  const tenantDetail =
    (tenantDetailQuery.data as TenantDetail | undefined) ?? null;

  const usersQuery = api.user.getAll.useQuery(
    { search: membershipSearch || undefined, limit: 50 },
    { enabled: isMembershipOpen && canReadUsers, refetchOnWindowFocus: false },
  );
  const users = (
    (usersQuery.data as { users: UserOption[] } | undefined)?.users ?? []
  ).filter((user) => !user.email?.startsWith("deleted-"));

  const createMutation = api.tenant.create.useMutation({
    onSuccess: async (result) => {
      await utils.tenant.getAll.invalidate();
      setCreateForm({ name: "", slug: "" });
      setIsCreateOpen(false);
      setSelectedTenantId((result as { id: string }).id);
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

  const openMembershipModal = (membership?: TenantMember) => {
    if (!selectedTenant || !canUpdate || !canReadUsers) return;
    setEditingMembership(membership ?? null);
    setMembershipSearch(
      membership?.user.name ?? membership?.user.email ?? membership?.user.employeeId ?? "",
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

  if (status === "loading") {
    return <div className="rounded-lg border bg-white p-12 text-center text-gray-500">Loading...</div>;
  }

  if (session && !canRead) {
    return null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Master Tenant"
        description="Kelola workspace tenant dan membership tenant. Pengaturan izin per peran sekarang dipindahkan ke menu Manajemen Peran."
        primaryAction={canCreate ? { label: "Create Tenant", onClick: () => setIsCreateOpen(true) } : undefined}
        secondaryAction={selectedTenant && canUpdate && canReadUsers ? { label: "Add Membership", onClick: () => openMembershipModal() } : undefined}
      />

      {tenants.length === 0 ? (
        <EmptyState
          icon="TN"
          title="No tenants yet"
          description="Create the first workspace to start using the multitenant model."
          action={canCreate ? { label: "Create Tenant", onClick: () => setIsCreateOpen(true) } : undefined}
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <section className="rounded-3xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <p className="text-xs font-semibold tracking-[0.2em] text-gray-500 uppercase">Tenant Registry</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">Select a workspace</h2>
            </div>
            <div className="space-y-3 p-4">
              {tenants.map((tenant) => (
                <button
                  key={tenant.id}
                  type="button"
                  onClick={() => setSelectedTenantId(tenant.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    tenant.id === selectedTenantId
                      ? "border-blue-300 bg-blue-50 shadow-sm"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{tenant.name}</p>
                      <p className="mt-1 text-xs text-gray-500">{tenant.slug}</p>
                    </div>
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                      {tenant.activeMembershipCount} active
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-gray-200 bg-white shadow-sm">
            {!selectedTenant ? (
              <div className="p-12 text-center text-sm text-gray-500">Select a tenant to inspect memberships.</div>
            ) : tenantDetailQuery.isLoading || !tenantDetail ? (
              <div className="p-12 text-center text-sm text-gray-500">Loading tenant detail...</div>
            ) : (
              <>
                <div className="border-b border-gray-100 px-6 py-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-2xl font-semibold text-gray-900">{tenantDetail.name}</h2>
                      <p className="mt-1 text-sm text-gray-500">
                        Workspace slug: <span className="font-medium">{tenantDetail.slug}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          await update({ activeTenantId: selectedTenantId });
                          router.refresh();
                        }}
                        disabled={session?.user.activeTenantId === tenantDetail.id}
                      >
                        {session?.user.activeTenantId === tenantDetail.id ? "Current Workspace" : "Switch Workspace"}
                      </Button>
                      {canUpdate && canReadUsers && (
                        <Button onClick={() => openMembershipModal()}>Add Membership</Button>
                      )}
                    </div>
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
                              {membership.user.name ?? membership.user.email ?? membership.user.employeeId ?? membership.userId}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              {membership.user.email ?? "No email"}
                              {membership.user.employeeId ? ` • ${membership.user.employeeId}` : ""}
                            </p>
                          </td>
                          <td className="px-6 py-4 text-gray-700">{ROLE_LABELS[membership.role]}</td>
                          <td className="px-6 py-4 text-gray-700">{membership.status}</td>
                          <td className="px-6 py-4 text-gray-700">{membership.isDefault ? "Yes" : "No"}</td>
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
                            {canUpdate && canReadUsers ? (
                              <Button size="sm" variant="secondary" onClick={() => openMembershipModal(membership)}>
                                Edit
                              </Button>
                            ) : (
                              <span className="text-xs text-gray-400">Read only</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-gray-100 px-6 py-6">
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-800">
                    Role permission editing has moved to the <span className="font-semibold">Manajemen Peran</span> menu.
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create Tenant" size="md">
        <div className="space-y-4">
          {formError && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>}
          <input
            value={createForm.name}
            onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Tenant name"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            value={createForm.slug}
            onChange={(event) => setCreateForm((current) => ({ ...current, slug: event.target.value }))}
            placeholder="tenant-slug"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!createForm.name.trim()) {
                  setFormError("Tenant name is required.");
                  return;
                }
                createMutation.mutate({
                  name: createForm.name.trim(),
                  slug: createForm.slug.trim() || undefined,
                });
              }}
              isLoading={createMutation.isPending}
            >
              Create Tenant
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isMembershipOpen} onClose={() => setIsMembershipOpen(false)} title={editingMembership ? "Edit Membership" : "Add Membership"} size="lg">
        <div className="space-y-4">
          {formError && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>}
          <input
            value={membershipSearch}
            onChange={(event) => setMembershipSearch(event.target.value)}
            placeholder="Search name, email, or employee ID"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={membershipForm.userId}
            onChange={(event) => setMembershipForm((current) => ({ ...current, userId: event.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{usersQuery.isLoading ? "Loading users..." : "Select a user"}</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name ?? user.email ?? user.id}
                {user.email ? ` • ${user.email}` : ""}
                {user.employeeId ? ` • ${user.employeeId}` : ""}
              </option>
            ))}
          </select>
          <div className="grid gap-4 md:grid-cols-3">
            <select
              value={membershipForm.role}
              onChange={(event) => setMembershipForm((current) => ({ ...current, role: event.target.value as Role }))}
              disabled={selectedTenant?.isRoot}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            >
              {(
                selectedTenant?.isRoot
                  ? (["ROOT"] as Role[])
                  : ROLE_OPTIONS.filter((role) => role !== "ROOT")
              ).map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            <select
              value={membershipForm.status}
              onChange={(event) => setMembershipForm((current) => ({ ...current, status: event.target.value as MembershipStatus }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {STATUS_OPTIONS.map((statusValue) => (
                <option key={statusValue} value={statusValue}>
                  {statusValue}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={membershipForm.isDefault}
                onChange={(event) => setMembershipForm((current) => ({ ...current, isDefault: event.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Default tenant
            </label>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsMembershipOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
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
              }}
              isLoading={membershipMutation.isPending}
            >
              Save Membership
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
