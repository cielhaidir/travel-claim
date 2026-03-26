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
import type { JournalStatus } from "../../../../../generated/prisma";

type TrialBalanceLine = {
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
  transactionDate: string | Date;
  status: JournalStatus;
  lines: TrialBalanceLine[];
};

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default function TrialBalancePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return toDateInputValue(new Date(now.getFullYear(), 0, 1));
  });
  const [endDate, setEndDate] = useState(() => toDateInputValue(new Date()));
  const [statusFilter, setStatusFilter] = useState<JournalStatus | "ALL">("POSTED");

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
      startDate: startDate ? new Date(`${startDate}T00:00:00`) : undefined,
      endDate: endDate ? new Date(`${endDate}T23:59:59`) : undefined,
    },
    {
      enabled: isAllowed,
      refetchOnWindowFocus: false,
    },
  );

  const journals = ((data as { journalEntries: JournalEntry[] } | undefined)?.journalEntries ?? []);

  const rows = useMemo(() => {
    const map = new Map<
      string,
      {
        code: string;
        name: string;
        accountType: string;
        debit: number;
        credit: number;
      }
    >();

    for (const journal of journals) {
      for (const line of journal.lines) {
        const key = line.chartOfAccount.id;
        const current = map.get(key) ?? {
          code: line.chartOfAccount.code,
          name: line.chartOfAccount.name,
          accountType: line.chartOfAccount.accountType,
          debit: 0,
          credit: 0,
        };

        current.debit += Number(line.debitAmount ?? 0);
        current.credit += Number(line.creditAmount ?? 0);
        map.set(key, current);
      }
    }

    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [journals]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.debit += row.debit;
        acc.credit += row.credit;
        acc.balance += row.debit - row.credit;
        return acc;
      },
      { debit: 0, credit: 0, balance: 0 },
    );
  }, [rows]);

  const groupedByType = useMemo(() => {
    const map = new Map<string, { count: number; debit: number; credit: number }>();

    for (const row of rows) {
      const current = map.get(row.accountType) ?? { count: 0, debit: 0, credit: 0 };
      current.count += 1;
      current.debit += row.debit;
      current.credit += row.credit;
      map.set(row.accountType, current);
    }

    return Array.from(map.entries()).map(([accountType, value]) => ({
      accountType,
      ...value,
    }));
  }, [rows]);

  if (!session || !isAllowed) return null;

  const activeTenantName =
    session.user.memberships?.find((item) => item.tenantId === session.user.activeTenantId)?.tenantName ?? "-";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trial Balance"
        description="Neraca saldo tenant aktif berdasarkan jurnal pada periode yang dipilih"
        primaryAction={{ label: "Muat Ulang", onClick: () => void refetch() }}
        secondaryAction={{ label: "Laporan Jurnal", href: "/reports/journal" }}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Tenant Aktif" value={activeTenantName} helper="Data mengikuti tenant yang dipilih" />
        <SummaryCard label="Total Debit" value={formatCurrency(totals.debit)} helper="Akumulasi debit semua akun" tone="blue" />
        <SummaryCard label="Total Kredit" value={formatCurrency(totals.credit)} helper="Akumulasi kredit semua akun" tone="green" />
        <SummaryCard label="Selisih" value={formatCurrency(totals.balance)} helper="Idealnya 0 untuk trial balance seimbang" tone={Math.abs(totals.balance) < 0.001 ? "emerald" : "amber"} />
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
          <Button size="sm" onClick={() => void refetch()}>Terapkan Filter</Button>
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
        <Panel title="Rekap per Tipe Akun" description="Distribusi trial balance per account type">
          <div className="space-y-3">
            {groupedByType.length === 0 ? (
              <EmptyLine text="Belum ada data akun pada filter ini." />
            ) : (
              groupedByType.map((group) => (
                <div key={group.accountType} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{group.accountType}</p>
                    <p className="text-xs text-gray-500">{group.count} akun</p>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <p>Debit: {formatCurrency(group.debit)}</p>
                    <p>Kredit: {formatCurrency(group.credit)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel title="Validasi Neraca Saldo" description="Trial balance sehat bila total debit = total kredit">
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4">
            <p className="text-sm text-gray-600">Total Debit</p>
            <p className="mt-1 text-xl font-semibold text-blue-700">{formatCurrency(totals.debit)}</p>
            <p className="mt-4 text-sm text-gray-600">Total Kredit</p>
            <p className="mt-1 text-xl font-semibold text-green-700">{formatCurrency(totals.credit)}</p>
            <p className="mt-4 text-sm text-gray-600">Selisih</p>
            <p className={`mt-1 text-xl font-semibold ${Math.abs(totals.balance) < 0.001 ? "text-emerald-700" : "text-amber-700"}`}>
              {formatCurrency(totals.balance)}
            </p>
          </div>
        </Panel>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Detail Trial Balance</h2>
          <p className="text-sm text-gray-500">Posisi debit, kredit, dan saldo bersih per akun</p>
        </div>
        {isLoading ? (
          <div className="px-5 py-6 text-sm text-gray-500">Memuat data trial balance...</div>
        ) : rows.length === 0 ? (
          <EmptyState icon="📗" title="Belum ada data trial balance" description="Tidak ada baris akun untuk tenant aktif pada filter yang dipilih." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Kode</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Nama Akun</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Tipe</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Debit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Kredit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Saldo Bersih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {rows.map((row) => {
                  const net = row.debit - row.credit;
                  return (
                    <tr key={row.code}>
                      <td className="px-4 py-3 font-mono text-gray-900">{row.code}</td>
                      <td className="px-4 py-3 text-gray-700">{row.name}</td>
                      <td className="px-4 py-3 text-gray-500">{row.accountType}</td>
                      <td className="px-4 py-3 text-right font-medium text-blue-700">{formatCurrency(row.debit)}</td>
                      <td className="px-4 py-3 text-right font-medium text-green-700">{formatCurrency(row.credit)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${net >= 0 ? "text-gray-900" : "text-amber-700"}`}>
                        {formatCurrency(net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-gray-900">Total</td>
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

function SummaryCard({ label, value, helper, tone = "default" }: { label: string; value: string; helper: string; tone?: "default" | "blue" | "green" | "amber" | "emerald"; }) {
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
