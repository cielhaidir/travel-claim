"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/features/PageHeader";
import { EmptyState } from "@/components/features/EmptyState";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import type { ApprovalStatus } from "../../../../generated/prisma";

const APPROVER_ROLES = ["SUPERVISOR", "MANAGER", "DIRECTOR", "FINANCE_MANAGER", "ADMIN"];

interface TravelRequestRef {
  id: string;
  requestNumber: string;
  destination: string;
  travelType: string;
  status: string;
  startDate: string | Date;
  endDate: string | Date;
  estimatedBudget: number | null;
  requester: { id: string; name: string | null; employeeId: string | null; department?: { name: string } | null };
  purpose: string;
}

interface ClaimRef {
  id: string;
  claimNumber: string;
  claimType: string;
  status: string;
  amount: number;
  description: string;
  submitter: { id: string; name: string | null; employeeId: string | null };
  travelRequest: { requestNumber: string; destination: string };
}

interface Approval {
  id: string;
  level: string;
  status: ApprovalStatus;
  comments: string | null;
  rejectionReason: string | null;
  approvedAt: string | Date | null;
  rejectedAt: string | Date | null;
  createdAt: string | Date;
  approver: { id: string; name: string | null; role: string };
  travelRequest: TravelRequestRef | null;
  claim: ClaimRef | null;
}

export default function ApprovalsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const userRole = session?.user?.role ?? "EMPLOYEE";

  if (!APPROVER_ROLES.includes(userRole)) {
    router.replace("/");
    return null;
  }

  return <ApprovalsContent />;
}

