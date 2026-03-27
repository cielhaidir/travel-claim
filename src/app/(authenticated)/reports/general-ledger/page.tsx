"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/features/PageHeader";
import { EmptyState } from "@/components/features/EmptyState";
import { Button } from "@/components/ui/Button";
import { hasPermissionMap } from "@/lib/auth/permissions";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import type { JournalStatus } from "../../../../../generated/prisma";

type JournalLine = {
  id: string;
  description?: string | null;
  debitAmount: number;
  creditAmount: number;
  lineNumber: number;
  chartOfAccount: {
    id: string;
    code: string;
    name: string;
    accountType: string;
  };
  balanceAccount?: {
    id: string;
    code: string;
    name: string;
  } | null;
};

type JournalEntry = {
  id: string;
  journalNumber: string;
  transactionDate: string | Date;
  description: string;
  sourceType?: string | null;
  status: JournalStatus;
  referenceNumber?: string | null;
  lines: JournalLine[];
};

type CoaOption = {
  id: string;
  code: string;
  name: string;
  accountType?: string;
};

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default function GeneralLedgerPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return toDateInputValue(new Date(now.getFullYear(), 0, 1));
  });
  const [endDate, setEndDate] = useState(() => toDateInputValue(new Date()));
  const [statusFilter, setStatusFilter] = useState<JournalStatus | "ALL">("POSTED");
  const [selectedCoaId, setSelectedCoaId] = useState("");

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
      startDate: startDate ? new Date(`${startDate}T00:00:00`) : undefined,
      endDate: endDate ? new Date(`${endDate}T23:59:59`) : undefined,
    },
    {
      enabled: isAllowed,
      refetchOnWindowFocus: false,
    },
  );

  const journals = ((journalQuery.data as { journalEntries: JournalEntry[] } | undefined)?.journalEntries ?? []);

  const coaOptions = useMemo<CoaOption[]>(() => {
    const options = new Map<string, CoaOption>();

    for (const journal of journals) {
      for (const line of journal.lines) {
        options.set(line.chartOfAccount.id, {
          id: line.chartOfAccount.id,
          code: line.chartOfAccount.code,
          name: line.chartOfAccount.name,
          accountType: line.chartOfAccount.accountType,
        });
      }
    }

    return Array.from(options.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [journals]);

  useEffect(() => {
    if (!selectedCoaId && coaOptions.length > 0) {
      setSelectedCoaId(coaOptions[0]?.id ?? "");
      return;
    }

    if (selectedCoaId && !coaOptions.some((coa) => coa.id === selectedCoaId)) {
      setSelectedCoaId(coaOptions[0]?.id ?? "");
    }
  }, [coaOptions, selectedCoaId]);

  const ledgerRows = useMemo(() => {
    const rows = journals.flatMap((journal) =>
      journal.lines
        .filter((line) => line.chartOfAccount.id === selectedCoaId)
        .map((line) => ({
          journalId: journal.id,
          journalNumber: journal.journalNumber,
          transactionDate: journal.transactionDate,
          status: journal.status,
          sourceType: journal.sourceType ?? "MANUAL",
          referenceNumber: journal.referenceNumber,
          journalDescription: journal.description,
          lineDescription: line.description,
          debit: Number(line.debitAmount ?? 0),
          credit: Number(line.creditAmount ?? 0),
          lineNumber: line.lineNumber,
          balanceAccount: line.balanceAccount,
        })),
    );

    return rows
      .sort((a, b) => {
        const dateDiff = new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime();
        if (dateDiff !== 0) return dateDiff;
        if (a.journalNumber !== b.journalNumber) return a.journalNumber.localeCompare(b.journalNumber);
        return a.lineNumber - b.lineNumber;
      })
      .map((row, index, array) => {
        const runningBalance = array
          .slice(0, index + 1)
          .reduce((sum, item) => sum + item.debit - item.credit, 0);
        return {
          ...row,
          runningBalance,
        };
      });
  }, [journals, selectedCoaId]);

  const totals = useMemo(() => {
    return ledgerRows.reduce(
      (acc, row) => {
        acc.debit += row.debit;
        acc.credit += row.credit;
        acc.balance = row.runningBalance;
        return acc;
      },
      { debit: 0, credit: 0, balance: 0 },
    );
  }, [ledgerRows]);

  const selectedCoa = coaOptions.find((coa) => coa.id === selectedCoaId);
  const reportScopeLabel = "Semua Data";

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="General Ledger"
        description="Buku besar per akun COA berdasarkan jurnal dalam periode yang dipilih"
        primaryAction={{ label: "Muat Ulang", onClick: () => void journalQuery.refetch() }}
        secondaryAction={{ label: "Trial Balance", href: "/reports/trial-balance" }}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Cakupan Data" value={reportScopeLabel} helper="Laporan mencakup seluruh data yang tersedia" />
        <SummaryCard label="Akun COA" value={selectedCoa ? `${selectedCoa.code} · ${selectedCoa.name}` : "-"} helper={selectedCoa?.accountType ?? "Pilih akun untuk melihat buku besar"} tone="blue" />
        <SummaryCard label="Total Debit" value={formatCurrency(totals.debit)} helper="Akumulasi debit akun terpilih" tone="green" />
        <SummaryCard label="Running Balance" value={formatCurrency(totals.balance)} helper="Saldo berjalan akhir akun terpilih" tone="amber" />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-4">
          <label className="space-y-2 text-sm lg:col-span-2">
            <span className="font-medium text-gray-700">Akun COA</span>
            <select value={selectedCoaId} onChange={(e) => setSelectedCoaId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
              {coaOptions.length === 0 ? <option value="">Tidak ada akun</option> : null}
              {coaOptions.map((coa) => (
                <option key={coa.id} value={coa.id}>{coa.code} - {coa.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-gray-700">Tanggal Mulai</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-gray-700">Tanggal Selesai</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-4">
          <label className="space-y-2 text-sm lg:col-span-2">
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
        <Panel title="Ringkasan Akun" description="Mutasi debit, kredit, dan saldo akun COA terpilih">
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniMetric label="Debit" value={formatCurrency(totals.debit)} />
            <MiniMetric label="Kredit" value={formatCurrency(totals.credit)} />
            <MiniMetric label="Saldo Akhir" value={formatCurrency(totals.balance)} />
          </div>
        </Panel>

        <Panel title="Informasi Ledger" description="Buku besar disusun dari line jurnal pada filter aktif">
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            <p>• Data mengikuti filter akun, tanggal, dan status jurnal yang dipilih.</p>
            <p>• Running balance dihitung dari debit - kredit secara kronologis.</p>
            <p>• Untuk akurasi laporan operasional, gunakan status POSTED sebagai default.</p>
          </div>
        </Panel>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Detail General Ledger</h2>
          <p className="text-sm text-gray-500">Mutasi jurnal untuk akun COA terpilih</p>
        </div>
        {journalQuery.isLoading ? (
          <div className="px-5 py-6 text-sm text-gray-500">Memuat data general ledger...</div>
        ) : !selectedCoaId ? (
          <EmptyState icon="📙" title="Pilih akun COA" description="Pilih akun COA terlebih dahulu untuk melihat buku besar." />
        ) : ledgerRows.length === 0 ? (
          <EmptyState icon="📙" title="Belum ada mutasi ledger" description="Tidak ada baris jurnal untuk akun terpilih pada periode aktif." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Tanggal</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">No. Jurnal</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Deskripsi</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Sumber</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Debit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Kredit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {ledgerRows.map((row) => (
                  <tr key={`${row.journalId}-${row.lineNumber}`}>
                    <td className="px-4 py-3 text-gray-600">{formatDate(row.transactionDate)}</td>
                    <td className="px-4 py-3 font-mono text-gray-900">{row.journalNumber}</td>
                    <td className="px-4 py-3 text-gray-600">
                      <div>
                        <p>{row.lineDescription ?? row.journalDescription}</p>
                        {row.referenceNumber ? <p className="text-xs text-gray-400">Ref: {row.referenceNumber}</p> : null}
                        {row.balanceAccount ? <p className="text-xs text-gray-400">Balance: {row.balanceAccount.code} - {row.balanceAccount.name}</p> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{row.sourceType}</td>
                    <td className="px-4 py-3 text-right font-medium text-blue-700">{formatCurrency(row.debit)}</td>
                    <td className="px-4 py-3 text-right font-medium text-green-700">{formatCurrency(row.credit)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${row.runningBalance >= 0 ? "text-gray-900" : "text-amber-700"}`}>
                      {formatCurrency(row.runningBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-900">Total</td>
                  <td className="px-4 py-3 text-right font-semibold text-blue-700">{formatCurrency(totals.debit)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-700">{formatCurrency(totals.credit)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(totals.balance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
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
  tone?: "default" | "blue" | "green" | "amber";
}) {
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

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}
