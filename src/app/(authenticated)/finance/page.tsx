"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { skipToken } from "@tanstack/react-query";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/features/PageHeader";
import { EmptyState } from "@/components/features/EmptyState";
import { StatusBadge } from "@/components/features/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Modal, ConfirmModal } from "@/components/ui/Modal";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import type {
  BailoutStatus,
  ClaimStatus,
  TravelStatus,
} from "../../../../generated/prisma";

// ─── Local Types ──────────────────────────────────────────────────────────────

interface Bailout {
  id: string;
  amount: number;
  status: BailoutStatus;
  createdAt: string | Date;
  requester: { id: string; name: string | null; employeeId: string | null };
  travelRequest: {
    id: string;
    requestNumber: string;
    destination: string;
    status: TravelStatus;
  };
}

interface Claim {
  id: string;
  claimNumber: string;
  claimType: string;
  status: ClaimStatus;
  amount: number;
  description: string;
  createdAt: string | Date;
  submitter: { id: string; name: string | null; employeeId: string | null };
  travelRequest: {
    id: string;
    requestNumber: string;
    destination: string;
    status: TravelStatus;
  };
}

interface TravelRequest {
  id: string;
  requestNumber: string;
  destination: string;
  purpose: string;
  startDate: string | Date;
  endDate: string | Date;
  status: TravelStatus;
  requester: { id: string; name: string | null; employeeId: string | null };
}

interface BalanceAccount {
  id: string;
  code: string;
  name: string;
  balance: number;
  isActive: boolean;
  description: string | null;
}