function ApprovalsContent() {
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | "ALL">("PENDING");
  const [entityFilter, setEntityFilter] = useState<"ALL" | "TravelRequest" | "Claim">("ALL");
  const [viewingApproval, setViewingApproval] = useState<Approval | null>(null);
  const [actionApproval, setActionApproval] = useState<Approval | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | "revision" | null>(null);
  const [actionComment, setActionComment] = useState("");
  const [actionError, setActionError] = useState("");

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data: rawData, isLoading, refetch } = api.approval.getMyApprovals.useQuery(
    {
      status: statusFilter === "ALL" ? undefined : statusFilter,
      entityType: entityFilter === "ALL" ? undefined : entityFilter,
      limit: 50,
    },
    { refetchOnWindowFocus: false }
  );
  const data = rawData as { approvals: Approval[] } | undefined;
  const approvals = data?.approvals ?? [];

  const { data: rawPending } = api.approval.getPendingCount.useQuery({});
  const pendingCount = typeof rawPending === "number" ? rawPending : 0;

  const approveTravelMutation = api.approval.approveTravelRequest.useMutation({
    onSuccess: () => { void refetch(); closeActionModal(); },
    onError: (err) => setActionError(err.message),
  });
  const rejectTravelMutation = api.approval.rejectTravelRequest.useMutation({
    onSuccess: () => { void refetch(); closeActionModal(); },
    onError: (err) => setActionError(err.message),
  });
  const revisionMutation = api.approval.requestRevision.useMutation({
    onSuccess: () => { void refetch(); closeActionModal(); },
    onError: (err) => setActionError(err.message),
  });
  const approveClaimMutation = api.approval.approveClaim.useMutation({
    onSuccess: () => { void refetch(); closeActionModal(); },
    onError: (err) => setActionError(err.message),
  });
  const rejectClaimMutation = api.approval.rejectClaim.useMutation({
    onSuccess: () => { void refetch(); closeActionModal(); },
    onError: (err) => setActionError(err.message),
  });
  const claimRevisionMutation = api.approval.requestClaimRevision.useMutation({
    onSuccess: () => { void refetch(); closeActionModal(); },
    onError: (err) => setActionError(err.message),
  });

  const isTravelApproval = (a: Approval) => !!a.travelRequest;

  const openAction = (a: Approval, type: "approve" | "reject" | "revision") => {
    setActionApproval(a);
    setActionType(type);
    setActionComment("");
    setActionError("");
  };

  const closeActionModal = () => {
    setActionApproval(null);
    setActionType(null);
    setActionComment("");
    setActionError("");
  };

  const handleAction = () => {
    if (!actionApproval || !actionType) return;

    const requiresComment = actionType === "reject" || actionType === "revision";
    if (requiresComment && actionComment.length < 10) {
      setActionError("Please provide a reason (min. 10 characters)");
      return;
    }

    if (isTravelApproval(actionApproval)) {
      if (actionType === "approve") {
        approveTravelMutation.mutate({ approvalId: actionApproval.id, comments: actionComment || undefined });
      } else if (actionType === "reject") {
        rejectTravelMutation.mutate({ approvalId: actionApproval.id, rejectionReason: actionComment });
      } else {
        revisionMutation.mutate({ approvalId: actionApproval.id, comments: actionComment });
      }
    } else {
      if (actionType === "approve") {
        approveClaimMutation.mutate({ approvalId: actionApproval.id, comments: actionComment || undefined });
      } else if (actionType === "reject") {
        rejectClaimMutation.mutate({ approvalId: actionApproval.id, rejectionReason: actionComment });
      } else {
        claimRevisionMutation.mutate({ approvalId: actionApproval.id, comments: actionComment });
      }
    }
  };

  const isActionLoading =
    approveTravelMutation.isPending ||
    rejectTravelMutation.isPending ||
    revisionMutation.isPending ||
    approveClaimMutation.isPending ||
    rejectClaimMutation.isPending ||
    claimRevisionMutation.isPending;

  const actionTitle =
    actionType === "approve"
      ? "Approve"
      : actionType === "reject"
      ? "Reject"
      : "Request Revision";

  const actionBtnVariant: "primary" | "destructive" | "secondary" =
    actionType === "approve" ? "primary" : actionType === "reject" ? "destructive" : "secondary";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals"
        description="Review and approve pending requests and claims"
        badge={
          pendingCount > 0 ? (
            <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-sm font-semibold text-orange-800">
              {pendingCount} pending
            </span>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ApprovalStatus | "ALL")}
        >
          <option value="ALL">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="REVISION_REQUESTED">Revision Requested</option>
        </select>
        <select
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value as "ALL" | "TravelRequest" | "Claim")}
        >
          <option value="ALL">All Types</option>
          <option value="TravelRequest">Travel Requests</option>
          <option value="Claim">Claims</option>
        </select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="rounded-lg border bg-white p-12 text-center text-gray-500">Loading...</div>
      ) : approvals.length === 0 ? (
        <EmptyState
          icon="✅"
          title="No approvals found"
          description={
            statusFilter === "PENDING"
              ? "You're all caught up! No pending approvals."
              : "No approvals match the selected filters."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Requestor / Submitter</th>
                <th className="px-4 py-3">Level</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {approvals.map((a) => {
                const isTravel = !!a.travelRequest;
                const refNumber = isTravel
                  ? a.travelRequest!.requestNumber
                  : a.claim?.claimNumber ?? "—";
                const person = isTravel
                  ? a.travelRequest!.requester.name ?? "—"
                  : a.claim?.submitter.name ?? "—";

                return (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-blue-600">
                      <span>{refNumber}</span>
                      {isTravel && a.travelRequest && (
                        <span className="ml-1 text-xs text-gray-400">
                          — {a.travelRequest.destination}
                        </span>
                      )}
                      {!isTravel && a.claim && (
                        <span className="ml-1 text-xs text-gray-400">
                          — {formatCurrency(Number(a.claim.amount), "IDR")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {isTravel ? "Trip Request" : `Claim (${a.claim?.claimType?.replace("_", " ")})`}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{person}</td>
                    <td className="px-4 py-3 text-gray-600">{a.level.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(a.createdAt)}</td>
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
                          View
                        </button>
                        {a.status === "PENDING" && (
                          <>
                            <button
                              onClick={() => openAction(a, "approve")}
                              className="rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => openAction(a, "revision")}
                              className="rounded px-2 py-1 text-xs text-yellow-600 hover:bg-yellow-50"
                            >
                              Revise
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
        </div>
      )}

      {/* View Modal */}
      <Modal
        isOpen={!!viewingApproval}
        onClose={() => setViewingApproval(null)}
        title="Approval Detail"
        size="xl"
      >
        {viewingApproval && (
          <ApprovalDetail
            approval={viewingApproval}
            onApprove={() => { openAction(viewingApproval, "approve"); setViewingApproval(null); }}
            onReject={() => { openAction(viewingApproval, "reject"); setViewingApproval(null); }}
            onRevision={() => { openAction(viewingApproval, "revision"); setViewingApproval(null); }}
          />
        )}
      </Modal>

      {/* Action Modal */}
      <Modal
        isOpen={!!actionApproval}
        onClose={closeActionModal}
        title={`${actionTitle}: ${
          actionApproval?.travelRequest?.requestNumber ?? actionApproval?.claim?.claimNumber ?? ""
        }`}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {actionType === "approve"
              ? "Confirm your approval. You may optionally add a comment."
              : actionType === "reject"
              ? "Please provide a reason for rejection (required, min. 10 characters)."
              : "Please describe what changes are needed (required, min. 10 characters)."}
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {actionType === "approve" ? "Comments (optional)" : "Reason *"}
            </label>
            <textarea
              rows={4}
              value={actionComment}
              onChange={(e) => { setActionComment(e.target.value); setActionError(""); }}
              placeholder={
                actionType === "approve"
                  ? "Any comments..."
                  : "Explain the reason..."
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {actionError && <p className="mt-1 text-xs text-red-500">{actionError}</p>}
          </div>
          <div className="flex justify-end gap-3 border-t pt-4">
            <Button variant="secondary" onClick={closeActionModal} disabled={isActionLoading}>
              Cancel
            </Button>
            <Button
              variant={actionBtnVariant}
              onClick={handleAction}
              isLoading={isActionLoading}
            >
              {actionTitle}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ─────────────────────────────────────────────────────
   Approval Detail Component
───────────────────────────────────────────────────── */
function ApprovalDetail({
  approval,
  onApprove,
  onReject,
  onRevision,
}: {
  approval: Approval;
  onApprove: () => void;
  onReject: () => void;
  onRevision: () => void;
}) {
  const isTravel = !!approval.travelRequest;
  const tr = approval.travelRequest;
  const claim = approval.claim;

  return (
    <div className="space-y-6">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-bold text-gray-900">
            {isTravel ? tr?.requestNumber : claim?.claimNumber}
          </p>
          <p className="text-sm text-gray-500">{approval.level.replace(/_/g, " ")} — {isTravel ? "Travel Request" : "Claim"}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${
            approval.status === "APPROVED"
              ? "bg-green-100 text-green-800"
              : approval.status === "REJECTED"
              ? "bg-red-100 text-red-800"
              : approval.status === "REVISION_REQUESTED"
              ? "bg-yellow-100 text-yellow-800"
              : "bg-orange-100 text-orange-800"
          }`}
        >
          {approval.status.replace(/_/g, " ")}
        </span>
      </div>

      {/* Travel request details */}
      {isTravel && tr && (
        <div className="rounded-lg border border-gray-100 p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">Trip Request Details</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Destination" value={tr.destination} />
            <Field label="Type" value={tr.travelType} />
            <Field label="Dates" value={`${formatDate(tr.startDate)} – ${formatDate(tr.endDate)}`} />
            <Field
              label="Budget"
              value={tr.estimatedBudget ? formatCurrency(Number(tr.estimatedBudget), "IDR") : "—"}
            />
            <Field label="Requester" value={`${tr.requester.name ?? "—"} (${tr.requester.employeeId ?? "—"})`} />
            {tr.requester.department && (
              <Field label="Department" value={tr.requester.department.name} />
            )}
            <Field label="Purpose" value={tr.purpose} />
            <Field label="Status" value={tr.status} />
          </div>
        </div>
      )}

      {/* Claim details */}
      {!isTravel && claim && (
        <div className="rounded-lg border border-gray-100 p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">Claim Details</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Claim #" value={claim.claimNumber} />
            <Field label="Type" value={claim.claimType.replace("_", " ")} />
            <Field label="Amount" value={formatCurrency(Number(claim.amount), "IDR")} />
            <Field label="Trip Request" value={`${claim.travelRequest.requestNumber} — ${claim.travelRequest.destination}`} />
            <Field label="Submitter" value={`${claim.submitter.name ?? "—"} (${claim.submitter.employeeId ?? "—"})`} />
            <Field label="Description" value={claim.description} />
          </div>
        </div>
      )}

      {/* Previous comments */}
      {(approval.comments ?? approval.rejectionReason) && (
        <div className="rounded-lg border border-yellow-100 bg-yellow-50 p-3">
          <p className="text-xs font-semibold text-yellow-800 mb-1">Previous Comments</p>
          <p className="text-sm text-yellow-900">{approval.comments ?? approval.rejectionReason}</p>
        </div>
      )}

      {/* Actions */}
      {approval.status === "PENDING" && (
        <div className="flex justify-end gap-3 border-t pt-4">
          <Button variant="destructive" size="sm" onClick={onReject}>Reject</Button>
          <Button variant="secondary" size="sm" onClick={onRevision}>Request Revision</Button>
          <Button size="sm" onClick={onApprove}>Approve</Button>
        </div>
      )}
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