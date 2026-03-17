"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/features/PageHeader";
import { StatusBadge } from "@/components/features/StatusBadge";
import { EmptyState } from "@/components/features/EmptyState";
import { Button } from "@/components/ui/Button";
import { Modal, ConfirmModal } from "@/components/ui/Modal";
import { TravelRequestForm, type TravelRequestFormData } from "@/components/features/travel/TravelRequestForm";
import { BailoutPanel } from "@/components/features/travel/BailoutPanel";
import { formatDate } from "@/lib/utils/format";
import type { TravelType, TravelStatus } from "../../../../generated/prisma";

// ─────────────── Types ───────────────

interface TravelRequest {
  id: string;
  requestNumber: string;
  purpose: string;
  destination: string;
  travelType: TravelType;
  status: TravelStatus;
  startDate: string | Date;
  endDate: string | Date;
  createdAt: string | Date;
  submittedAt: string | Date | null;
  requester: {
    id: string;
    name: string | null;
    email: string | null;
    employeeId: string | null;
  };
  project?: {
    id: string;
    code: string;
    name: string;
    clientName: string | null;
  } | null;
  bailouts?: Array<{
    id: string;
    description: string;
    amount: number | string;
    category?: string | null;
    storageUrl?: string | null;
    disbursedAt?: string | Date | null;
    transportMode?: string | null;
    carrier?: string | null;
    departureFrom?: string | null;
    arrivalTo?: string | null;
    departureAt?: string | Date | null;
    arrivalAt?: string | Date | null;
    flightNumber?: string | null;
    seatClass?: string | null;
    bookingRef?: string | null;
    hotelName?: string | null;
    hotelAddress?: string | null;
    checkIn?: string | Date | null;
    checkOut?: string | Date | null;
    roomType?: string | null;
    mealDate?: string | Date | null;
    mealLocation?: string | null;
    financeId?: string | null;
    finance?: { id: string; name: string | null; email: string | null } | null;
  }>;
  participants: Array<{ userId: string; user: { id: string; name: string | null } }>;
  approvals: Array<{
    id: string;
    level: string;
    status: string;
    approver: { id: string; name: string | null; role: string };
    comments: string | null;
    rejectionReason: string | null;
    approvedAt: string | Date | null;
    rejectedAt: string | Date | null;
  }>;
  _count?: { claims: number };
}

// ─────────────── Constants ───────────────

const TRAVEL_TYPE_LABELS: Record<TravelType, string> = {
  SALES: "Sales",
  OPERATIONAL: "Operational",
  MEETING: "Meeting",
  TRAINING: "Training",
};

const EDITABLE_STATUSES: TravelStatus[] = ["DRAFT", "REVISION"];
const DELETABLE_STATUSES: TravelStatus[] = ["DRAFT"];
const SUBMITTABLE_STATUSES: TravelStatus[] = ["DRAFT", "REVISION"];

function toDateInput(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toISOString().split("T")[0] ?? "";
}

function toDateTimeInput(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  const offset = d.getTimezoneOffset();
  const localDate = new Date(d.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

function getTravelDecisionReason(request: TravelRequest): string | null {
  if (request.status === "REJECTED") {
    return (
      request.approvals.find((approval) => approval.status === "REJECTED")
        ?.rejectionReason ?? null
    );
  }

  if (request.status === "REVISION") {
    return (
      request.approvals.find((approval) => approval.status === "REVISION_REQUESTED")
        ?.comments ?? null
    );
  }

  return null;
}

// ─────────────── Main Page ───────────────

export default function TravelRequestsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Business Trip Requests"
        description="Kelola dan lacak seluruh pengajuan dan persetujuan perjalanan dinas"
      />
      <PengajuanTab />
    </div>
  );
}

// ─────────────── Tab 1: Pengajuan ───────────────

