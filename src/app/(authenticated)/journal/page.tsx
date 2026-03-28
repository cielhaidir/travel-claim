"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/features/PageHeader";
import { EmptyState } from "@/components/features/EmptyState";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { hasPermissionMap } from "@/lib/auth/permissions";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import type {
  JournalSourceType,
  JournalStatus,
} from "../../../../generated/prisma";

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
  sourceType?: JournalSourceType | null;
  status: JournalStatus;
  referenceNumber?: string | null;
  createdBy?: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  postedBy?: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  claim?: {
    id: string;
    claimNumber: string;
    status: string;
  } | null;
  bailout?: {
    id: string;
    bailoutNumber: string;
    status: string;
  } | null;
  lines: JournalLine[];
};

type StatusFilter = "ALL" | JournalStatus;
type SourceFilter = "ALL" | JournalSourceType;

export default function JournalPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("ALL");
  const [selectedJournal, setSelectedJournal] = useState<JournalEntry | null>(null);

  const isAllowed =
    (session?.user?.isRoot ?? false) ||
    hasPermissionMap(session?.user?.permissions, "journals", "read");

  useEffect(() => {
    if (session && !isAllowed) {
      void router.replace("/dashboard");
    }
  }, [session, isAllowed, router]);

  const { data: journalRaw, isLoading, refetch } = api.journalEntry.list.useQuery(
    {
      limit: 100,
      status: statusFilter === "ALL" ? undefined : statusFilter,
      sourceType: sourceFilter === "ALL" ? undefined : sourceFilter,
    },
    {
      enabled: isAllowed,
      refetchOnWindowFocus: false,
    },
  );

  const journalEntries =
    (journalRaw as { journalEntries: JournalEntry[] } | undefined)?.journalEntries ?? [];

  const summary = useMemo(() => {
    return journalEntries.reduce(
      (acc, journal) => {
        acc.journals += 1;
        for (const line of journal.lines) {
          acc.debit += Number(line.debitAmount ?? 0);
          acc.credit += Number(line.creditAmount ?? 0);
        }
        return acc;
      },
      { journals: 0, debit: 0, credit: 0 },
    );
  }, [journalEntries]);

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jurnal"
        description="Lihat jurnal akuntansi double-entry untuk klaim, bailout, settlement, dan transaksi manual"
        primaryAction={{
          label: "Muat Ulang",
          onClick: () => void refetch(),
        }}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Total Jurnal" value={summary.journals.toString()} />
        <SummaryCard label="Total Debit" value={formatCurrency(summary.debit)} color="blue" />
        <SummaryCard label="Total Kredit" value={formatCurrency(summary.credit)} color="green" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <FilterCard title="Filter Status">
          <div className="flex flex-wrap gap-2">
            {(["ALL", "DRAFT", "POSTED", "VOID"] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={statusFilter === value ? "primary" : "secondary"}
                onClick={() => setStatusFilter(value)}
              >
                {value === "ALL" ? "Semua" : value}
              </Button>
            ))}
          </div>
        </FilterCard>

        <FilterCard title="Filter Sumber">
          <div className="flex flex-wrap gap-2">
            {(["ALL", "CLAIM", "BAILOUT", "SETTLEMENT", "ADJUSTMENT", "FUNDING", "MANUAL", "SALES_DELIVERY_COGS", "SALES_DELIVERY_COGS_REVERSAL", "SALES_INVOICE_AR", "SALES_INVOICE_AR_REVERSAL"] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={sourceFilter === value ? "primary" : "secondary"}
                onClick={() => setSourceFilter(value)}
              >
                {value === "ALL" ? "Semua" : value}
              </Button>
            ))}
          </div>
        </FilterCard>
      </div>

      {isLoading ? (
        <Skeleton />
      ) : journalEntries.length === 0 ? (
        <div className="rounded-lg border bg-white">
          <EmptyState
            icon="🧾"
            title="Belum ada jurnal"
            description="Jurnal akan muncul setelah transaksi keuangan diposting oleh bagian keuangan."
          />
        </div>
      ) : (
        <div className="space-y-4">
          {journalEntries.map((journal) => {
            const totalDebit = journal.lines.reduce(
              (sum, line) => sum + Number(line.debitAmount ?? 0),
              0,
            );
            const totalCredit = journal.lines.reduce(
              (sum, line) => sum + Number(line.creditAmount ?? 0),
              0,
            );
            const sourceLabel = journal.claim
              ? `Klaim · ${journal.claim.claimNumber}`
              : journal.bailout
                ? `Bailout · ${journal.bailout.bailoutNumber}`
                : journal.sourceType ?? "MANUAL";

            return (
              <div key={journal.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-sm font-semibold text-gray-900">{journal.journalNumber}</p>
                      <StatusPill status={journal.status} />
                      <SourcePill source={journal.sourceType ?? "MANUAL"} />
                    </div>
                    <p className="text-sm text-gray-500">{formatDate(journal.transactionDate)}</p>
                    <p className="text-base font-medium text-gray-900">{journal.description}</p>
                    <p className="text-sm text-gray-500">Sumber: {sourceLabel}</p>
                    {journal.referenceNumber ? (
                      <p className="text-sm text-gray-500">Referensi: {journal.referenceNumber}</p>
                    ) : null}
                  </div>

                  <div className="flex flex-col items-start gap-2 lg:items-end">
                    <div className="text-sm text-gray-500">
                      <div>Debit: <span className="font-semibold text-blue-700">{formatCurrency(totalDebit)}</span></div>
                      <div>Kredit: <span className="font-semibold text-green-700">{formatCurrency(totalCredit)}</span></div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => setSelectedJournal(journal)}>
                      Lihat Detail
                    </Button>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto rounded-lg border border-gray-100">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Baris</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Bagan Akun</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Akun Saldo</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Debit</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Kredit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {journal.lines.map((line) => (
                        <tr key={line.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-600">{line.lineNumber}</td>
                          <td className="px-4 py-3">
                            <div className="font-mono text-gray-900">{line.chartOfAccount.code}</div>
                            <div className="text-xs text-gray-500">{line.chartOfAccount.name}</div>
                          </td>
                          <td className="px-4 py-3 text-gray-500">
                            {line.balanceAccount ? (
                              <>
                                <div className="font-mono text-gray-900">{line.balanceAccount.code}</div>
                                <div className="text-xs text-gray-500">{line.balanceAccount.name}</div>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-blue-700">
                            {Number(line.debitAmount) > 0 ? formatCurrency(Number(line.debitAmount)) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-green-700">
                            {Number(line.creditAmount) > 0 ? formatCurrency(Number(line.creditAmount)) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={!!selectedJournal}
        onClose={() => setSelectedJournal(null)}
        title="Detail Jurnal"
        size="xl"
      >
        {selectedJournal && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <InfoCard label="Nomor Jurnal" value={selectedJournal.journalNumber} />
              <InfoCard label="Tanggal Transaksi" value={formatDate(selectedJournal.transactionDate)} />
              <InfoCard label="Status" value={selectedJournal.status} />
              <InfoCard label="Sumber" value={selectedJournal.sourceType ?? "MANUAL"} />
              <InfoCard label="Referensi" value={selectedJournal.referenceNumber ?? "—"} />
              <InfoCard label="Dibuat Oleh" value={selectedJournal.createdBy?.name ?? selectedJournal.createdBy?.email ?? "—"} />
            </div>

            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-700">Deskripsi</p>
              <p className="mt-1 text-sm text-gray-900">{selectedJournal.description}</p>
            </div>

            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Baris</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Bagan Akun</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Deskripsi</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Akun Saldo</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Debit</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Kredit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {selectedJournal.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-4 py-3">{line.lineNumber}</td>
                      <td className="px-4 py-3">
                        <div className="font-mono">{line.chartOfAccount.code}</div>
                        <div className="text-xs text-gray-500">{line.chartOfAccount.name}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{line.description ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {line.balanceAccount ? `${line.balanceAccount.code} - ${line.balanceAccount.name}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-700">
                        {Number(line.debitAmount) > 0 ? formatCurrency(Number(line.debitAmount)) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-green-700">
                        {Number(line.creditAmount) > 0 ? formatCurrency(Number(line.creditAmount)) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function FilterCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-gray-900">{title}</p>
      {children}
    </div>
  );
}

function StatusPill({ status }: { status: JournalStatus }) {
  const styles = {
    DRAFT: "bg-yellow-100 text-yellow-700",
    POSTED: "bg-green-100 text-green-700",
    VOID: "bg-red-100 text-red-700",
  } as const;

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status]}`}>
      {status}
    </span>
  );
}

function SourcePill({ source }: { source: JournalSourceType | "MANUAL" }) {
  return (
    <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
      {source}
    </span>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-900">{value}</p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color = "gray",
}: {
  label: string;
  value: string;
  color?: "gray" | "blue" | "green";
}) {
  const colors = {
    gray: "border-gray-200 bg-gray-50 text-gray-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    green: "border-green-200 bg-green-50 text-green-900",
  } as const;

  return (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="h-20 animate-pulse rounded-lg bg-gray-100" />
      ))}
    </div>
  );
}
