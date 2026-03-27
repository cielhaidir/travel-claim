"use client";

import { useState } from "react";
import { Download, Eye, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmModal, Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import {
  CrmActionIconButton,
  CrmActionIconLink,
  crmInputClassName,
  CrmEmptyHint,
  crmTextareaClassName,
} from "@/components/features/crm/shared";
import {
  CRM_TASK_PRIORITY_OPTIONS,
  CRM_TASK_STATUS_OPTIONS,
  getCrmBadgeVariant,
  getCrmLabel,
} from "@/lib/constants/crm";
import { formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";

type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: Date | string | null;
  priority: string;
};

type NoteItem = {
  id: string;
  title: string;
  content: string;
  writerId: string | null;
  writerName: string | null;
  updatedAt: Date | string;
};

type AttachmentItem = {
  id: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  storageUrl: string;
  createdAt: Date | string;
};

type ActivityItem = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  ownerName: string;
  scheduledAt: Date | string;
};

type UserOption = {
  id: string;
  name: string | null;
  email: string | null;
};

type SubjectProps = {
  subjectId: string;
  subjectType: "lead" | "deal";
};

type TaskStatusValue = (typeof CRM_TASK_STATUS_OPTIONS)[number];
type TaskPriorityValue = (typeof CRM_TASK_PRIORITY_OPTIONS)[number];

function invalidateSubjectDetail(
  utils: ReturnType<typeof api.useUtils>,
  props: SubjectProps,
) {
  if (props.subjectType === "lead") {
    return utils.crm.getLeadById.invalidate({ id: props.subjectId });
  }

  return utils.crm.getDealById.invalidate({ id: props.subjectId });
}

