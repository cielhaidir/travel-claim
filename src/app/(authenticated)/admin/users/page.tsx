"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/features/PageHeader";
import { EmptyState } from "@/components/features/EmptyState";
import { Button } from "@/components/ui/Button";
import { Modal, ConfirmModal } from "@/components/ui/Modal";
import { formatDate } from "@/lib/utils/format";
import type { MembershipStatus, Role } from "../../../../../generated/prisma";
import { hasPermissionMap } from "@/lib/auth/permissions";

// ─────────────────────────── Types ───────────────────────────

interface Department {
  id: string;
  name: string;
  code: string;
}

interface UserRef {
  id: string;
  name: string | null;
  email: string | null;
  employeeId: string | null;
  role: Role;
  phoneNumber: string | null;
  deletedAt: string | Date | null;
  createdAt: string | Date;
  department: Department | null;
  supervisor: { id: string; name: string | null; email: string | null } | null;
  memberships: {
    tenantId: string;
    role: Role;
    customRole: {
      id: string;
      displayName: string;
      baseRole: Role | null;
    } | null;
    status: MembershipStatus;
    isDefault: boolean;
    tenant: {
      id: string;
      name: string;
      slug: string;
      isRoot: boolean;
    };
  }[];
  _count: { directReports: number; travelRequests: number; claims: number };
}

interface TenantOption {
  id: string;
  name: string;
  slug: string;
  isRoot?: boolean;
}

interface TenantAccessForm {
  tenantId: string;
  role: Role;
  customRoleId: string | null;
  status: MembershipStatus;
  isDefault: boolean;
}

interface AssignableRoleOption {
  roleKey: string;
  roleKind: "SYSTEM" | "CUSTOM";
  displayName: string;
  baseRole: Role | null;
  systemRole: Role | null;
  customRoleId: string | null;
  tenantId: string;
}

interface UserFormData {
  name: string;
  email: string;
  password: string;
  employeeId: string;
  tenantMemberships: TenantAccessForm[];
  departmentId: string;
  supervisorId: string;
  phoneNumber: string;
}

// ─────────────────────────── Constants ───────────────────────────

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

const ROLE_COLORS: Record<Role, string> = {
  ROOT: "bg-black text-white",
  EMPLOYEE: "bg-gray-100 text-gray-700",
  SUPERVISOR: "bg-blue-100 text-blue-700",
  MANAGER: "bg-purple-100 text-purple-700",
  DIRECTOR: "bg-amber-100 text-amber-700",
  FINANCE: "bg-green-100 text-green-700",
  ADMIN: "bg-red-100 text-red-700",
  SALES_EMPLOYEE: "bg-cyan-100 text-cyan-700",
  SALES_CHIEF: "bg-teal-100 text-teal-700",
};
const EMPTY_ASSIGNABLE_ROLES: AssignableRoleOption[] = [];

function createTenantAccess(
  tenantId = "",
  role: Role = "EMPLOYEE",
  isDefault = false,
): TenantAccessForm {
  return {
    tenantId,
    role,
    customRoleId: null,
    status: "ACTIVE",
    isDefault,
  };
}

function getAssignableRoleValue(option: AssignableRoleOption) {
  return option.customRoleId
    ? `custom:${option.customRoleId}`
    : `system:${option.systemRole ?? option.baseRole ?? "EMPLOYEE"}`;
}

function resolveAssignableRole(
  option: AssignableRoleOption,
  fallback: Role = "EMPLOYEE",
) {
  return option.baseRole ?? option.systemRole ?? fallback;
}

function buildDefaultForm(defaultTenantId = ""): UserFormData {
  return {
    name: "",
    email: "",
    password: "",
    employeeId: "",
    tenantMemberships: defaultTenantId
      ? [createTenantAccess(defaultTenantId, "EMPLOYEE", true)]
      : [createTenantAccess()],
    departmentId: "",
    supervisorId: "",
    phoneNumber: "",
  };
}

// ─────────────────────────── Page Shell ───────────────────────────

export default function UserManagementPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const canAccess =
    (session?.user?.isRoot ?? false) ||
    hasPermissionMap(session?.user?.permissions, "users", "read");

  useEffect(() => {
    if (status !== "loading" && session && !canAccess) {
      void router.replace("/");
    }
  }, [canAccess, router, session, status]);

  if (status === "loading") {
    return (
      <div className="content-section p-12 text-center text-gray-500">
        Loading...
      </div>
    );
  }

  if (!session) {
    return null;
  }

  if (!canAccess) {
    return null;
  }

  return (
    <UserManagementContent
      session={session}
      canQuery={
        session.user.isRoot || !!session.user.activeTenantId
      }
    />
  );
}