type ActiveTab = "bailouts" | "claims" | "travel" | "accounts";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FinanceDashboard() {
  const { data: session } = useSession();
  const router = useRouter();

  const userRole = session?.user?.role ?? "EMPLOYEE";
  const isAllowed = userRole === "FINANCE" || userRole === "ADMIN";

  useEffect(() => {
    if (session && !isAllowed) {
      void router.replace("/dashboard");
    }
  }, [session, isAllowed, router]);

  const [activeTab, setActiveTab] = useState<ActiveTab>("bailouts");

  // ── Disburse modal state ──────────────────────────────────────────────────
  const [disburseOpen, setDisburseOpen] = useState(false);
  const [selectedBailout, setSelectedBailout] = useState<Bailout | null>(null);
  const [disbursementRef, setDisbursementRef] = useState("");

  // ── Mark paid modal state ──────────────────────────────────────────────────
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);
  const [paymentRef, setPaymentRef] = useState("");

  // ── Lock / Close confirm state ────────────────────────────────────────────
  const [lockConfirmOpen, setLockConfirmOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [selectedTravel, setSelectedTravel] = useState<TravelRequest | null>(
    null,
  );

  // ── Data queries ──────────────────────────────────────────────────────────

  const {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    data: bailoutsRaw,
    isLoading: loadingBailouts,
    refetch: refetchBailouts,
  } = api.bailout.getAll.useQuery(
    { status: "APPROVED_L2", limit: 50 },
    { enabled: isAllowed },
  );
  const bailouts =
    (bailoutsRaw as { bailouts: Bailout[] } | undefined)?.bailouts ?? [];

  const {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    data: claimsRaw,
    isLoading: loadingClaims,
    refetch: refetchClaims,
  } = api.claim.getAll.useQuery(
    { status: "APPROVED", limit: 50 },
    { enabled: isAllowed },
  );
  const claims =
    (claimsRaw as { claims: Claim[] } | undefined)?.claims ?? [];

  const {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    data: travelApprovedRaw,
    isLoading: loadingTravelApproved,
    refetch: refetchTravelApproved,
  } = api.travelRequest.getAll.useQuery(
    { status: "APPROVED", limit: 50 },
    { enabled: isAllowed },
  );
  const travelApproved =
    (
      travelApprovedRaw as { requests: TravelRequest[] } | undefined
    )?.requests ?? [];

  const {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    data: travelLockedRaw,
    isLoading: loadingTravelLocked,
    refetch: refetchTravelLocked,
  } = api.travelRequest.getAll.useQuery(
    { status: "LOCKED", limit: 50 },
    { enabled: isAllowed },
  );
  const travelLocked =
    (travelLockedRaw as { requests: TravelRequest[] } | undefined)?.requests ??
    [];

  const {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    data: accountsRaw,
    isLoading: loadingAccounts,
    refetch: refetchAccounts,
  } = api.finance.listBalanceAccounts.useQuery(
    { limit: 100 },
    { enabled: isAllowed },
  );
  const accounts =
    (
      accountsRaw as { balanceAccounts: BalanceAccount[] } | undefined
    )?.balanceAccounts ?? [];

  const {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    data: statsRaw,
  } = api.claim.getStatistics.useQuery(isAllowed ? {} : skipToken);
  const stats = statsRaw as
    | {
        total: number;
        byStatus: Array<{ status: ClaimStatus; count: number }>;
        totalAmount: number;
        paidAmount: number;
      }
    | undefined;

  const pendingClaimsCount =
    stats?.byStatus.find((s) => s.status === "APPROVED")?.count ??
    claims.length;
  const pendingPaymentAmount =
    (stats?.totalAmount ?? 0) - (stats?.paidAmount ?? 0);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const disburseMutation = api.bailout.disburse.useMutation({
    onSuccess: () => {
      void refetchBailouts();
      setDisburseOpen(false);
      setSelectedBailout(null);
      setDisbursementRef("");
    },
  });

  const markPaidMutation = api.claim.markAsPaid.useMutation({
    onSuccess: () => {
      void refetchClaims();
      setMarkPaidOpen(false);
      setSelectedClaim(null);
      setPaymentRef("");
    },
  });

  const lockMutation = api.travelRequest.lock.useMutation({
    onSuccess: () => {
      void refetchTravelApproved();
      setLockConfirmOpen(false);
      setSelectedTravel(null);
    },
  });

  const closeMutation = api.travelRequest.close.useMutation({
    onSuccess: () => {
      void refetchTravelLocked();
      setCloseConfirmOpen(false);
      setSelectedTravel(null);
    },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openDisburse(b: Bailout) {
    setSelectedBailout(b);
    setDisbursementRef("");
    setDisburseOpen(true);
  }

  function openMarkPaid(c: Claim) {
    setSelectedClaim(c);
    setPaymentRef("");
    setMarkPaidOpen(true);
  }

  function openLock(t: TravelRequest) {
    setSelectedTravel(t);
    setLockConfirmOpen(true);
  }

  function openClose(t: TravelRequest) {
    setSelectedTravel(t);
    setCloseConfirmOpen(true);
  }

  if (!session || !isAllowed) return null;

  const tabs: Array<{ id: ActiveTab; label: string; badge?: number }> = [
    { id: "bailouts", label: "Bailout Disbursements", badge: bailouts.length },
    { id: "claims", label: "Claim Payments", badge: claims.length },
    {
      id: "travel",
      label: "Travel Requests",
      badge: travelApproved.length + travelLocked.length,
    },
    { id: "accounts", label: "Balance Accounts" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance Dashboard"
        description="Manage disbursements, claim payments, and travel request lifecycle"
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Pending Disbursements"
          value={bailouts.length}
          unit="bailouts"
          color="yellow"
        />
        <SummaryCard
          label="Approved Claims"
          value={pendingClaimsCount}
          unit="awaiting payment"
          color="blue"
        />
        <SummaryCard
          label="Travel Requests to Lock"
          value={travelApproved.length}
          unit="approved"
          color="purple"
        />
        <SummaryCard
          label="Pending Payment Amount"
          value={formatCurrency(pendingPaymentAmount)}
          color="green"
        />
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "bailouts" && (
        <BailoutsTab
          bailouts={bailouts}
          isLoading={loadingBailouts}
          onDisburse={openDisburse}
        />
      )}
      {activeTab === "claims" && (
        <ClaimsTab
          claims={claims}
          isLoading={loadingClaims}
          onMarkPaid={openMarkPaid}
        />
      )}
      {activeTab === "travel" && (
        <TravelTab
          approved={travelApproved}
          locked={travelLocked}
          isLoading={loadingTravelApproved || loadingTravelLocked}
          onLock={openLock}
          onClose={openClose}
        />
      )}
      {activeTab === "accounts" && (
        <AccountsTab
          accounts={accounts}
          isLoading={loadingAccounts}
          onRefresh={() => void refetchAccounts()}
        />
      )}

      {/* ── Disburse Bailout Modal ───────────────────────────────────────── */}
      <Modal
        isOpen={disburseOpen}
        onClose={() => setDisburseOpen(false)}
        title="Disburse Bailout"
      >
        {selectedBailout && (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-4 text-sm">
              <p className="font-semibold">
                {selectedBailout.requester.name ?? "—"}
              </p>
              <p className="text-gray-500">
                {selectedBailout.travelRequest.requestNumber} ·{" "}
                {selectedBailout.travelRequest.destination}
              </p>
              <p className="mt-1 text-lg font-bold text-blue-700">
                {formatCurrency(selectedBailout.amount)}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Disbursement Reference{" "}
                <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={disbursementRef}
                onChange={(e) => setDisbursementRef(e.target.value)}
                placeholder="e.g. BANK-TFR-20260225"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {disburseMutation.error && (
              <p className="text-sm text-red-600">
                {disburseMutation.error.message}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDisburseOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                isLoading={disburseMutation.isPending}
                onClick={() => {
                  if (!selectedBailout) return;
                  disburseMutation.mutate({
                    id: selectedBailout.id,
                    disbursementRef: disbursementRef.trim() || undefined,
                  });
                }}
              >
                Confirm Disbursement
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Mark Claim as Paid Modal ─────────────────────────────────────── */}
      <Modal
        isOpen={markPaidOpen}
        onClose={() => setMarkPaidOpen(false)}
        title="Mark Claim as Paid"
      >
        {selectedClaim && (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-4 text-sm">
              <p className="font-mono font-semibold">
                {selectedClaim.claimNumber}
              </p>
              <p className="text-gray-500">
                {selectedClaim.submitter.name ?? "—"} ·{" "}
                {selectedClaim.travelRequest.requestNumber}
              </p>
              <p className="mt-1 text-lg font-bold text-blue-700">
                {formatCurrency(selectedClaim.amount)}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Payment Reference <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="e.g. BANK-TFR-20260225"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {markPaidMutation.error && (
              <p className="text-sm text-red-600">
                {markPaidMutation.error.message}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setMarkPaidOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                isLoading={markPaidMutation.isPending}
                disabled={!paymentRef.trim()}
                onClick={() => {
                  if (!selectedClaim || !paymentRef.trim()) return;
                  markPaidMutation.mutate({
                    id: selectedClaim.id,
                    paymentReference: paymentRef.trim(),
                  });
                }}
              >
                Mark as Paid
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Lock Confirm ──────────────────────────────────────────────────── */}
      <ConfirmModal
        isOpen={lockConfirmOpen}
        onClose={() => setLockConfirmOpen(false)}
        onConfirm={() => {
          if (selectedTravel) lockMutation.mutate({ id: selectedTravel.id });
        }}
        title="Lock Travel Request"
        message={`Lock travel request ${selectedTravel?.requestNumber ?? ""}? Participants will be able to submit expense claims once locked.`}
        confirmLabel="Lock"
        isLoading={lockMutation.isPending}
        variant="warning"
      />

      {/* ── Close Confirm ─────────────────────────────────────────────────── */}
      <ConfirmModal
        isOpen={closeConfirmOpen}
        onClose={() => setCloseConfirmOpen(false)}
        onConfirm={() => {
          if (selectedTravel) closeMutation.mutate({ id: selectedTravel.id });
        }}
        title="Close Travel Request"
        message={`Close travel request ${selectedTravel?.requestNumber ?? ""}? All unsettled claims will block this action — only PAID or REJECTED claims are accepted.`}
        confirmLabel="Close Request"
        isLoading={closeMutation.isPending}
        variant="danger"
      />
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  unit,
  color = "gray",
}: {
  label: string;
  value: number | string;
  unit?: string;
  color?: "gray" | "blue" | "green" | "yellow" | "purple";
}) {
  const border = {
    gray: "border-gray-200 bg-gray-50",
    blue: "border-blue-200 bg-blue-50",
    green: "border-green-200 bg-green-50",
    yellow: "border-yellow-200 bg-yellow-50",
    purple: "border-purple-200 bg-purple-50",
  } as const;

  const text = {
    gray: "text-gray-800",
    blue: "text-blue-800",
    green: "text-green-800",
    yellow: "text-yellow-800",
    purple: "text-purple-800",
  } as const;

  return (
    <div className={`rounded-xl border p-5 ${border[color]}`}>
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${text[color]}`}>
        {value}
      </p>
      {unit && <p className="mt-0.5 text-xs text-gray-400">{unit}</p>}
    </div>
  );
}

function BailoutsTab({
  bailouts,
  isLoading,
  onDisburse,
}: {
  bailouts: Bailout[];
  isLoading: boolean;
  onDisburse: (b: Bailout) => void;
}) {
  if (isLoading) return <Skeleton />;
  if (bailouts.length === 0)
    return (
      <EmptyState
        title="No pending disbursements"
        description="All Director-approved bailouts have been disbursed."
      />
    );

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Requester
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Travel Request
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Destination
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
              Amount
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Submitted
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {bailouts.map((b) => (
            <tr key={b.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium">
                {b.requester.name ?? "—"}
              </td>
              <td className="px-4 py-3 font-mono text-gray-600">
                {b.travelRequest.requestNumber}
              </td>
              <td className="px-4 py-3 text-gray-600">
                {b.travelRequest.destination}
              </td>
              <td className="px-4 py-3 text-right font-semibold">
                {formatCurrency(b.amount)}
              </td>
              <td className="px-4 py-3 text-gray-500">
                {formatDate(b.createdAt)}
              </td>
              <td className="px-4 py-3 text-right">
                <Button size="sm" variant="primary" onClick={() => onDisburse(b)}>
                  Disburse
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClaimsTab({
  claims,
  isLoading,
  onMarkPaid,
}: {
  claims: Claim[];
  isLoading: boolean;
  onMarkPaid: (c: Claim) => void;
}) {
  if (isLoading) return <Skeleton />;
  if (claims.length === 0)
    return (
      <EmptyState
        title="No approved claims pending payment"
        description="All approved claims have been paid."
      />
    );

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Claim #
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Submitter
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Travel Request
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Type
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
              Amount
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Date
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {claims.map((c) => (
            <tr key={c.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-mono font-semibold">
                {c.claimNumber}
              </td>
              <td className="px-4 py-3">{c.submitter.name ?? "—"}</td>
              <td className="px-4 py-3 font-mono text-gray-600">
                {c.travelRequest.requestNumber}
              </td>
              <td className="px-4 py-3 text-gray-600">
                {c.claimType === "ENTERTAINMENT"
                  ? "Entertainment"
                  : "Non-Entertainment"}
              </td>
              <td className="px-4 py-3 text-right font-semibold">
                {formatCurrency(c.amount)}
              </td>
              <td className="px-4 py-3 text-gray-500">
                {formatDate(c.createdAt)}
              </td>
              <td className="px-4 py-3 text-right">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => onMarkPaid(c)}
                >
                  Mark Paid
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TravelTab({
  approved,
  locked,
  isLoading,
  onLock,
  onClose,
}: {
  approved: TravelRequest[];
  locked: TravelRequest[];
  isLoading: boolean;
  onLock: (t: TravelRequest) => void;
  onClose: (t: TravelRequest) => void;
}) {
  if (isLoading) return <Skeleton />;

  const allRows = [
    ...approved.map((t) => ({ ...t, action: "lock" as const })),
    ...locked.map((t) => ({ ...t, action: "close" as const })),
  ];

  if (allRows.length === 0)
    return (
      <EmptyState
        title="No travel requests pending action"
        description="All approved travel requests have been locked or closed."
      />
    );

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Request #
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Requester
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Destination
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Period
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Status
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {allRows.map((r) => (
            <tr key={r.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-mono font-semibold">
                {r.requestNumber}
              </td>
              <td className="px-4 py-3">{r.requester.name ?? "—"}</td>
              <td className="px-4 py-3 text-gray-600">{r.destination}</td>
              <td className="px-4 py-3 text-gray-500">
                {formatDate(r.startDate)} – {formatDate(r.endDate)}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={r.status} type="travel" />
              </td>
              <td className="px-4 py-3 text-right">
                {r.action === "lock" ? (
                  <Button size="sm" variant="primary" onClick={() => onLock(r)}>
                    Lock
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => onClose(r)}
                  >
                    Close
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccountsTab({
  accounts,
  isLoading,
  onRefresh,
}: {
  accounts: BalanceAccount[];
  isLoading: boolean;
  onRefresh: () => void;
}) {
  if (isLoading) return <Skeleton />;
  if (accounts.length === 0)
    return (
      <EmptyState
        title="No balance accounts"
        description="No balance accounts have been configured yet."
      />
    );

  const totalBalance = accounts.reduce((sum, a) => sum + (a.balance ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Total across all accounts:{" "}
          <span className="font-semibold text-gray-900">
            {formatCurrency(totalBalance)}
          </span>
        </p>
        <Button size="sm" variant="secondary" onClick={onRefresh}>
          Refresh
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Code
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Description
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                Balance
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {accounts.map((a) => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono">{a.code}</td>
                <td className="px-4 py-3 font-medium">{a.name}</td>
                <td className="px-4 py-3 text-gray-500">
                  {a.description ?? "—"}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                  {formatCurrency(a.balance ?? 0)}
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      a.isActive
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {a.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
      ))}
    </div>
  );
}
