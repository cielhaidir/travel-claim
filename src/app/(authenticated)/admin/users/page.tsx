"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/features/PageHeader";
import { EmptyState } from "@/components/features/EmptyState";
import { Button } from "@/components/ui/Button";
import { ConfirmModal, Modal } from "@/components/ui/Modal";
import { formatDate } from "@/lib/utils/format";
import type { Role } from "../../../../../generated/prisma";
import { hasPermissionMap } from "@/lib/auth/permissions";

type Department = {
  id: string;
  name: string;
  code: string;
};

type UserRef = {
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
  _count: { directReports: number; travelRequests: number; claims: number };
};

type UserFormData = {
  name: string;
  email: string;
  password: string;
  employeeId: string;
  role: Role;
  departmentId: string;
  supervisorId: string;
  phoneNumber: string;
};

type ImportRow = {
  id?: string;
  displayName: string;
  userPrincipalName: string;
  userType: string;
};

type ImportResult = {
  email: string;
  status: "created" | "skipped";
  reason?: string;
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

const ROLE_OPTIONS = Object.keys(ROLE_LABELS) as Role[];

function buildDefaultForm(): UserFormData {
  return {
    name: "",
    email: "",
    password: "",
    employeeId: "",
    role: "EMPLOYEE",
    departmentId: "",
    supervisorId: "",
    phoneNumber: "",
  };
}

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

  if (!session || !canAccess) {
    return null;
  }

  return <UserManagementContent session={session} />;
}