// ─────────────────────────── Main Content ───────────────────────────

// ─────────────────────────── Import Types ───────────────────────────

interface ImportRow {
  id?: string;
  displayName: string;
  userPrincipalName: string;
  userType: string;
}

interface ImportResult {
  email: string;
  status: "created" | "skipped";
  reason?: string;
}

function UserManagementContent({
  canQuery,
  session,
}: {
  canQuery: boolean;
  session: NonNullable<ReturnType<typeof useSession>["data"]>;
}) {
  const canCreateUser =
    session.user.isRoot ||
    hasPermissionMap(session.user.permissions, "users", "create");
  const canUpdateUser =
    session.user.isRoot ||
    hasPermissionMap(session.user.permissions, "users", "update");
  const canDeleteUser =
    session.user.isRoot ||
    hasPermissionMap(session.user.permissions, "users", "delete");
  const canImportUser =
    session.user.isRoot ||
    hasPermissionMap(session.user.permissions, "users", "import");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "ALL">("ALL");
  const [deptFilter, setDeptFilter] = useState("");

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRef | null>(null);
  const [viewingUser, setViewingUser] = useState<UserRef | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserRef | null>(null);
  const [resetPwUser, setResetPwUser] = useState<UserRef | null>(null);

  // Import modal state
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importPassword, setImportPassword] = useState("Password@123");
  const [importError, setImportError] = useState("");
  const [importResults, setImportResults] = useState<ImportResult[] | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form & password state
  const [form, setForm] = useState<UserFormData>(() =>
    buildDefaultForm(session.user.activeTenantId ?? ""),
  );
  const [newPassword, setNewPassword] = useState("");
  const [formError, setFormError] = useState("");

  // Queries
  const usersQuery = api.user.getAll.useQuery(
    {
      role: roleFilter === "ALL" ? undefined : roleFilter,
      departmentId: deptFilter || undefined,
      search: search || undefined,
      limit: 100,
    },
    { refetchOnWindowFocus: false, enabled: canQuery },
  );
  const isLoading = usersQuery.isLoading;
  const refetch = usersQuery.refetch;
  const rawUsers = usersQuery.data as { users: UserRef[] } | undefined;
  const users = rawUsers?.users ?? [];

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data: rawDepts } = api.department.getAll.useQuery(
    {},
    { enabled: canQuery, refetchOnWindowFocus: false },
  );
  const departments = (rawDepts as Department[] | undefined) ?? [];

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data: rawTenants } = api.tenant.getAll.useQuery(undefined, {
    enabled: canQuery && session.user.isRoot,
    refetchOnWindowFocus: false,
  });
  const tenantOptions: TenantOption[] = session.user.isRoot
    ? (
        (rawTenants as
          | Array<{
              id: string;
              name: string;
              slug: string;
              isRoot: boolean;
            }>
          | undefined) ?? []
      ).map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        isRoot: tenant.isRoot,
      }))
    : (session.user.memberships ?? [])
        .filter((membership) => membership.status === "ACTIVE")
        .map((membership) => ({
          id: membership.tenantId,
          name: membership.tenantName,
          slug: membership.tenantSlug,
          isRoot: membership.isRootTenant,
        }));
  const tenantIdsForRoleCatalog = useMemo(() => {
    const ids = new Set<string>();

    for (const tenant of tenantOptions) {
      if (tenant.id) {
        ids.add(tenant.id);
      }
    }

    for (const membership of form.tenantMemberships) {
      if (membership.tenantId) {
        ids.add(membership.tenantId);
      }
    }

    return [...ids];
  }, [form.tenantMemberships, tenantOptions]);
  const roleCatalogQuery = api.tenant.getAssignableRolesCatalog.useQuery(
    { tenantIds: tenantIdsForRoleCatalog },
    {
      enabled: canQuery && tenantIdsForRoleCatalog.length > 0,
      refetchOnWindowFocus: false,
    },
  );
  const roleCatalog =
    (roleCatalogQuery.data as Record<string, AssignableRoleOption[]> | undefined) ??
    {};

  // Mutations
  const createMutation = api.user.create.useMutation({
    onSuccess: () => {
      void refetch();
      setIsCreateOpen(false);
      setForm(
        buildDefaultForm(
          session.user.activeTenantId ?? tenantOptions[0]?.id ?? "",
        ),
      );
      setFormError("");
    },
    onError: (e) => setFormError(e.message),
  });
  const updateMutation = api.user.update.useMutation({
    onSuccess: () => {
      void refetch();
      setEditingUser(null);
      setFormError("");
    },
    onError: (e) => setFormError(e.message),
  });
  const deleteMutation = api.user.delete.useMutation({
    onSuccess: () => {
      void refetch();
      setDeletingUser(null);
    },
    onError: (e) => alert(`Error: ${e.message}`),
  });
  const resetPwMutation = api.user.resetPassword.useMutation({
    onSuccess: () => {
      setResetPwUser(null);
      setNewPassword("");
      alert("Password reset successfully.");
    },
    onError: (e) => alert(`Error: ${e.message}`),
  });

  const bulkImportMutation = api.user.bulkImport.useMutation({
    onSuccess: (data) => {
      const d = data as {
        results: ImportResult[];
        created: number;
        skipped: number;
        total: number;
      };
      setImportResults(d.results);
      void refetch();
    },
    onError: (e) => setImportError(e.message),
  });

  // Import helpers
  const openImport = () => {
    if (!canImportUser) return;
    setImportRows([]);
    setImportError("");
    setImportResults(null);
    setImportPassword("Password@123");
    setIsImportOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError("");
    setImportResults(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];

        if (!sheetName) {
          setImportError("No sheets found in file.");
          return;
        }
        const sheet = workbook.Sheets[sheetName];

        if (!sheet) {
          setImportError("Sheet not found in file.");
          return;
        }
        const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, {
          defval: "",
        });

        // Normalize keys (case-insensitive)
        const normalised: ImportRow[] = rows
          .map((row) => {
            const lower: Record<string, string> = {};
            for (const [k, v] of Object.entries(row)) {
              lower[k.trim().toLowerCase()] = String(v).trim();
            }
            return {
              id: lower.id ?? "",
              displayName: lower.displayname ?? lower.display_name ?? "",
              userPrincipalName:
                lower.userprincipalname ??
                lower.user_principal_name ??
                lower.email ??
                "",
              userType: lower.usertype ?? lower.user_type ?? "",
            };
          })
          // Only include member rows
          .filter((row) => row.userType.toLowerCase() === "member")
          // Drop rows missing required fields
          .filter((row) => row.displayName && row.userPrincipalName);

        if (normalised.length === 0) {
          setImportError(
            "No valid member rows found. Make sure your file has a 'userType' column with value 'member'.",
          );
          setImportRows([]);
        } else {
          setImportRows(normalised);
        }
      } catch {
        setImportError(
          "Failed to parse file. Please upload a valid Excel (.xlsx) or CSV file.",
        );
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImportSubmit = () => {
    if (!canImportUser) return;
    if (importRows.length === 0) return;
    if (importPassword.length < 8) {
      setImportError("Default password must be at least 8 characters.");
      return;
    }
    setImportError("");
    bulkImportMutation.mutate({
      users: importRows.map((r) => ({
        id: r.id ?? undefined,
        displayName: r.displayName,
        userPrincipalName: r.userPrincipalName,
      })),
      defaultPassword: importPassword,
    });
  };

  // Helpers
  const openCreate = () => {
    if (!canCreateUser) return;
    setForm(
      buildDefaultForm(
        session.user.activeTenantId ?? tenantOptions[0]?.id ?? "",
      ),
    );
    setFormError("");
    setIsCreateOpen(true);
  };
  const openEdit = (user: UserRef) => {
    if (!canUpdateUser) return;
    setForm({
      name: user.name ?? "",
      email: user.email ?? "",
      password: "",
      employeeId: user.employeeId ?? "",
      tenantMemberships:
        user.memberships.length > 0
          ? user.memberships.map((membership) => ({
              tenantId: membership.tenantId,
              role: membership.role,
              customRoleId: membership.customRole?.id ?? null,
              status: membership.status,
              isDefault: membership.isDefault,
            }))
          : [
              createTenantAccess(
                session.user.activeTenantId ?? "",
                user.role,
                true,
              ),
            ],
      departmentId: user.department?.id ?? "",
      supervisorId: user.supervisor?.id ?? "",
      phoneNumber: user.phoneNumber ?? "",
    });
    setFormError("");
    setEditingUser(user);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!form.password || form.password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }
    createMutation.mutate({
      name: form.name,
      email: form.email,
      password: form.password,
      employeeId: form.employeeId || undefined,
      tenantMemberships: form.tenantMemberships,
      departmentId: form.departmentId || undefined,
      supervisorId: form.supervisorId || undefined,
      phoneNumber: form.phoneNumber || undefined,
    });
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !canUpdateUser) return;
    setFormError("");
    updateMutation.mutate({
      id: editingUser.id,
      name: form.name,
      email: form.email,
      employeeId: form.employeeId || undefined,
      tenantMemberships: form.tenantMemberships,
      departmentId: form.departmentId || null,
      supervisorId: form.supervisorId || null,
      phoneNumber: form.phoneNumber || null,
    });
  };

  const handleResetPw = () => {
    if (!resetPwUser || !canUpdateUser || newPassword.length < 8) return;
    resetPwMutation.mutate({ id: resetPwUser.id, newPassword });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="Manage users, roles, and organisational hierarchy"
        primaryAction={
          canCreateUser ? { label: "Add User", onClick: openCreate } : undefined
        }
        secondaryAction={
          canImportUser
            ? { label: "Import Users", onClick: openImport }
            : undefined
        }
      />

      {/* Department / Group Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {departments.map((dept) => {
          const deptUsers = users.filter((u) => u.department?.id === dept.id);
          const chief = deptUsers.find((u) =>
            ["SUPERVISOR", "MANAGER", "ADMIN"].includes(u.role),
          );
          const isActive = deptFilter === dept.id;
          return (
            <button
              key={dept.id}
              type="button"
              onClick={() => setDeptFilter(isActive ? "" : dept.id)}
              className={`content-section p-4 text-left transition-all hover:border-blue-400 hover:shadow-md ${
                isActive ? "border-blue-500 bg-blue-50 shadow-md" : ""
              }`}
            >
              <p className="text-xs font-semibold text-gray-500 uppercase">
                {dept.name}
              </p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {deptUsers.length}
              </p>
              <p className="mt-0.5 truncate text-xs text-gray-500">
                {chief ? `Chief: ${chief.name ?? "—"}` : "No chief assigned"}
              </p>
            </button>
          );
        })}
        {/* Director card */}
        {(() => {
          const directors = users.filter((u) => u.role === "DIRECTOR");
          return (
            <div className="content-section p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase">
                Director
              </p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {directors.length}
              </p>
              <p className="mt-0.5 truncate text-xs text-gray-500">
                {directors[0]?.name ?? "Not assigned"}
              </p>
            </div>
          );
        })()}
      </div>

      {/* Filters */}
      <div className="content-section p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search name, email, employee ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as Role | "ALL")}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="ALL">All Roles</option>
            <option value="EMPLOYEE">Employee</option>
            <option value="SUPERVISOR">Supervisor</option>
            <option value="MANAGER">Manager</option>
            <option value="DIRECTOR">Director</option>
            <option value="FINANCE">Finance</option>
            <option value="ADMIN">Admin</option>
            <option value="SALES_EMPLOYEE">Sales Employee</option>
            <option value="SALES_CHIEF">Sales Chief</option>
          </select>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {(deptFilter || roleFilter !== "ALL" || search) && (
            <button
              onClick={() => {
                setDeptFilter("");
                setRoleFilter("ALL");
                setSearch("");
              }}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* User Table */}
      {isLoading ? (
        <div className="content-section p-12 text-center text-gray-500">
          Loading…
        </div>
      ) : users.length === 0 ? (
        <div className="content-section">
          <EmptyState
            icon="👥"
            title="No users found"
            description="Create your first user or adjust the filters"
            action={canCreateUser ? { label: "Add User", onClick: openCreate } : undefined}
          />
        </div>
      ) : (
        <div className="content-table">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Supervisor</th>
                <th className="px-4 py-3 text-center">Reports</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">
                      {user.name ?? "—"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {user.employeeId ?? "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {user.email ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(user.memberships.length > 0
                        ? user.memberships
                            .filter(
                              (membership) => membership.status === "ACTIVE",
                            )
                            .map((membership) => ({
                              key: `${membership.tenantId}-${membership.customRole?.id ?? membership.role}`,
                              label: `${membership.tenant.slug}: ${membership.customRole?.displayName ?? ROLE_LABELS[membership.role]}`,
                              role: membership.role,
                            }))
                        : [
                            {
                              key: user.role,
                              label: ROLE_LABELS[user.role],
                              role: user.role,
                            },
                          ]
                      ).map((item) => (
                        <span
                          key={item.key}
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${ROLE_COLORS[item.role]}`}
                        >
                          {item.label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {user.department?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {user.supervisor?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">
                    {user._count.directReports}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setViewingUser(user)}
                        className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                      >
                        View
                      </button>
                      {canUpdateUser ? (
                        <>
                          <button
                            onClick={() => openEdit(user)}
                            className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              setResetPwUser(user);
                              setNewPassword("");
                            }}
                            className="rounded px-2 py-1 text-xs text-amber-600 hover:bg-amber-50"
                          >
                            Reset PW
                          </button>
                        </>
                      ) : null}
                      {canDeleteUser ? (
                        <button
                          onClick={() => setDeletingUser(user)}
                          className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t bg-gray-50 px-4 py-2 text-xs text-gray-500">
            {users.length} user{users.length !== 1 ? "s" : ""} found
          </div>
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────── */}

      {/* Create */}
      <Modal
        isOpen={isCreateOpen && canCreateUser}
        onClose={() => setIsCreateOpen(false)}
        title="Add New User"
        size="lg"
      >
        <UserForm
          form={form}
          setForm={setForm}
          departments={departments}
          tenantOptions={tenantOptions}
          roleCatalog={roleCatalog}
          canManageAllTenants={session.user.isRoot}
          supervisorOptions={users}
          onSubmit={handleCreate}
          onCancel={() => setIsCreateOpen(false)}
          isLoading={createMutation.isPending}
          error={formError}
          isCreate
        />
      </Modal>

      {/* Edit */}
      <Modal
        isOpen={!!editingUser && canUpdateUser}
        onClose={() => setEditingUser(null)}
        title={`Edit User — ${editingUser?.name ?? ""}`}
        size="lg"
      >
        <UserForm
          form={form}
          setForm={setForm}
          departments={departments}
          tenantOptions={tenantOptions}
          roleCatalog={roleCatalog}
          canManageAllTenants={session.user.isRoot}
          supervisorOptions={users.filter((u) => u.id !== editingUser?.id)}
          onSubmit={handleUpdate}
          onCancel={() => setEditingUser(null)}
          isLoading={updateMutation.isPending}
          error={formError}
          isCreate={false}
        />
      </Modal>

      {/* View */}
      <Modal
        isOpen={!!viewingUser}
        onClose={() => setViewingUser(null)}
        title={`User — ${viewingUser?.name ?? ""}`}
        size="lg"
      >
        {viewingUser && (
          <div className="space-y-5 text-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-xl font-bold text-blue-700">
                {(viewingUser.name ?? "?")[0]?.toUpperCase()}
              </div>
              <div>
                <p className="text-lg font-semibold text-gray-900">
                  {viewingUser.name ?? "—"}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(() => {
                    const primaryMembership =
                      viewingUser.memberships.find(
                        (membership) =>
                          membership.status === "ACTIVE" && membership.isDefault,
                      ) ??
                      viewingUser.memberships.find(
                        (membership) => membership.status === "ACTIVE",
                      ) ??
                      viewingUser.memberships[0] ??
                      null;
                    const primaryRole = primaryMembership?.role ?? viewingUser.role;
                    const primaryRoleLabel =
                      primaryMembership?.customRole?.displayName ??
                      ROLE_LABELS[primaryRole];

                    return (
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLORS[primaryRole]}`}
                      >
                        {primaryRoleLabel}
                      </span>
                    );
                  })()}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Employee ID"
                value={viewingUser.employeeId ?? "—"}
              />
              <Field label="Email" value={viewingUser.email ?? "—"} />
              <Field label="Phone" value={viewingUser.phoneNumber ?? "—"} />
              <Field
                label="Department"
                value={viewingUser.department?.name ?? "—"}
              />
              <Field
                label="Supervisor"
                value={viewingUser.supervisor?.name ?? "—"}
              />
              <Field
                label="Direct Reports"
                value={String(viewingUser._count.directReports)}
              />
              <Field
                label="Travel Requests"
                value={String(viewingUser._count.travelRequests)}
              />
              <Field label="Claims" value={String(viewingUser._count.claims)} />
              <Field
                label="Created At"
                value={formatDate(viewingUser.createdAt)}
              />
              <Field
                label="Status"
                value={viewingUser.deletedAt ? "🔴 Deleted" : "🟢 Active"}
              />
            </div>
            <div className="flex justify-end gap-3 border-t pt-4">
              {canDeleteUser ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setDeletingUser(viewingUser);
                    setViewingUser(null);
                  }}
                >
                  Delete
                </Button>
              ) : null}
              {canUpdateUser ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setResetPwUser(viewingUser);
                      setViewingUser(null);
                    }}
                  >
                    Reset Password
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      openEdit(viewingUser);
                      setViewingUser(null);
                    }}
                  >
                    Edit
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={!!deletingUser}
        onClose={() => setDeletingUser(null)}
        onConfirm={() =>
          canDeleteUser &&
          deletingUser &&
          deleteMutation.mutate({ id: deletingUser.id })
        }
        title="Delete User"
        message={`Delete "${deletingUser?.name ?? "this user"}"? This will soft-delete the account. Users with active direct reports cannot be deleted.`}
        confirmLabel="Delete"
        isLoading={deleteMutation.isPending}
        variant="danger"
      />

      {/* Reset Password */}
      <Modal
        isOpen={!!resetPwUser && canUpdateUser}
        onClose={() => setResetPwUser(null)}
        title={`Reset Password — ${resetPwUser?.name ?? ""}`}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Set a new password for <strong>{resetPwUser?.name}</strong>.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-700">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setResetPwUser(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleResetPw}
              isLoading={resetPwMutation.isPending}
              disabled={newPassword.length < 8}
            >
              Reset Password
            </Button>
          </div>
        </div>
      </Modal>
      {/* Import Users Modal */}
      <Modal
        isOpen={isImportOpen && canImportUser}
        onClose={() => setIsImportOpen(false)}
        title="Import Users from Excel / CSV"
        size="lg"
      >
        <div className="space-y-4 text-sm">
          {/* Instructions */}
          <div className="rounded-lg bg-blue-50 px-4 py-3 text-blue-800">
            <p className="font-medium">Expected columns in your file:</p>
            <ul className="mt-1 list-disc pl-4 text-xs">
              <li>
                <code>id</code> — optional, Azure/external ID
              </li>
              <li>
                <code>displayName</code> — full name (required)
              </li>
              <li>
                <code>userPrincipalName</code> — email address (required)
              </li>
              <li>
                <code>userType</code> — only rows with value{" "}
                <strong>member</strong> will be imported
              </li>
            </ul>
            <p className="mt-1 text-xs">
              Supports <strong>.xlsx</strong>, <strong>.xls</strong>, and{" "}
              <strong>.csv</strong> files.
            </p>
          </div>

          {/* File picker */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Upload File *
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>

          {/* Default password */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Default Password (min 8 chars) *
            </label>
            <input
              type="text"
              value={importPassword}
              onChange={(e) => setImportPassword(e.target.value)}
              placeholder="Password@123"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">
              All imported users will receive this temporary password.
            </p>
          </div>

          {/* Error */}
          {importError && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {importError}
            </div>
          )}

          {/* Preview table */}
          {importRows.length > 0 && !importResults && (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-700">
                Preview —{" "}
                <span className="text-blue-600">
                  {importRows.length} member row(s)
                </span>{" "}
                ready to import
              </p>
              <div className="max-h-52 overflow-y-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 text-left">
                    <tr>
                      <th className="px-3 py-2 font-semibold text-gray-500">
                        Display Name
                      </th>
                      <th className="px-3 py-2 font-semibold text-gray-500">
                        Email (UPN)
                      </th>
                      <th className="px-3 py-2 font-semibold text-gray-500">
                        ID
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {importRows.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2">{row.displayName}</td>
                        <td className="px-3 py-2 text-gray-600">
                          {row.userPrincipalName}
                        </td>
                        <td className="px-3 py-2 text-gray-400">
                          {row.id ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Results */}
          {importResults && (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-700">
                Import Results
              </p>
              <div className="max-h-52 overflow-y-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 text-left">
                    <tr>
                      <th className="px-3 py-2 font-semibold text-gray-500">
                        Email
                      </th>
                      <th className="px-3 py-2 font-semibold text-gray-500">
                        Status
                      </th>
                      <th className="px-3 py-2 font-semibold text-gray-500">
                        Reason
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {importResults.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2">{r.email}</td>
                        <td
                          className={`px-3 py-2 font-semibold ${r.status === "created" ? "text-green-600" : "text-amber-600"}`}
                        >
                          {r.status === "created" ? "✓ Created" : "⚠ Skipped"}
                        </td>
                        <td className="px-3 py-2 text-gray-400">
                          {r.reason ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {importResults.filter((r) => r.status === "created").length}{" "}
                created ·{" "}
                {importResults.filter((r) => r.status === "skipped").length}{" "}
                skipped
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 border-t pt-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsImportOpen(false)}
            >
              {importResults ? "Close" : "Cancel"}
            </Button>
            {!importResults && (
              <Button
                size="sm"
                onClick={handleImportSubmit}
                isLoading={bulkImportMutation.isPending}
                disabled={importRows.length === 0 || importPassword.length < 8}
              >
                Import{" "}
                {importRows.length > 0 ? `${importRows.length} Users` : "Users"}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ─────────────────────────── User Form ─────────────────────────── */

function UserForm({
  form,
  setForm,
  departments,
  tenantOptions,
  roleCatalog,
  canManageAllTenants,
  supervisorOptions,
  onSubmit,
  onCancel,
  isLoading,
  error,
  isCreate,
}: {
  form: UserFormData;
  setForm: React.Dispatch<React.SetStateAction<UserFormData>>;
  departments: Department[];
  tenantOptions: TenantOption[];
  roleCatalog: Record<string, AssignableRoleOption[]>;
  canManageAllTenants: boolean;
  supervisorOptions: UserRef[];
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  isLoading: boolean;
  error: string;
  isCreate: boolean;
}) {
  const set = (field: keyof UserFormData, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const getRoleOptions = (tenantId: string) =>
    roleCatalog[tenantId] ?? EMPTY_ASSIGNABLE_ROLES;

  const updateTenantAccess = (
    index: number,
    patch: Partial<TenantAccessForm>,
  ) => {
    setForm((prev) => ({
      ...prev,
      tenantMemberships: prev.tenantMemberships.map((membership, current) =>
        current === index ? { ...membership, ...patch } : membership,
      ),
    }));
  };

  const addTenantAccess = () => {
    const defaultTenantId = tenantOptions[0]?.id ?? "";
    const defaultRoleOptions =
      roleCatalog[defaultTenantId] ?? EMPTY_ASSIGNABLE_ROLES;
    const defaultOption = defaultRoleOptions[0];

    setForm((prev) => ({
      ...prev,
      tenantMemberships: [
        ...prev.tenantMemberships,
        {
          ...createTenantAccess(
            defaultTenantId,
            defaultOption
              ? resolveAssignableRole(defaultOption)
              : "EMPLOYEE",
            false,
          ),
          customRoleId: defaultOption?.customRoleId ?? null,
        },
      ],
    }));
  };

  const removeTenantAccess = (index: number) => {
    setForm((prev) => {
      const next = prev.tenantMemberships.filter(
        (_, current) => current !== index,
      );
      if (!next.some((membership) => membership.isDefault) && next[0]) {
        next[0] = { ...next[0], isDefault: true };
      }
      return {
        ...prev,
        tenantMemberships: next.length > 0 ? next : [createTenantAccess()],
      };
    });
  };

  const setDefaultTenantAccess = (index: number) => {
    setForm((prev) => ({
      ...prev,
      tenantMemberships: prev.tenantMemberships.map((membership, current) => ({
        ...membership,
        isDefault: current === index,
      })),
    }));
  };

  useEffect(() => {
    setForm((prev) => {
      let changed = false;

      const nextMemberships = prev.tenantMemberships.map((membership) => {
        const roleOptions =
          roleCatalog[membership.tenantId] ?? EMPTY_ASSIGNABLE_ROLES;
        if (roleOptions.length === 0) {
          if (membership.customRoleId !== null) {
            changed = true;
            return {
              ...membership,
              customRoleId: null,
            };
          }

          return membership;
        }

        const currentKey = membership.customRoleId
          ? `custom:${membership.customRoleId}`
          : `system:${membership.role}`;
        const hasCurrentOption = roleOptions.some((option) =>
          getAssignableRoleValue(option) === currentKey,
        );

        if (hasCurrentOption) {
          return membership;
        }

        const nextOption = roleOptions[0];
        if (!nextOption) {
          return membership;
        }

        changed = true;
        return {
          ...membership,
          role: resolveAssignableRole(nextOption, membership.role),
          customRoleId: nextOption.customRoleId,
        };
      });

      return changed
        ? {
            ...prev,
            tenantMemberships: nextMemberships,
          }
        : prev;
    });
  }, [roleCatalog, setForm]);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-gray-700">
            Full Name *
          </label>
          <input
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
        {/* Email */}
        <div>
          <label className="block text-xs font-medium text-gray-700">
            Email *
          </label>
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
        {/* Password (create only) */}
        {isCreate && (
          <div>
            <label className="block text-xs font-medium text-gray-700">
              Password *
            </label>
            <input
              required
              type="password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              placeholder="Min. 8 characters"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        )}
        {/* Employee ID */}
        <div>
          <label className="block text-xs font-medium text-gray-700">
            Employee ID
          </label>
          <input
            value={form.employeeId}
            onChange={(e) => set("employeeId", e.target.value)}
            placeholder="e.g. EMP011"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
        {/* Phone */}
        <div>
          <label className="block text-xs font-medium text-gray-700">
            Phone Number
          </label>
          <input
            value={form.phoneNumber}
            onChange={(e) => set("phoneNumber", e.target.value)}
            placeholder="+628..."
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-700">
            Tenant Access *
          </label>
          <div className="mt-2 space-y-3">
            {form.tenantMemberships.map((membership, index) => (
              <div
                key={`${membership.tenantId}-${index}`}
                className="content-subcard p-3"
              >
                <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_auto_auto]">
                  <div>
                    <label className="block text-[11px] font-medium tracking-[0.12em] text-gray-500 uppercase">
                      Tenant
                    </label>
                    <select
                      value={membership.tenantId}
                      disabled={!canManageAllTenants}
                      onChange={(e) =>
                        updateTenantAccess(index, { tenantId: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100"
                    >
                      <option value="">Select tenant</option>
                      {tenantOptions.map((tenant) => (
                        <option key={tenant.id} value={tenant.id}>
                          {tenant.name}
                          {tenant.isRoot ? " (Root)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium tracking-[0.12em] text-gray-500 uppercase">
                      Role
                    </label>
                    <select
                      value={
                        membership.customRoleId
                          ? `custom:${membership.customRoleId}`
                          : `system:${membership.role}`
                      }
                      onChange={(e) => {
                        const selectedValue = e.target.value;
                        if (selectedValue === "system:ROOT") {
                          updateTenantAccess(index, {
                            role: "ROOT",
                            customRoleId: null,
                          });
                          return;
                        }

                        const selectedOption = getRoleOptions(
                          membership.tenantId,
                        ).find((option) =>
                          getAssignableRoleValue(option) === selectedValue,
                        );

                        if (!selectedOption) {
                          return;
                        }

                        updateTenantAccess(index, {
                          role: resolveAssignableRole(
                            selectedOption,
                            membership.role,
                          ),
                          customRoleId: selectedOption.customRoleId,
                        });
                      }}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    >
                      {getRoleOptions(membership.tenantId).length > 0 ? (
                        getRoleOptions(membership.tenantId).map((option) => (
                          <option
                            key={option.roleKey}
                            value={getAssignableRoleValue(option)}
                          >
                            {option.displayName}
                          </option>
                        ))
                      ) : (
                        <option value={`system:${membership.role}`}>
                          {ROLE_LABELS[membership.role]}
                        </option>
                      )}
                    </select>
                  </div>

                  <label className="flex items-center gap-2 pt-6 text-sm text-gray-700">
                    <input
                      type="radio"
                      name="defaultTenantAccess"
                      checked={membership.isDefault}
                      onChange={() => setDefaultTenantAccess(index)}
                      className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Default
                  </label>

                  {canManageAllTenants && form.tenantMemberships.length > 1 ? (
                    <div className="pt-5 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeTenantAccess(index)}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <div />
                  )}
                </div>
              </div>
            ))}
          </div>

          {canManageAllTenants && (
            <div className="mt-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={addTenantAccess}
              >
                Add Tenant Access
              </Button>
            </div>
          )}

          <p className="mt-2 text-xs text-gray-400">
            The active tenant determines the role used at login. Department
            stays on the user record in the current schema.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700">
            Department
          </label>
          <select
            value={form.departmentId}
            onChange={(e) => set("departmentId", e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">— No Department —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-700">
            Supervisor
          </label>
          <select
            value={form.supervisorId}
            onChange={(e) => set("supervisorId", e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">— No Supervisor —</option>
            {supervisorOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.email ?? u.id} — {ROLE_LABELS[u.role]}
                {u.department ? ` (${u.department.name})` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t pt-4">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" isLoading={isLoading}>
          {isCreate ? "Create User" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-0.5 text-sm text-gray-900">{value}</p>
    </div>
  );
}
