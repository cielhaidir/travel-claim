"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/features/PageHeader";
import { StatusBadge } from "@/components/features/StatusBadge";
import { EmptyState } from "@/components/features/EmptyState";
import { Button } from "@/components/ui/Button";
import { Modal, ConfirmModal } from "@/components/ui/Modal";
import { ClaimForm, type ClaimFormData } from "@/components/features/claims/ClaimForm";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import type { ClaimType, ClaimStatus, TravelType, TravelStatus } from "../../../../generated/prisma";

interface TravelRequestRef {
  id: string;
  requestNumber: string;
  destination: string;
  travelType: TravelType;
  status: TravelStatus;
}

interface Claim {
  id: string;
  claimNumber: string;
  claimType: ClaimType;
  status: ClaimStatus;
  amount: number;
  description: string;
  notes: string | null;
  createdAt: string | Date;
  submittedAt: string | Date | null;
  // Entertainment
  entertainmentType: string | null;
  entertainmentDate: string | Date | null;
  entertainmentLocation: string | null;
  entertainmentAddress: string | null;
  guestName: string | null;
  guestCompany: string | null;
  guestPosition: string | null;
  isGovernmentOfficial: boolean | null;
  // Non-entertainment
  expenseCategory: string | null;
  expenseDate: string | Date | null;
  expenseDestination: string | null;
  customerName: string | null;
  submitter: { id: string; name: string | null; employeeId: string | null };
  travelRequest: TravelRequestRef;
  approvals: Array<{
    id: string;
    level: string;
    status: string;
    approver: { id: string; name: string | null; role: string };
    comments: string | null;
    approvedAt: string | Date | null;
    rejectedAt: string | Date | null;
  }>;
}

const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  ENTERTAINMENT: "Entertainment",
  NON_ENTERTAINMENT: "Non-Entertainment",
};

const EDITABLE_STATUSES: ClaimStatus[] = ["DRAFT", "REVISION"];
const DELETABLE_STATUSES: ClaimStatus[] = ["DRAFT"];
const SUBMITTABLE_STATUSES: ClaimStatus[] = ["DRAFT", "REVISION"];

function toDateInput(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toISOString().split("T")[0] ?? "";
}

