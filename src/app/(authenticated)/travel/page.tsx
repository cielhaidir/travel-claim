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
import type { TravelType, TravelStatus, ApprovalStatus } from "../../../../generated/prisma";

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
    transportMode?: string | null;
    carrier?: string | null;
    departureFrom?: string | null;
    arrivalTo?: string | null;
    hotelName?: string | null;
    checkIn?: string | Date | null;
    checkOut?: string | Date | null;
    mealDate?: string | Date | null;
    mealLocation?: string | null;
  }>;
  participants: Array<{ userId: string; user: { id: string; name: string | null } }>;
  approvals: Array<{
    id: string;
    level: string;
    status: string;
    approver: { id: string; name: string | null; role: string };
    comments: string | null;
    approvedAt: string | Date | null;
    rejectedAt: string | Date | null;
  }>;
  _count?: { claims: number };
}

interface ApprovalItem {
  id: string;
  level: string;
  status: ApprovalStatus;
  comments: string | null;
  rejectionReason: string | null;
  approvedAt: string | Date | null;
  rejectedAt: string | Date | null;
  createdAt: string | Date;
  approver: { id: string; name: string | null; role: string };
  travelRequest: {
    id: string;
    requestNumber: string;
    destination: string;
    travelType: string;
    status: string;
    startDate: string | Date;
    endDate: string | Date;
    estimatedBudget: number | null;
    purpose: string;
    requester: { id: string; name: string | null; employeeId: string | null; department?: { name: string } | null };
  } | null;
  claim: null;
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

// ─────────────── Page Tabs ───────────────

type PageTab = "pengajuan" | "supervisor" | "director";

const PAGE_TABS: { key: PageTab; label: string; icon: string }[] = [
  { key: "pengajuan", label: "Pengajuan Busstrip", icon: "✈️" },
  { key: "supervisor", label: "Approval Supervisor", icon: "👔" },
  { key: "director", label: "Approval Director", icon: "🏢" },
];

// ─────────────── Main Page ───────────────

export default function TravelRequestsPage() {
  const [activeTab, setActiveTab] = useState<PageTab>("pengajuan");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business Trip Requests"
        description="Kelola dan lacak seluruh pengajuan dan persetujuan perjalanan dinas"
      />

      {/* Page-level Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0" aria-label="Tabs">
          {PAGE_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-blue-500 text-blue-600 bg-blue-50"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "pengajuan" && <PengajuanTab />}
      {activeTab === "supervisor" && <ApprovalTab role="supervisor" />}
      {activeTab === "director" && <DirectorApprovalTab />}
    </div>
  );
}

// ─────────────── Tab 1: Pengajuan ───────────────

function PengajuanTab() {
  const { data: session } = useSession();
  const userId = session?.user?.id;

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
    onSuccess: () => { void refetch(); setIsFormOpen(false); },
    onError: (err) => alert(`Error: ${err.message}`),
  });
  const updateMutation = api.travelRequest.update.useMutation({
    onSuccess: () => { void refetch(); setEditingRequest(null); },
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

  const handleCreate = (formData: TravelRequestFormData) => {
    createMutation.mutate({
      purpose: formData.purpose,
      destination: formData.destination,
      travelType: formData.travelType,
      startDate: new Date(formData.startDate),
      endDate: new Date(formData.endDate),
      projectId: formData.projectId ?? undefined,
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
        bookingRef: b.bookingRef ?? undefined,
        hotelName: b.hotelName ?? undefined,
        hotelAddress: b.hotelAddress ?? undefined,
        checkIn: b.checkIn ? new Date(b.checkIn) : undefined,
        checkOut: b.checkOut ? new Date(b.checkOut) : undefined,
        roomType: b.roomType ?? undefined,
        mealDate: b.mealDate ? new Date(b.mealDate) : undefined,
        mealLocation: b.mealLocation ?? undefined,
      })),
    });
  };


  const handleUpdate = (formData: TravelRequestFormData) => {
    if (!editingRequest) return;
    updateMutation.mutate({
      id: editingRequest.id,
      purpose: formData.purpose,
      destination: formData.destination,
      travelType: formData.travelType,
      startDate: new Date(formData.startDate),
      endDate: new Date(formData.endDate),
      projectId: formData.projectId ?? undefined,
    });
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
        <Button onClick={() => setIsFormOpen(true)}>+ New Request</Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="rounded-lg border bg-white p-12 text-center text-gray-500">Loading...</div>
      ) : requests.length === 0 ? (
        <EmptyState
          icon="✈️"
          title="No business trip requests yet"
          description="Get started by creating your first business trip request"
          action={{ label: "Create Request", onClick: () => setIsFormOpen(true) }}
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
          isLoading={createMutation.isPending}
          onSubmit={handleCreate}
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
              bailouts: editingRequest.bailouts?.map((b) => ({
                category: (b.category as "TRANSPORT" | "HOTEL" | "MEAL" | "OTHER") ?? "OTHER",
                description: b.description,
                amount: typeof b.amount === "string" ? parseFloat(b.amount) : b.amount,
                transportMode: b.transportMode ?? undefined,
                carrier: b.carrier ?? undefined,
                departureFrom: b.departureFrom ?? undefined,
                arrivalTo: b.arrivalTo ?? undefined,
                hotelName: b.hotelName ?? undefined,
                checkIn: toDateInput(b.checkIn),
                checkOut: toDateInput(b.checkOut),
                mealDate: toDateInput(b.mealDate),
                mealLocation: b.mealLocation ?? undefined,
              })) ?? [],
            }}
            isLoading={updateMutation.isPending}
            onSubmit={handleUpdate}
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

// ─────────────── Tab 2 & 3: Approval Tabs ───────────────

function ApprovalTab({ role }: { role: "supervisor" | "director" }) {
  const levelFilter = role === "supervisor" ? "L1_SUPERVISOR" : "L3_DIRECTOR";
  const roleLabel = role === "supervisor" ? "Supervisor" : "Director";

  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | "ALL">("PENDING");
  const [viewingApproval, setViewingApproval] = useState<ApprovalItem | null>(null);
  const [actionApproval, setActionApproval] = useState<ApprovalItem | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | "revision" | null>(null);
  const [actionComment, setActionComment] = useState("");
  const [actionError, setActionError] = useState("");

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data: rawData, isLoading, refetch } = api.approval.getAllApprovalsAdmin.useQuery(
    {
      level: levelFilter,
      status: statusFilter === "ALL" ? undefined : statusFilter,
      limit: 50,
    },
    { refetchOnWindowFocus: false }
  );
  const data = rawData as { approvals: ApprovalItem[] } | undefined;
  const approvals = data?.approvals ?? [];

  const adminActMutation = api.approval.adminActOnApproval.useMutation({
    onSuccess: () => { void refetch(); closeAction(); },
    onError: (err) => setActionError(err.message),
  });

  const openAction = (a: ApprovalItem, type: "approve" | "reject" | "revision") => {
    setActionApproval(a);
    setActionType(type);
    setActionComment("");
    setActionError("");
  };

  const closeAction = () => {
    setActionApproval(null);
    setActionType(null);
    setActionComment("");
    setActionError("");
  };

  const handleAction = () => {
    if (!actionApproval || !actionType) return;
    const requiresComment = actionType === "reject" || actionType === "revision";
    if (requiresComment && actionComment.length < 10) {
      setActionError("Berikan alasan minimal 10 karakter");
      return;
    }
    adminActMutation.mutate({
      approvalId: actionApproval.id,
      action: actionType,
      comments: actionComment || undefined,
    });
  };

  const isLoading2 = adminActMutation.isPending;

  const actionTitle =
    actionType === "approve" ? "Approve" : actionType === "reject" ? "Reject" : "Request Revision";
  const actionVariant: "primary" | "destructive" | "secondary" =
    actionType === "approve" ? "primary" : actionType === "reject" ? "destructive" : "secondary";

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        <strong>Mode Testing — Approval {roleLabel}.</strong> Tab ini menampilkan semua pengajuan busstrip yang di-assign ke level <strong>{levelFilter.replace(/_/g, " ")}</strong>. Admin dapat melakukan approve/reject/revisi dari sini untuk keperluan pengujian alur.
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-3">
        <select
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ApprovalStatus | "ALL")}
        >
          <option value="ALL">Semua Status</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="REVISION_REQUESTED">Revision Requested</option>
        </select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="rounded-lg border bg-white p-12 text-center text-gray-500">Loading...</div>
      ) : approvals.length === 0 ? (
        <EmptyState
          icon={role === "supervisor" ? "👔" : "🏢"}
          title={`Tidak ada approval ${roleLabel}`}
          description={
            statusFilter === "PENDING"
              ? `Tidak ada pengajuan busstrip yang menunggu persetujuan ${roleLabel}.`
              : "Tidak ada data yang sesuai dengan filter."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Request #</th>
                <th className="px-4 py-3">Requester</th>
                <th className="px-4 py-3">Destination</th>
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Approver Assign</th>
                <th className="px-4 py-3">Status Approval</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {approvals.map((a) => {
                const tr = a.travelRequest;
                return (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-blue-600">
                      {tr?.requestNumber ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <p>{tr?.requester.name ?? "—"}</p>
                      {tr?.requester.employeeId && (
                        <p className="text-xs text-gray-400">{tr.requester.employeeId}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <p>{tr?.destination ?? "—"}</p>
                      {tr?.travelType && (
                        <p className="text-xs text-gray-400">{tr.travelType}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {tr ? `${formatDate(tr.startDate)} – ${formatDate(tr.endDate)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {a.approver?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          a.status === "APPROVED"
                            ? "bg-green-100 text-green-800"
                            : a.status === "REJECTED"
                            ? "bg-red-100 text-red-800"
                            : a.status === "REVISION_REQUESTED"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-orange-100 text-orange-800"
                        }`}
                      >
                        {a.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setViewingApproval(a)}
                          className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                        >
                          Detail
                        </button>
                        {a.status === "PENDING" && (
                          <>
                            <button
                              onClick={() => openAction(a, "approve")}
                              className="rounded px-2 py-1 text-xs text-green-700 font-medium hover:bg-green-50"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => openAction(a, "revision")}
                              className="rounded px-2 py-1 text-xs text-yellow-700 hover:bg-yellow-50"
                            >
                              Revisi
                            </button>
                            <button
                              onClick={() => openAction(a, "reject")}
                              className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="border-t bg-gray-50 px-4 py-2 text-xs text-gray-500">
            {approvals.length} approval ditemukan
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <Modal isOpen={!!viewingApproval} onClose={() => setViewingApproval(null)} title="Detail Pengajuan" size="lg">
        {viewingApproval?.travelRequest && (
          <div className="space-y-4 text-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-bold text-gray-900">{viewingApproval.travelRequest.requestNumber}</p>
                <p className="text-sm text-gray-500">{viewingApproval.travelRequest.travelType}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                viewingApproval.status === "APPROVED" ? "bg-green-100 text-green-800"
                : viewingApproval.status === "REJECTED" ? "bg-red-100 text-red-800"
                : viewingApproval.status === "REVISION_REQUESTED" ? "bg-yellow-100 text-yellow-800"
                : "bg-orange-100 text-orange-800"
              }`}>
                {viewingApproval.status.replace(/_/g, " ")}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Requester" value={`${viewingApproval.travelRequest.requester.name ?? "—"} (${viewingApproval.travelRequest.requester.employeeId ?? "—"})`} />
              {viewingApproval.travelRequest.requester.department && (
                <Field label="Department" value={viewingApproval.travelRequest.requester.department.name} />
              )}
              <Field label="Destination" value={viewingApproval.travelRequest.destination} />
              <Field label="Tanggal" value={`${formatDate(viewingApproval.travelRequest.startDate)} – ${formatDate(viewingApproval.travelRequest.endDate)}`} />
              <Field label="Status Request" value={viewingApproval.travelRequest.status} />
              <Field label="Level Approval" value={viewingApproval.level.replace(/_/g, " ")} />
              <Field label="Approver Assign" value={viewingApproval.approver?.name ?? "—"} />
            </div>
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
              <p className="text-xs font-medium text-gray-500 mb-1">Tujuan Perjalanan</p>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{viewingApproval.travelRequest.purpose}</p>
            </div>
            {viewingApproval.comments && (
              <div className="rounded-lg border border-yellow-100 bg-yellow-50 p-3">
                <p className="text-xs font-semibold text-yellow-800 mb-1">Komentar</p>
                <p className="text-sm text-yellow-900">{viewingApproval.comments}</p>
              </div>
            )}
            {viewingApproval.status === "PENDING" && (
              <div className="flex justify-end gap-3 border-t pt-4">
                <Button variant="destructive" size="sm" onClick={() => { openAction(viewingApproval, "reject"); setViewingApproval(null); }}>Reject</Button>
                <Button variant="secondary" size="sm" onClick={() => { openAction(viewingApproval, "revision"); setViewingApproval(null); }}>Request Revision</Button>
                <Button size="sm" onClick={() => { openAction(viewingApproval, "approve"); setViewingApproval(null); }}>Approve</Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Action Modal */}
      <Modal
        isOpen={!!actionApproval}
        onClose={closeAction}
        title={`${actionTitle}: ${actionApproval?.travelRequest?.requestNumber ?? ""}`}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {actionType === "approve"
              ? "Konfirmasi approval. Anda dapat menambahkan komentar (opsional)."
              : actionType === "reject"
              ? "Berikan alasan penolakan (wajib, min. 10 karakter)."
              : "Deskripsikan perubahan yang diperlukan (wajib, min. 10 karakter)."}
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {actionType === "approve" ? "Komentar (opsional)" : "Alasan *"}
            </label>
            <textarea
              rows={4}
              value={actionComment}
              onChange={(e) => { setActionComment(e.target.value); setActionError(""); }}
              placeholder={actionType === "approve" ? "Tambahkan komentar..." : "Jelaskan alasannya..."}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {actionError && <p className="mt-1 text-xs text-red-500">{actionError}</p>}
          </div>
          <div className="flex justify-end gap-3 border-t pt-4">
            <Button variant="secondary" onClick={closeAction} disabled={isLoading2}>Batal</Button>
            <Button variant={actionVariant} onClick={handleAction} isLoading={isLoading2}>
              {actionTitle}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}


// ─────────────── Tab 3: Director Approval (dedicated) ───────────────

interface DirectorTravelRequest {
  id: string;
  requestNumber: string;
  destination: string;
  travelType: string;
  status: string;
  startDate: string | Date;
  endDate: string | Date;
  purpose: string;
  requester: {
    id: string;
    name: string | null;
    employeeId: string | null;
    department?: { name: string } | null;
  };
  approvals: Array<{
    id: string;
    level: string;
    status: string;
    comments: string | null;
    approver: { id: string; name: string | null; role: string };
  }>;
}

function DirectorApprovalTab() {
  const [statusFilter, setStatusFilter] = useState<"PENDING" | "ALL">("PENDING");
  const [actionRequest, setActionRequest] = useState<DirectorTravelRequest | null>(null);
  const [actionApprovalId, setActionApprovalId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | "revision" | null>(null);
  const [actionComment, setActionComment] = useState("");
  const [actionError, setActionError] = useState("");

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data: rawData, isLoading, refetch } = api.approval.getTravelRequestsForDirectorReview.useQuery(
    { statusFilter, limit: 50 },
    { refetchOnWindowFocus: false }
  );
  const data = rawData as { travelRequests: DirectorTravelRequest[] } | undefined;
  const travelRequests = data?.travelRequests ?? [];

  const adminActMutation = api.approval.adminActOnApproval.useMutation({
    onSuccess: () => { void refetch(); closeAction(); },
    onError: (err) => setActionError(err.message),
  });

  // For requests that have no L3 approval yet, use a direct travelRequest-level action
  const adminDirectActMutation = api.approval.adminActOnTravelRequestDirect.useMutation({
    onSuccess: () => { void refetch(); closeAction(); },
    onError: (err) => setActionError(err.message),
  });

  const openAction = (req: DirectorTravelRequest, type: "approve" | "reject" | "revision") => {
    const l3 = req.approvals.find(a => a.level === "L3_DIRECTOR" && a.status === "PENDING");
    setActionRequest(req);
    setActionApprovalId(l3?.id ?? null);
    setActionType(type);
    setActionComment("");
    setActionError("");
  };

  const closeAction = () => {
    setActionRequest(null);
    setActionApprovalId(null);
    setActionType(null);
    setActionComment("");
    setActionError("");
  };

  const handleAction = () => {
    if (!actionRequest || !actionType) return;
    const requiresComment = actionType === "reject" || actionType === "revision";
    if (requiresComment && actionComment.length < 10) {
      setActionError("Berikan alasan minimal 10 karakter");
      return;
    }
    if (actionApprovalId) {
      // Has L3 approval record — use standard adminActOnApproval
      adminActMutation.mutate({ approvalId: actionApprovalId, action: actionType, comments: actionComment || undefined });
    } else {
      // No L3 approval yet — use direct travelRequest action
      adminDirectActMutation.mutate({ travelRequestId: actionRequest.id, action: actionType, comments: actionComment || undefined });
    }
  };

  const isActing = adminActMutation.isPending || adminDirectActMutation.isPending;
  const actionTitle = actionType === "approve" ? "Approve" : actionType === "reject" ? "Reject" : "Request Revision";
  const actionVariant: "primary" | "destructive" | "secondary" =
    actionType === "approve" ? "primary" : actionType === "reject" ? "destructive" : "secondary";

  const getL3Status = (req: DirectorTravelRequest) => {
    const l3 = req.approvals.find(a => a.level === "L3_DIRECTOR");
    return l3?.status ?? "NOT_CREATED";
  };

  const canAct = (req: DirectorTravelRequest) => {
    const l3Status = getL3Status(req);
    return l3Status === "PENDING" || l3Status === "NOT_CREATED";
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        <strong>Mode Testing — Approval Director.</strong> Menampilkan semua pengajuan yang sudah melewati approval Supervisor (APPROVED_L1/APPROVED_L2) dan siap direview oleh Director. Admin dapat melakukan approve/reject/revisi dari sini.
      </div>

      <div className="flex gap-3">
        <select
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "PENDING" | "ALL")}
        >
          <option value="PENDING">Menunggu Persetujuan</option>
          <option value="ALL">Semua (termasuk sudah diproses)</option>
        </select>
      </div>

