"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/features/PageHeader";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatDate } from "@/lib/utils/format";

const FINANCE_ROLES = new Set(["FINANCE", "ADMIN", "ROOT"]);

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

type MyDashboardData = {
  travelRequests: {
    total: number;
  };
  claims: {
    total: number;
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

export function TenantDashboard() {
  const { data: session } = useSession();

  const currentMembership =
    session?.user.memberships?.find(
      (membership) =>
        membership.status === "ACTIVE" &&
        membership.tenantId === session.user.activeTenantId,
    ) ?? null;

  const userRole = session?.user.role ?? "EMPLOYEE";
  const isFinance = FINANCE_ROLES.has(userRole) || session?.user.isRoot === true;

  const myDashboardQuery = api.dashboard.getMyDashboard.useQuery(
    {},
    { enabled: !!session?.user, refetchOnWindowFocus: false },
  );

  const financeDashboardQuery = api.dashboard.getFinanceDashboard.useQuery(
    {},
    { enabled: !!session?.user && isFinance, refetchOnWindowFocus: false },
  );

  const coaQuery = api.chartOfAccount.getAll.useQuery(
    { limit: 100 },
    { enabled: !!session?.user && isFinance, refetchOnWindowFocus: false },
  );

  const balanceQuery = api.balanceAccount.list.useQuery(
    { limit: 200 },
    { enabled: !!session?.user && isFinance, refetchOnWindowFocus: false },
  );

  const journalQuery = api.journalEntry.list.useQuery(
    { limit: 10 },
    { enabled: !!session?.user && isFinance, refetchOnWindowFocus: false },
  );

  const isLoading =
    myDashboardQuery.isLoading ||
    (isFinance &&
      (financeDashboardQuery.isLoading ||
        coaQuery.isLoading ||
        balanceQuery.isLoading ||
        journalQuery.isLoading));

  const myDashboard = myDashboardQuery.data as MyDashboardData | undefined;
  const financeDashboard = financeDashboardQuery.data as FinanceDashboardData | undefined;
  const coaData = coaQuery.data as CoaList | undefined;
  const balanceData = balanceQuery.data as BalanceAccountList | undefined;
  const journalData = journalQuery.data as JournalList | undefined;

  const coaSummary = useMemo(() => {
    const accounts = coaData?.accounts ?? [];
    return {
      total: accounts.length,
      active: accounts.filter((account) => account.isActive).length,
      expense: accounts.filter((account) => account.accountType === "EXPENSE").length,
      asset: accounts.filter((account) => account.accountType === "ASSET").length,
    };
  }, [coaData]);

  const balanceSummary = useMemo(() => {
    const accounts = balanceData?.balanceAccounts ?? [];
    return {
      total: accounts.length,
      active: accounts.filter((account) => account.isActive).length,
      amount: accounts.reduce((sum, account) => sum + Number(account.balance ?? 0), 0),
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

      {isFinance ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="COA Aktif"
              value={coaSummary.active.toString()}
              helper={`${coaSummary.total} akun · ${coaSummary.asset} aset · ${coaSummary.expense} beban`}
              tone="info"
            />
            <MetricCard
              label="Balance Account Aktif"
              value={balanceSummary.active.toString()}
              helper={`${balanceSummary.total} akun saldo tenant aktif`}
              tone="success"
            />
            <MetricCard
              label="Total Saldo"
              value={formatCurrency(balanceSummary.amount)}
              helper="Akumulasi seluruh balance account tenant aktif"
              tone="default"
            />
            <MetricCard
              label="Pending Payment"
              value={formatCurrency(Number(financeDashboard?.pendingPayments.total ?? 0))}
              helper={`${financeDashboard?.pendingPayments.count ?? 0} klaim approved belum dibayar`}
              tone="warning"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Panel title="Ringkasan Finance" description="Posisi klaim dan pembayaran pada tenant aktif">
              <div className="grid gap-3 sm:grid-cols-3">
                <MiniMetric label="Approved" value={formatCurrency(Number(financeDashboard?.overview.totalApproved ?? 0))} />
                <MiniMetric label="Paid" value={formatCurrency(Number(financeDashboard?.overview.totalPaid ?? 0))} />
                <MiniMetric label="Pending" value={formatCurrency(Number(financeDashboard?.overview.pendingPayment ?? 0))} />
              </div>
            </Panel>

            <Panel title="Jurnal Terbaru" description="10 jurnal terakhir tenant aktif">
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <MiniMetric label="Total" value={journalSummary.total.toString()} />
                <MiniMetric label="Posted" value={journalSummary.posted.toString()} />
                <MiniMetric label="Draft" value={journalSummary.draft.toString()} />
              </div>
              <div className="space-y-3">
                {journalSummary.recent.length === 0 ? (
                  <EmptyLine text="Belum ada jurnal pada tenant ini." />
                ) : (
                  journalSummary.recent.map((journal) => (
                    <ListRow
                      key={journal.id}
                      title={journal.journalNumber}
                      subtitle={`${journal.sourceType ?? "MANUAL"} · ${journal.description}`}
                      trailing={`${journal.status} · ${formatDate(journal.transactionDate)}`}
                    />
                  ))
                )}
              </div>
            </Panel>

            <Panel title="Akun Saldo Teratas" description="Balance account dengan saldo terbesar">
              <div className="space-y-3">
                {balanceSummary.topAccounts.length === 0 ? (
                  <EmptyLine text="Belum ada akun saldo pada tenant ini." />
                ) : (
                  balanceSummary.topAccounts.map((account) => (
                    <ListRow
                      key={account.id}
                      title={`${account.code} · ${account.name}`}
                      subtitle={account.isActive ? "Aktif" : "Nonaktif"}
                      trailing={formatCurrency(Number(account.balance ?? 0))}
                    />
                  ))
                )}
              </div>
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Pembayaran Terakhir" description="Riwayat claim yang sudah dibayar">
              <div className="space-y-3">
                {(financeDashboard?.recentPayments ?? []).length === 0 ? (
                  <EmptyLine text="Belum ada pembayaran claim pada tenant ini." />
                ) : (
                  (financeDashboard?.recentPayments ?? []).slice(0, 5).map((payment) => (
                    <ListRow
                      key={payment.id}
                      title={`${payment.claimNumber} · ${payment.submitter?.name ?? payment.submitter?.employeeId ?? "-"}`}
                      subtitle={payment.travelRequest?.destination ?? "Tanpa tujuan"}
                      trailing={`${formatCurrency(Number(payment.amount ?? 0))} · ${payment.paidAt ? formatDate(payment.paidAt) : "-"}`}
                    />
                  ))
                )}
              </div>
            </Panel>

            <Panel title="Aksi Cepat" description="Navigasi cepat tenant aktif">
              <div className="grid gap-3 sm:grid-cols-2">
                <QuickLink href="/finance" label="Keuangan" description="Proses claim, bailout, settlement" />
                <QuickLink href="/journal" label="Jurnal" description="Lihat jurnal tenant aktif" />
                <QuickLink href="/reports/journal" label="Laporan Jurnal" description="Rekap jurnal tenant aktif" />
                <QuickLink href="/reports/trial-balance" label="Trial Balance" description="Neraca saldo tenant aktif" />
                <QuickLink href="/reports/general-ledger" label="General Ledger" description="Buku besar per akun tenant aktif" />
                <QuickLink href="/reports/expense-summary" label="Expense Summary" description="Ringkasan beban tenant aktif" />
                <QuickLink href="/accounting" label="Accounting" description="Kelola balance account" />
                <QuickLink href="/accounting" label="Detail Akun Saldo" description="Masuk ke daftar dan drill-down mutasi akun" />
                <QuickLink href="/chart-of-accounts" label="Bagan Akun" description="Kelola COA tenant aktif" />
              </div>
            </Panel>
          </div>
        </>
      ) : (
        <Panel title="Aksi Cepat" description="Akses utama untuk tenant aktif">
          <div className="grid gap-3 sm:grid-cols-3">
            <QuickLink href="/travel" label="Perjalanan Dinas" description="Buat dan pantau pengajuan" />
            <QuickLink href="/claims" label="Klaim" description="Lihat dan ajukan klaim" />
            <QuickLink href="/approvals" label="Persetujuan" description="Review approval tenant aktif" />
          </div>
        </Panel>
      )}

      {isLoading ? <p className="text-sm text-gray-500">Memuat dashboard tenant...</p> : null}
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
  return <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-sm text-gray-500">{text}</p>;
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
    <a href={href} className="rounded-xl border border-gray-200 bg-gray-50 p-4 transition hover:bg-gray-100">
      <p className="text-sm font-semibold text-gray-900">{label}</p>
      <p className="mt-1 text-xs text-gray-500">{description}</p>
      <div className="mt-3">
        <Button size="sm" variant="secondary">Buka</Button>
      </div>
    </a>
  );
}
