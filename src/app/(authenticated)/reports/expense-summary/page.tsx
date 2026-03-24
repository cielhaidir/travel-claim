"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/features/PageHeader";
import { EmptyState } from "@/components/features/EmptyState";
import { Button } from "@/components/ui/Button";
import { hasPermissionMap } from "@/lib/auth/permissions";
import { formatCurrency } from "@/lib/utils/format";
import type { JournalSourceType, JournalStatus } from "../../../../../generated/prisma";

type JournalLine = {
  id: string;
  debitAmount: number;
  creditAmount: number;
  chartOfAccount: {
    id: string;
    code: string;
    name: string;
    accountType: string;
    category?: string;
  };
};

type JournalEntry = {
  id: string;
  journalNumber: string;
  transactionDate: string | Date;
  description: string;
  sourceType?: JournalSourceType | null;
  status: JournalStatus;
  lines: JournalLine[];
};

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default function ExpenseSummaryPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [endDate, setEndDate] = useState(() => toDateInputValue(new Date()));
  const [statusFilter, setStatusFilter] = useState<JournalStatus | "ALL">("POSTED");
  const [sourceFilter, setSourceFilter] = useState<JournalSourceType | "ALL">("ALL");

  const isAllowed =
    (session?.user?.isRoot ?? false) ||
    (hasPermissionMap(session?.user?.permissions, "reports", "read") &&
      hasPermissionMap(session?.user?.permissions, "journals", "read"));

  useEffect(() => {
    if (session && !isAllowed) {
      void router.replace("/dashboard");
    }
  }, [session, isAllowed, router]);

  const journalQuery = api.journalEntry.list.useQuery(
    {
      limit: 100,
      status: statusFilter === "ALL" ? undefined : statusFilter,
      sourceType: sourceFilter === "ALL" ? undefined : sourceFilter,
      startDate: startDate ? new Date(`${startDate}T00:00:00`) : undefined,
      endDate: endDate ? new Date(`${endDate}T23:59:59`) : undefined,
    },
    {
      enabled: isAllowed,
      refetchOnWindowFocus: false,
    },
  );

  const journals = ((journalQuery.data as { journalEntries: JournalEntry[] } | undefined)?.journalEntries ?? []);

  const expenseLines = useMemo(() => {
    return journals.flatMap((journal) =>
      journal.lines
        .filter((line) => line.chartOfAccount.accountType === "EXPENSE")
        .map((line) => ({
          journalId: journal.id,
          journalNumber: journal.journalNumber,
          transactionDate: journal.transactionDate,
          sourceType: journal.sourceType ?? "MANUAL",
          description: journal.description,
          accountId: line.chartOfAccount.id,
          accountCode: line.chartOfAccount.code,
          accountName: line.chartOfAccount.name,
          amount: Number(line.debitAmount ?? 0) - Number(line.creditAmount ?? 0),
        }))
        .filter((line) => Math.abs(line.amount) > 0.001),
    );
  }, [journals]);

  const summary = useMemo(() => {
    const byCoa = new Map<string, { code: string; name: string; total: number; count: number }>();
    const bySource = new Map<string, { total: number; count: number }>();
    let total = 0;

    for (const line of expenseLines) {
      total += line.amount;

      const coa = byCoa.get(line.accountId) ?? {
        code: line.accountCode,
        name: line.accountName,
        total: 0,
        count: 0,
      };
      coa.total += line.amount;
      coa.count += 1;
      byCoa.set(line.accountId, coa);

      const source = bySource.get(line.sourceType) ?? { total: 0, count: 0 };
      source.total += line.amount;
      source.count += 1;
      bySource.set(line.sourceType, source);
    }

    return {
      total,
      lineCount: expenseLines.length,
      distinctAccounts: byCoa.size,
      byCoa: Array.from(byCoa.values()).sort((a, b) => b.total - a.total),
      bySource: Array.from(bySource.entries()).map(([source, value]) => ({ source, ...value })).sort((a, b) => b.total - a.total),
      topTransactions: [...expenseLines].sort((a, b) => b.amount - a.amount).slice(0, 10),
    };
  }, [expenseLines]);

  const activeTenantName =
    session?.user.memberships?.find((item) => item.tenantId === session.user.activeTenantId)?.tenantName ?? "-";

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expense Summary"
        description="Ringkasan beban tenant aktif berdasarkan akun expense dan sumber jurnal"
        primaryAction={{ label: "Muat Ulang", onClick: () => void journalQuery.refetch() }}
        secondaryAction={{ label: "General Ledger", href: "/reports/general-ledger" }}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Tenant Aktif" value={activeTenantName} helper="Data mengikuti tenant aktif" />
        <SummaryCard label="Total Beban" value={formatCurrency(summary.total)} helper="Akumulasi akun bertipe EXPENSE" tone="amber" />
        <SummaryCard label="Baris Expense" value={summary.lineCount.toString()} helper="Jumlah line jurnal expense pada filter" tone="blue" />
        <SummaryCard label="Akun Expense" value={summary.distinctAccounts.toString()} helper="Jumlah akun expense yang terpakai" tone="green" />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-4">
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
          <label className="space-y-2 text-sm">
            <span className="font-medium text-gray-700">Sumber</span>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as JournalSourceType | "ALL")} className="w-full rounded-lg border border-gray-300 px-3 py-2">
              <option value="ALL">Semua</option>
              <option value="CLAIM">CLAIM</option>
              <option value="BAILOUT">BAILOUT</option>
              <option value="SETTLEMENT">SETTLEMENT</option>
              <option value="ADJUSTMENT">ADJUSTMENT</option>
              <option value="FUNDING">FUNDING</option>
              <option value="MANUAL">MANUAL</option>
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
              setStartDate(toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)));
              setEndDate(toDateInputValue(now));
              setStatusFilter("POSTED");
              setSourceFilter("ALL");
            }}
          >
            Reset
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Rekap per Akun Expense" description="Akun expense dengan akumulasi beban terbesar">
          <div className="space-y-3">
            {summary.byCoa.length === 0 ? (
              <EmptyLine text="Belum ada akun expense pada filter ini." />
            ) : (
              summary.byCoa.slice(0, 10).map((item) => (
                <div key={item.code} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{item.code} · {item.name}</p>
                    <p className="text-xs text-gray-500">{item.count} line jurnal</p>
                  </div>
                  <p className="text-sm font-semibold text-amber-700">{formatCurrency(item.total)}</p>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel title="Rekap per Sumber" description="Kontribusi expense berdasarkan source jurnal">
          <div className="space-y-3">
            {summary.bySource.length === 0 ? (
              <EmptyLine text="Belum ada source expense pada filter ini." />
            ) : (
              summary.bySource.map((item) => (
                <div key={item.source} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{item.source}</p>
                    <p className="text-xs text-gray-500">{item.count} line jurnal</p>
                  </div>
                  <p className="text-sm font-semibold text-amber-700">{formatCurrency(item.total)}</p>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Top Expense Transactions</h2>
          <p className="text-sm text-gray-500">Line jurnal expense terbesar pada tenant aktif</p>
        </div>
        {journalQuery.isLoading ? (
          <div className="px-5 py-6 text-sm text-gray-500">Memuat expense summary...</div>
        ) : summary.topTransactions.length === 0 ? (
          <EmptyState icon="📒" title="Belum ada expense transaction" description="Tidak ada line expense pada tenant aktif untuk filter yang dipilih." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">No. Jurnal</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Tanggal</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Sumber</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Akun Expense</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Deskripsi</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Nilai</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {summary.topTransactions.map((item) => (
                  <tr key={`${item.journalId}-${item.accountId}`}>
                    <td className="px-4 py-3 font-mono text-gray-900">{item.journalNumber}</td>
                    <td className="px-4 py-3 text-gray-600">{new Date(item.transactionDate).toLocaleDateString("id-ID")}</td>
                    <td className="px-4 py-3 text-gray-500">{item.sourceType}</td>
                    <td className="px-4 py-3 text-gray-700">{item.accountCode} · {item.accountName}</td>
                    <td className="px-4 py-3 text-gray-600">{item.description}</td>
                    <td className="px-4 py-3 text-right font-semibold text-amber-700">{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, helper, tone = "default" }: { label: string; value: string; helper: string; tone?: "default" | "blue" | "green" | "amber"; }) {
  const tones = {
    default: "border-gray-200 bg-white",
    blue: "border-blue-200 bg-blue-50",
    green: "border-green-200 bg-green-50",
    amber: "border-amber-200 bg-amber-50",
  };

  return (
    <div className={`rounded-xl border p-5 ${tones[tone]}`}>
      <p className="text-sm text-gray-600">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-2 text-xs text-gray-500">{helper}</p>
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode; }) {
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

function EmptyLine({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-sm text-gray-500">{text}</p>;
}
