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

type RolePermissionProfile = {
  id: string | null;
  roleKey: string;
  role: Role;
  displayName: string;
  defaultDisplayName: string;
  isArchived: boolean;
  permissions: PermissionMap;
  defaultPermissions: PermissionMap;
  isCustomized: boolean;
  userCount: number;
  createdAt: string | Date | null;
  updatedAt: string | Date | null;
};

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

export default function RoleManagementPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const utils = api.useUtils();

  const [selectedRoleKey, setSelectedRoleKey] = useState<string>("system:ADMIN");
  const [permissionDraft, setPermissionDraft] = useState<PermissionMap>({});
  const [permissionError, setPermissionError] = useState("");
  const [renameTarget, setRenameTarget] = useState<Role | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [roleActionError, setRoleActionError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Role | "">("");
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);

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

  const rolesQuery = api.role.getAll.useQuery(undefined, {
    enabled: canAccessRoleAdmin,
    refetchOnWindowFocus: false,
  });

  const permissionProfiles = useMemo(
    () => (rolesQuery.data as RolePermissionProfile[] | undefined) ?? [],
    [rolesQuery.data],
  );
  const activeRoles = useMemo(
    () => permissionProfiles.filter((profile) => !profile.isArchived),
    [permissionProfiles],
  );
  const archivedRoles = useMemo(
    () => permissionProfiles.filter((profile) => profile.isArchived),
    [permissionProfiles],
  );

  useEffect(() => {
    if (activeRoles.length === 0) {
      return;
    }

    if (!activeRoles.some((profile) => profile.roleKey === selectedRoleKey)) {
      setSelectedRoleKey(activeRoles[0]?.roleKey ?? "system:ADMIN");
    }
  }, [activeRoles, selectedRoleKey]);

  const selectedRole =
    permissionProfiles.find((profile) => profile.roleKey === selectedRoleKey) ?? null;

  useEffect(() => {
    if (selectedRole) {
      setPermissionDraft(selectedRole.permissions);
      setPermissionError("");
    }
  }, [selectedRole]);

  useEffect(() => {
    if (!renameTarget) {
      return;
    }

    const current = permissionProfiles.find((profile) => profile.role === renameTarget);
    setRenameDraft(current?.displayName ?? "");
  }, [permissionProfiles, renameTarget]);

  useEffect(() => {
    if (archivedRoles.length === 0) {
      setRestoreTarget("");
      return;
    }

    if (!restoreTarget || !archivedRoles.some((profile) => profile.role === restoreTarget)) {
      setRestoreTarget(archivedRoles[0]?.role ?? "");
    }
  }, [archivedRoles, restoreTarget]);

  const refreshRoles = async () => {
    await utils.role.getAll.invalidate();
    await update();
    router.refresh();
  };

  const updatePermissionsMutation = api.role.updatePermissions.useMutation({
    onSuccess: async () => {
      await refreshRoles();
      setPermissionError("");
    },
    onError: (error) => setPermissionError(error.message),
  });

  const resetPermissionsMutation = api.role.resetPermissions.useMutation({
    onSuccess: async () => {
      await refreshRoles();
      setPermissionError("");
    },
    onError: (error) => setPermissionError(error.message),
  });

  const renameRoleMutation = api.role.rename.useMutation({
    onSuccess: async () => {
      await refreshRoles();
      setRenameTarget(null);
      setRoleActionError("");
    },
    onError: (error) => setRoleActionError(error.message),
  });

  const deleteRoleMutation = api.role.delete.useMutation({
    onSuccess: async () => {
      await refreshRoles();
      setDeleteTarget(null);
      setIsPermissionModalOpen(false);
      setRoleActionError("");
    },
    onError: (error) => setRoleActionError(error.message),
  });

  const restoreRoleMutation = api.role.restore.useMutation({
    onSuccess: async () => {
      await refreshRoles();
      setRoleActionError("");
    },
    onError: (error) => setRoleActionError(error.message),
  });

  const permissionsDirty = selectedRole
    ? JSON.stringify(permissionDraft) !== JSON.stringify(selectedRole.permissions)
    : false;

  const canEditSelectedRole =
    canUpdateRolePermissions &&
    !!selectedRole &&
    selectedRole.role !== "ROOT" &&
    !selectedRole.isArchived;

  const togglePermission = (moduleKey: string, action: PermissionAction) => {
    setPermissionDraft((current) => {
      const next = { ...current };
      const actions = new Set(next[moduleKey] ?? []);

      if (actions.has(action)) {
        actions.delete(action);
      } else {
        actions.add(action);
      }

      next[moduleKey] = [...actions].sort();
      return next;
    });
  };

  const handleSavePermissions = () => {
    if (!selectedRole) {
      return;
    }

    updatePermissionsMutation.mutate({
      role: selectedRole.role,
      permissions: permissionDraft,
    });
  };

  const handleResetPermissions = () => {
    if (!selectedRole) {
      return;
    }

    resetPermissionsMutation.mutate({
      role: selectedRole.role,
    });
  };

  const handleRename = () => {
    if (!renameTarget) {
      return;
    }

    const nextName = renameDraft.trim();
    if (nextName.length < 2) {
      setRoleActionError("Role name must be at least 2 characters.");
      return;
    }

    renameRoleMutation.mutate({
      role: renameTarget,
      displayName: nextName,
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
        description="Kelola izin menu dan aksi fitur per role secara global."
        secondaryAction={
          archivedRoles.length > 0 && canUpdateRolePermissions
            ? {
                label: "Restore Role",
                onClick: () => {
                  if (!restoreTarget) {
                    return;
                  }

                  restoreRoleMutation.mutate({ role: restoreTarget });
                },
              }
            : undefined
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Active Roles"
          value={String(activeRoles.length)}
          detail="Roles currently available for assignment."
        />
        <SummaryCard
          label="Archived Roles"
          value={String(archivedRoles.length)}
          detail="Archived roles can be restored later."
        />
        <SummaryCard
          label="Selected Role"
          value={selectedRole?.displayName ?? "-"}
          detail={
            selectedRole
              ? `${countPermissionActions(permissionDraft)} enabled actions`
              : "Choose a role to inspect permissions."
          }
        />
        <SummaryCard
          label="Edit Access"
          value={canUpdateRolePermissions ? "Yes" : "Read Only"}
          detail="Renaming, archiving, and permission edits follow roles:update."
        />
      </section>

      {activeRoles.length === 0 ? (
        <div className="rounded-lg border bg-white">
          <EmptyState
            icon="RL"
            title="No roles available"
            description="The role permission catalog is empty."
          />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-gray-500 uppercase">
                  Role Catalog
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  Select a role to inspect or edit its permission matrix.
                </p>
              </div>
              {archivedRoles.length > 0 ? (
                <select
                  value={restoreTarget}
                  onChange={(event) => setRestoreTarget(event.target.value as Role)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  disabled={!canUpdateRolePermissions || restoreRoleMutation.isPending}
                >
                  {archivedRoles.map((profile) => (
                    <option key={profile.role} value={profile.role}>
                      Restore {profile.displayName}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>

            <div className="mt-5 space-y-3">
              {activeRoles.map((profile) => {
                const isSelected = profile.roleKey === selectedRoleKey;

                return (
                  <button
                    key={profile.roleKey}
                    type="button"
                    onClick={() => setSelectedRoleKey(profile.roleKey)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      isSelected
                        ? "border-blue-300 bg-blue-50"
                        : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {profile.displayName}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          Built-in: {ROLE_LABELS[profile.role]}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {countPermissionActions(profile.permissions)} enabled actions
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-semibold tracking-[0.16em] uppercase ${
                          profile.isCustomized
                            ? "bg-amber-100 text-amber-800"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {profile.isCustomized ? "Custom" : "Default"}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-600">
                      <MiniStat label="Users" value={profile.userCount} />
                      <MiniStat
                        label="Status"
                        value={profile.isArchived ? "Archived" : "Active"}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            {!selectedRole ? (
              <div className="p-12 text-center text-sm text-gray-500">
                Select a role to inspect permissions.
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.18em] text-gray-500 uppercase">
                      Selected Role
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-gray-900">
                      {selectedRole.displayName}
                    </h2>
                    <p className="mt-2 text-sm text-gray-500">
                      Default name: {selectedRole.defaultDisplayName}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setRoleActionError("");
                        setRenameTarget(selectedRole.role);
                      }}
                      disabled={!canEditSelectedRole}
                    >
                      Rename
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setIsPermissionModalOpen(true)}
                      disabled={!selectedRole || selectedRole.isArchived}
                    >
                      Permission Matrix
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setDeleteTarget(selectedRole.role);
                        setRoleActionError("");
                      }}
                      disabled={
                        !canUpdateRolePermissions ||
                        selectedRole.role === "ROOT" ||
                        selectedRole.userCount > 0
                      }
                    >
                      Archive
                    </Button>
                  </div>
                </div>

                {roleActionError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {roleActionError}
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-4">
                  <InlineMetric
                    label="Users"
                    value={String(selectedRole.userCount)}
                  />
                  <InlineMetric
                    label="Current Actions"
                    value={String(countPermissionActions(permissionDraft))}
                  />
                  <InlineMetric
                    label="Default Actions"
                    value={String(
                      countPermissionActions(selectedRole.defaultPermissions),
                    )}
                  />
                  <InlineMetric
                    label="State"
                    value={selectedRole.isArchived ? "Archived" : "Active"}
                  />
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                  <p className="text-sm font-semibold text-gray-900">
                    Enabled Modules
                  </p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {Object.entries(PERMISSION_MODULES).map(([moduleKey, moduleMeta]) => {
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
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      <Modal
        isOpen={isPermissionModalOpen && !!selectedRole}
        onClose={() => setIsPermissionModalOpen(false)}
        title={
          selectedRole
            ? `Permissions - ${selectedRole.displayName}`
            : "Role Permissions"
        }
        size="xl"
      >
        {selectedRole ? (
          <div className="space-y-6">
            {permissionError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {permissionError}
              </div>
            ) : null}

            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Toggle these permissions to control which sidebar menus and feature
              actions are visible for users with this role.
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {Object.entries(PERMISSION_MODULES).map(([moduleKey, moduleMeta]) => {
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
                            className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition ${
                              enabled
                                ? "border-blue-200 bg-blue-50 text-blue-700"
                                : "border-gray-200 bg-gray-50 text-gray-600"
                            } ${
                              canEditSelectedRole
                                ? "cursor-pointer hover:border-blue-300"
                                : "cursor-not-allowed opacity-60"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={enabled}
                              disabled={!canEditSelectedRole}
                              onChange={() => togglePermission(moduleKey, action)}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span>{PERMISSION_ACTIONS[action].label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4">
              <Button
                variant="secondary"
                onClick={handleResetPermissions}
                disabled={
                  !canEditSelectedRole ||
                  !selectedRole.isCustomized ||
                  resetPermissionsMutation.isPending ||
                  updatePermissionsMutation.isPending
                }
                isLoading={resetPermissionsMutation.isPending}
              >
                Reset to Default
              </Button>
              <Button
                onClick={handleSavePermissions}
                disabled={
                  !canEditSelectedRole ||
                  !permissionsDirty ||
                  updatePermissionsMutation.isPending ||
                  resetPermissionsMutation.isPending
                }
                isLoading={updatePermissionsMutation.isPending}
              >
                Save Permissions
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={renameTarget !== null}
        onClose={() => {
          setRenameTarget(null);
          setRoleActionError("");
        }}
        title="Rename Role"
        size="md"
      >
        <div className="space-y-4">
          <input
            value={renameDraft}
            onChange={(event) => setRenameDraft(event.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="Role display name"
          />
          {roleActionError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {roleActionError}
            </div>
          ) : null}
          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setRenameTarget(null);
                setRoleActionError("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRename}
              isLoading={renameRoleMutation.isPending}
              disabled={!renameDraft.trim()}
            >
              Save Name
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => {
          setDeleteTarget(null);
          setRoleActionError("");
        }}
        onConfirm={() => {
          if (!deleteTarget) {
            return;
          }
          deleteRoleMutation.mutate({ role: deleteTarget });
        }}
        title="Archive role?"
        message={
          deleteTarget
            ? `${ROLE_LABELS[deleteTarget]} will be hidden from role management and user assignment. Reassign active users before archiving.`
            : "Archive this role?"
        }
        confirmLabel="Archive"
        confirmDisabled={!canUpdateRolePermissions}
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
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold tracking-[0.18em] text-gray-500 uppercase">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold text-gray-900">{value}</p>
      <p className="mt-2 text-sm text-gray-500">{detail}</p>
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
