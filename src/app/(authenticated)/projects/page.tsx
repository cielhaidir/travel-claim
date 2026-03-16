"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/features/PageHeader";
import { EmptyState } from "@/components/features/EmptyState";
import { Button } from "@/components/ui/Button";
import { Modal, ConfirmModal } from "@/components/ui/Modal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  code: string;
  name: string;
  description: string | null;
  clientName: string | null;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  _count?: { travelRequests: number };
}

interface ProjectFormData {
  code: string;
  name: string;
  description: string;
  clientName: string;
  isActive: boolean;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ─── Sub-component: Project Form ──────────────────────────────────────────────

function ProjectForm({
  initialData,
  isLoading,
  onSubmit,
  onCancel,
}: {
  initialData?: Partial<ProjectFormData>;
  isLoading?: boolean;
  onSubmit: (data: ProjectFormData) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ProjectFormData>({
    code: initialData?.code ?? "",
    name: initialData?.name ?? "",
    description: initialData?.description ?? "",
    clientName: initialData?.clientName ?? "",
    isActive: initialData?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ProjectFormData, string>>>({});

  const set = (field: keyof ProjectFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = e.target.type === "checkbox"
        ? (e.target as HTMLInputElement).checked
        : e.target.value;
      setForm((prev) => ({ ...prev, [field]: value }));
      if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
    };

  const validate = () => {
    const errs: Partial<Record<keyof ProjectFormData, string>> = {};
    if (!form.code.trim()) errs.code = "Kode project wajib diisi";
    else if (form.code.length > 30) errs.code = "Kode maksimal 30 karakter";
    if (!form.name.trim()) errs.name = "Nama project wajib diisi";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) onSubmit(form);
  };

  const inp = (field: keyof ProjectFormData) =>
    `w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      errors[field] ? "border-red-400 bg-red-50" : "border-gray-300"
    }`;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Kode Project <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            className={inp("code")}
            placeholder="cth. PRJ-001"
            value={form.code}
            onChange={set("code")}
            maxLength={30}
          />
          {errors.code && <p className="mt-1 text-xs text-red-500">{errors.code}</p>}
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Nama Project <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            className={inp("name")}
            placeholder="Nama project"
            value={form.name}
            onChange={set("name")}
          />
          {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Nama Client</label>
        <input
          type="text"
          className={inp("clientName")}
          placeholder="cth. PT. ABC Indonesia"
          value={form.clientName}
          onChange={set("clientName")}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Deskripsi</label>
        <textarea
          rows={3}
          className={inp("description")}
          placeholder="Deskripsi singkat tentang project ini..."
          value={form.description}
          onChange={set("description")}
        />
      </div>

      <div className="flex items-center gap-3">
        <input
          id="isActive"
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          checked={form.isActive}
          onChange={set("isActive")}
        />
        <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
          Project Aktif
        </label>
      </div>

      <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isLoading}>
          Batal
        </Button>
        <Button type="submit" isLoading={isLoading}>
          Simpan
        </Button>
      </div>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);

  const utils = api.useUtils();

  // ─── Queries ──────────────────────────────────────────────────────────────
  const projectQuery = api.project.getAll.useQuery({
    search: search || undefined,
    isActive: activeFilter === "ALL" ? undefined : activeFilter === "ACTIVE",
    limit: 50,
  });
  const isLoading: boolean = projectQuery.isLoading;
  const rawData: unknown = projectQuery.data;
  const projects = (rawData as { projects: Project[] } | undefined)?.projects ?? [];

  // ─── Mutations ────────────────────────────────────────────────────────────
  const createMutation = api.project.create.useMutation({
    onSuccess: () => {
      void utils.project.getAll.invalidate();
      setShowForm(false);
    },
  });

  const updateMutation = api.project.update.useMutation({
    onSuccess: () => {
      void utils.project.getAll.invalidate();
      setEditingProject(null);
    },
  });

  const deleteMutation = api.project.delete.useMutation({
    onSuccess: () => {
      void utils.project.getAll.invalidate();
      setDeletingProject(null);
    },
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleCreate = (form: ProjectFormData) => {
    createMutation.mutate({
      code: form.code,
      name: form.name,
      description: form.description || undefined,
      clientName: form.clientName || undefined,
      isActive: form.isActive,
    });
  };

  const handleUpdate = (form: ProjectFormData) => {
    if (!editingProject) return;
    updateMutation.mutate({
      id: editingProject.id,
      code: form.code,
      name: form.name,
      description: form.description || undefined,
      clientName: form.clientName || undefined,
      isActive: form.isActive,
    });
  };

  const handleDelete = () => {
    if (!deletingProject) return;
    deleteMutation.mutate({ id: deletingProject.id });
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        title="Manajemen Project"
        description="Kelola project untuk referensi perjalanan dinas Sales"
        primaryAction={{ label: "+ Tambah Project", onClick: () => setShowForm(true) }}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="🔍 Cari kode, nama, atau client..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[240px]"
        />
        <div className="flex gap-2">
          {(["ALL", "ACTIVE", "INACTIVE"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                activeFilter === f
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f === "ALL" ? "Semua" : f === "ACTIVE" ? "Aktif" : "Tidak Aktif"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          title="Belum Ada Project"
          description={search ? "Tidak ada project yang cocok dengan pencarian" : "Tambahkan project pertama untuk memulai"}
          action={!search ? { label: "Tambah Project", onClick: () => setShowForm(true) } : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3">Kode</th>
                <th className="px-4 py-3">Nama Project</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3 text-center">Travel Requests</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3">Dibuat</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {projects.map((project) => (
                <tr key={project.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs font-semibold text-gray-700">
                      {project.code}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{project.name}</td>
                  <td className="px-4 py-3 text-gray-500">{project.clientName ?? "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                      {project._count?.travelRequests ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        project.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {project.isActive ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(project.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditingProject(project)}
                        className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeletingProject(project)}
                        className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                      >
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Tambah Project Baru"
        size="md"
      >
        <ProjectForm
          isLoading={createMutation.isPending}
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={!!editingProject}
        onClose={() => setEditingProject(null)}
        title={`Edit Project — ${editingProject?.code}`}
        size="md"
      >
        {editingProject && (
          <ProjectForm
            initialData={{
              code: editingProject.code,
              name: editingProject.name,
              description: editingProject.description ?? "",
              clientName: editingProject.clientName ?? "",
              isActive: editingProject.isActive,
            }}
            isLoading={updateMutation.isPending}
            onSubmit={handleUpdate}
            onCancel={() => setEditingProject(null)}
          />
        )}
      </Modal>

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={!!deletingProject}
        onClose={() => setDeletingProject(null)}
        onConfirm={handleDelete}
        title="Hapus Project"
        message={`Yakin ingin menghapus project "${deletingProject?.name}"? Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus"
        isLoading={deleteMutation.isPending}
        variant="danger"
      />
    </div>
  );
}
