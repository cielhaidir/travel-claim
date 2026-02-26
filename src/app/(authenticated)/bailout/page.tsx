"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/features/PageHeader";
import { EmptyState } from "@/components/features/EmptyState";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

// ─── Types ────────────────────────────────────────────────────────────────────

type BailoutStatus = "DRAFT" | "SUBMITTED" | "APPROVED_CHIEF" | "APPROVED_DIRECTOR" | "REJECTED" | "DISBURSED";

interface Bailout {
  id: string;
  bailoutNumber: string;
  description: string;
  amount: number | string;
  status: BailoutStatus;
  submittedAt: string | Date | null;
  chiefApprovedAt: string | Date | null;
  directorApprovedAt: string | Date | null;
  disbursedAt: string | Date | null;
  rejectedAt: string | Date | null;
  rejectionReason: string | null;
  travelRequest: { id: string; requestNumber: string; destination: string };
  requester: { id: string; name: string | null; employeeId: string | null };
  chiefApprover?: { id: string; name: string | null } | null;
  directorApprover?: { id: string; name: string | null } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}
function currency(n: number | string) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(Number(n));
}

const STATUS_LABELS: Record<BailoutStatus, string> = {
  DRAFT: "Draft", SUBMITTED: "Diajukan", APPROVED_CHIEF: "Disetujui Chief",
  APPROVED_DIRECTOR: "Disetujui Direktur", REJECTED: "Ditolak", DISBURSED: "Dicairkan",
};
const STATUS_COLORS: Record<BailoutStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-600", SUBMITTED: "bg-yellow-100 text-yellow-700",
  APPROVED_CHIEF: "bg-blue-100 text-blue-700", APPROVED_DIRECTOR: "bg-indigo-100 text-indigo-700",
  REJECTED: "bg-red-100 text-red-700", DISBURSED: "bg-green-100 text-green-700",
};

// ─── Action Modal ─────────────────────────────────────────────────────────────

