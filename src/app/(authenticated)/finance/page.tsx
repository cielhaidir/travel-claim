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
import { hasPermissionMap } from "@/lib/auth/permissions";
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

interface COAOption {
  id: string;
  code: string;
  name: string;
  accountType: string;
  category: string;
  subcategory: string | null;
  parentId: string | null;
}

interface BalanceAccountOption {
  id: string;
  code: string;
  name: string;
  balance: number;
  isActive: boolean;
  defaultChartOfAccountId?: string | null;
  defaultChartOfAccount?: {
    id: string;
    code: string;
    name: string;
    accountType: string;
  } | null;
}

type ActiveTab = "bailouts" | "claims" | "travel" | "settlement";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FinanceDashboard() {
  const { data: session } = useSession();
  const router = useRouter();

  const isRoot = session?.user?.isRoot ?? false;
  const permissions = session?.user?.permissions;
  const canReadBailout = isRoot || hasPermissionMap(permissions, "bailout", "read");
  const canDisburseBailout =
    isRoot || hasPermissionMap(permissions, "bailout", "disburse");
  const canReadClaims = isRoot || hasPermissionMap(permissions, "claims", "read");
  const canPayClaims = isRoot || hasPermissionMap(permissions, "claims", "pay");
  const canReadTravel = isRoot || hasPermissionMap(permissions, "travel", "read");
  const canLockTravel = isRoot || hasPermissionMap(permissions, "travel", "lock");
  const canCloseTravel =
    isRoot || hasPermissionMap(permissions, "travel", "close");
  const canReadJournals =
    isRoot || hasPermissionMap(permissions, "journals", "read");
  const canCreateJournals =
    isRoot || hasPermissionMap(permissions, "journals", "create");
  const canReadAccounting =
    isRoot || hasPermissionMap(permissions, "accounting", "read");
  const canReadCoa =
    isRoot ||
    hasPermissionMap(permissions, "chart-of-accounts", "read");
  const canReadBalanceAccounts =
    isRoot || hasPermissionMap(permissions, "balance-accounts", "read");
  const canUseBailoutDisbursement =
    canReadBailout &&
    canDisburseBailout &&
    canReadCoa &&
    canReadBalanceAccounts;
  const canUseClaimPayment =
    canReadClaims && canPayClaims && canReadCoa && canReadBalanceAccounts;
  const canUseSettlement =
    canReadBailout && canReadJournals && canCreateJournals && canReadCoa;
  const canUseTravelActions =
    canReadTravel && (canLockTravel || canCloseTravel);
  const isAllowed =
    canUseBailoutDisbursement ||
    canUseClaimPayment ||
    canUseSettlement ||
    canUseTravelActions;

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
  const [bailoutStorageUrl, setBailoutStorageUrl] = useState("");
  const [bailoutExpenseCoaId, setBailoutExpenseCoaId] = useState("");
  const [bailoutOffsetCoaId, setBailoutOffsetCoaId] = useState("");
  const [bailoutBalanceAccountId, setBailoutBalanceAccountId] = useState("");

  // ── Mark paid modal state ──────────────────────────────────────────────────
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);
  const [paymentRef, setPaymentRef] = useState("");
  const [claimStorageUrl, setClaimStorageUrl] = useState("");
  const [claimExpenseCoaId, setClaimExpenseCoaId] = useState("");
  const [claimOffsetCoaId, setClaimOffsetCoaId] = useState("");
  const [claimBalanceAccountId, setClaimBalanceAccountId] = useState("");

  const [settlementOpen, setSettlementOpen] = useState(false);
  const [selectedSettlementBailout, setSelectedSettlementBailout] =
    useState<Bailout | null>(null);
  const [settlementExpenseCoaId, setSettlementExpenseCoaId] = useState("");
  const [settlementAdvanceCoaId, setSettlementAdvanceCoaId] = useState("");
  const [settlementRef, setSettlementRef] = useState("");
  const [settlementExpenseLines, setSettlementExpenseLines] = useState<
    Array<{ chartOfAccountId: string; amount: string; description: string }>
  >([]);
  const [settlementVarianceHandling, setSettlementVarianceHandling] = useState<
    "REQUIRE_EXACT" | "REFUND_TO_BANK" | "REFUND_TO_RECEIVABLE" | "TOPUP_TO_PAYABLE"
  >("REQUIRE_EXACT");
  const [settlementRefundBankCoaId, setSettlementRefundBankCoaId] = useState("");
  const [settlementRefundBalanceAccountId, setSettlementRefundBalanceAccountId] =
    useState("");
  const [settlementEmployeeReceivableCoaId, setSettlementEmployeeReceivableCoaId] =
    useState("");
  const [settlementEmployeePayableCoaId, setSettlementEmployeePayableCoaId] =
    useState("");

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
    { status: "APPROVED_DIRECTOR", limit: 50 },
    { enabled: canUseBailoutDisbursement },
  );
  const bailouts =
    (bailoutsRaw as { bailouts: Bailout[] } | undefined)?.bailouts ?? [];

  const {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    data: bailoutSettlementsRaw,
    isLoading: loadingBailoutSettlements,
    refetch: refetchBailoutSettlements,
  } = api.bailout.getAll.useQuery(
    { status: "DISBURSED", limit: 50 },
    { enabled: canUseSettlement },
  );
  const bailoutSettlements =
    (bailoutSettlementsRaw as { bailouts: Bailout[] } | undefined)?.bailouts ?? [];

  const {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    data: claimsRaw,
    isLoading: loadingClaims,
    refetch: refetchClaims,
  } = api.claim.getAll.useQuery(
    { status: "APPROVED", limit: 50 },
    { enabled: canUseClaimPayment },
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
    { enabled: canUseTravelActions && canLockTravel },
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
    { enabled: canUseTravelActions && canCloseTravel },
  );
  const travelLocked =
    (travelLockedRaw as { requests: TravelRequest[] } | undefined)?.requests ??
    [];

  const { data: activeCoasRaw } = api.chartOfAccount.getActiveAccounts.useQuery(
    {},
    {
      enabled:
        canReadCoa &&
        (canUseBailoutDisbursement || canUseClaimPayment || canUseSettlement),
      refetchOnWindowFocus: false,
    },
  );
  const activeCoas = (activeCoasRaw as COAOption[] | undefined) ?? [];

  const { data: balanceAccountsRaw } = api.balanceAccount.list.useQuery(
    { isActive: true, limit: 100 },
    {
      enabled:
        canReadBalanceAccounts &&
        (canUseBailoutDisbursement || canUseClaimPayment),
      refetchOnWindowFocus: false,
    },
  );
  const balanceAccounts =
    (balanceAccountsRaw as { balanceAccounts: BalanceAccountOption[] } | undefined)
      ?.balanceAccounts ?? [];

  const { data: settlementJournalsRaw, refetch: refetchSettlementJournals } =
    api.journalEntry.list.useQuery(
      {
        sourceType: "SETTLEMENT",
        status: "POSTED",
        limit: 100,
      },
      { enabled: canUseSettlement, refetchOnWindowFocus: false },
    );
  const settlementJournals =
    (settlementJournalsRaw as { journalEntries: Array<{ bailout?: { id: string } | null }> } | undefined)
      ?.journalEntries ?? [];

  const { data: postedJournalLinesRaw } = api.journalEntry.list.useQuery(
    {
      status: "POSTED",
      limit: 200,
    },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );
  const postedJournalEntries =
    (postedJournalLinesRaw as {
      journalEntries: Array<{
        id: string;
        journalNumber: string;
        transactionDate: string | Date;
        description: string;
        sourceType?: string | null;
        bailout?: { id: string; bailoutNumber: string } | null;
        lines: Array<{
          debitAmount: number;
          creditAmount: number;
          chartOfAccount: { code: string; name: string };
        }>;
      }>;
    } | undefined)?.journalEntries ?? [];
  const settledBailoutIds = new Set(
    settlementJournals
      .map((journal) => journal.bailout?.id)
      .filter((id): id is string => Boolean(id)),
  );

  const {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    data: statsRaw,
  } = api.claim.getStatistics.useQuery(canUseClaimPayment ? {} : skipToken);
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
  const unsettledBailouts = bailoutSettlements.filter(
    (bailout) => !settledBailoutIds.has(bailout.id),
  );

  // ── Mutations ──────────────────────────────────────────────────────────────

  const disburseMutation = api.bailout.disburse.useMutation();
  const processBailoutMutation = api.finance.processBailoutTransaction.useMutation({
    onSuccess: () => {
      void refetchBailouts();
      setDisburseOpen(false);
      setSelectedBailout(null);
      setDisbursementRef("");
      setBailoutStorageUrl("");
      setBailoutExpenseCoaId("");
      setBailoutOffsetCoaId("");
      setBailoutBalanceAccountId("");
    },
  });

  const markPaidMutation = api.claim.markAsPaid.useMutation();
  const processClaimMutation = api.finance.processClaimTransaction.useMutation({
    onSuccess: () => {
      void refetchClaims();
      setMarkPaidOpen(false);
      setSelectedClaim(null);
      setPaymentRef("");
      setClaimStorageUrl("");
      setClaimExpenseCoaId("");
      setClaimOffsetCoaId("");
      setClaimBalanceAccountId("");
    },
  });

  const settlementMutation = api.finance.settleBailoutTransaction.useMutation({
    onSuccess: () => {
      void refetchBailoutSettlements();
      void refetchSettlementJournals();
      setSettlementOpen(false);
      setSelectedSettlementBailout(null);
      setSettlementExpenseCoaId("");
      setSettlementAdvanceCoaId("");
      setSettlementRef("");
      setSettlementExpenseLines([]);
      setSettlementVarianceHandling("REQUIRE_EXACT");
      setSettlementRefundBankCoaId("");
      setSettlementRefundBalanceAccountId("");
      setSettlementEmployeeReceivableCoaId("");
      setSettlementEmployeePayableCoaId("");
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
    if (!canUseBailoutDisbursement) return;
    setSelectedBailout(b);
    setDisbursementRef("");
    setBailoutStorageUrl("");
    setBailoutExpenseCoaId(
      activeCoas.find((coa) => coa.accountType === "ASSET")?.id ?? "",
    );
    setBailoutOffsetCoaId(
      balanceAccounts[0]?.defaultChartOfAccountId ??
        activeCoas.find((coa) => coa.accountType === "ASSET")?.id ??
        "",
    );
    setBailoutBalanceAccountId(balanceAccounts[0]?.id ?? "");
    setDisburseOpen(true);
  }

  function openMarkPaid(c: Claim) {
    if (!canUseClaimPayment) return;
    setSelectedClaim(c);
    setPaymentRef("");
    setClaimStorageUrl("");
    setClaimExpenseCoaId(
      activeCoas.find((coa) => coa.accountType === "EXPENSE")?.id ?? "",
    );
    setClaimOffsetCoaId(
      balanceAccounts[0]?.defaultChartOfAccountId ??
        activeCoas.find((coa) => coa.accountType === "ASSET")?.id ??
        "",
    );
    setClaimBalanceAccountId(balanceAccounts[0]?.id ?? "");
    setMarkPaidOpen(true);
  }

  function openSettlement(b: Bailout) {
    const defaultExpenseCoaId = activeCoas.find((coa) => coa.code === "6130" && coa.accountType === "EXPENSE")?.id
      ?? activeCoas.find((coa) => coa.accountType === "EXPENSE")?.id
      ?? "";
    const defaultAdvanceCoaId = activeCoas.find((coa) => coa.code === "1131")?.id
      ?? activeCoas.find((coa) => coa.code === "1130")?.id
      ?? activeCoas.find((coa) => coa.accountType === "ASSET")?.id
      ?? "";
    const defaultRefundBankCoaId = balanceAccounts[0]?.defaultChartOfAccountId
      ?? activeCoas.find((coa) => coa.code === "1120")?.id
      ?? activeCoas.find((coa) => coa.accountType === "ASSET")?.id
      ?? "";
    const defaultEmployeeReceivableCoaId = activeCoas.find((coa) => coa.code === "1132")?.id ?? "";
    const defaultEmployeePayableCoaId = activeCoas.find((coa) => coa.code === "2110")?.id ?? "";

    setSelectedSettlementBailout(b);
    setSettlementExpenseCoaId(defaultExpenseCoaId);
    setSettlementAdvanceCoaId(defaultAdvanceCoaId);
    setSettlementExpenseLines([
      {
        chartOfAccountId: defaultExpenseCoaId,
        amount: Number(b.amount ?? 0).toString(),
        description: `Settlement ${b.travelRequest.requestNumber}`,
      },
    ]);
    setSettlementVarianceHandling("REQUIRE_EXACT");
    setSettlementRefundBankCoaId(defaultRefundBankCoaId);
    setSettlementRefundBalanceAccountId(balanceAccounts[0]?.id ?? "");
    setSettlementEmployeeReceivableCoaId(defaultEmployeeReceivableCoaId);
    setSettlementEmployeePayableCoaId(defaultEmployeePayableCoaId);
    setSettlementRef("");
    setSettlementOpen(true);
  }

  function openLock(t: TravelRequest) {
    if (!canLockTravel) return;
    setSelectedTravel(t);
    setLockConfirmOpen(true);
  }

  function openClose(t: TravelRequest) {
    if (!canCloseTravel) return;
    setSelectedTravel(t);
    setCloseConfirmOpen(true);
  }

  const expenseCoaOptions = activeCoas
    .filter((coa) => coa.accountType === "EXPENSE")
    .map((coa) => ({ value: coa.id, label: `${coa.code} - ${coa.name}` }));
  const assetCoaOptions = activeCoas
    .filter((coa) => coa.accountType === "ASSET")
    .map((coa) => ({ value: coa.id, label: `${coa.code} - ${coa.name}` }));
  const liabilityCoaOptions = activeCoas
    .filter((coa) => coa.accountType === "LIABILITY")
    .map((coa) => ({ value: coa.id, label: `${coa.code} - ${coa.name}` }));
  const balanceAccountOptions = balanceAccounts.map((account) => ({
    value: account.id,
    label: `${account.code} - ${account.name}`,
  }));

  const settlementRealizationAmount = settlementExpenseLines.reduce(
    (sum, line) => sum + (Number(line.amount) || 0),
    0,
  );
  const settlementAdvanceAmount = Number(selectedSettlementBailout?.amount ?? 0);
  const settlementVariance = Number(
    (settlementAdvanceAmount - settlementRealizationAmount).toFixed(2),
  );
  const requiresRefundBank = settlementVariance > 0 && settlementVarianceHandling === "REFUND_TO_BANK";
  const requiresReceivable = settlementVariance > 0 && settlementVarianceHandling === "REFUND_TO_RECEIVABLE";
  const requiresPayable = settlementVariance < 0 && settlementVarianceHandling === "TOPUP_TO_PAYABLE";
  const settlementVarianceModeMismatch =
    (settlementVariance > 0 && settlementVarianceHandling === "TOPUP_TO_PAYABLE") ||
    (settlementVariance < 0 && ["REFUND_TO_BANK", "REFUND_TO_RECEIVABLE"].includes(settlementVarianceHandling));

  const settlementPreviewLines: Array<{
    label: string;
    debit: number;
    credit: number;
    note?: string;
  }> = [
    ...settlementExpenseLines
      .filter((line) => line.chartOfAccountId && Number(line.amount) > 0)
      .map((line) => ({
        label: activeCoas.find((coa) => coa.id === line.chartOfAccountId)
          ? `${activeCoas.find((coa) => coa.id === line.chartOfAccountId)?.code} - ${activeCoas.find((coa) => coa.id === line.chartOfAccountId)?.name}`
          : "Akun beban",
        debit: Number(line.amount),
        credit: 0,
        note: line.description || undefined,
      })),
  ];

  if (requiresRefundBank && settlementRefundBankCoaId) {
    const coa = activeCoas.find((item) => item.id === settlementRefundBankCoaId);
    settlementPreviewLines.push({
      label: coa ? `${coa.code} - ${coa.name}` : "Akun kas/bank refund",
      debit: Math.max(settlementVariance, 0),
      credit: 0,
      note: "Pengembalian selisih ke kas/bank",
    });
  }

  if (requiresReceivable && settlementEmployeeReceivableCoaId) {
    const coa = activeCoas.find((item) => item.id === settlementEmployeeReceivableCoaId);
    settlementPreviewLines.push({
      label: coa ? `${coa.code} - ${coa.name}` : "Akun piutang karyawan",
      debit: Math.max(settlementVariance, 0),
      credit: 0,
      note: "Selisih lebih menjadi piutang karyawan",
    });
  }

  if (settlementAdvanceCoaId) {
    const coa = activeCoas.find((item) => item.id === settlementAdvanceCoaId);
    settlementPreviewLines.push({
      label: coa ? `${coa.code} - ${coa.name}` : "Akun uang muka",
      debit: 0,
      credit: settlementAdvanceAmount,
      note: "Penutupan uang muka perjalanan",
    });
  }

  if (requiresPayable && settlementEmployeePayableCoaId) {
    const coa = activeCoas.find((item) => item.id === settlementEmployeePayableCoaId);
    settlementPreviewLines.push({
      label: coa ? `${coa.code} - ${coa.name}` : "Akun hutang karyawan",
      debit: 0,
      credit: Math.abs(settlementVariance),
      note: "Kekurangan bayar menjadi hutang karyawan",
    });
  }

  const settlementPreviewTotals = settlementPreviewLines.reduce(
    (acc, line) => ({ debit: acc.debit + line.debit, credit: acc.credit + line.credit }),
    { debit: 0, credit: 0 },
  );

  const outstandingAdvanceAmount = unsettledBailouts.reduce(
    (sum, bailout) => sum + Number(bailout.amount ?? 0),
    0,
  );
  const accountExposureMap = postedJournalEntries
    .flatMap((journal) => journal.lines)
    .reduce((map, line) => {
      const code = line.chartOfAccount.code;
      const amount = Number(line.debitAmount ?? 0) - Number(line.creditAmount ?? 0);
      map.set(code, (map.get(code) ?? 0) + amount);
      return map;
    }, new Map<string, number>());
  const outstandingEmployeeReceivable = accountExposureMap.get("1132") ?? 0;
  const outstandingEmployeePayable = Math.abs(accountExposureMap.get("2110") ?? 0);
  const receivablePayableJournalRows = postedJournalEntries
    .flatMap((journal) =>
      journal.lines
        .filter((line) => ["1132", "2110"].includes(line.chartOfAccount.code))
        .map((line) => ({
          journalId: journal.id,
          journalNumber: journal.journalNumber,
          transactionDate: journal.transactionDate,
          description: journal.description,
          sourceType: journal.sourceType ?? "MANUAL",
          accountCode: line.chartOfAccount.code,
          accountName: line.chartOfAccount.name,
          amount: Math.abs(Number(line.debitAmount ?? 0) - Number(line.creditAmount ?? 0)),
          position: Number(line.debitAmount ?? 0) > 0 ? "DEBIT" : "CREDIT",
          bailoutNumber: journal.bailout?.bailoutNumber,
        })),
    )
    .sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime())
    .slice(0, 8);

  function updateSettlementExpenseLine(
    index: number,
    patch: Partial<{ chartOfAccountId: string; amount: string; description: string }>,
  ) {
    setSettlementExpenseLines((prev) => prev.map((line, lineIndex) => (
      lineIndex === index ? { ...line, ...patch } : line
    )));
  }

  function addSettlementExpenseLine() {
    setSettlementExpenseLines((prev) => ([
      ...prev,
      {
        chartOfAccountId: settlementExpenseCoaId || expenseCoaOptions[0]?.value || "",
        amount: "",
        description: "",
      },
    ]));
  }

  function removeSettlementExpenseLine(index: number) {
    setSettlementExpenseLines((prev) => prev.filter((_, lineIndex) => lineIndex !== index));
  }

  if (!session || !isAllowed) return null;

  const tabs: Array<{ id: ActiveTab; label: string; badge?: number }> = [
    ...(canUseBailoutDisbursement
      ? [{ id: "bailouts" as const, label: "Pencairan Bailout", badge: bailouts.length }]
      : []),
    ...(canUseClaimPayment
      ? [{ id: "claims" as const, label: "Pembayaran Klaim", badge: claims.length }]
      : []),
    ...(canUseSettlement
      ? [{
          id: "settlement" as const,
          label: "Settlement Bailout",
          badge: unsettledBailouts.length,
        }]
      : []),
    ...(canUseTravelActions
      ? [{
          id: "travel" as const,
          label: "Perjalanan Dinas",
          badge:
            (canLockTravel ? travelApproved.length : 0) +
            (canCloseTravel ? travelLocked.length : 0),
        }]
      : []),
  ];

  useEffect(() => {
    if (tabs.length === 0) return;
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(tabs[0]?.id ?? "bailouts");
    }
  }, [activeTab, tabs]);

  const summaryCards = [
    ...(canUseBailoutDisbursement
      ? [{
          label: "Pencairan Tertunda",
          value: bailouts.length,
          unit: "bailout",
          color: "yellow" as const,
        }]
      : []),
    ...(canUseSettlement
      ? [{
          label: "Bailout Belum Settlement",
          value: unsettledBailouts.length,
          unit: "siap diproses",
          color: "gray" as const,
        }]
      : []),
    ...(canUseClaimPayment
      ? [
          {
            label: "Klaim Disetujui",
            value: pendingClaimsCount,
            unit: "menunggu pembayaran",
            color: "blue" as const,
          },
          {
            label: "Nominal Pembayaran Tertunda",
            value: formatCurrency(pendingPaymentAmount),
            color: "green" as const,
          },
        ]
      : []),
    ...(canUseTravelActions
      ? [{
          label: "Perjalanan Siap Diproses",
          value:
            (canLockTravel ? travelApproved.length : 0) +
            (canCloseTravel ? travelLocked.length : 0),
          unit: "perjalanan",
          color: "purple" as const,
        }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dasbor Keuangan"
        description="Kelola pencairan bailout, pembayaran klaim, dan siklus perjalanan dinas"
        primaryAction={
          canReadJournals
            ? {
                label: "Lihat Jurnal",
                href: "/journal",
              }
            : undefined
        }
        secondaryAction={
          canReadAccounting
            ? {
                label: "Akuntansi Perusahaan",
                href: "/accounting",
              }
            : undefined
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Pencairan Tertunda"
          value={bailouts.length}
          unit="bailout"
          color="yellow"
        />
        <SummaryCard
          label="Bailout Belum Settlement"
          value={unsettledBailouts.length}
          unit="siap diproses"
          color="gray"
        />
        <SummaryCard
          label="Klaim Disetujui"
          value={pendingClaimsCount}
          unit="menunggu pembayaran"
          color="blue"
        />
        <SummaryCard
          label="Perjalanan Siap Dikunci"
          value={travelApproved.length}
          unit="disetujui"
          color="purple"
        />
        <SummaryCard
          label="Nominal Pembayaran Tertunda"
          value={formatCurrency(pendingPaymentAmount)}
          color="green"
        />
        <SummaryCard
          label="Outstanding Uang Muka"
          value={formatCurrency(outstandingAdvanceAmount)}
          unit={`${unsettledBailouts.length} bailout`}
          color="yellow"
        />
        <SummaryCard
          label="Piutang Karyawan"
          value={formatCurrency(outstandingEmployeeReceivable)}
          unit="saldo akun 1132"
          color="blue"
        />
        <SummaryCard
          label="Hutang Karyawan"
          value={formatCurrency(outstandingEmployeePayable)}
          unit="saldo akun 2110"
          color="purple"
        />
      </div>

      {canReadJournals || canReadAccounting ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {canReadJournals ? (
            <QuickLinkCard
          title="Jurnal"
          description="Lihat seluruh transaksi debit dan kredit yang sudah tercatat."
          href="/journal"
          cta="Buka Jurnal"
          icon="🧾"
            />
          ) : null}
          {canReadAccounting ? (
            <QuickLinkCard
          title="Akuntansi Perusahaan"
          description="Kelola akun saldo perusahaan dan lakukan penyesuaian saldo."
          href="/accounting"
          cta="Buka Halaman Akuntansi"
          icon="🏦"
            />
          ) : null}
        </div>
      ) : null}

      {/* Tab Navigation */}
      <div className="content-section p-4">
        <nav className="-mb-px flex space-x-6 overflow-x-auto border-b border-gray-200">
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
      {activeTab === "settlement" && (
        <BailoutSettlementTab
          bailouts={unsettledBailouts}
          isLoading={loadingBailoutSettlements}
          onSettle={openSettlement}
          outstandingAdvanceAmount={outstandingAdvanceAmount}
          outstandingEmployeeReceivable={outstandingEmployeeReceivable}
          outstandingEmployeePayable={outstandingEmployeePayable}
          receivablePayableRows={receivablePayableJournalRows}
        />
      )}
      {activeTab === "travel" && (
        <TravelTab
          approved={travelApproved}
          locked={travelLocked}
          isLoading={loadingTravelApproved || loadingTravelLocked}
          canLock={canLockTravel}
          canClose={canCloseTravel}
          onLock={openLock}
          onClose={openClose}
        />
      )}
      {/* ── Disburse Bailout Modal ───────────────────────────────────────── */}
      <Modal
        isOpen={disburseOpen && canUseBailoutDisbursement}
        onClose={() => setDisburseOpen(false)}
        title="Cairkan Bailout"
      >
        {selectedBailout && (
          <div className="space-y-4">
            <div className="content-subcard p-4 text-sm">
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
                Referensi Pencairan <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={disbursementRef}
                onChange={(e) => setDisbursementRef(e.target.value)}
                placeholder="contoh: BANK-TFR-20260225"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Tautan Bukti Pencairan <span className="text-red-500">*</span>
              </label>
              <p className="mb-1 text-xs text-gray-500">
                Bailout dicatat sebagai uang muka perjalanan. Pilih akun aset untuk uang muka dan akun aset kas/bank sebagai lawannya.
              </p>
              <input
                type="url"
                value={bailoutStorageUrl}
                onChange={(e) => setBailoutStorageUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <SelectField
              label="Bagan Akun Uang Muka"
              value={bailoutExpenseCoaId}
              onChange={setBailoutExpenseCoaId}
              options={activeCoas
                .filter((coa) => coa.accountType === "ASSET")
                .map((coa) => ({
                  value: coa.id,
                  label: `${coa.code} - ${coa.name}`,
                }))}
            />
            <SelectField
              label="Bagan Akun Kas/Bank"
              value={bailoutOffsetCoaId}
              onChange={setBailoutOffsetCoaId}
              options={activeCoas
                .filter((coa) => coa.accountType === "ASSET")
                .map((coa) => ({
                  value: coa.id,
                  label: `${coa.code} - ${coa.name}`,
                }))}
            />
            <SelectField
              label="Akun Saldo"
              value={bailoutBalanceAccountId}
              onChange={(value) => {
                setBailoutBalanceAccountId(value);
                const selected = balanceAccounts.find((account) => account.id === value);
                if (selected?.defaultChartOfAccountId) {
                  setBailoutOffsetCoaId(selected.defaultChartOfAccountId);
                }
              }}
              options={balanceAccounts.map((account) => ({
                value: account.id,
                label: `${account.code} - ${account.name}`,
              }))}
            />
            {(disburseMutation.error || processBailoutMutation.error) && (
              <p className="text-sm text-red-600">
                {disburseMutation.error?.message ?? processBailoutMutation.error?.message}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDisburseOpen(false)}>
                Batal
              </Button>
              <Button
                variant="primary"
                isLoading={disburseMutation.isPending || processBailoutMutation.isPending}
                disabled={
                  !disbursementRef.trim() ||
                  !bailoutStorageUrl.trim() ||
                  !bailoutExpenseCoaId ||
                  !bailoutOffsetCoaId ||
                  !bailoutBalanceAccountId
                }
                onClick={async () => {
                  if (!selectedBailout) return;
                  await disburseMutation.mutateAsync({
                    id: selectedBailout.id,
                    disbursementRef: disbursementRef.trim(),
                    storageUrl: bailoutStorageUrl.trim(),
                  });
                  await processBailoutMutation.mutateAsync({
                    bailoutId: selectedBailout.id,
                    storageUrl: bailoutStorageUrl.trim(),
                    chartOfAccountId: bailoutExpenseCoaId,
                    offsetChartOfAccountId: bailoutOffsetCoaId,
                    balanceAccountId: bailoutBalanceAccountId,
                    referenceNumber: disbursementRef.trim(),
                  });
                }}
              >
                Cairkan Uang Muka & Posting Jurnal
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Mark Claim as Paid Modal ─────────────────────────────────────── */}
      <Modal
        isOpen={markPaidOpen && canUseClaimPayment}
        onClose={() => setMarkPaidOpen(false)}
        title="Tandai Klaim Sudah Dibayar"
      >
        {selectedClaim && (
          <div className="space-y-4">
            <div className="content-subcard p-4 text-sm">
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
                Referensi Pembayaran <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="contoh: BANK-TFR-20260225"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Tautan Bukti Pembayaran <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                value={claimStorageUrl}
                onChange={(e) => setClaimStorageUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <SelectField
              label="Bagan Akun Beban"
              value={claimExpenseCoaId}
              onChange={setClaimExpenseCoaId}
              options={activeCoas
                .filter((coa) => coa.accountType === "EXPENSE")
                .map((coa) => ({
                  value: coa.id,
                  label: `${coa.code} - ${coa.name}`,
                }))}
            />
            <SelectField
              label="Bagan Akun Kas/Bank"
              value={claimOffsetCoaId}
              onChange={setClaimOffsetCoaId}
              options={activeCoas
                .filter((coa) => coa.accountType === "ASSET")
                .map((coa) => ({
                  value: coa.id,
                  label: `${coa.code} - ${coa.name}`,
                }))}
            />
            <SelectField
              label="Akun Saldo"
              value={claimBalanceAccountId}
              onChange={(value) => {
                setClaimBalanceAccountId(value);
                const selected = balanceAccounts.find((account) => account.id === value);
                if (selected?.defaultChartOfAccountId) {
                  setClaimOffsetCoaId(selected.defaultChartOfAccountId);
                }
              }}
              options={balanceAccounts.map((account) => ({
                value: account.id,
                label: `${account.code} - ${account.name}`,
              }))}
            />
            {(markPaidMutation.error || processClaimMutation.error) && (
              <p className="text-sm text-red-600">
                {markPaidMutation.error?.message ?? processClaimMutation.error?.message}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setMarkPaidOpen(false)}
              >
                Batal
              </Button>
              <Button
                variant="primary"
                isLoading={markPaidMutation.isPending || processClaimMutation.isPending}
                disabled={
                  !paymentRef.trim() ||
                  !claimStorageUrl.trim() ||
                  !claimExpenseCoaId ||
                  !claimOffsetCoaId ||
                  !claimBalanceAccountId
                }
                onClick={async () => {
                  if (!selectedClaim || !paymentRef.trim()) return;
                  await markPaidMutation.mutateAsync({
                    id: selectedClaim.id,
                    paymentReference: paymentRef.trim(),
                  });
                  await processClaimMutation.mutateAsync({
                    claimId: selectedClaim.id,
                    storageUrl: claimStorageUrl.trim(),
                    chartOfAccountId: claimExpenseCoaId,
                    offsetChartOfAccountId: claimOffsetCoaId,
                    balanceAccountId: claimBalanceAccountId,
                    referenceNumber: paymentRef.trim(),
                  });
                }}
              >
                Bayar & Posting Jurnal
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={settlementOpen && canUseSettlement}
        onClose={() => setSettlementOpen(false)}
        title="Settlement Bailout"
      >
        {selectedSettlementBailout && (
          <div className="space-y-4">
            <div className="content-subcard p-4 text-sm">
              <p className="font-semibold text-gray-900">
                {selectedSettlementBailout.requester.name ?? "—"}
              </p>
              <p className="text-gray-500">
                {selectedSettlementBailout.travelRequest.requestNumber} · {selectedSettlementBailout.travelRequest.destination}
              </p>
              <p className="mt-1 font-mono text-gray-500">Settlement untuk bailout yang sudah dicairkan</p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-blue-500">Uang Muka</p>
                  <p className="mt-1 text-lg font-bold text-blue-700">{formatCurrency(settlementAdvanceAmount)}</p>
                </div>
                <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-emerald-500">Total Realisasi</p>
                  <p className="mt-1 text-lg font-bold text-emerald-700">{formatCurrency(settlementRealizationAmount)}</p>
                </div>
                <div className={`rounded-md px-3 py-3 ${settlementVariance === 0 ? "border border-gray-200 bg-gray-50" : settlementVariance > 0 ? "border border-amber-100 bg-amber-50" : "border border-purple-100 bg-purple-50"}`}>
                  <p className={`text-xs font-medium uppercase tracking-wide ${settlementVariance === 0 ? "text-gray-500" : settlementVariance > 0 ? "text-amber-500" : "text-purple-500"}`}>Selisih</p>
                  <p className={`mt-1 text-lg font-bold ${settlementVariance === 0 ? "text-gray-700" : settlementVariance > 0 ? "text-amber-700" : "text-purple-700"}`}>
                    {formatCurrency(Math.abs(settlementVariance))}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {settlementVariance === 0
                      ? "Realisasi pas dengan uang muka"
                      : settlementVariance > 0
                        ? "Sisa uang muka / refund"
                        : "Kekurangan bayar / top-up"}
                  </p>
                </div>
              </div>
            </div>

            <SelectField
              label="Bagan Akun Uang Muka"
              value={settlementAdvanceCoaId}
              onChange={setSettlementAdvanceCoaId}
              options={assetCoaOptions}
            />

            <div className="rounded-lg border border-gray-200 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Rincian Beban Settlement</p>
                  <p className="text-xs text-gray-500">Pisahkan realisasi biaya ke beberapa akun beban bila diperlukan.</p>
                </div>
                <Button size="sm" variant="secondary" onClick={addSettlementExpenseLine}>
                  Tambah Baris
                </Button>
              </div>

              <div className="space-y-3">
                {settlementExpenseLines.map((line, index) => (
                  <div key={`settlement-line-${index}`} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="grid gap-3 md:grid-cols-12">
                      <div className="md:col-span-6">
                        <SelectField
                          label={`Akun Beban ${index + 1}`}
                          value={line.chartOfAccountId}
                          onChange={(value) => {
                            updateSettlementExpenseLine(index, { chartOfAccountId: value });
                            if (index === 0) setSettlementExpenseCoaId(value);
                          }}
                          options={expenseCoaOptions}
                        />
                      </div>
                      <div className="md:col-span-3">
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Nominal <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.amount}
                          onChange={(e) => updateSettlementExpenseLine(index, { amount: e.target.value })}
                          placeholder="0"
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="md:col-span-3">
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Deskripsi
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={line.description}
                            onChange={(e) => updateSettlementExpenseLine(index, { description: e.target.value })}
                            placeholder="Opsional"
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={settlementExpenseLines.length <= 1}
                            onClick={() => removeSettlementExpenseLine(index)}
                          >
                            Hapus
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm font-semibold text-gray-900">Penanganan Selisih</p>
              <p className="mt-1 text-xs text-gray-500">Pilih perlakuan akuntansi jika total realisasi berbeda dengan uang muka.</p>
              <div className="mt-3">
                <label className="mb-1 block text-sm font-medium text-gray-700">Mode Settlement</label>
                <select
                  value={settlementVarianceHandling}
                  onChange={(e) => setSettlementVarianceHandling(e.target.value as "REQUIRE_EXACT" | "REFUND_TO_BANK" | "REFUND_TO_RECEIVABLE" | "TOPUP_TO_PAYABLE")}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="REQUIRE_EXACT">Wajib sama persis dengan uang muka</option>
                  <option value="REFUND_TO_BANK">Selisih lebih dikembalikan ke kas/bank</option>
                  <option value="REFUND_TO_RECEIVABLE">Selisih lebih jadi piutang karyawan</option>
                  <option value="TOPUP_TO_PAYABLE">Selisih kurang jadi hutang karyawan</option>
                </select>
              </div>

              {requiresRefundBank && (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <SelectField
                    label="Akun Kas/Bank Refund"
                    value={settlementRefundBankCoaId}
                    onChange={setSettlementRefundBankCoaId}
                    options={assetCoaOptions}
                  />
                  <SelectField
                    label="Balance Account Refund"
                    value={settlementRefundBalanceAccountId}
                    onChange={(value) => {
                      setSettlementRefundBalanceAccountId(value);
                      const selected = balanceAccounts.find((account) => account.id === value);
                      if (selected?.defaultChartOfAccountId) {
                        setSettlementRefundBankCoaId(selected.defaultChartOfAccountId);
                      }
                    }}
                    options={balanceAccountOptions}
                  />
                </div>
              )}

              {requiresReceivable && (
                <div className="mt-3">
                  <SelectField
                    label="Akun Piutang Karyawan"
                    value={settlementEmployeeReceivableCoaId}
                    onChange={setSettlementEmployeeReceivableCoaId}
                    options={assetCoaOptions}
                  />
                </div>
              )}

              {requiresPayable && (
                <div className="mt-3">
                  <SelectField
                    label="Akun Hutang Karyawan"
                    value={settlementEmployeePayableCoaId}
                    onChange={setSettlementEmployeePayableCoaId}
                    options={liabilityCoaOptions}
                  />
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Nomor Referensi <span className="text-gray-400">(opsional)</span>
              </label>
              <input
                type="text"
                value={settlementRef}
                onChange={(e) => setSettlementRef(e.target.value)}
                placeholder="contoh: STL-BLT-20260316"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Preview Jurnal Settlement</p>
                  <p className="text-xs text-gray-500">Pratinjau line debit dan kredit sebelum jurnal diposting.</p>
                </div>
                <div className={`rounded-full px-3 py-1 text-xs font-semibold ${Math.abs(settlementPreviewTotals.debit - settlementPreviewTotals.credit) < 0.001 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                  {Math.abs(settlementPreviewTotals.debit - settlementPreviewTotals.credit) < 0.001 ? "Balanced" : "Belum Balance"}
                </div>
              </div>
              <div className="mt-3 overflow-x-auto rounded-md border border-gray-100">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Akun</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Keterangan</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Debit</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Kredit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {settlementPreviewLines.map((line, index) => (
                      <tr key={`preview-line-${index}`}>
                        <td className="px-3 py-2 font-medium text-gray-900">{line.label}</td>
                        <td className="px-3 py-2 text-gray-500">{line.note ?? "—"}</td>
                        <td className="px-3 py-2 text-right font-medium text-blue-700">{line.debit > 0 ? formatCurrency(line.debit) : "—"}</td>
                        <td className="px-3 py-2 text-right font-medium text-green-700">{line.credit > 0 ? formatCurrency(line.credit) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan={2} className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Total</td>
                      <td className="px-3 py-2 text-right font-semibold text-blue-700">{formatCurrency(settlementPreviewTotals.debit)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-green-700">{formatCurrency(settlementPreviewTotals.credit)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {settlementVarianceModeMismatch ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Mode settlement yang dipilih belum sesuai dengan arah selisih saat ini. Ubah mode agar cocok dengan kondisi refund atau top-up.
              </p>
            ) : null}

            {settlementMutation.error && (
              <p className="text-sm text-red-600">{settlementMutation.error.message}</p>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setSettlementOpen(false)}>
                Batal
              </Button>
              <Button
                isLoading={settlementMutation.isPending}
                disabled={
                  settlementExpenseLines.length === 0 ||
                  settlementExpenseLines.some((line) => !line.chartOfAccountId || !line.amount || Number(line.amount) <= 0) ||
                  !settlementAdvanceCoaId ||
                  settlementVarianceModeMismatch ||
                  Math.abs(settlementPreviewTotals.debit - settlementPreviewTotals.credit) > 0.001 ||
                  (requiresRefundBank && (!settlementRefundBankCoaId || !settlementRefundBalanceAccountId)) ||
                  (requiresReceivable && !settlementEmployeeReceivableCoaId) ||
                  (requiresPayable && !settlementEmployeePayableCoaId)
                }
                onClick={() => {
                  if (!selectedSettlementBailout) return;
                  settlementMutation.mutate({
                    bailoutId: selectedSettlementBailout.id,
                    expenseChartOfAccountId: settlementExpenseCoaId || settlementExpenseLines[0]?.chartOfAccountId || undefined,
                    expenseLines: settlementExpenseLines.map((line) => ({
                      chartOfAccountId: line.chartOfAccountId,
                      amount: Number(line.amount),
                      description: line.description.trim() || undefined,
                    })),
                    advanceChartOfAccountId: settlementAdvanceCoaId,
                    varianceHandling: settlementVarianceHandling,
                    refundBankChartOfAccountId: requiresRefundBank ? settlementRefundBankCoaId : undefined,
                    refundBankBalanceAccountId: requiresRefundBank ? settlementRefundBalanceAccountId : undefined,
                    employeeReceivableChartOfAccountId: requiresReceivable ? settlementEmployeeReceivableCoaId : undefined,
                    employeePayableChartOfAccountId: requiresPayable ? settlementEmployeePayableCoaId : undefined,
                    referenceNumber: settlementRef.trim() || undefined,
                  });
                }}
              >
                Posting Settlement
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
        title="Kunci Perjalanan Dinas"
        message={`Kunci perjalanan dinas ${selectedTravel?.requestNumber ?? ""}? Peserta akan dapat mengajukan klaim biaya setelah dikunci.`}
        confirmLabel="Kunci"
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
        title="Tutup Perjalanan Dinas"
        message={`Tutup perjalanan dinas ${selectedTravel?.requestNumber ?? ""}? Semua klaim yang belum selesai akan memblokir aksi ini — hanya klaim PAID atau REJECTED yang diperbolehkan.`}
        confirmLabel="Tutup Perjalanan"
        isLoading={closeMutation.isPending}
        variant="danger"
      />
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function QuickLinkCard({
  title,
  description,
  href,
  cta,
  icon,
}: {
  title: string;
  description: string;
  href: string;
  cta: string;
  icon: string;
}) {
  return (
    <a
      href={href}
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-2xl">{icon}</p>
          <h3 className="mt-3 text-lg font-semibold text-gray-900">{title}</h3>
          <p className="mt-1 text-sm text-gray-600">{description}</p>
          <p className="mt-4 text-sm font-semibold text-blue-600">{cta} →</p>
        </div>
      </div>
    </a>
  );
}

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
    gray: "border-gray-200 bg-white",
    blue: "border-blue-200 bg-white",
    green: "border-green-200 bg-white",
    yellow: "border-yellow-200 bg-white",
    purple: "border-purple-200 bg-white",
  } as const;

  const text = {
    gray: "text-gray-800",
    blue: "text-blue-800",
    green: "text-green-800",
    yellow: "text-yellow-800",
    purple: "text-purple-800",
  } as const;

  return (
    <div className={`rounded-xl border p-5 shadow-sm ${border[color]}`}>
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
      <div className="content-section">
        <EmptyState
          title="Tidak ada pencairan tertunda"
          description="Semua bailout yang disetujui direktur sudah dicairkan."
        />
      </div>
    );

  return (
    <div className="content-table overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Pemohon
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              No. Perjalanan
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Tujuan
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
              Nominal
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Diajukan
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
              Aksi
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
                  Cairkan
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
      <div className="content-section">
        <EmptyState
          title="Tidak ada klaim yang menunggu pembayaran"
          description="Semua klaim yang disetujui sudah dibayar."
        />
      </div>
    );

  return (
    <div className="content-table overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              No. Klaim
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Pengaju
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              No. Perjalanan
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Jenis
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
              Nominal
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Tanggal
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
              Aksi
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
                  ? "Hiburan"
                  : "Non-Hiburan"}
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
                  Bayar Klaim
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BailoutSettlementTab({
  bailouts,
  isLoading,
  onSettle,
  outstandingAdvanceAmount,
  outstandingEmployeeReceivable,
  outstandingEmployeePayable,
  receivablePayableRows,
}: {
  bailouts: Bailout[];
  isLoading: boolean;
  onSettle: (b: Bailout) => void;
  outstandingAdvanceAmount: number;
  outstandingEmployeeReceivable: number;
  outstandingEmployeePayable: number;
  receivablePayableRows: Array<{
    journalId: string;
    journalNumber: string;
    transactionDate: string | Date;
    description: string;
    sourceType: string;
    accountCode: string;
    accountName: string;
    amount: number;
    position: string;
    bailoutNumber?: string;
  }>;
}) {
  if (isLoading) return <Skeleton />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryCard
          label="Outstanding Uang Muka"
          value={formatCurrency(outstandingAdvanceAmount)}
          unit={`${bailouts.length} bailout belum settlement`}
          color="yellow"
        />
        <SummaryCard
          label="Piutang Karyawan"
          value={formatCurrency(outstandingEmployeeReceivable)}
          unit="saldo akun 1132"
          color="blue"
        />
        <SummaryCard
          label="Hutang Karyawan"
          value={formatCurrency(outstandingEmployeePayable)}
          unit="saldo akun 2110"
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.4fr_1fr]">
        {bailouts.length === 0 ? (
          <EmptyState
            title="Tidak ada bailout untuk settlement"
            description="Semua bailout yang sudah dicairkan sudah diselesaikan atau belum tersedia untuk settlement."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Pemohon</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">No. Perjalanan</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Tujuan</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Nominal</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {bailouts.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{b.requester.name ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-gray-600">{b.travelRequest.requestNumber}</td>
                    <td className="px-4 py-3 text-gray-600">{b.travelRequest.destination}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatCurrency(b.amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-700">
                        Siap Settlement
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="primary" onClick={() => onSettle(b)}>
                        Settlement
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">Mutasi Piutang / Hutang Karyawan</p>
            <p className="text-xs text-gray-500">Ringkasan jurnal posted terbaru untuk akun 1132 dan 2110.</p>
          </div>
          {receivablePayableRows.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-500">Belum ada mutasi piutang atau hutang karyawan pada tenant aktif.</div>
          ) : (
            <div className="max-h-[420px] overflow-auto">
              <div className="divide-y divide-gray-100">
                {receivablePayableRows.map((row, index) => (
                  <div key={`${row.journalId}-${row.accountCode}-${row.position}-${index}`} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-sm font-semibold text-gray-900">{row.journalNumber}</p>
                        <p className="text-xs text-gray-500">{formatDate(row.transactionDate)} · {row.sourceType}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">{formatCurrency(row.amount)}</p>
                        <p className="text-xs text-gray-500">{row.position}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-sm font-medium text-gray-800">{row.accountCode} · {row.accountName}</p>
                    <p className="mt-1 text-xs text-gray-500">{row.description}</p>
                    {row.bailoutNumber ? <p className="mt-1 text-xs text-gray-400">Bailout: {row.bailoutNumber}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TravelTab({
  approved,
  locked,
  isLoading,
  canLock,
  canClose,
  onLock,
  onClose,
}: {
  approved: TravelRequest[];
  locked: TravelRequest[];
  isLoading: boolean;
  canLock: boolean;
  canClose: boolean;
  onLock: (t: TravelRequest) => void;
  onClose: (t: TravelRequest) => void;
}) {
  if (isLoading) return <Skeleton />;

  const allRows = [
    ...(canLock ? approved.map((t) => ({ ...t, action: "lock" as const })) : []),
    ...(canClose ? locked.map((t) => ({ ...t, action: "close" as const })) : []),
  ];

  if (allRows.length === 0)
    return (
      <div className="content-section">
        <EmptyState
          title="Tidak ada perjalanan dinas yang menunggu aksi"
          description="Semua perjalanan dinas yang disetujui sudah dikunci atau ditutup."
        />
      </div>
    );

  return (
    <div className="content-table overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              No. Perjalanan
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Pemohon
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Tujuan
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Periode
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Status
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
              Aksi
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
                    Kunci
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => onClose(r)}
                  >
                    Tutup
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

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label} <span className="text-red-500">*</span>
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Pilih {label}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="content-section p-4">
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    </div>
  );
}
