"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { Role } from "../../../../../generated/prisma";
import { EmptyState } from "@/components/features/EmptyState";
import { PageHeader } from "@/components/features/PageHeader";
import { Button } from "@/components/ui/Button";
import { ConfirmModal, Modal } from "@/components/ui/Modal";
import {
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  countPermissionActions,
  hasPermissionMap,
  type PermissionAction,
  type PermissionMap,
} from "@/lib/auth/permissions";
import { api } from "@/trpc/react";

type TenantSummary = {
  id: string;
  slug: string;
  name: string;
  isRoot: boolean;
  membershipCount: number;
  activeMembershipCount: number;
  stats: {
    departments: number;
    projects: number;
    travelRequests: number;
    claims: number;
    bailouts: number;
  };
};

type RolePermissionProfile = {
  id: string | null;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantIsRoot: boolean;
  role: Role;
  displayName: string;
  defaultDisplayName: string;
  isArchived: boolean;
  membershipCount: number;
  activeMembershipCount: number;
  permissions: PermissionMap;
  defaultPermissions: PermissionMap;
  isCustomized: boolean;
  createdAt: string | Date | null;
  updatedAt: string | Date | null;
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

function getPreferredTenant(
  tenants: TenantSummary[],
  activeTenantId?: string | null,
): TenantSummary | null {
  if (activeTenantId) {
    const activeTenant = tenants.find((tenant) => tenant.id === activeTenantId);
    if (activeTenant) {
      return activeTenant;
    }
  }

  return tenants.find((tenant) => !tenant.isRoot) ?? tenants[0] ?? null;
}

export default function RoleManagementPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const utils = api.useUtils();

  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<Role>("ADMIN");
  const [permissionDraft, setPermissionDraft] = useState<PermissionMap>({});
  const [permissionError, setPermissionError] = useState("");
  const [roleActionError, setRoleActionError] = useState("");
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleNameDraft, setRoleNameDraft] = useState("");
  const [deleteTargetRole, setDeleteTargetRole] = useState<Role | null>(null);

  const canAccessRoleAdmin =
    (session?.user.isRoot ?? false) ||
    hasPermissionMap(session?.user.permissions, "roles", "read");
  const canUpdateRolePermissions =
    (session?.user.isRoot ?? false) ||
    hasPermissionMap(session?.user.permissions, "roles", "update");

  useEffect(() => {
    if (status === "loading") {
      return;
    }

    if (session && !canAccessRoleAdmin) {
      router.replace("/");
    }
  }, [canAccessRoleAdmin, router, session, status]);

  const tenantListQuery = api.tenant.getAll.useQuery(undefined, {
    enabled: !!session?.user.isRoot,
    refetchOnWindowFocus: false,
  });

  const tenantMemberships = (session?.user.memberships ??
    []) as SessionMembership[];
  const manageableTenants = useMemo(() => {
    if (!session?.user) {
      return EMPTY_TENANTS;
    }

    if (session.user.isRoot) {
      return (tenantListQuery.data as TenantSummary[] | undefined) ?? EMPTY_TENANTS;
    }

    const activeMemberships = tenantMemberships.filter(
      (membership) => membership.status === "ACTIVE",
    );

    const currentMembership =
      activeMemberships.find(
        (membership) => membership.tenantId === session.user.activeTenantId,
      ) ??
      activeMemberships.find((membership) => membership.isDefault) ??
      activeMemberships[0];

    if (!currentMembership) {
      return EMPTY_TENANTS;
    }

    return [
      {
        id: currentMembership.tenantId,
        slug: currentMembership.tenantSlug,
        name: currentMembership.tenantName,
        isRoot: currentMembership.isRootTenant,
        membershipCount: 1,
        activeMembershipCount: 1,
        stats: {
          departments: 0,
          projects: 0,
          travelRequests: 0,
          claims: 0,
          bailouts: 0,
        },
      },
    ];
  }, [
    session?.user,
    session?.user.activeTenantId,
    tenantListQuery.data,
    tenantMemberships,
  ]);

  const preferredTenant = useMemo(
    () => getPreferredTenant(manageableTenants, session?.user.activeTenantId),
    [manageableTenants, session?.user.activeTenantId],
  );

  useEffect(() => {
    if (!selectedTenantId && preferredTenant) {
      setSelectedTenantId(preferredTenant.id);
    }

    if (
      selectedTenantId &&
      manageableTenants.length > 0 &&
      !manageableTenants.some((tenant) => tenant.id === selectedTenantId)
    ) {
      setSelectedTenantId(preferredTenant?.id ?? "");
    }
  }, [manageableTenants, preferredTenant, selectedTenantId]);

  const selectedTenant = manageableTenants.find(
    (tenant) => tenant.id === selectedTenantId,
  );

  useEffect(() => {
    if (selectedTenant?.isRoot) {
      setSelectedRole("ROOT");
      return;
    }

    if (selectedRole === "ROOT") {
      setSelectedRole("ADMIN");
    }
  }, [selectedRole, selectedTenant?.isRoot]);

  const rolePermissionsQuery = api.tenant.getRolePermissions.useQuery(
    { tenantId: selectedTenantId },
    {
      enabled: !!selectedTenantId && canAccessRoleAdmin,
      refetchOnWindowFocus: false,
    },
  );

  const isPermissionsLoading = rolePermissionsQuery.isLoading;
  const permissionProfiles =
    (rolePermissionsQuery.data as RolePermissionProfile[] | undefined) ?? [];
  const selectedPermissionProfile =
    permissionProfiles.find((profile) => profile.role === selectedRole) ?? null;

  const roleCards = useMemo(
    () =>
      permissionProfiles.filter(
        (profile) =>
          ((selectedTenant?.isRoot ?? false) || profile.role !== "ROOT") &&
          !profile.isArchived,
      ),
    [permissionProfiles, selectedTenant?.isRoot],
  );

  useEffect(() => {
    if (selectedTenant?.isRoot || roleCards.length === 0) {
      if (!selectedTenant?.isRoot) {
        setIsRoleModalOpen(false);
      }
      return;
    }

    if (!roleCards.some((profile) => profile.role === selectedRole)) {
      setSelectedRole(roleCards[0]?.role ?? "ADMIN");
      setIsRoleModalOpen(false);
    }
  }, [roleCards, selectedRole, selectedTenant?.isRoot]);

  useEffect(() => {
    if (selectedPermissionProfile) {
      setPermissionDraft(selectedPermissionProfile.permissions);
      setPermissionError("");
      if (editingRole !== selectedPermissionProfile.role) {
        setRoleNameDraft(selectedPermissionProfile.displayName);
      }
    }
  }, [editingRole, selectedPermissionProfile]);

  const syncPermissionSession = async (tenantId: string) => {
    await utils.tenant.getRolePermissions.invalidate({ tenantId });
    if (session?.user.activeTenantId === tenantId) {
      await update({ activeTenantId: tenantId });
      router.refresh();
    }
  };

  const refreshRoleProfiles = async (tenantId: string) => {
    await utils.tenant.getRolePermissions.invalidate({ tenantId });
  };

  const updateRolePermissionsMutation =
    api.tenant.updateRolePermissions.useMutation({
      onSuccess: async () => {
        if (selectedTenantId) {
          await syncPermissionSession(selectedTenantId);
        }
        setPermissionError("");
      },
      onError: (error) => setPermissionError(error.message),
    });

  const resetRolePermissionsMutation =
    api.tenant.resetRolePermissions.useMutation({
      onSuccess: async () => {
        if (selectedTenantId) {
          await syncPermissionSession(selectedTenantId);
        }
        setPermissionError("");
      },
      onError: (error) => setPermissionError(error.message),
    });

  const renameRoleMutation = api.tenant.renameRole.useMutation({
    onSuccess: async (_data, variables) => {
      await refreshRoleProfiles(variables.tenantId);
      setRoleActionError("");
      setEditingRole(null);
    },
    onError: (error) => setRoleActionError(error.message),
  });

  const deleteRoleMutation = api.tenant.deleteRole.useMutation({
    onSuccess: async (_data, variables) => {
      await refreshRoleProfiles(variables.tenantId);
      setRoleActionError("");
      setDeleteTargetRole(null);
      setIsRoleModalOpen(false);
    },
    onError: (error) => setRoleActionError(error.message),
  });

  const canEditSelectedRolePermissions =
    canUpdateRolePermissions &&
    !!selectedTenant &&
    !selectedTenant.isRoot &&
    selectedRole !== "ROOT" &&
    !!selectedPermissionProfile;

  const canEditRoleMetadata =
    canUpdateRolePermissions &&
    !!selectedTenant &&
    !selectedTenant.isRoot &&
    !renameRoleMutation.isPending &&
    !deleteRoleMutation.isPending;

  const permissionsDirty = selectedPermissionProfile
    ? JSON.stringify(permissionDraft) !==
      JSON.stringify(selectedPermissionProfile.permissions)
    : false;

  const selectedActionCount = selectedPermissionProfile
    ? countPermissionActions(permissionDraft)
    : 0;

  const deleteTargetProfile =
    permissionProfiles.find((profile) => profile.role === deleteTargetRole) ??
    null;
  const deleteBlockedByMembership =
    (deleteTargetProfile?.membershipCount ?? 0) > 0;

  const togglePermission = (moduleKey: string, action: PermissionAction) => {
    setPermissionDraft((current) => {
      const next = { ...current };
      const nextActions = new Set(next[moduleKey] ?? []);

      if (nextActions.has(action)) {
        nextActions.delete(action);
      } else {
        nextActions.add(action);
      }

      if (nextActions.size === 0) {
        delete next[moduleKey];
      } else {
        next[moduleKey] = [...nextActions].sort();
      }

      return next;
    });
  };

  const openRoleModal = (role: Role) => {
    setSelectedRole(role);
    setPermissionError("");
    setRoleActionError("");
    setIsRoleModalOpen(true);
  };

  const closeRoleModal = () => {
    setPermissionError("");
    setIsRoleModalOpen(false);
  };

  const startRoleRename = (profile: RolePermissionProfile) => {
    if (!canEditRoleMetadata) {
      return;
    }

    setEditingRole(profile.role);
    setRoleNameDraft(profile.displayName);
    setRoleActionError("");
  };

  const cancelRoleRename = (profile: RolePermissionProfile) => {
    setEditingRole(null);
    setRoleNameDraft(profile.displayName);
  };

  const submitRoleRename = (profile: RolePermissionProfile) => {
    if (!selectedTenant || !canEditRoleMetadata) {
      cancelRoleRename(profile);
      return;
    }

    const nextDisplayName = roleNameDraft.trim();
    setEditingRole(null);

    if (!nextDisplayName) {
      setRoleNameDraft(profile.displayName);
      setRoleActionError("Role name cannot be empty.");
      return;
    }

    if (nextDisplayName.length < 2) {
      setRoleNameDraft(profile.displayName);
      setRoleActionError("Role name must be at least 2 characters.");
      return;
    }

    if (nextDisplayName === profile.displayName) {
      setRoleNameDraft(profile.displayName);
      return;
    }

    renameRoleMutation.mutate({
      tenantId: selectedTenant.id,
      role: profile.role,
      displayName: nextDisplayName,
    });
  };

  const handleSaveRolePermissions = () => {
    if (!selectedTenant || !selectedPermissionProfile) {
      return;
    }

    updateRolePermissionsMutation.mutate({
      tenantId: selectedTenant.id,
      role: selectedPermissionProfile.role,
      permissions: permissionDraft,
    });
  };

  const handleResetRolePermissions = () => {
    if (!selectedTenant || !selectedPermissionProfile) {
      return;
    }

    resetRolePermissionsMutation.mutate({
      tenantId: selectedTenant.id,
      role: selectedPermissionProfile.role,
    });
  };

  const handleConfirmDeleteRole = () => {
    if (!selectedTenant || !deleteTargetProfile) {
      return;
    }

    deleteRoleMutation.mutate({
      tenantId: selectedTenant.id,
      role: deleteTargetProfile.role,
    });
  };

  if (status === "loading") {
    return (
      <div className="rounded-lg border bg-white p-12 text-center text-gray-500">
        Loading...
      </div>
    );
  }

  if (session && !canAccessRoleAdmin) {
    return null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manajemen Peran"
        description="Pisahkan pengaturan izin dari master tenant. Hak akses ini dipakai untuk mengontrol menu sidebar dan tombol fitur per tenant."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Tenant Scope"
          value={String(manageableTenants.length)}
          detail={
            session?.user.isRoot
              ? "Root dapat memilih tenant mana pun"
              : "Non-root hanya dapat mengelola tenant aktif"
          }
        />
        <SummaryCard
          label="Current Workspace"
          value={
            session?.user.memberships?.find(
              (membership) =>
                membership.tenantId === session.user.activeTenantId,
            )?.tenantName ?? "Unset"
          }
          detail="Switch tenant from the header to manage another workspace"
        />
        <SummaryCard
          label="Selected Role"
          value={
            selectedPermissionProfile?.displayName ??
            (selectedRole ? ROLE_LABELS[selectedRole] : "-")
          }
          detail={
            selectedPermissionProfile
              ? `${selectedActionCount} enabled actions`
              : "Choose a tenant first"
          }
          singleLineDetail
        />
        <SummaryCard
          label="Can Edit"
          value={canUpdateRolePermissions ? "Yes" : "Read Only"}
          detail="Role name, delete, and permission modal follow roles:update"
        />
      </section>

      {manageableTenants.length === 0 ? (
        <EmptyState
          icon="RB"
          title="No manageable tenant"
          description="Open a tenant workspace first, then the role permission matrix will be available here."
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <section className="rounded-3xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <p className="text-xs font-semibold tracking-[0.2em] text-gray-500 uppercase">
                Tenant Scope
              </p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">
                Select a workspace
              </h2>
            </div>

            <div className="space-y-3 p-4">
              {manageableTenants.map((tenant) => {
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
                Select a tenant to manage role permissions.
              </div>
            ) : (
              <>
                <div className="border-b border-gray-100 px-6 py-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-2xl font-semibold text-gray-900">
                          {selectedTenant.name}
                        </h2>
                        {selectedTenant.isRoot && (
                          <span className="rounded-full bg-black px-2 py-0.5 text-[10px] font-semibold tracking-[0.18em] text-white uppercase">
                            Root Tenant
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        Workspace slug:{" "}
                        <span className="font-medium">{selectedTenant.slug}</span>
                      </p>
                      {!session?.user.isRoot && (
                        <p className="mt-2 text-sm text-gray-500">
                          This screen follows your active tenant. Use the header
                          switcher to move to another workspace before editing
                          permissions.
                        </p>
                      )}
                    </div>

                    <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800 lg:max-w-sm">
                      Click a role card to open the permission modal. Click the
                      role name on the card to rename it, or use the trash icon
                      to delete the role card from this tenant.
                    </div>
                  </div>
                </div>

                <div className="px-6 py-6">
                  {roleActionError && (
                    <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {roleActionError}
                    </div>
                  )}

                  {isPermissionsLoading ? (
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-12 text-center text-sm text-gray-500">
                      Loading role permissions...
                    </div>
                  ) : selectedTenant.isRoot ? (
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-12 text-center text-sm text-gray-500">
                      Root tenant access is fixed. Permission overrides are only
                      meaningful for non-root workspaces.
                    </div>
                  ) : roleCards.length === 0 ? (
                    <EmptyState
                      icon="RB"
                      title="No role cards available"
                      description="All available roles for this tenant are archived."
                    />
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {roleCards.map((profile) => {
                        const permissionCount = countPermissionActions(
                          profile.permissions,
                        );
                        const isActiveRole =
                          profile.role === selectedRole && isRoleModalOpen;
                        const isRenaming = editingRole === profile.role;
                        return (
                          <div
                            key={profile.role}
                            role="button"
                            tabIndex={0}
                            onClick={() => openRoleModal(profile.role)}
                            onKeyDown={(event) => {
                              if (
                                event.key === "Enter" ||
                                event.key === " "
                              ) {
                                event.preventDefault();
                                openRoleModal(profile.role);
                              }
                            }}
                            className={`rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-blue-200 ${
                              isActiveRole
                                ? "border-blue-300 bg-blue-50 shadow-sm"
                                : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                {isRenaming ? (
                                  <input
                                    autoFocus
                                    value={roleNameDraft}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={(event) =>
                                      setRoleNameDraft(event.target.value)
                                    }
                                    onBlur={() => submitRoleRename(profile)}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        event.preventDefault();
                                        (
                                          event.currentTarget as HTMLInputElement
                                        ).blur();
                                      }

                                      if (event.key === "Escape") {
                                        event.preventDefault();
                                        cancelRoleRename(profile);
                                      }
                                    }}
                                    className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none ring-2 ring-blue-100"
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      startRoleRename(profile);
                                    }}
                                    disabled={!canEditRoleMetadata}
                                    className="truncate text-sm font-semibold text-gray-900 transition hover:text-blue-700 disabled:cursor-default disabled:hover:text-gray-900"
                                  >
                                    {profile.displayName}
                                  </button>
                                )}
                                <p className="mt-1 text-xs text-gray-500">
                                  {permissionCount} enabled actions
                                </p>
                              </div>

                              <div className="flex items-center gap-2">
                                <span
                                  className={`rounded-full px-2 py-1 text-[10px] font-semibold tracking-[0.16em] uppercase ${
                                    profile.isCustomized
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-gray-100 text-gray-600"
                                  }`}
                                >
                                  {profile.isCustomized ? "Custom" : "Default"}
                                </span>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setRoleActionError("");
                                    setDeleteTargetRole(profile.role);
                                  }}
                                  disabled={!canEditRoleMetadata}
                                  title={
                                    profile.membershipCount > 0
                                      ? "Reassign tenant members before deleting this role"
                                      : "Delete role"
                                  }
                                  className="rounded-full p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                                  aria-label={`Delete ${profile.displayName}`}
                                >
                                  <svg
                                    className="h-4 w-4"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M3 6h18" />
                                    <path d="M8 6V4h8v2" />
                                    <path d="M19 6l-1 14H6L5 6" />
                                    <path d="M10 11v6" />
                                    <path d="M14 11v6" />
                                  </svg>
                                </button>
                              </div>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-600">
                              <MiniStat
                                label="Active"
                                value={profile.activeMembershipCount}
                              />
                              <MiniStat
                                label="Members"
                                value={profile.membershipCount}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      <Modal
        isOpen={
          isRoleModalOpen &&
          !!selectedPermissionProfile &&
          !(selectedTenant?.isRoot ?? false)
        }
        onClose={closeRoleModal}
        title={
          selectedPermissionProfile
            ? `Permissions - ${selectedPermissionProfile.displayName}`
            : "Role Permissions"
        }
        size="xl"
      >
        {selectedPermissionProfile ? (
          <div className="space-y-6">
            {permissionError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {permissionError}
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-4">
              <InlineMetric
                label="Selected Role"
                value={selectedPermissionProfile.displayName}
              />
              <InlineMetric
                label="Current Actions"
                value={String(countPermissionActions(permissionDraft))}
              />
              <InlineMetric
                label="Default Actions"
                value={String(
                  countPermissionActions(
                    selectedPermissionProfile.defaultPermissions,
                  ),
                )}
              />
              <InlineMetric
                label="Active Members"
                value={String(selectedPermissionProfile.activeMembershipCount)}
              />
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Toggle these permissions to control which sidebar menus and
              feature buttons are visible for users in this tenant.
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {Object.entries(PERMISSION_MODULES).map(
                ([moduleKey, moduleMeta]) => {
                  const enabledActions = permissionDraft[moduleKey] ?? [];

                  return (
                    <div
                      key={moduleKey}
                      className="rounded-2xl border border-gray-200 bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {moduleMeta.label}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {moduleMeta.description}
                          </p>
                        </div>
                        <span
                          className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${moduleMeta.color}`}
                        >
                          {enabledActions.length} enabled
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {moduleMeta.actions.map((action) => {
                          const enabled = enabledActions.includes(action);

                          return (
                            <label
                              key={`${moduleKey}-${action}`}
                              className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition ${
                                enabled
                                  ? "border-blue-200 bg-blue-50 text-blue-700"
                                  : "border-gray-200 bg-gray-50 text-gray-600"
                              } ${
                                canEditSelectedRolePermissions
                                  ? "hover:border-blue-300"
                                  : "cursor-not-allowed opacity-60"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={enabled}
                                disabled={!canEditSelectedRolePermissions}
                                onChange={() =>
                                  togglePermission(moduleKey, action)
                                }
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span>{PERMISSION_ACTIONS[action].label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                },
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4">
              <Button
                variant="secondary"
                onClick={handleResetRolePermissions}
                disabled={
                  !canEditSelectedRolePermissions ||
                  !selectedPermissionProfile.isCustomized ||
                  resetRolePermissionsMutation.isPending ||
                  updateRolePermissionsMutation.isPending
                }
                isLoading={resetRolePermissionsMutation.isPending}
              >
                Reset to Default
              </Button>
              <Button
                onClick={handleSaveRolePermissions}
                disabled={
                  !canEditSelectedRolePermissions ||
                  !permissionsDirty ||
                  updateRolePermissionsMutation.isPending ||
                  resetRolePermissionsMutation.isPending
                }
                isLoading={updateRolePermissionsMutation.isPending}
              >
                Save Permissions
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTargetProfile}
        onClose={() => {
          setDeleteTargetRole(null);
          setRoleActionError("");
        }}
        onConfirm={handleConfirmDeleteRole}
        title={
          deleteTargetProfile
            ? `Delete ${deleteTargetProfile.displayName}?`
            : "Delete role?"
        }
        message={
          deleteTargetProfile && selectedTenant
            ? deleteBlockedByMembership
              ? `${deleteTargetProfile.displayName} is still assigned to ${deleteTargetProfile.membershipCount} tenant member${deleteTargetProfile.membershipCount === 1 ? "" : "s"}. Reassign them before deleting this role from ${selectedTenant.name}.`
              : `This removes the role card and its tenant-specific overrides from ${selectedTenant.name}. Reassign any members using this role before deletion.`
            : "Delete this role?"
        }
        confirmLabel="Delete"
        confirmDisabled={deleteBlockedByMembership || !canEditRoleMetadata}
        isLoading={deleteRoleMutation.isPending}
        variant="danger"
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  singleLineDetail = false,
}: {
  label: string;
  value: string;
  detail: string;
  singleLineDetail?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold tracking-[0.18em] text-gray-500 uppercase">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold text-gray-900">{value}</p>
      <p
        className={`mt-2 text-sm text-gray-500 ${
          singleLineDetail ? "truncate" : ""
        }`}
        title={singleLineDetail ? detail : undefined}
      >
        {detail}
      </p>
    </div>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
      <p className="text-[11px] font-semibold tracking-[0.16em] text-gray-400 uppercase">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function InlineMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
      <p className="text-xs font-semibold tracking-[0.16em] text-gray-500 uppercase">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-gray-900">{value}</p>
    </div>
  );
}