function ActionModal({
  bailout,
  onClose,
  onDone,
  userRole,
}: {
  bailout: Bailout;
  onClose: () => void;
  onDone: () => void;
  userRole: string;
}) {
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  const chiefRoles = ["SALES_CHIEF", "MANAGER", "DIRECTOR", "ADMIN"];
  const directorRoles = ["DIRECTOR", "ADMIN"];
  const financeRoles = ["FINANCE", "ADMIN"];

  const utils = api.useUtils();
  const refresh = () => { void utils.bailout.getAll.invalidate(); onDone(); onClose(); };

  const approveChief = api.bailout.approveByChief.useMutation({ onSuccess: refresh });
  const approveDirector = api.bailout.approveByDirector.useMutation({ onSuccess: refresh });
  const reject = api.bailout.reject.useMutation({ onSuccess: refresh });
  const disburse = api.bailout.disburse.useMutation({ onSuccess: refresh });

  const isActing = approveChief.isPending || approveDirector.isPending || reject.isPending || disburse.isPending;

  return (
    <div className="space-y-5">
      {/* Bailout Info */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="font-mono text-sm font-bold text-gray-800">{bailout.bailoutNumber}</p>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[bailout.status]}`}>
            {STATUS_LABELS[bailout.status]}
          </span>
        </div>
        <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs">
          <p className="font-medium text-blue-700">{bailout.travelRequest.requestNumber}</p>
          <p className="text-blue-500">{bailout.travelRequest.destination}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-gray-400">Pemohon</p><p className="font-medium">{bailout.requester.name ?? "—"}</p></div>
          <div><p className="text-xs text-gray-400">Jumlah</p><p className="font-bold text-gray-900">{currency(bailout.amount)}</p></div>
          <div className="col-span-2"><p className="text-xs text-gray-400">Deskripsi</p><p className="text-gray-700">{bailout.description}</p></div>
        </div>
        {bailout.status === "REJECTED" && bailout.rejectionReason && (
          <div className="rounded bg-red-50 border border-red-200 px-3 py-2">
            <p className="text-xs font-semibold text-red-700">Alasan penolakan:</p>
            <p className="text-xs text-gray-700">{bailout.rejectionReason}</p>
          </div>
        )}
      </div>

      {/* Reject Form */}
      {showReject && (
        <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-medium text-red-700">Alasan Penolakan</p>
          <textarea
            rows={3}
            className="w-full rounded border border-red-300 px-3 py-2 text-sm bg-white focus:outline-none"
            placeholder="Jelaskan alasan penolakan (min. 5 karakter)..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowReject(false)} className="text-xs text-gray-500">Batal</button>
            <Button variant="destructive" isLoading={reject.isPending}
              onClick={() => { if (rejectReason.trim().length >= 5) reject.mutate({ id: bailout.id, rejectionReason: rejectReason }); }}>
              Konfirmasi Tolak
            </Button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
        <Button variant="secondary" onClick={onClose}>Tutup</Button>
        {!showReject && chiefRoles.includes(userRole) && ["SUBMITTED", "APPROVED_CHIEF"].includes(bailout.status) && (
          <button onClick={() => setShowReject(true)} disabled={isActing}
            className="rounded px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 border border-red-200">
            Tolak
          </button>
        )}
        {chiefRoles.includes(userRole) && bailout.status === "SUBMITTED" && (
          <Button isLoading={approveChief.isPending} onClick={() => approveChief.mutate({ id: bailout.id })}>
            ✓ Setujui (Chief)
          </Button>
        )}
        {directorRoles.includes(userRole) && bailout.status === "APPROVED_CHIEF" && (
          <Button isLoading={approveDirector.isPending} onClick={() => approveDirector.mutate({ id: bailout.id })}>
            ✓ Setujui (Direktur)
          </Button>
        )}
        {financeRoles.includes(userRole) && bailout.status === "APPROVED_DIRECTOR" && (
          <Button isLoading={disburse.isPending} onClick={() => disburse.mutate({ id: bailout.id })}>
            💰 Cairkan Dana
          </Button>
        )}
      </div>
    </div>
  );
}

// Stable selector — must be defined outside the component to avoid
// React Query treating each render's new function reference as changed
// options and infinitely re-fetching.
function selectBailouts(d: { bailouts: Bailout[] }) {
  return d.bailouts;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BailoutApprovalPage() {
  const { data: session } = useSession();
  const userRole = session?.user?.role ?? "EMPLOYEE";

  const [statusFilter, setStatusFilter] = useState<BailoutStatus | "ALL">("ALL");
  const [selected, setSelected] = useState<Bailout | null>(null);

  const utils = api.useUtils();

  // Single query with no status filter so we always have the full list.
  // „select" uses a stable function reference to avoid infinite re-fetches.
  const { data: allBailouts = [], isLoading } = api.bailout.getAll.useQuery(
    { limit: 500 },
    { select: selectBailouts },
  );

  // Derive the filtered list and the pending count from the same data.
  const bailouts = statusFilter === "ALL"
    ? allBailouts
    : allBailouts.filter(b => b.status === statusFilter);
  const pendingCount = allBailouts.filter(b =>
    ["SUBMITTED", "APPROVED_CHIEF", "APPROVED_DIRECTOR"].includes(b.status)
  ).length;

  const statusFilters: { value: BailoutStatus | "ALL"; label: string }[] = [
    { value: "ALL", label: "Semua" },
    { value: "SUBMITTED", label: "Diajukan" },
    { value: "APPROVED_CHIEF", label: "Tunggu Direktur" },
    { value: "APPROVED_DIRECTOR", label: "Siap Cair" },
    { value: "DISBURSED", label: "Dicairkan" },
    { value: "REJECTED", label: "Ditolak" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bailout Approval"
        description="Kelola dan setujui pengajuan dana talangan perjalanan dinas"
      />

      {/* Pending Summary */}
      {pendingCount > 0 && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3">
          <p className="text-sm font-medium text-yellow-800">
            ⏳ Ada <strong>{pendingCount}</strong> pengajuan bailout yang menunggu tindakan Anda
          </p>
        </div>
      )}

      {/* Status Filters */}
      <div className="flex flex-wrap gap-2">
        {statusFilters.map(f => (
          <button key={f.value} onClick={() => setStatusFilter(f.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter === f.value ? "bg-blue-600 text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      ) : bailouts.length === 0 ? (
        <EmptyState
          icon="✅"
          title={statusFilter === "ALL" ? "Belum Ada Bailout" : `Tidak ada bailout berstatus "${STATUS_LABELS[statusFilter]}"`}
          description="Bailout akan muncul di sini setelah user mengajukannya dari halaman BusTrip."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3">No. Bailout</th>
                <th className="px-4 py-3">Perjalanan Dinas</th>
                <th className="px-4 py-3">Pemohon</th>
                <th className="px-4 py-3">Deskripsi</th>
                <th className="px-4 py-3 text-right">Jumlah</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Tanggal</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bailouts.map(b => (
                <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700">{b.bailoutNumber}</td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium text-gray-700">{b.travelRequest.requestNumber}</p>
                    <p className="text-xs text-gray-400 truncate max-w-[120px]">{b.travelRequest.destination}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{b.requester.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-gray-600 truncate max-w-[180px]">{b.description}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-xs">{currency(b.amount)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[b.status]}`}>
                      {STATUS_LABELS[b.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-400">
                    {fmt(b.submittedAt ?? null)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setSelected(b)}
                      className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50">
                      Proses
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t bg-gray-50 px-4 py-2 text-xs text-gray-400">
            {bailouts.length} entri
          </div>
        </div>
      )}

      {/* Action Modal */}
      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title="Proses Bailout" size="md">
        {selected && (
          <ActionModal
            bailout={selected}
            onClose={() => setSelected(null)}
            onDone={() => void utils.bailout.getAll.invalidate()}
            userRole={userRole}
          />
        )}
      </Modal>
    </div>
  );
}
