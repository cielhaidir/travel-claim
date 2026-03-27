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
import type { JournalSourceType, JournalStatus } from "../../../../../generated/prisma";

type JournalLine = {
  id: string;
  debitAmount: number;
  creditAmount: number;
  chartOfAccount: {
    code: string;
    name: string;
  };
};

type JournalEntry = {
  id: string;
  journalNumber: string;
  transactionDate: string | Date;
  description: string;
  sourceType?: JournalSourceType | null;
  status: JournalStatus;
  referenceNumber?: string | null;
  lines: JournalLine[];
};

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default function JournalReportPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<JournalStatus | "ALL">("ALL");
  const [sourceFilter, setSourceFilter] = useState<JournalSourceType | "ALL">("ALL");
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [endDate, setEndDate] = useState(() => toDateInputValue(new Date()));

  const isAllowed =
    (session?.user?.isRoot ?? false) ||
    (hasPermissionMap(session?.user?.permissions, "reports", "read") &&
      hasPermissionMap(session?.user?.permissions, "journals", "read"));

  useEffect(() => {
    if (session && !isAllowed) {
      void router.replace("/dashboard");
    }
  }, [session, isAllowed, router]);

  const { data, isLoading, refetch } = api.journalEntry.list.useQuery(
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

  const journals = ((data as { journalEntries: JournalEntry[] } | undefined)?.journalEntries ?? []);

  const summary = useMemo(() => {
    const bySource = new Map<string, { count: number; debit: number; credit: number }>();
    const byStatus = new Map<string, number>();
    let totalDebit = 0;
    let totalCredit = 0;

    for (const journal of journals) {
      const source = journal.sourceType ?? "MANUAL";
      const sourceEntry = bySource.get(source) ?? { count: 0, debit: 0, credit: 0 };
      sourceEntry.count += 1;

      for (const line of journal.lines) {
        const debit = Number(line.debitAmount ?? 0);
        const credit = Number(line.creditAmount ?? 0);
        sourceEntry.debit += debit;
        sourceEntry.credit += credit;
        totalDebit += debit;
        totalCredit += credit;
      }

      bySource.set(source, sourceEntry);
      byStatus.set(journal.status, (byStatus.get(journal.status) ?? 0) + 1);
    }

    return {
      total: journals.length,
      totalDebit,
      totalCredit,
      bySource: Array.from(bySource.entries()).map(([source, value]) => ({ source, ...value })),
      byStatus: Array.from(byStatus.entries()).map(([status, count]) => ({ status, count })),
    };
  }, [journals]);

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laporan Jurnal"
        description="Rekap jurnal berdasarkan periode, status, dan sumber transaksi"
        primaryAction={{
          label: "Muat Ulang",
          onClick: () => void refetch(),
        }}
        secondaryAction={{
          label: "Kembali ke Jurnal",
          href: "/journal",
        }}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ReportCard label="Total Jurnal" value={summary.total.toString()} helper="Jumlah jurnal pada periode filter" />
        <ReportCard label="Total Debit" value={formatCurrency(summary.totalDebit)} helper="Akumulasi debit periode filter" tone="blue" />
        <ReportCard label="Total Kredit" value={formatCurrency(summary.totalCredit)} helper="Akumulasi kredit periode filter" tone="green" />
        <ReportCard label="Cakupan Data" value="Semua Data" helper="Laporan mencakup seluruh data yang tersedia" tone="amber" />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-4">
          <label className="space-y-2 text-sm">
            <span className="font-medium text-gray-700">Tanggal Mulai</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-gray-700">Tanggal Selesai</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-gray-700">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as JournalStatus | "ALL")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="ALL">Semua</option>
              <option value="DRAFT">DRAFT</option>
              <option value="POSTED">POSTED</option>
              <option value="VOID">VOID</option>
            </select>
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-gray-700">Sumber</span>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as JournalSourceType | "ALL")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
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
          <Button size="sm" onClick={() => void refetch()}>Terapkan Filter</Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const now = new Date();
              setStartDate(toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)));
              setEndDate(toDateInputValue(now));
              setStatusFilter("ALL");
              setSourceFilter("ALL");
            }}
          >
            Reset
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ReportPanel title="Rekap per Sumber" description="Jumlah jurnal dan nilai debit/kredit per source type">
          <div className="space-y-3">
            {summary.bySource.length === 0 ? (
              <EmptyLine text="Belum ada data jurnal pada filter ini." />
            ) : (
              summary.bySource.map((item) => (
                <div key={item.source} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{item.source}</p>
                    <p className="text-xs text-gray-500">{item.count} jurnal</p>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <p>Debit: {formatCurrency(item.debit)}</p>
                    <p>Kredit: {formatCurrency(item.credit)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </ReportPanel>

        <ReportPanel title="Rekap per Status" description="Distribusi status jurnal pada filter aktif">
          <div className="space-y-3">
            {summary.byStatus.length === 0 ? (
              <EmptyLine text="Belum ada status jurnal yang bisa ditampilkan." />
            ) : (
              summary.byStatus.map((item) => (
                <div key={item.status} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-3">
                  <p className="text-sm font-semibold text-gray-900">{item.status}</p>
                  <p className="text-sm text-gray-500">{item.count} jurnal</p>
                </div>
              ))
            )}
          </div>
        </ReportPanel>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Detail Jurnal</h2>
          <p className="text-sm text-gray-500">Daftar jurnal sesuai filter laporan</p>
        </div>
        {isLoading ? (
          <div className="px-5 py-6 text-sm text-gray-500">Memuat data jurnal...</div>
        ) : journals.length === 0 ? (
          <EmptyState
            icon="🧾"
            title="Belum ada jurnal"
            description="Tidak ada jurnal untuk filter yang dipilih."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">No. Jurnal</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Tanggal</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Sumber</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Deskripsi</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Debit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Kredit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {journals.map((journal) => {
                  const totalDebit = journal.lines.reduce((sum, line) => sum + Number(line.debitAmount ?? 0), 0);
                  const totalCredit = journal.lines.reduce((sum, line) => sum + Number(line.creditAmount ?? 0), 0);

                  return (
                    <tr key={journal.id}>
                      <td className="px-4 py-3 font-mono text-gray-900">{journal.journalNumber}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(journal.transactionDate)}</td>
                      <td className="px-4 py-3 text-gray-600">{journal.sourceType ?? "MANUAL"}</td>
                      <td className="px-4 py-3 text-gray-600">{journal.status}</td>
                      <td className="px-4 py-3 text-gray-600">
                        <div>
                          <p>{journal.description}</p>
                          {journal.referenceNumber ? (
                            <p className="text-xs text-gray-400">Ref: {journal.referenceNumber}</p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-blue-700">{formatCurrency(totalDebit)}</td>
                      <td className="px-4 py-3 text-right font-medium text-green-700">{formatCurrency(totalCredit)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ReportCard({
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

function ReportPanel({
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

function EmptyLine({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-sm text-gray-500">{text}</p>;
}