export function CrmTasksSection({
  subjectId,
  subjectType,
  items,
  users,
}: SubjectProps & {
  items: TaskItem[];
  users: UserOption[];
}) {
  const utils = api.useUtils();
  const { showToast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    status: "OPEN",
    assigneeId: "",
    dueDate: "",
    priority: "MEDIUM",
  });

  const createMutation = api.crm.createTask.useMutation({
    onSuccess: async () => {
      await invalidateSubjectDetail(utils, { subjectId, subjectType });
      await utils.crm.listTasks.invalidate();
      await utils.crm.dashboard.invalidate();
    },
  });
  const updateMutation = api.crm.updateTask.useMutation({
    onSuccess: async () => {
      await invalidateSubjectDetail(utils, { subjectId, subjectType });
      await utils.crm.listTasks.invalidate();
      await utils.crm.dashboard.invalidate();
    },
  });
  const deleteMutation = api.crm.deleteTask.useMutation({
    onSuccess: async () => {
      await invalidateSubjectDetail(utils, { subjectId, subjectType });
      await utils.crm.listTasks.invalidate();
      await utils.crm.dashboard.invalidate();
    },
  });

  function openCreate() {
    setEditingTask(null);
    setForm({
      title: "",
      description: "",
      status: "OPEN",
      assigneeId: "",
      dueDate: "",
      priority: "MEDIUM",
    });
    setIsModalOpen(true);
  }

  function openEdit(task: TaskItem) {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      assigneeId: task.assigneeId ?? "",
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : "",
      priority: task.priority,
    });
    setIsModalOpen(true);
  }

  async function handleSubmit() {
    const payload = {
      leadId: subjectType === "lead" ? subjectId : null,
      dealId: subjectType === "deal" ? subjectId : null,
      title: form.title.trim(),
      description: form.description.trim() || null,
      status: form.status as TaskStatusValue,
      assigneeId: form.assigneeId || null,
      dueDate: form.dueDate || null,
      priority: form.priority as TaskPriorityValue,
    };

    try {
      if (editingTask) {
        await updateMutation.mutateAsync({ id: editingTask.id, ...payload });
        showToast({ title: "Tugas diperbarui", message: "Tugas CRM berhasil disimpan.", variant: "success" });
      } else {
        await createMutation.mutateAsync(payload);
        showToast({ title: "Tugas ditambahkan", message: "Tugas CRM berhasil ditambahkan.", variant: "success" });
      }
      setIsModalOpen(false);
    } catch (error) {
      showToast({
        title: "Gagal menyimpan tugas",
        message: error instanceof Error ? error.message : "Terjadi kesalahan tak terduga",
        variant: "error",
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>Tambah Tugas</Button>
      </div>

      {items.length ? (
        items.map((task) => (
          <div key={task.id} className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{task.title}</p>
                <p className="mt-1 text-sm text-gray-500">{task.assigneeName ?? "Belum ditugaskan"}</p>
              </div>
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass(task.status)}`}>
                {getCrmLabel(task.status)}
              </span>
            </div>
            <p className="mt-3 text-sm text-gray-600">{task.description ?? "Tidak ada deskripsi"}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
              <span>Prioritas: {getCrmLabel(task.priority)}</span>
              <span>Jatuh tempo: {task.dueDate ? formatDate(task.dueDate) : "Tanpa jatuh tempo"}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <CrmActionIconButton label="Ubah tugas" onClick={() => openEdit(task)}>
                <Pencil className="h-4 w-4" />
              </CrmActionIconButton>
              <CrmActionIconButton label="Hapus tugas" tone="danger" onClick={() => setDeleteId(task.id)}>
                <Trash2 className="h-4 w-4" />
              </CrmActionIconButton>
            </div>
          </div>
        ))
      ) : (
        <CrmEmptyHint text="Belum ada tugas untuk data ini." />
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingTask ? "Ubah Tugas" : "Tambah Tugas"} size="lg">
        <div className="grid gap-4">
          <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className={crmInputClassName} placeholder="Judul" />
          <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className={crmTextareaClassName} placeholder="Deskripsi" />
          <div className="grid gap-4 md:grid-cols-2">
            <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className={crmInputClassName}>
              {CRM_TASK_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {getCrmLabel(option)}
                </option>
              ))}
            </select>
            <select value={form.assigneeId} onChange={(event) => setForm((current) => ({ ...current, assigneeId: event.target.value }))} className={crmInputClassName}>
              <option value="">Pilih penanggung jawab</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name ?? user.email ?? user.id}
                </option>
              ))}
            </select>
            <input type="date" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} className={crmInputClassName} />
            <select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))} className={crmInputClassName}>
              {CRM_TASK_PRIORITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {getCrmLabel(option)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
            Batal
          </Button>
          <Button onClick={() => void handleSubmit()} isLoading={createMutation.isPending || updateMutation.isPending}>
            {editingTask ? "Simpan Tugas" : "Tambah Tugas"}
          </Button>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => void deleteMutation.mutateAsync({ id: deleteId ?? "" })}
        title="Hapus Tugas"
        message="Tugas ini akan dihapus dari data CRM terkait."
        confirmLabel="Hapus"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

export function CrmNotesSection({
  subjectId,
  subjectType,
  items,
  users,
}: SubjectProps & {
  items: NoteItem[];
  users: UserOption[];
}) {
  const utils = api.useUtils();
  const { showToast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", content: "", writerId: "" });

  const createMutation = api.crm.createNote.useMutation({
    onSuccess: async () => {
      await invalidateSubjectDetail(utils, { subjectId, subjectType });
      await utils.crm.listNotes.invalidate();
      await utils.crm.dashboard.invalidate();
    },
  });
  const updateMutation = api.crm.updateNote.useMutation({
    onSuccess: async () => {
      await invalidateSubjectDetail(utils, { subjectId, subjectType });
      await utils.crm.listNotes.invalidate();
      await utils.crm.dashboard.invalidate();
    },
  });
  const deleteMutation = api.crm.deleteNote.useMutation({
    onSuccess: async () => {
      await invalidateSubjectDetail(utils, { subjectId, subjectType });
      await utils.crm.listNotes.invalidate();
      await utils.crm.dashboard.invalidate();
    },
  });

  function openCreate() {
    setEditingNote(null);
    setForm({ title: "", content: "", writerId: "" });
    setIsModalOpen(true);
  }

  function openEdit(note: NoteItem) {
    setEditingNote(note);
    setForm({
      title: note.title,
      content: note.content,
      writerId: note.writerId ?? "",
    });
    setIsModalOpen(true);
  }

  async function handleSubmit() {
    const payload = {
      leadId: subjectType === "lead" ? subjectId : null,
      dealId: subjectType === "deal" ? subjectId : null,
      title: form.title.trim(),
      content: form.content.trim(),
      writerId: form.writerId || null,
    };

    try {
      if (editingNote) {
        await updateMutation.mutateAsync({ id: editingNote.id, ...payload });
        showToast({ title: "Catatan diperbarui", message: "Catatan CRM berhasil disimpan.", variant: "success" });
      } else {
        await createMutation.mutateAsync(payload);
        showToast({ title: "Catatan ditambahkan", message: "Catatan CRM berhasil ditambahkan.", variant: "success" });
      }
      setIsModalOpen(false);
    } catch (error) {
      showToast({
        title: "Gagal menyimpan catatan",
        message: error instanceof Error ? error.message : "Terjadi kesalahan tak terduga",
        variant: "error",
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>Tambah Catatan</Button>
      </div>

      {items.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {items.map((note) => (
            <div key={note.id} className="flex h-full flex-col rounded-lg border border-gray-200 p-4">
              <p className="font-semibold text-gray-900">{note.title}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">{note.writerName ?? "Penulis tidak diketahui"}</p>
              <p className="mt-3 flex-1 whitespace-pre-wrap text-sm text-gray-600">{note.content}</p>
              <p className="mt-3 text-xs text-gray-500">Diperbarui: {formatDate(note.updatedAt)}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <CrmActionIconButton label="Ubah catatan" onClick={() => openEdit(note)}>
                  <Pencil className="h-4 w-4" />
                </CrmActionIconButton>
                <CrmActionIconButton label="Hapus catatan" tone="danger" onClick={() => setDeleteId(note.id)}>
                  <Trash2 className="h-4 w-4" />
                </CrmActionIconButton>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <CrmEmptyHint text="Belum ada catatan untuk data ini." />
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingNote ? "Ubah Catatan" : "Tambah Catatan"} size="lg">
        <div className="grid gap-4">
          <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className={crmInputClassName} placeholder="Judul" />
          <textarea value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} className={crmTextareaClassName} placeholder="Isi catatan" />
          <select value={form.writerId} onChange={(event) => setForm((current) => ({ ...current, writerId: event.target.value }))} className={crmInputClassName}>
            <option value="">Pengguna saat ini</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name ?? user.email ?? user.id}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
            Batal
          </Button>
          <Button onClick={() => void handleSubmit()} isLoading={createMutation.isPending || updateMutation.isPending}>
            {editingNote ? "Simpan Catatan" : "Tambah Catatan"}
          </Button>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => void deleteMutation.mutateAsync({ id: deleteId ?? "" })}
        title="Hapus Catatan"
        message="Catatan ini akan dihapus dari data CRM terkait."
        confirmLabel="Hapus"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

export function CrmAttachmentsSection({
  subjectId,
  subjectType,
  items,
}: SubjectProps & {
  items: AttachmentItem[];
}) {
  const utils = api.useUtils();
  const { showToast } = useToast();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const createMutation = api.crm.createAttachment.useMutation({
    onSuccess: async () => {
      await invalidateSubjectDetail(utils, { subjectId, subjectType });
    },
  });
  const deleteMutation = api.crm.deleteAttachment.useMutation({
    onSuccess: async () => {
      await invalidateSubjectDetail(utils, { subjectId, subjectType });
    },
  });

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await createMutation.mutateAsync({
          leadId: subjectType === "lead" ? subjectId : null,
          dealId: subjectType === "deal" ? subjectId : null,
          originalName: file.name,
          mimeType: file.type || "application/octet-stream",
          fileSize: file.size,
          storageUrl: String(reader.result),
        });
        showToast({ title: "Lampiran ditambahkan", message: "Lampiran CRM berhasil disimpan.", variant: "success" });
      } catch (error) {
        showToast({
          title: "Gagal menambahkan lampiran",
          message: error instanceof Error ? error.message : "Terjadi kesalahan tak terduga",
          variant: "error",
        });
      } finally {
        setIsUploading(false);
        event.target.value = "";
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <label className="inline-flex cursor-pointer items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          <input type="file" className="hidden" onChange={(event) => void handleFileChange(event)} />
          {isUploading ? "Mengunggah..." : "Tambah Lampiran"}
        </label>
      </div>

      {items.length ? (
        items.map((attachment) => (
          <div key={attachment.id} className="rounded-lg border border-gray-200 p-4">
            <p className="font-semibold text-gray-900">{attachment.originalName}</p>
            <p className="mt-1 text-sm text-gray-500">
              {attachment.mimeType} · {Math.round(attachment.fileSize / 1024)} KB
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <CrmActionIconLink href={attachment.storageUrl} label={`Unduh lampiran ${attachment.originalName}`} tone="primary">
                <Download className="h-4 w-4" />
              </CrmActionIconLink>
              <CrmActionIconButton label="Hapus lampiran" tone="danger" onClick={() => setDeleteId(attachment.id)}>
                <Trash2 className="h-4 w-4" />
              </CrmActionIconButton>
            </div>
          </div>
        ))
      ) : (
        <CrmEmptyHint text="Belum ada lampiran untuk data ini." />
      )}

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => void deleteMutation.mutateAsync({ id: deleteId ?? "" })}
        title="Hapus Lampiran"
        message="Lampiran ini akan dihapus dari data CRM terkait."
        confirmLabel="Hapus"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

export function CrmActivitySection({ items }: { items: ActivityItem[] }) {
  if (!items.length) {
    return <CrmEmptyHint text="Belum ada aktivitas untuk data ini." />;
  }

  return (
    <div className="space-y-3">
      {items.map((activity) => (
        <div key={activity.id} className="rounded-lg border border-gray-200 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-gray-900">{activity.title}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">
                {activity.ownerName} · {getCrmLabel(activity.type)}
              </p>
            </div>
            <span className="text-xs text-gray-500">{formatDate(activity.scheduledAt)}</span>
          </div>
          {activity.description ? <p className="mt-3 text-sm text-gray-600">{activity.description}</p> : null}
        </div>
      ))}
    </div>
  );
}

function badgeClass(value: string) {
  const variant = getCrmBadgeVariant(value);

  switch (variant) {
    case "success":
      return "bg-green-100 text-green-700";
    case "warning":
      return "bg-orange-100 text-orange-700";
    case "danger":
      return "bg-red-100 text-red-700";
    case "info":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}
