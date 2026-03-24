"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/features/PageHeader";
import { StatusBadge } from "@/components/features/StatusBadge";
import { hasPermissionMap } from "@/lib/auth/permissions";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import type { ClaimStatus, TravelStatus } from "../../../../generated/prisma";

type FinanceDashboardData = {
  overview: {
    totalApproved: number;
    totalPaid: number;
    pendingPayment: number;
  };
  pendingPayments: {
    count: number;
    total: number;
  };
  recentPayments: Array<{
    id: string;
    claimNumber: string;
    amount: number;
    paidAt?: string | Date | null;
    submitter?: {
      name: string | null;
      employeeId: string | null;
    } | null;
    travelRequest?: {
      requestNumber: string;
      destination: string;
    } | null;
  }>;
};

type BalanceAccountList = {
  balanceAccounts: Array<{
    id: string;
    code: string;
    name: string;
    balance: number;
    isActive: boolean;
  }>;
};

type JournalList = {
  journalEntries: Array<{
    id: string;
    journalNumber: string;
    transactionDate: string | Date;
    description: string;
    status: string;
    sourceType?: string | null;
  }>;
};

type CoaList = {
  accounts: Array<{
    id: string;
    accountType: string;
    isActive: boolean;
  }>;
};

type TravelRequestItem = {
  id: string;
  requestNumber: string;
  destination: string;
  status: TravelStatus;
  startDate: string | Date;
};

type ClaimItem = {
  id: string;
  claimNumber: string;
  claimType: string;
  status: ClaimStatus;
  amount: number;
  travelRequest: {
    destination: string;
  };
};

type MyDashboardData = {
  travelRequests: {
    total: number;
    recent: TravelRequestItem[];
  };
  claims: {
    total: number;
    recent: ClaimItem[];
  };
  approvals: {
    pending: number;
  };
  notifications: {
    unread: number;
  };
  recentActivity?: Array<{
    id: string;
    requestNumber?: string;
    status?: string;
    createdAt?: string | Date;
  }>;
};

type QuickLinkItem = {
  href: string;
  label: string;
  description: string;
};

