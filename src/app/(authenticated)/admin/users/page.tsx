"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/features/PageHeader";
import { EmptyState } from "@/components/features/EmptyState";
import { Button } from "@/components/ui/Button";
import { Modal, ConfirmModal } from "@/components/ui/Modal";
import { formatDate } from "@/lib/utils/format";
import type { Role } from "../../../../../generated/prisma";

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
  _count: { directReports: number; travelRequests: number; claims: number };
}

interface UserFormData {
  name: string;
  email: string;
  password: string;
  employeeId: string;
  role: Role;
  departmentId: string;
  supervisorId: string;
  phoneNumber: string;
}

// ─────────────────────────── Constants ───────────────────────────

const ROLE_LABELS: Record<Role, string> = {
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
  EMPLOYEE: "bg-gray-100 text-gray-700",
  SUPERVISOR: "bg-blue-100 text-blue-700",
  MANAGER: "bg-purple-100 text-purple-700",
  DIRECTOR: "bg-amber-100 text-amber-700",
  FINANCE: "bg-green-100 text-green-700",
  ADMIN: "bg-red-100 text-red-700",
  SALES_EMPLOYEE: "bg-cyan-100 text-cyan-700",
  SALES_CHIEF: "bg-teal-100 text-teal-700",
};

const DEFAULT_FORM: UserFormData = {
  name: "",
  email: "",
  password: "",
  employeeId: "",
  role: "EMPLOYEE",
  departmentId: "",
  supervisorId: "",
  phoneNumber: "",
};

// ─────────────────────────── Page Shell ───────────────────────────

export default function UserManagementPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const userRole = session?.user?.role ?? "EMPLOYEE";

  if (userRole !== "ADMIN") {
    router.replace("/");
    return null;
  }

  return <UserManagementContent />;
}

// ─────────────────────────── Main Content ───────────────────────────

function UserManagementContent() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "ALL">("ALL");
  const [deptFilter, setDeptFilter] = useState("");

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRef | null>(null);
  const [viewingUser, setViewingUser] = useState<UserRef | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserRef | null>(null);
  const [resetPwUser, setResetPwUser] = useState<UserRef | null>(null);

  // Form & password state
  const [form, setForm] = useState<UserFormData>(DEFAULT_FORM);
  const [newPassword, setNewPassword] = useState("");
  const [formError, setFormError] = useState("");

  // Queries
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data: rawUsers, isLoading, refetch } = api.user.getAll.useQuery(
    {
      role: roleFilter === "ALL" ? undefined : roleFilter,
      departmentId: deptFilter || undefined,
      search: search || undefined,
      limit: 100,
    },
    { refetchOnWindowFocus: false }
  );
  const users = (rawUsers as { users: UserRef[] } | undefined)?.users ?? [];

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data: rawDepts } = api.department.getAll.useQuery({});
  const departments = (rawDepts as Department[] | undefined) ?? [];

  // Mutations
  const createMutation = api.user.create.useMutation({
    onSuccess: () => { void refetch(); setIsCreateOpen(false); setForm(DEFAULT_FORM); setFormError(""); },
    onError: (e) => setFormError(e.message),
  });
  const updateMutation = api.user.update.useMutation({
    onSuccess: () => { void refetch(); setEditingUser(null); setFormError(""); },
    onError: (e) => setFormError(e.message),
  });
  const deleteMutation = api.user.delete.useMutation({
    onSuccess: () => { void refetch(); setDeletingUser(null); },
    onError: (e) => alert(`Error: ${e.message}`),
  });
  const resetPwMutation = api.user.resetPassword.useMutation({
    onSuccess: () => { setResetPwUser(null); setNewPassword(""); alert("Password reset successfully."); },
    onError: (e) => alert(`Error: ${e.message}`),
  });

  // Helpers
  const openCreate = () => { setForm(DEFAULT_FORM); setFormError(""); setIsCreateOpen(true); };
  const openEdit = (user: UserRef) => {
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
      role: form.role,
      departmentId: form.departmentId || undefined,
      supervisorId: form.supervisorId || undefined,
      phoneNumber: form.phoneNumber || undefined,
    });
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="Manage users, roles, and organisational hierarchy"
        primaryAction={{ label: "Add User", onClick: openCreate }}
      />

      {/* Department / Group Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {departments.map((dept) => {
          const deptUsers = users.filter((u) => u.department?.id === dept.id);
          const chief = deptUsers.find((u) =>
            ["SUPERVISOR", "MANAGER", "ADMIN"].includes(u.role)
          );
          const isActive = deptFilter === dept.id;
          return (
            <button
              key={dept.id}
              type="button"
              onClick={() => setDeptFilter(isActive ? "" : dept.id)}
              className={`rounded-lg border p-4 text-left transition-colors hover:border-blue-400 ${
                isActive ? "border-blue-500 bg-blue-50" : "bg-white"
              }`}
            >
              <p className="text-xs font-semibold uppercase text-gray-500">{dept.name}</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{deptUsers.length}</p>
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
            <div className="rounded-lg border bg-white p-4">
              <p className="text-xs font-semibold uppercase text-gray-500">Director</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{directors.length}</p>
              <p className="mt-0.5 truncate text-xs text-gray-500">
                {directors[0]?.name ?? "Not assigned"}
              </p>
            </div>
          );
        })()}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search name, email, employee ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as Role | "ALL")}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        {(deptFilter || roleFilter !== "ALL" || search) && (
          <button
            onClick={() => { setDeptFilter(""); setRoleFilter("ALL"); setSearch(""); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* User Table */}
      {isLoading ? (
        <div className="rounded-lg border bg-white p-12 text-center text-gray-500">Loading…</div>
      ) : users.length === 0 ? (
        <EmptyState
          icon="👥"
          title="No users found"
          description="Create your first user or adjust the filters"
          action={{ label: "Add User", onClick: openCreate }}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
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
                    <p className="font-medium text-gray-900">{user.name ?? "—"}</p>
                    <p className="text-xs text-gray-500">{user.employeeId ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{user.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLORS[user.role]}`}
                    >
                      {ROLE_LABELS[user.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{user.department?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{user.supervisor?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{user._count.directReports}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setViewingUser(user)}
                        className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                      >
                        View
                      </button>
                      <button
                        onClick={() => openEdit(user)}
                        className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => { setResetPwUser(user); setNewPassword(""); }}
                        className="rounded px-2 py-1 text-xs text-amber-600 hover:bg-amber-50"
                      >
                        Reset PW
                      </button>
                      <button
                        onClick={() => setDeletingUser(user)}
                        className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
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
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Add New User" size="lg">
        <UserForm
          form={form}
          setForm={setForm}
          departments={departments}
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
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        title={`Edit User — ${editingUser?.name ?? ""}`}
        size="lg"
      >
        <UserForm
          form={form}
          setForm={setForm}
          departments={departments}
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
                <p className="text-lg font-semibold text-gray-900">{viewingUser.name ?? "—"}</p>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLORS[viewingUser.role]}`}
                >
                  {ROLE_LABELS[viewingUser.role]}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Employee ID" value={viewingUser.employeeId ?? "—"} />
              <Field label="Email" value={viewingUser.email ?? "—"} />
              <Field label="Phone" value={viewingUser.phoneNumber ?? "—"} />
              <Field label="Department" value={viewingUser.department?.name ?? "—"} />
              <Field label="Supervisor" value={viewingUser.supervisor?.name ?? "—"} />
              <Field label="Direct Reports" value={String(viewingUser._count.directReports)} />
              <Field label="Travel Requests" value={String(viewingUser._count.travelRequests)} />
              <Field label="Claims" value={String(viewingUser._count.claims)} />
              <Field label="Created At" value={formatDate(viewingUser.createdAt)} />
              <Field label="Status" value={viewingUser.deletedAt ? "🔴 Deleted" : "🟢 Active"} />
            </div>
            <div className="flex justify-end gap-3 border-t pt-4">
              <Button variant="destructive" size="sm" onClick={() => { setDeletingUser(viewingUser); setViewingUser(null); }}>
                Delete
              </Button>
              <Button variant="secondary" size="sm" onClick={() => { setResetPwUser(viewingUser); setViewingUser(null); }}>
                Reset Password
              </Button>
              <Button size="sm" onClick={() => { openEdit(viewingUser); setViewingUser(null); }}>
                Edit
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={!!deletingUser}
        onClose={() => setDeletingUser(null)}
        onConfirm={() => deletingUser && deleteMutation.mutate({ id: deletingUser.id })}
        title="Delete User"
        message={`Delete "${deletingUser?.name ?? "this user"}"? This will soft-delete the account. Users with active direct reports cannot be deleted.`}
        confirmLabel="Delete"
        isLoading={deleteMutation.isPending}
        variant="danger"
      />

      {/* Reset Password */}
      <Modal
        isOpen={!!resetPwUser}
        onClose={() => setResetPwUser(null)}
        title={`Reset Password — ${resetPwUser?.name ?? ""}`}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Set a new password for <strong>{resetPwUser?.name}</strong>.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-700">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" size="sm" onClick={() => setResetPwUser(null)}>
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
    </div>
  );
}

