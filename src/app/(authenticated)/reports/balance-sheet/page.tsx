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

export default function BalanceSheetPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [asOfDate, setAsOfDate] = useState(() => toDateInputValue(new Date()));
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
      endDate: asOfDate ? new Date(`${asOfDate}T23:59:59`) : undefined,
    },
    {
      enabled: isAllowed,
      refetchOnWindowFocus: false,
    },
  );

  const dataScopeLabel = "Semua data";

  const coaAccounts = (coaQuery.data as CoaAccount[] | undefined) ?? [];
  const journals = ((journalQuery.data as { journalEntries: JournalEntry[] } | undefined)?.journalEntries ?? []);

  const report = useMemo(() => {
    const relevantAccounts = coaAccounts.filter((account) =>
      ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"].includes(account.accountType),
    );

    const accountMap = new Map(
      relevantAccounts.map((account) => [
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

    const assets = Array.from(accountMap.values())
      .filter((account) => account.accountType === "ASSET" && Math.abs(account.amount) > 0.001)
      .sort((a, b) => a.code.localeCompare(b.code));
    const liabilities = Array.from(accountMap.values())
      .filter((account) => account.accountType === "LIABILITY" && Math.abs(account.amount) > 0.001)
      .sort((a, b) => a.code.localeCompare(b.code));
    const equities = Array.from(accountMap.values())
      .filter((account) => account.accountType === "EQUITY" && Math.abs(account.amount) > 0.001)
      .sort((a, b) => a.code.localeCompare(b.code));
    const revenues = Array.from(accountMap.values()).filter((account) => account.accountType === "REVENUE");
    const expenses = Array.from(accountMap.values()).filter((account) => account.accountType === "EXPENSE");

    const totalAssets = assets.reduce((sum, account) => sum + account.amount, 0);
    const totalLiabilities = liabilities.reduce((sum, account) => sum + account.amount, 0);
    const totalEquity = equities.reduce((sum, account) => sum + account.amount, 0);
    const currentEarnings =
      revenues.reduce((sum, account) => sum + account.amount, 0) -
      expenses.reduce((sum, account) => sum + account.amount, 0);
    const totalLiabilityAndEquity = totalLiabilities + totalEquity + currentEarnings;
    const difference = totalAssets - totalLiabilityAndEquity;

    return {
      assets,
      liabilities,
      equities,
      totalAssets,
      totalLiabilities,
      totalEquity,
      currentEarnings,
      totalLiabilityAndEquity,
      difference,
    };
  }, [coaAccounts, journals]);

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Neraca"
        description="Posisi aset, kewajiban, dan ekuitas sampai tanggal laporan"
        primaryAction={{ label: "Muat Ulang", onClick: () => void journalQuery.refetch() }}
        secondaryAction={{ label: "Laba Rugi", href: "/reports/income-statement" }}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Cakupan Data" value={dataScopeLabel} helper="Laporan mengikuti data global saat ini" />
        <SummaryCard label="Total Aset" value={formatCurrency(report.totalAssets)} helper="Saldo normal akun ASSET" tone="blue" />
        <SummaryCard label="Liabilitas + Ekuitas" value={formatCurrency(report.totalLiabilityAndEquity)} helper="Termasuk laba rugi berjalan" tone="green" />
        <SummaryCard
          label="Selisih Neraca"
          value={formatCurrency(report.difference)}
          helper="Idealnya 0 untuk neraca seimbang"
          tone={Math.abs(report.difference) < 0.001 ? "emerald" : "amber"}
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-medium text-gray-700">Posisi per Tanggal</span>
            <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
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
              setAsOfDate(toDateInputValue(new Date()));
              setStatusFilter("POSTED");
            }}
          >
            Reset
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Aset" description="Saldo normal debit akun aset hingga tanggal laporan">
          {coaQuery.isLoading || journalQuery.isLoading ? (
            <LoadingLine text="Memuat data aset..." />
          ) : report.assets.length === 0 ? (
            <EmptyLine text="Belum ada akun aset yang memiliki saldo pada tanggal laporan." />
          ) : (
            <div className="space-y-3">
              {report.assets.map((account) => (
                <AccountRow key={account.id} code={account.code} name={account.name} amount={account.amount} tone="blue" subtitle={account.category ?? undefined} />
              ))}
              <TotalRow label="Total Aset" amount={report.totalAssets} tone="blue" />
            </div>
          )}
        </Panel>

        <Panel title="Kewajiban & Ekuitas" description="Saldo normal kredit akun liabilitas dan ekuitas hingga tanggal laporan">
          {coaQuery.isLoading || journalQuery.isLoading ? (
            <LoadingLine text="Memuat data kewajiban dan ekuitas..." />
          ) : report.liabilities.length === 0 && report.equities.length === 0 && Math.abs(report.currentEarnings) < 0.001 ? (
            <EmptyLine text="Belum ada akun kewajiban atau ekuitas yang memiliki saldo pada tanggal laporan." />
          ) : (
            <div className="space-y-4">
              <SectionTitle text="Liabilitas" />
              {report.liabilities.length === 0 ? <EmptyLine text="Tidak ada saldo liabilitas." /> : null}
              {report.liabilities.map((account) => (
                <AccountRow key={account.id} code={account.code} name={account.name} amount={account.amount} tone="green" subtitle={account.category ?? undefined} />
              ))}
              <TotalRow label="Total Liabilitas" amount={report.totalLiabilities} tone="green" />

              <SectionTitle text="Ekuitas" />
              {report.equities.length === 0 ? <EmptyLine text="Tidak ada saldo ekuitas." /> : null}
              {report.equities.map((account) => (
                <AccountRow key={account.id} code={account.code} name={account.name} amount={account.amount} tone="emerald" subtitle={account.category ?? undefined} />
              ))}
              <div className="flex items-center justify-between rounded-lg border border-dashed border-emerald-200 bg-emerald-50 px-3 py-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Laba / (Rugi) Berjalan</p>
                  <p className="text-xs text-gray-500">Virtual line dari akun revenue dan expense yang belum di-closing</p>
                </div>
                <p className={`text-sm font-semibold ${report.currentEarnings >= 0 ? "text-emerald-700" : "text-amber-700"}`}>
                  {formatCurrency(report.currentEarnings)}
                </p>
              </div>
              <TotalRow label="Total Liabilitas + Ekuitas" amount={report.totalLiabilityAndEquity} tone="emerald" />
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Validasi Neraca" description="Aset harus sama dengan kewajiban ditambah ekuitas">
        <div className="grid gap-4 md:grid-cols-3">
          <MiniMetric label="Aset" value={formatCurrency(report.totalAssets)} tone="blue" />
          <MiniMetric label="Liabilitas + Ekuitas" value={formatCurrency(report.totalLiabilityAndEquity)} tone="green" />
          <MiniMetric label="Selisih" value={formatCurrency(report.difference)} tone={Math.abs(report.difference) < 0.001 ? "emerald" : "amber"} />
        </div>
        <p className="mt-4 text-xs text-gray-500">
          Catatan: laba/rugi berjalan ditambahkan sebagai baris virtual agar neraca tetap mencerminkan posisi akun revenue dan expense yang belum ditutup ke ekuitas.
        </p>
      </Panel>

      {!coaQuery.isLoading && !journalQuery.isLoading && report.assets.length === 0 && report.liabilities.length === 0 && report.equities.length === 0 ? (
        <EmptyState
          icon="📗"
          title="Belum ada data neraca"
          description="Tidak ditemukan saldo akun aset, kewajiban, atau ekuitas pada tenant aktif untuk tanggal laporan yang dipilih."
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
  tone?: "default" | "blue" | "green" | "amber" | "emerald";
}) {
  const tones = {
    default: "border-gray-200 bg-white",
    blue: "border-blue-200 bg-blue-50",
    green: "border-green-200 bg-green-50",
    amber: "border-amber-200 bg-amber-50",
    emerald: "border-emerald-200 bg-emerald-50",
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
  tone: "blue" | "green" | "emerald";
  subtitle?: string;
}) {
  const toneClass = {
    blue: "text-blue-700",
    green: "text-green-700",
    emerald: "text-emerald-700",
  };

  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-3">
      <div>
        <p className="text-sm font-semibold text-gray-900">{code} · {name}</p>
        {subtitle ? <p className="text-xs text-gray-500">{subtitle}</p> : null}
      </div>
      <p className={`text-sm font-semibold ${toneClass[tone]}`}>{formatCurrency(amount)}</p>
    </div>
  );
}

function TotalRow({ label, amount, tone }: { label: string; amount: number; tone: "blue" | "green" | "emerald" }) {
  const toneClass = {
    blue: "text-blue-700",
    green: "text-green-700",
    emerald: "text-emerald-700",
  };

  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-3">
      <p className="text-sm font-semibold text-gray-900">{label}</p>
      <p className={`text-sm font-bold ${toneClass[tone]}`}>{formatCurrency(amount)}</p>
    </div>
  );
}

function MiniMetric({ label, value, tone }: { label: string; value: string; tone: "blue" | "green" | "amber" | "emerald" }) {
  const toneClass = {
    blue: "border-blue-200 bg-blue-50",
    green: "border-green-200 bg-green-50",
    amber: "border-amber-200 bg-amber-50",
    emerald: "border-emerald-200 bg-emerald-50",
  };

  return (
    <div className={`rounded-lg border p-4 ${toneClass[tone]}`}>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function SectionTitle({ text }: { text: string }) {
  return <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">{text}</p>;
}

function EmptyLine({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-sm text-gray-500">{text}</p>;
}

function LoadingLine({ text }: { text: string }) {
  return <p className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-4 text-sm text-gray-500">{text}</p>;
}