      {isLoading ? (
        <div className="rounded-lg border bg-white p-12 text-center text-gray-500">Loading...</div>
      ) : travelRequests.length === 0 ? (
        <EmptyState
          icon="🏢"
          title="Tidak ada pengajuan untuk Director"
          description={statusFilter === "PENDING"
            ? "Belum ada pengajuan yang melewati approval Supervisor dan menunggu persetujuan Director."
            : "Tidak ada data yang sesuai filter."}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Request #</th>
                <th className="px-4 py-3">Requester</th>
                <th className="px-4 py-3">Destination</th>
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Status Request</th>
                <th className="px-4 py-3">Status L3 Approval</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {travelRequests.map((req) => {
                const l3Status = getL3Status(req);
                const l3 = req.approvals.find(a => a.level === "L3_DIRECTOR");
                return (
                  <tr key={req.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-blue-600">{req.requestNumber}</td>
                    <td className="px-4 py-3 text-gray-700">
                      <p>{req.requester.name ?? "—"}</p>
                      {req.requester.employeeId && (
                        <p className="text-xs text-gray-400">{req.requester.employeeId}</p>
                      )}
                      {req.requester.department && (
                        <p className="text-xs text-gray-400">{req.requester.department.name}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <p>{req.destination}</p>
                      <p className="text-xs text-gray-400">{req.travelType}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {formatDate(req.startDate)} – {formatDate(req.endDate)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                        {req.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        l3Status === "APPROVED" ? "bg-green-100 text-green-800"
                        : l3Status === "REJECTED" ? "bg-red-100 text-red-800"
                        : l3Status === "REVISION_REQUESTED" ? "bg-yellow-100 text-yellow-800"
                        : l3Status === "PENDING" ? "bg-orange-100 text-orange-800"
                        : "bg-gray-100 text-gray-600"
                      }`}>
                        {l3Status === "NOT_CREATED" ? "Belum dibuat" : l3Status.replace(/_/g, " ")}
                      </span>
                      {l3?.approver && (
                        <p className="mt-0.5 text-xs text-gray-400">{l3.approver.name}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {canAct(req) && (
                          <>
                            <button onClick={() => openAction(req, "approve")} className="rounded px-2 py-1 text-xs text-green-700 font-medium hover:bg-green-50">Approve</button>
                            <button onClick={() => openAction(req, "revision")} className="rounded px-2 py-1 text-xs text-yellow-700 hover:bg-yellow-50">Revisi</button>
                            <button onClick={() => openAction(req, "reject")} className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">Reject</button>
                          </>
                        )}
                        {!canAct(req) && l3Status !== "NOT_CREATED" && (
                          <span className="text-xs text-gray-400">Sudah diproses</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="border-t bg-gray-50 px-4 py-2 text-xs text-gray-500">
            {travelRequests.length} pengajuan ditemukan
          </div>
        </div>
      )}

      {/* Action Modal */}
      <Modal
        isOpen={!!actionRequest}
        onClose={closeAction}
        title={`${actionTitle}: ${actionRequest?.requestNumber ?? ""}`}
        size="md"
      >
        <div className="space-y-4">
          {!actionApprovalId && (
            <div className="rounded-lg border border-yellow-100 bg-yellow-50 p-3 text-xs text-yellow-800">
              ⚠️ Pengajuan ini belum memiliki approval Director yang dibuat secara otomatis. Aksi ini akan membuat dan langsung memproses approval Director sekarang.
            </div>
          )}
          <p className="text-sm text-gray-600">
            {actionType === "approve"
              ? "Konfirmasi approval sebagai Director. Anda dapat menambahkan komentar (opsional)."
              : actionType === "reject"
              ? "Berikan alasan penolakan (wajib, min. 10 karakter)."
              : "Deskripsikan perubahan yang diperlukan (wajib, min. 10 karakter)."}
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {actionType === "approve" ? "Komentar (opsional)" : "Alasan *"}
            </label>
            <textarea
              rows={4}
              value={actionComment}
              onChange={(e) => { setActionComment(e.target.value); setActionError(""); }}
              placeholder={actionType === "approve" ? "Tambahkan komentar..." : "Jelaskan alasannya..."}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {actionError && <p className="mt-1 text-xs text-red-500">{actionError}</p>}
          </div>
          <div className="flex justify-end gap-3 border-t pt-4">
            <Button variant="secondary" onClick={closeAction} disabled={isActing}>Batal</Button>
            <Button variant={actionVariant} onClick={handleAction} isLoading={isActing}>{actionTitle}</Button>
          </div>
        </div>
      </Modal>
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
          {request.participants.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold text-gray-700">Peserta</p>
              <div className="flex flex-wrap gap-2">
                {request.participants.map((p) => (
                  <span key={p.userId} className="rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-700">
                    {p.user.name ?? p.userId}
                  </span>
                ))}
              </div>
            </div>
          )}
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
                {a.comments && <p className="mt-1.5 text-xs italic text-gray-500">&quot;{a.comments}&quot;</p>}
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