/* ─────────────────────────── User Form ─────────────────────────── */

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
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  isLoading: boolean;
  error: string;
  isCreate: boolean;
}) {
  const set = (field: keyof UserFormData, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      <div className="grid grid-cols-2 gap-4">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-gray-700">Full Name *</label>
          <input
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {/* Email */}
        <div>
          <label className="block text-xs font-medium text-gray-700">Email *</label>
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {/* Password (create only) */}
        {isCreate && (
          <div>
            <label className="block text-xs font-medium text-gray-700">Password *</label>
            <input
              required
              type="password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              placeholder="Min. 8 characters"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
        {/* Employee ID */}
        <div>
          <label className="block text-xs font-medium text-gray-700">Employee ID</label>
          <input
            value={form.employeeId}
            onChange={(e) => set("employeeId", e.target.value)}
            placeholder="e.g. EMP011"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {/* Phone */}
        <div>
          <label className="block text-xs font-medium text-gray-700">Phone Number</label>
          <input
            value={form.phoneNumber}
            onChange={(e) => set("phoneNumber", e.target.value)}
            placeholder="+628..."
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {/* Role */}
        <div>
          <label className="block text-xs font-medium text-gray-700">Role *</label>
          <select
            required
            value={form.role}
            onChange={(e) => set("role", e.target.value as Role)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="EMPLOYEE">Employee</option>
            <option value="SUPERVISOR">Supervisor (Chief)</option>
            <option value="MANAGER">Manager</option>
            <option value="DIRECTOR">Director</option>
            <option value="FINANCE">Finance</option>
            <option value="ADMIN">Admin</option>
            <option value="SALES_EMPLOYEE">Sales Employee</option>
            <option value="SALES_CHIEF">Sales Chief</option>
          </select>
        </div>
        {/* Department */}
        <div>
          <label className="block text-xs font-medium text-gray-700">Department</label>
          <select
            value={form.departmentId}
            onChange={(e) => set("departmentId", e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— No Department —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        {/* Supervisor */}
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-700">Supervisor</label>
          <select
            value={form.supervisorId}
            onChange={(e) => set("supervisorId", e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