function UserManagementContent({
  session,
}: {
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

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRef | null>(null);
  const [viewingUser, setViewingUser] = useState<UserRef | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserRef | null>(null);
  const [resetPwUser, setResetPwUser] = useState<UserRef | null>(null);

  const [form, setForm] = useState<UserFormData>(buildDefaultForm);
  const [newPassword, setNewPassword] = useState("");
  const [formError, setFormError] = useState("");

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importPassword, setImportPassword] = useState("Password@123");
  const [importError, setImportError] = useState("");
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const usersQuery = api.user.getAll.useQuery(
    {
      role: roleFilter === "ALL" ? undefined : roleFilter,
      departmentId: deptFilter || undefined,
      search: search || undefined,
      limit: 100,
    },
    { refetchOnWindowFocus: false },
  );
  const rawUsers = usersQuery.data as { users: UserRef[] } | undefined;
  const users = rawUsers?.users ?? [];

  const { data: rawDepts } = api.department.getAll.useQuery(
    {},
    { refetchOnWindowFocus: false },
  );
  const departments = (rawDepts as Department[] | undefined) ?? [];

  const createMutation = api.user.create.useMutation({
    onSuccess: async () => {
      await usersQuery.refetch();
      setIsCreateOpen(false);
      setForm(buildDefaultForm());
      setFormError("");
    },
    onError: (error) => setFormError(error.message),
  });

  const updateMutation = api.user.update.useMutation({
    onSuccess: async () => {
      await usersQuery.refetch();
      setEditingUser(null);
      setFormError("");
    },
    onError: (error) => setFormError(error.message),
  });

  const deleteMutation = api.user.delete.useMutation({
    onSuccess: async () => {
      await usersQuery.refetch();
      setDeletingUser(null);
    },
    onError: (error) => alert(`Error: ${error.message}`),
  });

  const resetPwMutation = api.user.resetPassword.useMutation({
    onSuccess: () => {
      setResetPwUser(null);
      setNewPassword("");
      alert("Password reset successfully.");
    },
    onError: (error) => alert(`Error: ${error.message}`),
  });

  const bulkImportMutation = api.user.bulkImport.useMutation({
    onSuccess: async (data) => {
      const result = data as {
        results: ImportResult[];
      };
      setImportResults(result.results);
      await usersQuery.refetch();
    },
    onError: (error) => setImportError(error.message),
  });

  const supervisors = useMemo(
    () =>
      users.filter((user) =>
        ["ROOT", "ADMIN", "DIRECTOR", "MANAGER", "SUPERVISOR", "FINANCE", "SALES_CHIEF"].includes(
          user.role,
        ),
      ),
    [users],
  );

  const openCreate = () => {
    if (!canCreateUser) return;
    setForm(buildDefaultForm());
    setFormError("");
    setIsCreateOpen(true);
  };

  const openEdit = (user: UserRef) => {
    if (!canUpdateUser) return;
    setEditingUser(user);
    setForm({
      name: user.name ?? "",
      email: user.email ?? "",
      password: "",
      employeeId: user.employeeId ?? "",
      role: user.role,
      departmentId: user.department?.id ?? "",
      supervisorId: user.supervisor?.id ?? "",
      phoneNumber: user.phoneNumber ?? "",
    });
    setFormError("");
  };

  const handleCreate = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");

    if (form.password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }

    createMutation.mutate({
      name: form.name,
      email: form.email,
      password: form.password,
      employeeId: form.employeeId || undefined,
      role: form.role,
      departmentId: form.departmentId || null,
      supervisorId: form.supervisorId || null,
      phoneNumber: form.phoneNumber || null,
    });
  };

  const handleUpdate = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingUser) return;

    setFormError("");
    updateMutation.mutate({
      id: editingUser.id,
      name: form.name,
      email: form.email,
      employeeId: form.employeeId || undefined,
      role: form.role,
      departmentId: form.departmentId || null,
      supervisorId: form.supervisorId || null,
      phoneNumber: form.phoneNumber || null,
    });
  };

  const handleResetPw = () => {
    if (!resetPwUser || newPassword.length < 8) return;
    resetPwMutation.mutate({ id: resetPwUser.id, newPassword });
  };

  const openImport = () => {
    if (!canImportUser) return;
    setImportRows([]);
    setImportError("");
    setImportResults(null);
    setImportPassword("Password@123");
    setIsImportOpen(true);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportError("");
    setImportResults(null);

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const data = new Uint8Array(loadEvent.target?.result as ArrayBuffer);
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

        const normalized: ImportRow[] = rows
          .map((row) => {
            const lower: Record<string, string> = {};
            for (const [key, value] of Object.entries(row)) {
              lower[key.trim().toLowerCase()] = String(value).trim();
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
          .filter((row) => row.userType.toLowerCase() === "member")
          .filter((row) => row.displayName && row.userPrincipalName);

        if (normalized.length === 0) {
          setImportError(
            "No valid member rows found. Make sure your file has a 'userType' column with value 'member'.",
          );
          setImportRows([]);
          return;
        }

        setImportRows(normalized);
      } catch {
        setImportError(
          "Failed to parse file. Please upload a valid Excel (.xlsx) or CSV file.",
        );
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleImportSubmit = () => {
    if (importRows.length === 0) return;
    if (importPassword.length < 8) {
      setImportError("Default password must be at least 8 characters.");
      return;
    }

    setImportError("");
    bulkImportMutation.mutate({
      users: importRows.map((row) => ({
        id: row.id ?? undefined,
        displayName: row.displayName,
        userPrincipalName: row.userPrincipalName,
      })),
      defaultPassword: importPassword,
    });
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
          canImportUser ? { label: "Import Users", onClick: openImport } : undefined
        }
      />

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-4">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, employee ID"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as Role | "ALL")}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="ALL">All Roles</option>
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <select
            value={deptFilter}
            onChange={(event) => setDeptFilter(event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">All Departments</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={() => void usersQuery.refetch()}>
            Refresh
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        {usersQuery.isLoading ? (
          <div className="p-12 text-center text-sm text-gray-500">Loading users...</div>
        ) : users.length === 0 ? (
          <EmptyState
            icon="US"
            title="No users found"
            description="No users match the current filters."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-semibold tracking-[0.12em] text-gray-500 uppercase">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Supervisor</th>
                  <th className="px-4 py-3">Stats</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {user.name ?? "-"}
                        </p>
                        <p className="text-xs text-gray-500">{user.email ?? "-"}</p>
                        <p className="text-xs text-gray-400">
                          {user.employeeId ?? "No employee ID"}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${ROLE_COLORS[user.role]}`}
                      >
                        {ROLE_LABELS[user.role]}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-gray-600">
                      {user.department?.name ?? "-"}
                    </td>
                    <td className="px-4 py-4 text-gray-600">
                      {user.supervisor?.name ?? user.supervisor?.email ?? "-"}
                    </td>
                    <td className="px-4 py-4 text-xs text-gray-500">
                      <p>{user._count.directReports} reports</p>
                      <p>{user._count.travelRequests} travel</p>
                      <p>{user._count.claims} claims</p>
                    </td>
                    <td className="px-4 py-4 text-gray-600">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setViewingUser(user)}
                        >
                          View
                        </Button>
                        {canUpdateUser ? (
                          <Button size="sm" onClick={() => openEdit(user)}>
                            Edit
                          </Button>
                        ) : null}
                        {canUpdateUser ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setResetPwUser(user)}
                          >
                            Reset Password
                          </Button>
                        ) : null}
                        {canDeleteUser ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setDeletingUser(user)}
                          >
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create User"
        size="lg"
      >
        <UserForm
          form={form}
          setForm={setForm}
          departments={departments}
          supervisorOptions={supervisors}
          onSubmit={handleCreate}
          onCancel={() => setIsCreateOpen(false)}
          isLoading={createMutation.isPending}
          error={formError}
          isCreate
        />
      </Modal>

      <Modal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        title={editingUser ? `Edit ${editingUser.name ?? editingUser.email ?? "User"}` : "Edit User"}
        size="lg"
      >
        <UserForm
          form={form}
          setForm={setForm}
          departments={departments}
          supervisorOptions={supervisors.filter((user) => user.id !== editingUser?.id)}
          onSubmit={handleUpdate}
          onCancel={() => setEditingUser(null)}
          isLoading={updateMutation.isPending}
          error={formError}
          isCreate={false}
        />
      </Modal>

      <Modal
        isOpen={!!viewingUser}
        onClose={() => setViewingUser(null)}
        title="User Detail"
        size="md"
      >
        {viewingUser ? (
          <div className="space-y-4">
            <Field label="Name" value={viewingUser.name ?? "-"} />
            <Field label="Email" value={viewingUser.email ?? "-"} />
            <Field label="Employee ID" value={viewingUser.employeeId ?? "-"} />
            <Field label="Role" value={ROLE_LABELS[viewingUser.role]} />
            <Field label="Department" value={viewingUser.department?.name ?? "-"} />
            <Field
              label="Supervisor"
              value={viewingUser.supervisor?.name ?? viewingUser.supervisor?.email ?? "-"}
            />
            <Field label="Phone" value={viewingUser.phoneNumber ?? "-"} />
            <Field label="Created" value={formatDate(viewingUser.createdAt)} />
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={!!resetPwUser}
        onClose={() => {
          setResetPwUser(null);
          setNewPassword("");
        }}
        title="Reset Password"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Enter a new password for {resetPwUser?.name ?? resetPwUser?.email ?? "this user"}.
          </p>
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Minimum 8 characters"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <div className="flex justify-end gap-3 border-t pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setResetPwUser(null);
                setNewPassword("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleResetPw}
              isLoading={resetPwMutation.isPending}
              disabled={newPassword.length < 8}
            >
              Reset Password
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deletingUser}
        onClose={() => setDeletingUser(null)}
        onConfirm={() => {
          if (!deletingUser) return;
          deleteMutation.mutate({ id: deletingUser.id });
        }}
        title={deletingUser ? `Delete ${deletingUser.name ?? deletingUser.email ?? "user"}?` : "Delete user?"}
        message="This performs a soft delete. The user record will remain in the database."
        confirmLabel="Delete"
        isLoading={deleteMutation.isPending}
        variant="danger"
      />

      <Modal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        title="Import Users"
        size="lg"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            Upload an Excel or CSV file with `displayName`, `userPrincipalName`, and `userType`.
            Only rows with `userType = member` will be imported.
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_auto]">
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Default Password
              </label>
              <input
                type="password"
                value={importPassword}
                onChange={(event) => setImportPassword(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div className="self-end">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                Choose File
              </Button>
            </div>
          </div>

          {importError ? (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {importError}
            </div>
          ) : null}

          {importRows.length > 0 && !importResults ? (
            <div>
              <p className="mb-2 text-xs font-medium text-gray-700">
                Preview: {importRows.length} member row(s)
              </p>
              <div className="max-h-52 overflow-y-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 text-left">
                    <tr>
                      <th className="px-3 py-2 font-semibold text-gray-500">
                        Display Name
                      </th>
                      <th className="px-3 py-2 font-semibold text-gray-500">
                        Email
                      </th>
                      <th className="px-3 py-2 font-semibold text-gray-500">
                        ID
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {importRows.map((row, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2">{row.displayName}</td>
                        <td className="px-3 py-2 text-gray-600">
                          {row.userPrincipalName}
                        </td>
                        <td className="px-3 py-2 text-gray-400">
                          {row.id ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {importResults ? (
            <div>
              <p className="mb-2 text-xs font-medium text-gray-700">Import Results</p>
              <div className="max-h-52 overflow-y-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 text-left">
                    <tr>
                      <th className="px-3 py-2 font-semibold text-gray-500">Email</th>
                      <th className="px-3 py-2 font-semibold text-gray-500">Status</th>
                      <th className="px-3 py-2 font-semibold text-gray-500">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {importResults.map((result, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2">{result.email}</td>
                        <td className="px-3 py-2">
                          {result.status === "created" ? "Created" : "Skipped"}
                        </td>
                        <td className="px-3 py-2 text-gray-500">
                          {result.reason ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="flex justify-end gap-3 border-t pt-4">
            <Button variant="secondary" onClick={() => setIsImportOpen(false)}>
              {importResults ? "Close" : "Cancel"}
            </Button>
            {!importResults ? (
              <Button
                onClick={handleImportSubmit}
                isLoading={bulkImportMutation.isPending}
                disabled={importRows.length === 0 || importPassword.length < 8}
              >
                Import Users
              </Button>
            ) : null}
          </div>
        </div>
      </Modal>
    </div>
  );
}

function UserForm({
  form,
  setForm,
  departments,
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
  supervisorOptions: UserRef[];
  onSubmit: (event: React.FormEvent) => void;
  onCancel: () => void;
  isLoading: boolean;
  error: string;
  isCreate: boolean;
}) {
  const set = (field: keyof UserFormData, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700">Full Name *</label>
          <input
            required
            value={form.name}
            onChange={(event) => set("name", event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">Email *</label>
          <input
            required
            type="email"
            value={form.email}
            onChange={(event) => set("email", event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        {isCreate ? (
          <div>
            <label className="block text-xs font-medium text-gray-700">Password *</label>
            <input
              required
              type="password"
              value={form.password}
              onChange={(event) => set("password", event.target.value)}
              placeholder="Min. 8 characters"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        ) : null}

        <div>
          <label className="block text-xs font-medium text-gray-700">Employee ID</label>
          <input
            value={form.employeeId}
            onChange={(event) => set("employeeId", event.target.value)}
            placeholder="e.g. EMP011"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700">Role *</label>
          <select
            value={form.role}
            onChange={(event) => set("role", event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700">Phone Number</label>
          <input
            value={form.phoneNumber}
            onChange={(event) => set("phoneNumber", event.target.value)}
            placeholder="+628..."
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700">Department</label>
          <select
            value={form.departmentId}
            onChange={(event) => set("departmentId", event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">No Department</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-700">Supervisor</label>
          <select
            value={form.supervisorId}
            onChange={(event) => set("supervisorId", event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">No Supervisor</option>
            {supervisorOptions.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name ?? user.email ?? user.id} - {ROLE_LABELS[user.role]}
                {user.department ? ` (${user.department.name})` : ""}
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
