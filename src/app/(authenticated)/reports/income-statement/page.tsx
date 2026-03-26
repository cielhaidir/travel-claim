"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/features/PageHeader";
import { EmptyState } from "@/components/features/EmptyState";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/utils/format";
import type { JournalStatus } from "../../../../../generated/prisma";

type CoaAccount = {
  id: string;
  code: string;
  name: string;
  accountType: string;
  category?: string | null;
  subcategory?: string | null;
};

type JournalLine = {
  chartOfAccount: {
    id: string;
    code: string;
    name: string;
    accountType: string;
  };
  debitAmount: number;
  creditAmount: number;
};

type JournalEntry = {
  id: string;
  journalNumber: string;
  transactionDate: string | Date;
  status: JournalStatus;
  lines: JournalLine[];
};

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getNormalBalance(accountType: string, debit: number, credit: number) {
  if (accountType === "REVENUE" || accountType === "LIABILITY" || accountType === "EQUITY") {
    return credit - debit;
  }

  return debit - credit;
}

export default function IncomeStatementPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return toDateInputValue(new Date(now.getFullYear(), 0, 1));
  });
  const [endDate, setEndDate] = useState(() => toDateInputValue(new Date()));
  const [statusFilter, setStatusFilter] = useState<JournalStatus | "ALL">("POSTED");

  const userRole = session?.user?.role ?? "EMPLOYEE";
  const isAllowed = userRole === "FINANCE" || userRole === "ADMIN" || session?.user?.isRoot === true;

  useEffect(() => {
    if (session && !isAllowed) {
      void router.replace("/dashboard");
    }
  }, [session, isAllowed, router]);

  const coaQuery = api.chartOfAccount.getActiveAccounts.useQuery(
    {},
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );
  const journalQuery = api.journalEntry.list.useQuery(
    {
      limit: 100,
      status: statusFilter === "ALL" ? undefined : statusFilter,
      startDate: startDate ? new Date(`${startDate}T00:00:00`) : undefined,
      endDate: endDate ? new Date(`${endDate}T23:59:59`) : undefined,
    },
    {
      enabled: isAllowed,
      refetchOnWindowFocus: false,
    },
  );

  const activeTenantName =
    session?.user.memberships?.find((item) => item.tenantId === session.user.activeTenantId)?.tenantName ?? "-";

  const coaAccounts = (coaQuery.data as CoaAccount[] | undefined) ?? [];
  const journals = ((journalQuery.data as { journalEntries: JournalEntry[] } | undefined)?.journalEntries ?? []);

  const statement = useMemo(() => {
    const reportAccounts = coaAccounts.filter(
      (account) => account.accountType === "REVENUE" || account.accountType === "EXPENSE",
    );
    const accountMap = new Map(
      reportAccounts.map((account) => [
        account.id,
        {
          ...account,
          debit: 0,
          credit: 0,
          amount: 0,
        },
      ]),
    );

    for (const journal of journals) {
      for (const line of journal.lines) {
        const current = accountMap.get(line.chartOfAccount.id);
        if (!current) continue;

        current.debit += Number(line.debitAmount ?? 0);
        current.credit += Number(line.creditAmount ?? 0);
        current.amount = getNormalBalance(current.accountType, current.debit, current.credit);
      }
    }

    const revenues = Array.from(accountMap.values())
      .filter((account) => account.accountType === "REVENUE" && Math.abs(account.amount) > 0.001)
      .sort((a, b) => a.code.localeCompare(b.code));
    const expenses = Array.from(accountMap.values())
      .filter((account) => account.accountType === "EXPENSE" && Math.abs(account.amount) > 0.001)
      .sort((a, b) => a.code.localeCompare(b.code));

    const totalRevenue = revenues.reduce((sum, account) => sum + account.amount, 0);
    const totalExpense = expenses.reduce((sum, account) => sum + account.amount, 0);
    const netIncome = totalRevenue - totalExpense;

    const expenseByCategoryMap = new Map<string, number>();
    for (const account of expenses) {
      const key = account.category ?? "Lain-lain";
      expenseByCategoryMap.set(key, (expenseByCategoryMap.get(key) ?? 0) + account.amount);
    }

    return {
      revenues,
      expenses,
      totalRevenue,
      totalExpense,
      netIncome,
      expenseByCategory: Array.from(expenseByCategoryMap.entries())
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount),
    };
  }, [coaAccounts, journals]);

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laporan Laba Rugi"
        description="Ringkasan pendapatan, beban, dan laba rugi tenant aktif pada periode yang dipilih"
        primaryAction={{ label: "Muat Ulang", onClick: () => void journalQuery.refetch() }}
        secondaryAction={{ label: "Neraca", href: "/reports/balance-sheet" }}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Tenant Aktif" value={activeTenantName} helper="Data mengikuti tenant aktif" />
        <SummaryCard label="Total Pendapatan" value={formatCurrency(statement.totalRevenue)} helper="Akumulasi akun REVENUE" tone="green" />
        <SummaryCard label="Total Beban" value={formatCurrency(statement.totalExpense)} helper="Akumulasi akun EXPENSE" tone="amber" />
        <SummaryCard
          label="Laba / (Rugi) Bersih"
          value={formatCurrency(statement.netIncome)}
          helper="Pendapatan dikurangi beban"
          tone={statement.netIncome >= 0 ? "emerald" : "rose"}
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="space-y-2 text-sm">
            <span className="font-medium text-gray-700">Tanggal Mulai</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-gray-700">Tanggal Selesai</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-gray-700">Status Jurnal</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as JournalStatus | "ALL")} className="w-full rounded-lg border border-gray-300 px-3 py-2">
              <option value="POSTED">POSTED</option>
              <option value="ALL">Semua</option>
              <option value="DRAFT">DRAFT</option>
              <option value="VOID">VOID</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void journalQuery.refetch()}>Terapkan Filter</Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const now = new Date();
              setStartDate(toDateInputValue(new Date(now.getFullYear(), 0, 1)));
              setEndDate(toDateInputValue(now));
              setStatusFilter("POSTED");
            }}
          >
            Reset
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Pendapatan" description="Akun revenue dengan saldo kredit bersih pada periode laporan">
          {coaQuery.isLoading || journalQuery.isLoading ? (
            <LoadingLine text="Memuat data pendapatan..." />
          ) : statement.revenues.length === 0 ? (
            <EmptyLine text="Belum ada akun pendapatan yang memiliki mutasi pada periode ini." />
          ) : (
            <div className="space-y-3">
              {statement.revenues.map((account) => (
                <AccountRow key={account.id} code={account.code} name={account.name} amount={account.amount} tone="green" />
              ))}
              <TotalRow label="Total Pendapatan" amount={statement.totalRevenue} tone="green" />
            </div>
          )}
        </Panel>

        <Panel title="Beban" description="Akun expense dengan saldo debit bersih pada periode laporan">
          {coaQuery.isLoading || journalQuery.isLoading ? (
            <LoadingLine text="Memuat data beban..." />
          ) : statement.expenses.length === 0 ? (
            <EmptyLine text="Belum ada akun beban yang memiliki mutasi pada periode ini." />
          ) : (
            <div className="space-y-3">
              {statement.expenses.map((account) => (
                <AccountRow key={account.id} code={account.code} name={account.name} amount={account.amount} tone="amber" subtitle={account.category ?? undefined} />
              ))}
              <TotalRow label="Total Beban" amount={statement.totalExpense} tone="amber" />
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Ringkasan Kategori Beban" description="Akumulasi beban berdasarkan kategori COA">
          {statement.expenseByCategory.length === 0 ? (
            <EmptyLine text="Belum ada kategori beban yang dapat ditampilkan." />
          ) : (
            <div className="space-y-3">
              {statement.expenseByCategory.map((item) => (
                <div key={item.category} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-3">
                  <p className="text-sm font-semibold text-gray-900">{item.category}</p>
                  <p className="text-sm font-semibold text-amber-700">{formatCurrency(item.amount)}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Hasil Akhir Periode" description="Laba rugi bersih sebelum proses closing jurnal akhir periode">
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4">
            <p className="text-sm text-gray-600">Total Pendapatan</p>
            <p className="mt-1 text-xl font-semibold text-green-700">{formatCurrency(statement.totalRevenue)}</p>
            <p className="mt-4 text-sm text-gray-600">Total Beban</p>
            <p className="mt-1 text-xl font-semibold text-amber-700">{formatCurrency(statement.totalExpense)}</p>
            <p className="mt-4 text-sm text-gray-600">Laba / (Rugi) Bersih</p>
            <p className={`mt-1 text-2xl font-bold ${statement.netIncome >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {formatCurrency(statement.netIncome)}
            </p>
            <p className="mt-3 text-xs text-gray-500">
              Catatan: laporan ini menghitung saldo akun REVENUE dan EXPENSE dari jurnal pada periode terpilih.
            </p>
          </div>
        </Panel>
      </div>

      {!coaQuery.isLoading && !journalQuery.isLoading && statement.revenues.length === 0 && statement.expenses.length === 0 ? (
        <EmptyState
          icon="📘"
          title="Belum ada data laba rugi"
          description="Tidak ditemukan mutasi akun pendapatan atau beban pada tenant aktif untuk filter yang dipilih."
        />
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: string;
  helper: string;
  tone?: "default" | "green" | "amber" | "emerald" | "rose";
}) {
  const tones = {
    default: "border-gray-200 bg-white",
    green: "border-green-200 bg-green-50",
    amber: "border-amber-200 bg-amber-50",
    emerald: "border-emerald-200 bg-emerald-50",
    rose: "border-rose-200 bg-rose-50",
  };

  return (
    <div className={`rounded-xl border p-5 ${tones[tone]}`}>
      <p className="text-sm text-gray-600">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-2 text-xs text-gray-500">{helper}</p>
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
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

function AccountRow({
  code,
  name,
  amount,
  tone,
  subtitle,
}: {
  code: string;
  name: string;
  amount: number;
  tone: "green" | "amber";
  subtitle?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-3">
      <div>
        <p className="text-sm font-semibold text-gray-900">{code} · {name}</p>
        {subtitle ? <p className="text-xs text-gray-500">{subtitle}</p> : null}
      </div>
      <p className={`text-sm font-semibold ${tone === "green" ? "text-green-700" : "text-amber-700"}`}>
        {formatCurrency(amount)}
      </p>
    </div>
  );
}

function TotalRow({ label, amount, tone }: { label: string; amount: number; tone: "green" | "amber" }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-3">
      <p className="text-sm font-semibold text-gray-900">{label}</p>
      <p className={`text-sm font-bold ${tone === "green" ? "text-green-700" : "text-amber-700"}`}>
        {formatCurrency(amount)}
      </p>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-sm text-gray-500">{text}</p>;
}

function LoadingLine({ text }: { text: string }) {
  return <p className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-4 text-sm text-gray-500">{text}</p>;
}