export function TenantDashboard() {
  const { data: session } = useSession();
  const isRoot = session?.user.isRoot === true;
  const permissions = session?.user.permissions;

  const currentMembership =
    session?.user.memberships?.find(
      (membership) =>
        membership.status === "ACTIVE" &&
        membership.tenantId === session.user.activeTenantId,
    ) ?? null;

  const canReadTravel = isRoot || hasPermissionMap(permissions, "travel", "read");
  const canCreateTravel =
    isRoot || hasPermissionMap(permissions, "travel", "create");
  const canReadClaims = isRoot || hasPermissionMap(permissions, "claims", "read");
  const canCreateClaims =
    isRoot || hasPermissionMap(permissions, "claims", "create");
  const canReadApprovals =
    isRoot || hasPermissionMap(permissions, "approvals", "read");
  const canReadBailout =
    isRoot || hasPermissionMap(permissions, "bailout", "read");
  const canDisburseBailout =
    isRoot || hasPermissionMap(permissions, "bailout", "disburse");
  const canPayClaims = isRoot || hasPermissionMap(permissions, "claims", "pay");
  const canReadAccounting =
    isRoot || hasPermissionMap(permissions, "accounting", "read");
  const canReadCoa =
    isRoot || hasPermissionMap(permissions, "chart-of-accounts", "read");
  const canReadBalanceAccounts =
    isRoot || hasPermissionMap(permissions, "balance-accounts", "read");
  const canReadJournals =
    isRoot || hasPermissionMap(permissions, "journals", "read");
  const canCreateJournals =
    isRoot || hasPermissionMap(permissions, "journals", "create");
  const canReadReports =
    isRoot ||
    (hasPermissionMap(permissions, "reports", "read") && canReadJournals);
  const canLockTravel = isRoot || hasPermissionMap(permissions, "travel", "lock");
  const canCloseTravel =
    isRoot || hasPermissionMap(permissions, "travel", "close");

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
  const canAccessFinanceDashboard =
    canUseBailoutDisbursement ||
    canUseClaimPayment ||
    canUseSettlement ||
    canUseTravelActions;
  const showFinanceSection =
    canAccessFinanceDashboard ||
    canReadAccounting ||
    canReadCoa ||
    canReadBalanceAccounts ||
    canReadJournals ||
    canReadReports;

  const quickLinks: QuickLinkItem[] = [
    canReadTravel
      ? {
          href: "/travel",
          label: "Perjalanan Dinas",
          description: canCreateTravel
            ? "Buat dan pantau pengajuan"
            : "Lihat pengajuan tenant aktif",
        }
      : null,
    canReadClaims
      ? {
          href: "/claims",
          label: "Klaim",
          description: canCreateClaims
            ? "Lihat dan ajukan klaim"
            : "Lihat klaim tenant aktif",
        }
      : null,
    canReadApprovals
      ? {
          href: "/approvals",
          label: "Persetujuan",
          description: "Review approval tenant aktif",
        }
      : null,
    canAccessFinanceDashboard
      ? {
          href: "/finance",
          label: "Keuangan",
          description: "Proses claim, bailout, settlement",
        }
      : null,
    canReadJournals
      ? {
          href: "/journal",
          label: "Jurnal",
          description: "Lihat jurnal tenant aktif",
        }
      : null,
    canReadReports
      ? {
          href: "/reports/journal",
          label: "Laporan Jurnal",
          description: "Rekap jurnal tenant aktif",
        }
      : null,
    canReadReports
      ? {
          href: "/reports/trial-balance",
          label: "Trial Balance",
          description: "Neraca saldo tenant aktif",
        }
      : null,
    canReadReports
      ? {
          href: "/reports/general-ledger",
          label: "General Ledger",
          description: "Buku besar per akun tenant aktif",
        }
      : null,
    canReadReports
      ? {
          href: "/reports/expense-summary",
          label: "Expense Summary",
          description: "Ringkasan beban tenant aktif",
        }
      : null,
    canReadAccounting
      ? {
          href: "/accounting",
          label: "Accounting",
          description: "Kelola balance account",
        }
      : null,
    canReadCoa
      ? {
          href: "/chart-of-accounts",
          label: "Bagan Akun",
          description: "Kelola COA tenant aktif",
        }
      : null,
  ].filter((link): link is QuickLinkItem => link !== null);

  const myDashboardQuery = api.dashboard.getMyDashboard.useQuery(
    {},
    { enabled: !!session?.user, refetchOnWindowFocus: false },
  );

  const financeDashboardQuery = api.dashboard.getFinanceDashboard.useQuery(
    {},
    {
      enabled: !!session?.user && canUseClaimPayment,
      refetchOnWindowFocus: false,
    },
  );

  const coaQuery = api.chartOfAccount.getAll.useQuery(
    { limit: 100 },
    { enabled: !!session?.user && canReadCoa, refetchOnWindowFocus: false },
  );

  const balanceQuery = api.balanceAccount.list.useQuery(
    { limit: 200 },
    {
      enabled: !!session?.user && canReadBalanceAccounts,
      refetchOnWindowFocus: false,
    },
  );

  const journalQuery = api.journalEntry.list.useQuery(
    { limit: 10 },
    {
      enabled: !!session?.user && canReadJournals,
      refetchOnWindowFocus: false,
    },
  );

  const isLoading =
    myDashboardQuery.isLoading ||
    (showFinanceSection &&
      ((canUseClaimPayment && financeDashboardQuery.isLoading) ||
        (canReadCoa && coaQuery.isLoading) ||
        (canReadBalanceAccounts && balanceQuery.isLoading) ||
        (canReadJournals && journalQuery.isLoading)));

  const myDashboard = myDashboardQuery.data as MyDashboardData | undefined;
  const financeDashboard = financeDashboardQuery.data as
    | FinanceDashboardData
    | undefined;
  const coaData = coaQuery.data as CoaList | undefined;
  const balanceData = balanceQuery.data as BalanceAccountList | undefined;
  const journalData = journalQuery.data as JournalList | undefined;
  const data = myDashboard;

  const coaSummary = useMemo(() => {
    const accounts = coaData?.accounts ?? [];
    return {
      total: accounts.length,
      active: accounts.filter((account) => account.isActive).length,
      expense: accounts.filter((account) => account.accountType === "EXPENSE")
        .length,
      asset: accounts.filter((account) => account.accountType === "ASSET").length,
    };
  }, [coaData]);

  const balanceSummary = useMemo(() => {
    const accounts = balanceData?.balanceAccounts ?? [];
    return {
      total: accounts.length,
      active: accounts.filter((account) => account.isActive).length,
      amount: accounts.reduce(
        (sum, account) => sum + Number(account.balance ?? 0),
        0,
      ),
      topAccounts: [...accounts]
        .sort((a, b) => Number(b.balance ?? 0) - Number(a.balance ?? 0))
        .slice(0, 5),
    };
  }, [balanceData]);

  const journalSummary = useMemo(() => {
    const journals = journalData?.journalEntries ?? [];
    return {
      total: journals.length,
      posted: journals.filter((journal) => journal.status === "POSTED").length,
      draft: journals.filter((journal) => journal.status === "DRAFT").length,
      recent: journals.slice(0, 5),
    };
  }, [journalData]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard Tenant"
        description={`Ringkasan operasional dan keuangan untuk tenant aktif ${currentMembership?.tenantName ?? "tanpa tenant"}`}
        badge={
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            {currentMembership?.tenantName ?? "No Active Tenant"}
          </span>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Pending Approvals"
          value={(myDashboard?.approvals.pending ?? 0).toString()}
          helper="Menunggu aksi pengguna saat ini"
          tone="info"
        />
        <MetricCard
          label="Travel Requests Saya"
          value={(myDashboard?.travelRequests.total ?? 0).toString()}
          helper="Total pengajuan perjalanan di tenant aktif"
          tone="default"
        />
        <MetricCard
          label="Klaim Saya"
          value={(myDashboard?.claims.total ?? 0).toString()}
          helper="Total klaim di tenant aktif"
          tone="warning"
        />
        <MetricCard
          label="Notifikasi Belum Dibaca"
          value={(myDashboard?.notifications.unread ?? 0).toString()}
          helper="Notifikasi tenant aktif"
          tone="success"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-lg border bg-white">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Recent Trip Requests
              </h2>
              {canReadTravel ? (
                <a
                  href="/travel"
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  View all -&gt;
                </a>
              ) : null}
            </div>
            <div className="divide-y">
              {isLoading ? (
                <p className="px-6 py-8 text-center text-sm text-gray-500">
                  Loading...
                </p>
              ) : !data?.travelRequests.recent.length ? (
                <p className="px-6 py-8 text-center text-sm text-gray-500">
                  No trip requests yet.
                  {canCreateTravel ? (
                    <>
                      {" "}
                      <a href="/travel" className="text-blue-600 hover:underline">
                        Create one
                      </a>
                    </>
                  ) : null}
                </p>
              ) : (
                data.travelRequests.recent.map((tr) => (
                  <div
                    key={tr.id}
                    className="flex items-center justify-between px-6 py-3"
                  >
                    <div>
                      <span className="text-sm font-medium text-blue-600">
                        {tr.requestNumber}
                      </span>
                      <span className="ml-2 text-sm text-gray-700">
                        {tr.destination}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">
                        {formatDate(tr.startDate)}
                      </span>
                      <StatusBadge status={tr.status} type="travel" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-lg border bg-white">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Recent Claims
              </h2>
              {canReadClaims ? (
                <a
                  href="/claims"
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  View all -&gt;
                </a>
              ) : null}
            </div>
            <div className="divide-y">
              {isLoading ? (
                <p className="px-6 py-8 text-center text-sm text-gray-500">
                  Loading...
                </p>
              ) : !data?.claims.recent.length ? (
                <p className="px-6 py-8 text-center text-sm text-gray-500">
                  No claims yet.
                  {canCreateClaims ? (
                    <>
                      {" "}
                      <a href="/claims" className="text-blue-600 hover:underline">
                        Submit one
                      </a>
                    </>
                  ) : null}
                </p>
              ) : (
                data.claims.recent.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between px-6 py-3"
                  >
                    <div>
                      <span className="text-sm font-medium text-blue-600">
                        {c.claimNumber}
                      </span>
                      <span className="ml-2 text-xs text-gray-500">
                        {c.claimType.replace("_", " ")} |{" "}
                        {c.travelRequest.destination}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-900">
                        {formatCurrency(Number(c.amount), "IDR")}
                      </span>
                      <StatusBadge status={c.status} type="claim" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {showFinanceSection && canUseClaimPayment ? (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-6">
              <h3 className="mb-2 text-lg font-semibold text-orange-900">
                Action Required
              </h3>
              <p className="mb-4 text-sm text-orange-800">
                {financeDashboard?.pendingPayments.count ?? 0} pembayaran klaim
                masih menunggu proses.
              </p>
              {canAccessFinanceDashboard ? (
                <a
                  href="/finance"
                  className="inline-flex w-full items-center justify-center rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
                >
                  Review Now
                </a>
              ) : null}
            </div>
          ) : null}

          {quickLinks.length > 0 ? (
            <Panel title="Aksi Cepat" description="Akses utama untuk tenant aktif">
              <div className="grid gap-3 sm:grid-cols-1">
                {quickLinks.map((link) => (
                  <QuickLink
                    key={link.href}
                    href={link.href}
                    label={link.label}
                    description={link.description}
                  />
                ))}
              </div>
            </Panel>
          ) : null}
        </div>
      </div>

      {showFinanceSection ? (
        <>
          {canReadCoa || canReadBalanceAccounts || canUseClaimPayment ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {canReadCoa ? (
                <MetricCard
                  label="COA Aktif"
                  value={coaSummary.active.toString()}
                  helper={`${coaSummary.total} akun | ${coaSummary.asset} aset | ${coaSummary.expense} beban`}
                  tone="info"
                />
              ) : null}
              {canReadBalanceAccounts ? (
                <MetricCard
                  label="Balance Account Aktif"
                  value={balanceSummary.active.toString()}
                  helper={`${balanceSummary.total} akun saldo tenant aktif`}
                  tone="success"
                />
              ) : null}
              {canReadBalanceAccounts ? (
                <MetricCard
                  label="Total Saldo"
                  value={formatCurrency(balanceSummary.amount)}
                  helper="Akumulasi seluruh balance account tenant aktif"
                  tone="default"
                />
              ) : null}
              {canUseClaimPayment ? (
                <MetricCard
                  label="Pending Payment"
                  value={formatCurrency(
                    Number(financeDashboard?.pendingPayments.total ?? 0),
                  )}
                  helper={`${financeDashboard?.pendingPayments.count ?? 0} klaim approved belum dibayar`}
                  tone="warning"
                />
              ) : null}
            </div>
          ) : null}

          {canUseClaimPayment || canReadJournals || canReadBalanceAccounts ? (
            <div className="grid gap-6 xl:grid-cols-3">
              {canUseClaimPayment ? (
                <Panel
                  title="Ringkasan Finance"
                  description="Posisi klaim dan pembayaran pada tenant aktif"
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    <MiniMetric
                      label="Approved"
                      value={formatCurrency(
                        Number(financeDashboard?.overview.totalApproved ?? 0),
                      )}
                    />
                    <MiniMetric
                      label="Paid"
                      value={formatCurrency(
                        Number(financeDashboard?.overview.totalPaid ?? 0),
                      )}
                    />
                    <MiniMetric
                      label="Pending"
                      value={formatCurrency(
                        Number(financeDashboard?.overview.pendingPayment ?? 0),
                      )}
                    />
                  </div>
                </Panel>
              ) : null}

              {canReadJournals ? (
                <Panel
                  title="Jurnal Terbaru"
                  description="10 jurnal terakhir tenant aktif"
                >
                  <div className="mb-4 grid gap-3 sm:grid-cols-3">
                    <MiniMetric
                      label="Total"
                      value={journalSummary.total.toString()}
                    />
                    <MiniMetric
                      label="Posted"
                      value={journalSummary.posted.toString()}
                    />
                    <MiniMetric
                      label="Draft"
                      value={journalSummary.draft.toString()}
                    />
                  </div>
                  <div className="space-y-3">
                    {journalSummary.recent.length === 0 ? (
                      <EmptyLine text="Belum ada jurnal pada tenant ini." />
                    ) : (
                      journalSummary.recent.map((journal) => (
                        <ListRow
                          key={journal.id}
                          title={journal.journalNumber}
                          subtitle={`${journal.sourceType ?? "MANUAL"} | ${journal.description}`}
                          trailing={`${journal.status} | ${formatDate(journal.transactionDate)}`}
                        />
                      ))
                    )}
                  </div>
                </Panel>
              ) : null}

              {canReadBalanceAccounts ? (
                <Panel
                  title="Akun Saldo Teratas"
                  description="Balance account dengan saldo terbesar"
                >
                  <div className="space-y-3">
                    {balanceSummary.topAccounts.length === 0 ? (
                      <EmptyLine text="Belum ada akun saldo pada tenant ini." />
                    ) : (
                      balanceSummary.topAccounts.map((account) => (
                        <ListRow
                          key={account.id}
                          title={`${account.code} | ${account.name}`}
                          subtitle={account.isActive ? "Aktif" : "Nonaktif"}
                          trailing={formatCurrency(Number(account.balance ?? 0))}
                        />
                      ))
                    )}
                  </div>
                </Panel>
              ) : null}
            </div>
          ) : null}

          {canUseClaimPayment ? (
            <Panel
              title="Pembayaran Terakhir"
              description="Riwayat claim yang sudah dibayar"
            >
              <div className="space-y-3">
                {(financeDashboard?.recentPayments ?? []).length === 0 ? (
                  <EmptyLine text="Belum ada pembayaran claim pada tenant ini." />
                ) : (
                  (financeDashboard?.recentPayments ?? []).slice(0, 5).map((payment) => (
                    <ListRow
                      key={payment.id}
                      title={`${payment.claimNumber} | ${payment.submitter?.name ?? payment.submitter?.employeeId ?? "-"}`}
                      subtitle={payment.travelRequest?.destination ?? "Tanpa tujuan"}
                      trailing={`${formatCurrency(Number(payment.amount ?? 0))} | ${payment.paidAt ? formatDate(payment.paidAt) : "-"}`}
                    />
                  ))
                )}
              </div>
            </Panel>
          ) : null}
        </>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-gray-500">Memuat dashboard tenant...</p>
      ) : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: "default" | "info" | "warning" | "success";
}) {
  const tones = {
    default: "border-gray-200 bg-white",
    info: "border-blue-200 bg-blue-50",
    warning: "border-amber-200 bg-amber-50",
    success: "border-green-200 bg-green-50",
  };

  return (
    <div className={`rounded-xl border p-5 ${tones[tone]}`}>
      <p className="text-sm text-gray-600">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-2 text-xs text-gray-500">{helper}</p>
    </div>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      {children}
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function ListRow({
  title,
  subtitle,
  trailing,
}: {
  title: string;
  subtitle: string;
  trailing: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-gray-100 px-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-gray-900">{title}</p>
        <p className="truncate text-xs text-gray-500">{subtitle}</p>
      </div>
      <p className="text-right text-xs text-gray-500">{trailing}</p>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-sm text-gray-500">
      {text}
    </p>
  );
}

function QuickLink({
  href,
  label,
  description,
}: {
  href: string;
  label: string;
  description: string;
}) {
  return (
    <a
      href={href}
      className="rounded-xl border border-gray-200 bg-gray-50 p-4 transition hover:bg-gray-100"
    >
      <p className="text-sm font-semibold text-gray-900">{label}</p>
      <p className="mt-1 text-xs text-gray-500">{description}</p>
      <div className="mt-3">
        <span className="inline-flex rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700">
          Buka
        </span>
      </div>
    </a>
  );
}
