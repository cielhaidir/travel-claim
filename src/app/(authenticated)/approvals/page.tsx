"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/features/PageHeader";
import { EmptyState } from "@/components/features/EmptyState";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils/format";
import type { ApprovalStatus } from "../../../../generated/prisma";
import {
  APPROVER_ROLES,
  hasAnyRole,
  normalizeRoles,
} from "@/lib/constants/roles";

interface TravelRequestRef {
  id: string;
  requestNumber: string;
  destination: string;
  travelType: string;
  status: string;
  startDate: string | Date;
  endDate: string | Date;
  estimatedBudget?: number | null;
  requester: {
    id: string;
    name: string | null;
    employeeId: string | null;
    department?: { name: string } | null;
  };
  purpose: string;
  project?: {
    id: string;
    code: string;
    name: string;
    clientName: string | null;
  } | null;
  participants: Array<{
    userId: string;
    user: {
      id: string;
      name: string | null;
      email: string | null;
      employeeId: string | null;
      department?: { name: string } | null;
    };
  }>;
  bailouts: Array<{
    id: string;
    description: string;
    amount: number | string;
    category: string;
    transportMode?: string | null;
    carrier?: string | null;
    departureFrom?: string | null;
    arrivalTo?: string | null;
    departureAt?: string | Date | null;
    arrivalAt?: string | Date | null;
    flightNumber?: string | null;
    seatClass?: string | null;
    hotelName?: string | null;
    hotelAddress?: string | null;
    checkIn?: string | Date | null;
    checkOut?: string | Date | null;
    roomType?: string | null;
    mealDate?: string | Date | null;
    mealLocation?: string | null;
    finance?: {
      id: string;
      name: string | null;
      email: string | null;
      employeeId: string | null;
    } | null;
  }>;
  approvals: Array<{
    id: string;
    level: string;
    status: string;
    comments: string | null;
    rejectionReason: string | null;
    approvedAt: string | Date | null;
    rejectedAt: string | Date | null;
    approver: { id: string; name: string | null; role: string };
  }>;
}

function getApprovalStatusBadgeClass(status: ApprovalStatus) {
  if (status === "APPROVED") return "bg-green-100 text-green-800";
  if (status === "REJECTED") return "bg-red-100 text-red-800";
  if (status === "REVISION_REQUESTED") return "bg-yellow-100 text-yellow-800";
  return "bg-orange-100 text-orange-800";
}

function getTravelProgressBadgeClass(status: string) {
  if (status === "APPROVED") return "bg-emerald-100 text-emerald-800";
  if (status === "REJECTED") return "bg-red-100 text-red-800";
  if (status === "REVISION") return "bg-amber-100 text-amber-800";
  if (status.startsWith("APPROVED_L")) return "bg-blue-100 text-blue-800";
  return "bg-gray-100 text-gray-700";
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

function getBailoutCategoryLabel(category: string) {
  if (category === "TRANSPORT") return "Transportasi";
  if (category === "HOTEL") return "Penginapan";
  if (category === "MEAL") return "Uang Makan";
  return "Lainnya";
}

export default function ApprovalsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const userRoles = normalizeRoles({
    roles: session?.user?.roles,
    role: session?.user?.role,
  });

  useEffect(() => {
    if (status === "loading") return;
    if (!hasAnyRole(userRoles, APPROVER_ROLES)) {
      router.replace("/");
    }
  }, [userRoles, status, router]);

  if (status === "loading") return null;
  if (!hasAnyRole(userRoles, APPROVER_ROLES)) return null;

  return <ApprovalsContent />;
}