function PengajuanTab() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const canCreateTrip = !!userId;

  const [statusFilter, setStatusFilter] = useState<TravelStatus | "ALL">("ALL");
  const [typeFilter, setTypeFilter] = useState<TravelType | "ALL">("ALL");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<TravelRequest | null>(null);
  const [viewingRequest, setViewingRequest] = useState<TravelRequest | null>(null);
  const [deletingRequest, setDeletingRequest] = useState<TravelRequest | null>(null);
  const [submittingRequest, setSubmittingRequest] = useState<TravelRequest | null>(null);
  const [bailoutTrip, setBailoutTrip] = useState<TravelRequest | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data: rawData, isLoading, refetch } = api.travelRequest.getAll.useQuery(
    {
      status: statusFilter === "ALL" ? undefined : statusFilter,
      travelType: typeFilter === "ALL" ? undefined : typeFilter,
      limit: 50,
    },
    { refetchOnWindowFocus: false }
  );
  const data = rawData as { requests: TravelRequest[] } | undefined;
  const requests = data?.requests ?? [];

  const createMutation = api.travelRequest.create.useMutation({
    onSuccess: () => { void refetch(); },
    onError: (err) => alert(`Error: ${err.message}`),
  });
  const updateMutation = api.travelRequest.update.useMutation({
    onSuccess: () => { void refetch(); },
    onError: (err) => alert(`Error: ${err.message}`),
  });
  const deleteMutation = api.travelRequest.delete.useMutation({
    onSuccess: () => { void refetch(); setDeletingRequest(null); },
    onError: (err) => alert(`Error: ${err.message}`),
  });
  const submitMutation = api.travelRequest.submit.useMutation({
    onSuccess: () => { void refetch(); setSubmittingRequest(null); },
    onError: (err) => alert(`Error: ${err.message}`),
  });

  const mapTravelFormToPayload = (formData: TravelRequestFormData) => ({
    purpose: formData.purpose,
    destination: formData.destination,
    travelType: formData.travelType,
    startDate: new Date(formData.startDate),
    endDate: new Date(formData.endDate),
    projectId: formData.projectId ?? undefined,
    participantIds: formData.participantIds ?? [],
    bailouts: formData.bailouts?.filter((b) => b.description?.trim().length >= 5 && b.amount > 0).map((b) => ({
      description: b.description.trim(),
      amount: b.amount,
      category: b.category,
      transportMode: b.transportMode ?? undefined,
      carrier: b.carrier ?? undefined,
      departureFrom: b.departureFrom ?? undefined,
      arrivalTo: b.arrivalTo ?? undefined,
      departureAt: b.departureAt ? new Date(b.departureAt) : undefined,
      arrivalAt: b.arrivalAt ? new Date(b.arrivalAt) : undefined,
      flightNumber: b.flightNumber ?? undefined,
      seatClass: b.seatClass ?? undefined,
      hotelName: b.hotelName ?? undefined,
      hotelAddress: b.hotelAddress ?? undefined,
      checkIn: b.checkIn ? new Date(b.checkIn) : undefined,
      checkOut: b.checkOut ? new Date(b.checkOut) : undefined,
      roomType: b.roomType ?? undefined,
      mealDate: b.mealDate ? new Date(b.mealDate) : undefined,
      mealLocation: b.mealLocation ?? undefined,
      financeId: b.financeId ?? undefined,
    })),
  });

  const handleCreate = (formData: TravelRequestFormData) => {
    createMutation.mutate(mapTravelFormToPayload(formData), {
      onSuccess: () => setIsFormOpen(false),
    });
  };

  const handleCreateAndSubmit = async (formData: TravelRequestFormData) => {
    const created = await createMutation.mutateAsync(mapTravelFormToPayload(formData)) as { id: string };
    await submitMutation.mutateAsync({ id: created.id });
    setIsFormOpen(false);
  };

  const handleUpdate = async (formData: TravelRequestFormData) => {
    if (!editingRequest) return;
    await updateMutation.mutateAsync({
      id: editingRequest.id,
      ...mapTravelFormToPayload(formData),
    });
    setEditingRequest(null);
  };

  const handleUpdateAndSubmit = async (formData: TravelRequestFormData) => {
    if (!editingRequest) return;
    const requestId = editingRequest.id;
    await updateMutation.mutateAsync({
      id: requestId,
      ...mapTravelFormToPayload(formData),
    });
    await submitMutation.mutateAsync({ id: requestId });
    setEditingRequest(null);
  };

  const canEdit = (req: TravelRequest) =>
    EDITABLE_STATUSES.includes(req.status) && req.requester.id === userId;
  const canDelete = (req: TravelRequest) =>
    DELETABLE_STATUSES.includes(req.status) && req.requester.id === userId;
  const canSubmit = (req: TravelRequest) =>
    SUBMITTABLE_STATUSES.includes(req.status) && req.requester.id === userId;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-3 flex-1">
          <select
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TravelStatus | "ALL")}
          >
            <option value="ALL">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="APPROVED">Approved</option>
            <option value="APPROVED_L1">L1 Approved</option>
            <option value="APPROVED_L2">L2 Approved</option>
            <option value="APPROVED_L3">L3 Approved</option>
            <option value="APPROVED_L4">L4 Approved</option>
            <option value="APPROVED_L5">L5 Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="REVISION">Revision</option>
            <option value="LOCKED">Locked</option>
            <option value="CLOSED">Closed</option>
          </select>
          <select
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TravelType | "ALL")}
          >
            <option value="ALL">All Types</option>
            <option value="SALES">Sales</option>
            <option value="OPERATIONAL">Operational</option>
            <option value="MEETING">Meeting</option>
            <option value="TRAINING">Training</option>
          </select>
        </div>
        {canCreateTrip && <Button onClick={() => setIsFormOpen(true)}>+ New Request</Button>}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="rounded-lg border bg-white p-12 text-center text-gray-500">Loading...</div>
      ) : requests.length === 0 ? (
        <EmptyState
          icon="✈️"
          title="No business trip requests yet"
          description="Get started by creating your first business trip request"
          action={canCreateTrip ? { label: "Create Request", onClick: () => setIsFormOpen(true) } : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Request #</th>
                <th className="px-4 py-3">Destination</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Dates</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requests.map((req) => (
                <tr key={req.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-blue-600">{req.requestNumber}</td>
                  <td className="px-4 py-3 text-gray-900">{req.destination}</td>
                  <td className="px-4 py-3 text-gray-600">{TRAVEL_TYPE_LABELS[req.travelType]}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDate(req.startDate)} – {formatDate(req.endDate)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={req.status} type="travel" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setViewingRequest(req)}
                        className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                      >
                        View
                      </button>
                      {canSubmit(req) && (
                        <button
                          onClick={() => setSubmittingRequest(req)}
                          className="rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50"
                        >
                          Submit
                        </button>
                      )}
                      {canEdit(req) && (
                        <button
                          onClick={() => setEditingRequest(req)}
                          className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                        >
                          Edit
                        </button>
                      )}
                       {canDelete(req) && (
                        <button
                          onClick={() => setDeletingRequest(req)}
                          className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      )}
                      {/* Bailout button — visible for all trips */}
                      <button
                        onClick={() => setBailoutTrip(req)}
                        className="rounded px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 border border-amber-200"
                      >
                        💰 Bailout
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t bg-gray-50 px-4 py-2 text-xs text-gray-500">
            {requests.length} request{requests.length !== 1 ? "s" : ""} found
          </div>
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title="New Business Trip Request" size="lg">
        <TravelRequestForm
          isLoading={createMutation.isPending || submitMutation.isPending}
          onSubmit={handleCreate}
          onSubmitAndSubmit={handleCreateAndSubmit}
          onCancel={() => setIsFormOpen(false)}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={!!editingRequest}
        onClose={() => setEditingRequest(null)}
        title={`Edit Request — ${editingRequest?.requestNumber ?? ""}`}
        size="lg"
      >
        {editingRequest && (
          <TravelRequestForm
            initialData={{
              purpose: editingRequest.purpose,
              destination: editingRequest.destination,
              travelType: editingRequest.travelType,
              startDate: toDateInput(editingRequest.startDate),
              endDate: toDateInput(editingRequest.endDate),
              projectId: editingRequest.project?.id ?? undefined,
              participantIds: editingRequest.participants.map((p) => p.userId),
              bailouts: editingRequest.bailouts?.map((b) => ({
                category: (b.category as "TRANSPORT" | "HOTEL" | "MEAL" | "OTHER") ?? "OTHER",
                description: b.description,
                amount: typeof b.amount === "string" ? parseFloat(b.amount) : b.amount,
                transportMode: b.transportMode ?? undefined,
                carrier: b.carrier ?? undefined,
                departureFrom: b.departureFrom ?? undefined,
                arrivalTo: b.arrivalTo ?? undefined,
                departureAt: toDateTimeInput(b.departureAt),
                arrivalAt: toDateTimeInput(b.arrivalAt),
                flightNumber: b.flightNumber ?? undefined,
                seatClass: b.seatClass ?? undefined,
                hotelName: b.hotelName ?? undefined,
                hotelAddress: b.hotelAddress ?? undefined,
                checkIn: toDateInput(b.checkIn),
                checkOut: toDateInput(b.checkOut),
                roomType: b.roomType ?? undefined,
                mealDate: toDateInput(b.mealDate),
                mealLocation: b.mealLocation ?? undefined,
                financeId: b.financeId ?? undefined,
              })) ?? [],
            }}
            isLoading={updateMutation.isPending || submitMutation.isPending}
            onSubmit={handleUpdate}
            onSubmitAndSubmit={editingRequest.status === "REVISION" ? handleUpdateAndSubmit : undefined}
            submitAndSubmitLabel={editingRequest.status === "REVISION" ? "Submit Revisi" : "Submit Travel"}
            onCancel={() => setEditingRequest(null)}
          />
        )}
      </Modal>

      {/* View Modal */}
      <Modal
        isOpen={!!viewingRequest}
        onClose={() => setViewingRequest(null)}
        title={`Request Detail — ${viewingRequest?.requestNumber ?? ""}`}
        size="xl"
      >
        {viewingRequest && (
          <TravelRequestDetail
            request={viewingRequest}
            currentUserId={userId}
            onEdit={() => { setEditingRequest(viewingRequest); setViewingRequest(null); }}
            onSubmit={() => { setSubmittingRequest(viewingRequest); setViewingRequest(null); }}
            onDelete={() => { setDeletingRequest(viewingRequest); setViewingRequest(null); }}
            canEdit={canEdit(viewingRequest)}
            canDelete={canDelete(viewingRequest)}
            canSubmit={canSubmit(viewingRequest)}
          />
        )}
      </Modal>

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={!!deletingRequest}
        onClose={() => setDeletingRequest(null)}
        onConfirm={() => { if (deletingRequest) deleteMutation.mutate({ id: deletingRequest.id }); }}
        title="Delete Request"
        message={`Are you sure you want to delete request "${deletingRequest?.requestNumber}"? This action cannot be undone.`}
        confirmLabel="Delete"
        isLoading={deleteMutation.isPending}
        variant="danger"
      />

      {/* Submit Confirm */}
      <ConfirmModal
        isOpen={!!submittingRequest}
        onClose={() => setSubmittingRequest(null)}
        onConfirm={() => { if (submittingRequest) submitMutation.mutate({ id: submittingRequest.id }); }}
        title="Submit for Approval"
        message={`Submit "${submittingRequest?.requestNumber}" for approval? Once submitted, it cannot be edited unless a revision is requested.`}
        confirmLabel="Submit"
        isLoading={submitMutation.isPending}
        variant="warning"
      />

      {/* Bailout Panel */}
      {bailoutTrip && (
        <BailoutPanel
          travelRequestId={bailoutTrip.id}
          travelRequestNumber={bailoutTrip.requestNumber}
          travelStatus={bailoutTrip.status}
          isOpen={!!bailoutTrip}
          onClose={() => setBailoutTrip(null)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────
   TravelRequestDetail (used in Pengajuan View modal)
───────────────────────────────────────────────────── */
function TravelRequestDetail({
  request,
  onEdit,
  onSubmit,
  onDelete,
  canEdit,
  canDelete,
  canSubmit,
}: {
  request: TravelRequest;
  currentUserId?: string;
  onEdit: () => void;
  onSubmit: () => void;
  onDelete: () => void;
  canEdit: boolean;
  canDelete: boolean;
  canSubmit: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"info" | "bailout" | "approval">("info");

  const bailoutCount = request.bailouts?.length ?? 0;
  const approvalCount = request.approvals.length;
  const decisionReason = getTravelDecisionReason(request);

  const tabs = [
    { key: "info" as const, label: "📋 Info & Project" },
    { key: "bailout" as const, label: `💰 Dana Talangan ${bailoutCount > 0 ? `(${bailoutCount})` : ""}` },
    { key: "approval" as const, label: `✅ Approval ${approvalCount > 0 ? `(${approvalCount})` : ""}` },
  ];

  const CATEGORY_LABELS: Record<string, string> = {
    TRANSPORT: "✈️ Transportasi",
    HOTEL: "🏨 Penginapan",
    MEAL: "🍽️ Uang Makan",
    OTHER: "📦 Lainnya",
  };
  const CATEGORY_COLORS: Record<string, string> = {
    TRANSPORT: "bg-blue-100 text-blue-700",
    HOTEL: "bg-purple-100 text-purple-700",
    MEAL: "bg-green-100 text-green-700",
    OTHER: "bg-gray-100 text-gray-600",
  };

  return (
    <div className="flex flex-col gap-0">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-xl font-bold text-gray-900">{request.requestNumber}</p>
          <p className="mt-0.5 text-sm text-gray-500">{TRAVEL_TYPE_LABELS[request.travelType]}</p>
        </div>
        <StatusBadge status={request.status} type="travel" />
      </div>

      <div className="flex border-b border-gray-200 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "info" && (
        <div className="space-y-4">
          {(request.status === "REJECTED" || request.status === "REVISION") && (
            <div className={`rounded-lg border p-4 ${
              request.status === "REJECTED"
                ? "border-red-200 bg-red-50"
                : "border-yellow-200 bg-yellow-50"
            }`}>
              <p className={`text-sm font-semibold ${
                request.status === "REJECTED" ? "text-red-800" : "text-yellow-800"
              }`}>
                {request.status === "REJECTED" ? "❌ Permohonan Ditolak" : "↩️ Perlu Revisi"}
              </p>
              {decisionReason && (
                <p className={`mt-1 text-sm ${
                  request.status === "REJECTED" ? "text-red-700" : "text-yellow-700"
                }`}>
                  {decisionReason}
                </p>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nomor Request" value={request.requestNumber} />
            <Field label="Jenis Perjalanan" value={TRAVEL_TYPE_LABELS[request.travelType]} />
            <Field label="Destinasi" value={request.destination} />
            <Field label="Requester" value={`${request.requester.name ?? "—"} (${request.requester.employeeId ?? "—"})`} />
            <Field label="Tanggal Mulai" value={formatDate(request.startDate)} />
            <Field label="Tanggal Selesai" value={formatDate(request.endDate)} />
            <Field label="Dibuat" value={formatDate(request.createdAt)} />
            <Field label="Disubmit" value={request.submittedAt ? formatDate(request.submittedAt) : "—"} />
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
            <p className="text-xs font-medium text-gray-500 mb-1">Tujuan Perjalanan</p>
            <p className="text-sm text-gray-900 whitespace-pre-wrap">{request.purpose}</p>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-gray-700">👥 Peserta (Assignee)</p>
            {request.participants.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Tidak ada peserta tambahan</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {request.participants.map((p) => (
                  <span key={p.userId} className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                    👤 {p.user.name ?? p.userId}
                  </span>
                ))}
              </div>
            )}
          </div>
          {request.project && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="mb-3 text-sm font-semibold text-blue-800">📊 Informasi Project Sales</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Kode Project" value={request.project.code} />
                <Field label="Nama Project" value={request.project.name} />
                {request.project.clientName && (
                  <Field label="Client" value={request.project.clientName} />
                )}
              </div>
            </div>
          )}
          {request.travelType === "SALES" && !request.project && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
              <p className="text-sm text-yellow-700">⚠️ Tidak ada project terhubung</p>
            </div>
          )}
        </div>
      )}

      {activeTab === "bailout" && (
        <div className="space-y-3">
          {bailoutCount === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-gray-200 py-12 text-center">
              <p className="text-2xl">💰</p>
              <p className="mt-2 text-sm text-gray-500">Belum ada dana talangan</p>
            </div>
          ) : (
            request.bailouts?.map((b, i) => {
              const cat = b.category ?? "OTHER";
              return (
                <div key={b.id ?? i} className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[cat] ?? "bg-gray-100 text-gray-600"}`}>
                          {CATEGORY_LABELS[cat] ?? cat}
                        </span>
                      </div>
                      <p className="text-sm text-gray-800">{b.description}</p>
                      <p className="text-sm font-bold text-amber-700 mt-1">
                        {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(Number(b.amount))}
                      </p>
                    </div>
                  </div>
                  {cat === "TRANSPORT" && (b.departureFrom ?? b.arrivalTo) && (
                    <p className="text-xs text-blue-700">{b.departureFrom ?? "?"} → {b.arrivalTo ?? "?"}</p>
                  )}
                  {cat === "HOTEL" && b.hotelName && (
                    <p className="text-xs text-purple-700">
                      {b.hotelName}
                      {b.checkIn && b.checkOut ? ` (${formatDate(b.checkIn)} — ${formatDate(b.checkOut)})` : ""}
                    </p>
                  )}
                  {cat === "MEAL" && b.mealDate && (
                    <p className="text-xs text-green-700">{formatDate(b.mealDate)}{b.mealLocation ? ` — ${b.mealLocation}` : ""}</p>
                  )}
                  <div className="border-t border-gray-200 pt-2 mt-1">
                    {b.finance ? (
                      <p className="text-xs text-gray-600">
                        💳 <span className="font-medium text-gray-700">Finance:</span>{" "}
                        <span className="text-indigo-700">{b.finance.name ?? b.finance.email ?? b.finance.id}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 italic">💳 Finance belum ditugaskan</p>
                    )}
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-gray-600">
                        📁 <span className="font-medium text-gray-700">File Pencairan:</span>
                      </p>
                      <BailoutAttachmentLink bailoutId={b.id} storageUrl={b.storageUrl} />
                      {b.disbursedAt && (
                        <p className="text-xs text-green-700">
                          Dana dicairkan pada {formatDate(b.disbursedAt)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === "approval" && (
        <div className="space-y-2">
          {approvalCount === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-gray-200 py-12 text-center">
              <p className="text-2xl">✅</p>
              <p className="mt-2 text-sm text-gray-500">Belum ada riwayat approval</p>
            </div>
          ) : (
            request.approvals.map((a) => (
              <div key={a.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-600">{a.level.replace(/_/g, " ")}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    a.status === "APPROVED" ? "bg-green-100 text-green-700"
                    : a.status === "REJECTED" ? "bg-red-100 text-red-700"
                    : "bg-yellow-100 text-yellow-700"
                  }`}>
                    {a.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-700">{a.approver.name ?? "—"} <span className="text-gray-400">({a.approver.role})</span></p>
                {(a.rejectionReason ?? a.comments) && <p className="mt-1.5 text-xs italic text-gray-500">&quot;{a.rejectionReason ?? a.comments}&quot;</p>}
                {a.approvedAt && <p className="mt-1 text-xs text-gray-400">Disetujui: {formatDate(a.approvedAt)}</p>}
                {a.rejectedAt && <p className="mt-1 text-xs text-gray-400">Ditolak: {formatDate(a.rejectedAt)}</p>}
              </div>
            ))
          )}
        </div>
      )}

      <div className="flex justify-end gap-3 border-t pt-4 mt-4">
        {canDelete && (
          <Button variant="destructive" size="sm" onClick={onDelete}>Hapus</Button>
        )}
        {canEdit && (
          <Button variant="secondary" size="sm" onClick={onEdit}>Edit</Button>
        )}
        {canSubmit && (
          <Button size="sm" onClick={onSubmit}>Submit for Approval</Button>
        )}
      </div>
    </div>
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

function BailoutAttachmentLink({
  bailoutId,
  storageUrl,
}: {
  bailoutId: string;
  storageUrl?: string | null;
}) {
  const fileUrlQuery = api.bailout.getFileUrl.useQuery(
    { id: bailoutId },
    { enabled: !!storageUrl, staleTime: 25 * 60 * 1000 }
  );

  if (!storageUrl) {
    return <p className="text-xs text-gray-400 italic">Belum ada file bukti pencairan</p>;
  }

  const fileName = storageUrl.split("/").pop() ?? "Buka file";
  const downloadUrl = (fileUrlQuery.data as { url: string | null } | undefined)?.url ?? null;

  if (!downloadUrl) {
    return <p className="text-xs text-gray-500">Memuat file bukti pencairan...</p>;
  }

  return (
    <a
      href={downloadUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
    >
      📎 {fileName}
    </a>
  );
}