export default function ClaimsPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  // Filters
  const [statusFilter, setStatusFilter] = useState<ClaimStatus | "ALL">("ALL");
  const [typeFilter, setTypeFilter] = useState<ClaimType | "ALL">("ALL");

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingClaim, setEditingClaim] = useState<Claim | null>(null);
  const [viewingClaim, setViewingClaim] = useState<Claim | null>(null);
  const [deletingClaim, setDeletingClaim] = useState<Claim | null>(null);
  const [submittingClaim, setSubmittingClaim] = useState<Claim | null>(null);

  // Fetch claims
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data: rawClaims, isLoading, refetch } = api.claim.getAll.useQuery(
    {
      status: statusFilter === "ALL" ? undefined : statusFilter,
      claimType: typeFilter === "ALL" ? undefined : typeFilter,
      limit: 50,
    },
    { refetchOnWindowFocus: false }
  );
  const claimsData = rawClaims as { claims: Claim[] } | undefined;
  const claims = claimsData?.claims ?? [];

  // Fetch approved/locked travel requests for the dropdown
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data: rawTR } = api.travelRequest.getAll.useQuery(
    { limit: 100 },
    { refetchOnWindowFocus: false }
  );
  const trData = rawTR as { requests: TravelRequestRef[] } | undefined;
  const approvedTravelRequests = (trData?.requests ?? []).filter(
    (tr) => tr.status === "APPROVED" || tr.status === "LOCKED"
  );

  // Mutations
  const createEntMutation = api.claim.createEntertainment.useMutation({
    onSuccess: () => { void refetch(); setIsFormOpen(false); },
    onError: (err) => alert(`Error: ${err.message}`),
  });
  const createNonEntMutation = api.claim.createNonEntertainment.useMutation({
    onSuccess: () => { void refetch(); setIsFormOpen(false); },
    onError: (err) => alert(`Error: ${err.message}`),
  });
  const updateMutation = api.claim.update.useMutation({
    onSuccess: () => { void refetch(); setEditingClaim(null); },
    onError: (err) => alert(`Error: ${err.message}`),
  });
  const deleteMutation = api.claim.delete.useMutation({
    onSuccess: () => { void refetch(); setDeletingClaim(null); },
    onError: (err) => alert(`Error: ${err.message}`),
  });
  const submitMutation = api.claim.submit.useMutation({
    onSuccess: () => { void refetch(); setSubmittingClaim(null); },
    onError: (err) => alert(`Error: ${err.message}`),
  });

  const handleCreate = (formData: ClaimFormData) => {
    if (formData.claimType === "ENTERTAINMENT") {
      createEntMutation.mutate({
        travelRequestId: formData.travelRequestId,
        entertainmentType: formData.entertainmentType,
        entertainmentDate: new Date(formData.entertainmentDate),
        entertainmentLocation: formData.entertainmentLocation,
        entertainmentAddress: formData.entertainmentAddress || undefined,
        guestName: formData.guestName,
        guestCompany: formData.guestCompany || undefined,
        guestPosition: formData.guestPosition || undefined,
        isGovernmentOfficial: formData.isGovernmentOfficial,
        amount: Number(formData.amount),
        description: formData.description,
        notes: formData.notes || undefined,
      });
    } else {
      createNonEntMutation.mutate({
        travelRequestId: formData.travelRequestId,
        expenseCategory: formData.expenseCategory,
        expenseDate: new Date(formData.expenseDate),
        expenseDestination: formData.expenseDestination || undefined,
        customerName: formData.customerName || undefined,
        amount: Number(formData.amount),
        description: formData.description,
        notes: formData.notes || undefined,
      });
    }
  };

  const handleUpdate = (formData: ClaimFormData) => {
    if (!editingClaim) return;
    if (formData.claimType === "ENTERTAINMENT") {
      updateMutation.mutate({
        id: editingClaim.id,
        entertainmentDate: new Date(formData.entertainmentDate),
        entertainmentLocation: formData.entertainmentLocation,
        entertainmentAddress: formData.entertainmentAddress || undefined,
        guestName: formData.guestName,
        guestCompany: formData.guestCompany || undefined,
        guestPosition: formData.guestPosition || undefined,
        isGovernmentOfficial: formData.isGovernmentOfficial,
        amount: Number(formData.amount),
        description: formData.description,
        notes: formData.notes || undefined,
      });
    } else {
      updateMutation.mutate({
        id: editingClaim.id,
        expenseDate: new Date(formData.expenseDate),
        expenseDestination: formData.expenseDestination || undefined,
        customerName: formData.customerName || undefined,
        amount: Number(formData.amount),
        description: formData.description,
        notes: formData.notes || undefined,
      });
    }
  };

  const handleDelete = () => {
    if (deletingClaim) deleteMutation.mutate({ id: deletingClaim.id });
  };
  const handleSubmit = () => {
    if (submittingClaim) submitMutation.mutate({ id: submittingClaim.id });
  };

  const canEdit = (c: Claim) => EDITABLE_STATUSES.includes(c.status) && c.submitter.id === userId;
  const canDelete = (c: Claim) => DELETABLE_STATUSES.includes(c.status) && c.submitter.id === userId;
  const canSubmit = (c: Claim) => SUBMITTABLE_STATUSES.includes(c.status) && c.submitter.id === userId;

  const isCreateLoading = createEntMutation.isPending || createNonEntMutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expense Claims"
        description="Submit and track your expense claims"
        primaryAction={{ label: "New Claim", onClick: () => setIsFormOpen(true) }}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ClaimStatus | "ALL")}
        >
          <option value="ALL">All Status</option>
          <option value="DRAFT">Draft</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="REVISION">Revision</option>
          <option value="PAID">Paid</option>
        </select>
        <select
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as ClaimType | "ALL")}
        >
          <option value="ALL">All Types</option>
          <option value="ENTERTAINMENT">Entertainment</option>
          <option value="NON_ENTERTAINMENT">Non-Entertainment</option>
        </select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="rounded-lg border bg-white p-12 text-center text-gray-500">Loading...</div>
      ) : claims.length === 0 ? (
        <EmptyState
          icon="💰"
          title="No claims yet"
          description="Submit your first expense claim to get reimbursed"
          action={{ label: "Create Claim", onClick: () => setIsFormOpen(true) }}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Claim #</th>
                <th className="px-4 py-3">Trip Request</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {claims.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-blue-600">{c.claimNumber}</td>
                  <td className="px-4 py-3 text-gray-700">
                    <span className="font-medium">{c.travelRequest.requestNumber}</span>
                    <span className="ml-1 text-gray-400">({c.travelRequest.destination})</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{CLAIM_TYPE_LABELS[c.claimType]}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {formatCurrency(Number(c.amount), "IDR")}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} type="claim" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setViewingClaim(c)}
                        className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                      >
                        View
                      </button>
                      {canSubmit(c) && (
                        <button
                          onClick={() => setSubmittingClaim(c)}
                          className="rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50"
                        >
                          Submit
                        </button>
                      )}
                      {canEdit(c) && (
                        <button
                          onClick={() => setEditingClaim(c)}
                          className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                        >
                          Edit
                        </button>
                      )}
                      {canDelete(c) && (
                        <button
                          onClick={() => setDeletingClaim(c)}
                          className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title="New Expense Claim" size="lg">
        <ClaimForm
          travelRequests={approvedTravelRequests}
          isLoading={isCreateLoading}
          onSubmit={handleCreate}
          onCancel={() => setIsFormOpen(false)}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={!!editingClaim}
        onClose={() => setEditingClaim(null)}
        title={`Edit Claim — ${editingClaim?.claimNumber ?? ""}`}
        size="lg"
      >
        {editingClaim && (
          <ClaimForm
            travelRequests={approvedTravelRequests}
            initialType={editingClaim.claimType === "ENTERTAINMENT" ? "ENTERTAINMENT" : "NON_ENTERTAINMENT"}
            initialData={
              editingClaim.claimType === "ENTERTAINMENT"
                ? {
                    claimType: "ENTERTAINMENT",
                    travelRequestId: editingClaim.travelRequest.id,
                    entertainmentType: (editingClaim.entertainmentType ?? "MEAL") as Parameters<typeof ClaimForm>[0]["initialData"] extends { entertainmentType: infer T } ? T : never,
                    entertainmentDate: toDateInput(editingClaim.entertainmentDate),
                    entertainmentLocation: editingClaim.entertainmentLocation ?? "",
                    entertainmentAddress: editingClaim.entertainmentAddress ?? "",
                    guestName: editingClaim.guestName ?? "",
                    guestCompany: editingClaim.guestCompany ?? "",
                    guestPosition: editingClaim.guestPosition ?? "",
                    isGovernmentOfficial: editingClaim.isGovernmentOfficial ?? false,
                    amount: String(editingClaim.amount),
                    description: editingClaim.description,
                    notes: editingClaim.notes ?? "",
                  }
                : {
                    claimType: "NON_ENTERTAINMENT",
                    travelRequestId: editingClaim.travelRequest.id,
                    expenseCategory: (editingClaim.expenseCategory ?? "TRANSPORT") as Parameters<typeof ClaimForm>[0]["initialData"] extends { expenseCategory: infer T } ? T : never,
                    expenseDate: toDateInput(editingClaim.expenseDate),
                    expenseDestination: editingClaim.expenseDestination ?? "",
                    customerName: editingClaim.customerName ?? "",
                    amount: String(editingClaim.amount),
                    description: editingClaim.description,
                    notes: editingClaim.notes ?? "",
                  }
            }
            isLoading={updateMutation.isPending}
            onSubmit={handleUpdate}
            onCancel={() => setEditingClaim(null)}
          />
        )}
      </Modal>

      {/* View Modal */}
      <Modal
        isOpen={!!viewingClaim}
        onClose={() => setViewingClaim(null)}
        title={`Claim Detail — ${viewingClaim?.claimNumber ?? ""}`}
        size="xl"
      >
        {viewingClaim && (
          <ClaimDetail
            claim={viewingClaim}
            onEdit={() => { setEditingClaim(viewingClaim); setViewingClaim(null); }}
            onSubmit={() => { setSubmittingClaim(viewingClaim); setViewingClaim(null); }}
            onDelete={() => { setDeletingClaim(viewingClaim); setViewingClaim(null); }}
            canEdit={canEdit(viewingClaim)}
            canDelete={canDelete(viewingClaim)}
            canSubmit={canSubmit(viewingClaim)}
          />
        )}
      </Modal>

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={!!deletingClaim}
        onClose={() => setDeletingClaim(null)}
        onConfirm={handleDelete}
        title="Delete Claim"
        message={`Are you sure you want to delete claim "${deletingClaim?.claimNumber}"? This action cannot be undone.`}
        confirmLabel="Delete"
        isLoading={deleteMutation.isPending}
        variant="danger"
      />

      {/* Submit Confirm */}
      <ConfirmModal
        isOpen={!!submittingClaim}
        onClose={() => setSubmittingClaim(null)}
        onConfirm={handleSubmit}
        title="Submit Claim"
        message={`Submit claim "${submittingClaim?.claimNumber}" for approval? Once submitted, it cannot be edited unless a revision is requested.`}
        confirmLabel="Submit"
        isLoading={submitMutation.isPending}
        variant="warning"
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────
   Detail view
───────────────────────────────────────────────────── */
function ClaimDetail({
  claim,
  onEdit,
  onSubmit,
  onDelete,
  canEdit,
  canDelete,
  canSubmit,
}: {
  claim: Claim;
  onEdit: () => void;
  onSubmit: () => void;
  onDelete: () => void;
  canEdit: boolean;
  canDelete: boolean;
  canSubmit: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-2xl font-bold text-gray-900">{claim.claimNumber}</p>
          <p className="mt-1 text-sm text-gray-500">{CLAIM_TYPE_LABELS[claim.claimType]}</p>
        </div>
        <StatusBadge status={claim.status} type="claim" />
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <Field label="Trip Request" value={`${claim.travelRequest.requestNumber} — ${claim.travelRequest.destination}`} />
        <Field label="Amount" value={formatCurrency(Number(claim.amount), "IDR")} />
        <Field label="Description" value={claim.description} />
        <Field label="Submitter" value={`${claim.submitter.name ?? "—"} (${claim.submitter.employeeId ?? "—"})`} />
        <Field label="Created" value={formatDate(claim.createdAt)} />
        <Field label="Submitted" value={claim.submittedAt ? formatDate(claim.submittedAt) : "—"} />
        {claim.notes && <Field label="Notes" value={claim.notes} />}
      </div>

      {claim.claimType === "ENTERTAINMENT" && (
        <div className="rounded-lg border border-purple-100 bg-purple-50 p-4 space-y-2">
          <p className="text-sm font-semibold text-purple-800">Entertainment Details</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {claim.entertainmentType && <Field label="Type" value={claim.entertainmentType} />}
            {claim.entertainmentDate && <Field label="Date" value={formatDate(claim.entertainmentDate)} />}
            {claim.entertainmentLocation && <Field label="Location" value={claim.entertainmentLocation} />}
            {claim.entertainmentAddress && <Field label="Address" value={claim.entertainmentAddress} />}
            {claim.guestName && <Field label="Guest" value={claim.guestName} />}
            {claim.guestCompany && <Field label="Company" value={claim.guestCompany} />}
            {claim.guestPosition && <Field label="Position" value={claim.guestPosition} />}
            <Field label="Gov. Official" value={claim.isGovernmentOfficial ? "Yes" : "No"} />
          </div>
        </div>
      )}

      {claim.claimType === "NON_ENTERTAINMENT" && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 space-y-2">
          <p className="text-sm font-semibold text-blue-800">Expense Details</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {claim.expenseCategory && <Field label="Category" value={claim.expenseCategory.replace(/_/g, " ")} />}
            {claim.expenseDate && <Field label="Date" value={formatDate(claim.expenseDate)} />}
            {claim.expenseDestination && <Field label="Destination" value={claim.expenseDestination} />}
            {claim.customerName && <Field label="Customer" value={claim.customerName} />}
          </div>
        </div>
      )}

      {claim.approvals.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-gray-700">Approval History</p>
          <div className="space-y-2">
            {claim.approvals.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-2 text-xs"
              >
                <span className="text-gray-600">{a.level.replace(/_/g, " ")}</span>
                <span className="text-gray-700">{a.approver.name ?? "—"}</span>
                <span
                  className={
                    a.status === "APPROVED"
                      ? "font-semibold text-green-600"
                      : a.status === "REJECTED"
                      ? "font-semibold text-red-600"
                      : "text-yellow-600"
                  }
                >
                  {a.status}
                </span>
                {a.approvedAt && <span className="text-gray-400">{formatDate(a.approvedAt)}</span>}
                {a.rejectedAt && <span className="text-gray-400">{formatDate(a.rejectedAt)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 border-t pt-4">
        {canDelete && (
          <Button variant="destructive" size="sm" onClick={onDelete}>Delete</Button>
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