function ApprovalsContent() {
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | "ALL">(
    "ALL",
  );
  const [entityFilter, setEntityFilter] = useState<
    "ALL" | "TravelRequest" | "Claim"
  >("ALL");
  const [viewingApproval, setViewingApproval] = useState<Approval | null>(null);
  const [actionApproval, setActionApproval] = useState<Approval | null>(null);
  const [actionType, setActionType] = useState<
    "approve" | "reject" | "revision" | null
  >(null);
  const [actionComment, setActionComment] = useState("");
  const [actionError, setActionError] = useState("");

  const {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    data: rawData,
    isLoading,
    refetch,
  } = api.approval.getMyApprovals.useQuery(
    {
      status: statusFilter === "ALL" ? undefined : statusFilter,
      entityType: entityFilter === "ALL" ? undefined : entityFilter,
      limit: 50,
    },
    { refetchOnWindowFocus: false },
  );
  const data = rawData as { approvals: Approval[] } | undefined;
  const approvals = data?.approvals ?? [];

  const { data: rawPending } = api.approval.getPendingCount.useQuery({});
  const pendingCount = typeof rawPending === "number" ? rawPending : 0;

  const actionMutation = api.approval.actOnApproval.useMutation({
    onSuccess: () => {
      void refetch();
      closeActionModal();
    },
    onError: (err: { message: string }) => setActionError(err.message),
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

    const requiresComment =
      actionType === "reject" || actionType === "revision";
    if (requiresComment && actionComment.length < 10) {
      setActionError("Please provide a reason (min. 10 characters)");
      return;
    }

    if (actionType === "approve") {
      actionMutation.mutate({
        action: "approve",
        approvalId: actionApproval.id,
        comments: actionComment || undefined,
      });
    } else if (actionType === "reject") {
      actionMutation.mutate({
        action: "reject",
        approvalId: actionApproval.id,
        rejectionReason: actionComment,
      });
    } else {
      actionMutation.mutate({
        action: "revision",
        approvalId: actionApproval.id,
        comments: actionComment,
      });
    }
  };

  const isActionLoading = actionMutation.isPending;

  const actionTitle =
    actionType === "approve"
      ? "Approve"
      : actionType === "reject"
        ? "Reject"
        : "Request Revision";

  const actionBtnVariant: "primary" | "destructive" | "secondary" =
    actionType === "approve"
      ? "primary"
      : actionType === "reject"
        ? "destructive"
        : "secondary";

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
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as ApprovalStatus | "ALL")
          }
        >
          <option value="ALL">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="REVISION_REQUESTED">Revision Requested</option>
        </select>
        <select
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          value={entityFilter}
          onChange={(e) =>
            setEntityFilter(e.target.value as "ALL" | "TravelRequest" | "Claim")
          }
        >
          <option value="ALL">All Types</option>
          <option value="TravelRequest">Travel Requests</option>
          <option value="Claim">Claims</option>
        </select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="rounded-lg border bg-white p-12 text-center text-gray-500">
          Loading...
        </div>
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
            <thead className="border-b bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
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
                  : (a.claim?.claimNumber ?? "—");
                const person = isTravel
                  ? (a.travelRequest!.requester.name ?? "—")
                  : (a.claim?.submitter.name ?? "—");

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
                      {isTravel
                        ? "Trip Request"
                        : `Claim (${a.claim?.claimType?.replace("_", " ")})`}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{person}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {a.level.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {formatDate(a.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${getApprovalStatusBadgeClass(a.status)}`}
                        >
                          {a.status.replace(/_/g, " ")}
                        </span>
                        {isTravel && a.travelRequest && (
                          <span
                            className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${getTravelProgressBadgeClass(a.travelRequest.status)}`}
                          >
                            {a.travelRequest.status.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
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
          <RichApprovalDetail
            approval={viewingApproval}
            onApprove={() => {
              openAction(viewingApproval, "approve");
              setViewingApproval(null);
            }}
            onReject={() => {
              openAction(viewingApproval, "reject");
              setViewingApproval(null);
            }}
            onRevision={() => {
              openAction(viewingApproval, "revision");
              setViewingApproval(null);
            }}
          />
        )}
      </Modal>

      {/* Action Modal */}
      <Modal
        isOpen={!!actionApproval}
        onClose={closeActionModal}
        title={`${actionTitle}: ${
          actionApproval?.travelRequest?.requestNumber ??
          actionApproval?.claim?.claimNumber ??
          ""
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
              onChange={(e) => {
                setActionComment(e.target.value);
                setActionError("");
              }}
              placeholder={
                actionType === "approve"
                  ? "Any comments..."
                  : "Explain the reason..."
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            {actionError && (
              <p className="mt-1 text-xs text-red-500">{actionError}</p>
            )}
          </div>
          <div className="flex justify-end gap-3 border-t pt-4">
            <Button
              variant="secondary"
              onClick={closeActionModal}
              disabled={isActionLoading}
            >
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

function RichApprovalDetail({
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
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-bold text-gray-900">
            {isTravel ? tr?.requestNumber : claim?.claimNumber}
          </p>
          <p className="text-sm text-gray-500">
            {approval.level.replace(/_/g, " ")} -{" "}
            {isTravel ? "Travel Request" : "Claim"}
          </p>
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

      {isTravel && tr && (
        <div className="space-y-4">
          <div className="space-y-3 rounded-lg border border-gray-100 p-4">
            <p className="text-sm font-semibold text-gray-700">
              Trip Request Details
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Request Number" value={tr.requestNumber} />
              <Field
                label="Status Perjalanan"
                value={tr.status.replace(/_/g, " ")}
              />
              <Field label="Destination" value={tr.destination} />
              <Field label="Type" value={tr.travelType.replace(/_/g, " ")} />
              <Field
                label="Dates"
                value={`${formatDate(tr.startDate)} - ${formatDate(tr.endDate)}`}
              />
              <Field
                label="Requester"
                value={`${tr.requester.name ?? "—"} (${tr.requester.employeeId ?? "—"})`}
              />
              {tr.requester.department && (
                <Field label="Department" value={tr.requester.department.name} />
              )}
              <Field
                label="Total Bailout"
                value={formatCurrency(
                  tr.bailouts.reduce(
                    (sum, bailout) => sum + Number(bailout.amount),
                    0,
                  ),
                  "IDR",
                )}
              />
            </div>
            <Field label="Purpose" value={tr.purpose} />
          </div>

          {tr.project && (
            <div className="space-y-3 rounded-lg border border-blue-100 bg-blue-50 p-4">
              <p className="text-sm font-semibold text-blue-800">Project</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Kode Project" value={tr.project.code} />
                <Field label="Nama Project" value={tr.project.name} />
                <Field label="Client" value={tr.project.clientName ?? "—"} />
              </div>
            </div>
          )}

          <div className="space-y-3 rounded-lg border border-gray-100 p-4">
            <p className="text-sm font-semibold text-gray-700">Peserta</p>
            {tr.participants.length === 0 ? (
              <p className="text-sm text-gray-500">Tidak ada peserta tambahan.</p>
            ) : (
              <div className="grid gap-2">
                {tr.participants.map((participant) => (
                  <div
                    key={participant.userId}
                    className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-gray-900">
                      {participant.user.name ?? "—"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {participant.user.employeeId ?? "—"}
                      {participant.user.department?.name
                        ? ` - ${participant.user.department.name}`
                        : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-lg border border-gray-100 p-4">
            <p className="text-sm font-semibold text-gray-700">
              Bailout / Biaya
            </p>
            {tr.bailouts.length === 0 ? (
              <p className="text-sm text-gray-500">Belum ada dana talangan.</p>
            ) : (
              <div className="space-y-3">
                {tr.bailouts.map((bailout) => (
                  <div
                    key={bailout.id}
                    className="rounded-lg border border-gray-100 bg-gray-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {getBailoutCategoryLabel(bailout.category)}
                        </p>
                        <p className="text-sm text-gray-700">
                          {bailout.description}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-amber-700">
                        {formatCurrency(Number(bailout.amount), "IDR")}
                      </p>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <Field
                        label="Finance"
                        value={
                          bailout.finance?.name ??
                          bailout.finance?.employeeId ??
                          bailout.finance?.email ??
                          "Belum ditentukan"
                        }
                      />
                      <Field
                        label="Kategori"
                        value={getBailoutCategoryLabel(bailout.category)}
                      />
                      {bailout.transportMode && (
                        <Field
                          label="Mode Transport"
                          value={bailout.transportMode.replace(/_/g, " ")}
                        />
                      )}
                      {(bailout.departureFrom ?? bailout.arrivalTo) && (
                        <Field
                          label="Rute"
                          value={`${bailout.departureFrom ?? "—"} - ${bailout.arrivalTo ?? "—"}`}
                        />
                      )}
                      {bailout.departureAt && (
                        <Field
                          label="Berangkat"
                          value={formatDateTime(bailout.departureAt)}
                        />
                      )}
                      {bailout.arrivalAt && (
                        <Field
                          label="Tiba"
                          value={formatDateTime(bailout.arrivalAt)}
                        />
                      )}
                      {bailout.carrier && (
                        <Field label="Operator" value={bailout.carrier} />
                      )}
                      {bailout.flightNumber && (
                        <Field label="Nomor" value={bailout.flightNumber} />
                      )}
                      {bailout.seatClass && (
                        <Field
                          label="Kelas / Tipe"
                          value={bailout.seatClass}
                        />
                      )}
                      {bailout.hotelName && (
                        <Field label="Hotel" value={bailout.hotelName} />
                      )}
                      {bailout.hotelAddress && (
                        <Field
                          label="Alamat Hotel"
                          value={bailout.hotelAddress}
                        />
                      )}
                      {(bailout.checkIn ?? bailout.checkOut) && (
                        <Field
                          label="Check-in / Check-out"
                          value={`${bailout.checkIn ? formatDate(bailout.checkIn) : "—"} - ${bailout.checkOut ? formatDate(bailout.checkOut) : "—"}`}
                        />
                      )}
                      {bailout.roomType && (
                        <Field label="Tipe Kamar" value={bailout.roomType} />
                      )}
                      {bailout.mealDate && (
                        <Field
                          label="Tanggal Makan"
                          value={formatDate(bailout.mealDate)}
                        />
                      )}
                      {bailout.mealLocation && (
                        <Field
                          label="Lokasi Makan"
                          value={bailout.mealLocation}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-lg border border-gray-100 p-4">
            <p className="text-sm font-semibold text-gray-700">
              Riwayat Approval
            </p>
            <div className="space-y-2">
              {tr.approvals.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-gray-100 bg-gray-50 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-gray-900">
                      {item.level.replace(/_/g, " ")} -{" "}
                      {item.approver.name ?? "—"}
                    </p>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${getApprovalStatusBadgeClass(item.status as ApprovalStatus)}`}
                    >
                      {item.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  {(item.rejectionReason ?? item.comments) && (
                    <p className="mt-1 text-xs text-gray-600">
                      {item.rejectionReason ?? item.comments}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!isTravel && claim && (
        <div className="space-y-3 rounded-lg border border-gray-100 p-4">
          <p className="text-sm font-semibold text-gray-700">Claim Details</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Claim #" value={claim.claimNumber} />
            <Field label="Type" value={claim.claimType.replace("_", " ")} />
            <Field
              label="Amount"
              value={formatCurrency(Number(claim.amount), "IDR")}
            />
            <Field
              label="Trip Request"
              value={`${claim.travelRequest.requestNumber} — ${claim.travelRequest.destination}`}
            />
            <Field
              label="Submitter"
              value={`${claim.submitter.name ?? "—"} (${claim.submitter.employeeId ?? "—"})`}
            />
            <Field label="Description" value={claim.description} />
          </div>
        </div>
      )}

      {(approval.comments ?? approval.rejectionReason) && (
        <div className="rounded-lg border border-yellow-100 bg-yellow-50 p-3">
          <p className="mb-1 text-xs font-semibold text-yellow-800">
            Previous Comments
          </p>
          <p className="text-sm text-yellow-900">
            {approval.comments ?? approval.rejectionReason}
          </p>
        </div>
      )}

      {approval.status === "PENDING" && (
        <div className="flex justify-end gap-3 border-t pt-4">
          <Button variant="destructive" size="sm" onClick={onReject}>
            Reject
          </Button>
          <Button variant="secondary" size="sm" onClick={onRevision}>
            Request Revision
          </Button>
          <Button size="sm" onClick={onApprove}>
            Approve
          </Button>
        </div>
      )}
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
          <p className="text-sm text-gray-500">
            {approval.level.replace(/_/g, " ")} —{" "}
            {isTravel ? "Travel Request" : "Claim"}
          </p>
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
        <div className="space-y-3 rounded-lg border border-gray-100 p-4">
          <p className="text-sm font-semibold text-gray-700">
            Trip Request Details
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Destination" value={tr.destination} />
            <Field label="Type" value={tr.travelType} />
            <Field
              label="Dates"
              value={`${formatDate(tr.startDate)} – ${formatDate(tr.endDate)}`}
            />
            <Field
              label="Budget"
              value={
                tr.estimatedBudget
                  ? formatCurrency(Number(tr.estimatedBudget), "IDR")
                  : "—"
              }
            />
            <Field
              label="Requester"
              value={`${tr.requester.name ?? "—"} (${tr.requester.employeeId ?? "—"})`}
            />
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
        <div className="space-y-3 rounded-lg border border-gray-100 p-4">
          <p className="text-sm font-semibold text-gray-700">Claim Details</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Claim #" value={claim.claimNumber} />
            <Field label="Type" value={claim.claimType.replace("_", " ")} />
            <Field
              label="Amount"
              value={formatCurrency(Number(claim.amount), "IDR")}
            />
            <Field
              label="Trip Request"
              value={`${claim.travelRequest.requestNumber} — ${claim.travelRequest.destination}`}
            />
            <Field
              label="Submitter"
              value={`${claim.submitter.name ?? "—"} (${claim.submitter.employeeId ?? "—"})`}
            />
            <Field label="Description" value={claim.description} />
          </div>
        </div>
      )}

      {/* Previous comments */}
      {(approval.comments ?? approval.rejectionReason) && (
        <div className="rounded-lg border border-yellow-100 bg-yellow-50 p-3">
          <p className="mb-1 text-xs font-semibold text-yellow-800">
            Previous Comments
          </p>
          <p className="text-sm text-yellow-900">
            {approval.comments ?? approval.rejectionReason}
          </p>
        </div>
      )}

      {/* Actions */}
      {approval.status === "PENDING" && (
        <div className="flex justify-end gap-3 border-t pt-4">
          <Button variant="destructive" size="sm" onClick={onReject}>
            Reject
          </Button>
          <Button variant="secondary" size="sm" onClick={onRevision}>
            Request Revision
          </Button>
          <Button size="sm" onClick={onApprove}>
            Approve
          </Button>
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
