"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/features/PageHeader";
import { EmptyState } from "@/components/features/EmptyState";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import * as XLSX from "xlsx";
import type { BailoutStatus, JournalSourceType, JournalStatus } from "../../../../../generated/prisma";

type Bailout = {
  id: string;
  bailoutNumber: string;
  amount: number;
  status: BailoutStatus;
  createdAt: string | Date;
  disbursedAt?: string | Date | null;
  description: string;
  requester: {
    id: string;
    name: string | null;
    employeeId: string | null;
  };
  travelRequest: {
    id: string;
    requestNumber: string;
    destination: string;
    status: string;
  };
};

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
};

type JournalEntry = {
  id: string;
  journalNumber: string;
  transactionDate: string | Date;
  description: string;
  sourceType?: JournalSourceType | null;
  status: JournalStatus;
  referenceNumber?: string | null;
  bailout?: {
    id: string;
    bailoutNumber: string;
  } | null;
  lines: JournalLine[];
};

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function diffDays(from: string | Date, to = new Date()) {
  const start = new Date(from);
  const end = new Date(to);
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function getAgingBucket(days: number) {
  if (days <= 30) return "0-30 hari";
  if (days <= 60) return "31-60 hari";
  if (days <= 90) return "61-90 hari";
  return ">90 hari";
}

const CONTROL_ACCOUNT_CODES = ["1131", "1132", "2110"] as const;
type ControlAccountCode = (typeof CONTROL_ACCOUNT_CODES)[number];

export default function EmployeeAdvanceControlPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return toDateInputValue(new Date(now.getFullYear(), 0, 1));
  });
  const [endDate, setEndDate] = useState(() => toDateInputValue(new Date()));
  const [statusFilter, setStatusFilter] = useState<JournalStatus | "ALL">("POSTED");
  const [sourceFilter, setSourceFilter] = useState<JournalSourceType | "ALL">("ALL");
  const [accountFilter, setAccountFilter] = useState<ControlAccountCode | "ALL">("ALL");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [travelFilter, setTravelFilter] = useState("");

  const userRole = session?.user?.role ?? "EMPLOYEE";
  const isAllowed = userRole === "FINANCE" || userRole === "ADMIN" || session?.user?.isRoot === true;

  useEffect(() => {
    if (session && !isAllowed) {
      void router.replace("/dashboard");
    }
  }, [session, isAllowed, router]);

  const bailoutQuery = api.bailout.getAll.useQuery(
    { status: "DISBURSED", limit: 100 },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );
  const disbursedBailouts =
    ((bailoutQuery.data as { bailouts: Bailout[] } | undefined)?.bailouts ?? []);

  const journalQuery = api.journalEntry.list.useQuery(
    {
      limit: 200,
      status: statusFilter === "ALL" ? undefined : statusFilter,
      sourceType: sourceFilter === "ALL" ? undefined : sourceFilter,
      startDate: startDate ? new Date(`${startDate}T00:00:00`) : undefined,
      endDate: endDate ? new Date(`${endDate}T23:59:59`) : undefined,
    },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );
  const journals = ((journalQuery.data as { journalEntries: JournalEntry[] } | undefined)?.journalEntries ?? []);

  const postedJournals = useMemo(
    () => journals.filter((journal) => journal.status === "POSTED"),
    [journals],
  );

  const settledBailoutIds = useMemo(
    () => new Set(
      postedJournals
        .filter((journal) => journal.sourceType === "SETTLEMENT")
        .map((journal) => journal.bailout?.id)
        .filter((id): id is string => Boolean(id)),
    ),
    [postedJournals],
  );

  const bailoutInfoMap = useMemo(
    () => new Map(disbursedBailouts.map((bailout) => [bailout.id, bailout])),
    [disbursedBailouts],
  );

  const normalizedEmployeeFilter = employeeFilter.trim().toLowerCase();
  const normalizedTravelFilter = travelFilter.trim().toLowerCase();

  const outstandingBailouts = useMemo(
    () => disbursedBailouts.filter((bailout) => !settledBailoutIds.has(bailout.id)),
    [disbursedBailouts, settledBailoutIds],
  );

  const filteredOutstandingBailouts = useMemo(
    () => outstandingBailouts.filter((bailout) => {
      const employeeMatch = !normalizedEmployeeFilter || [
        bailout.requester.name,
        bailout.requester.employeeId,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedEmployeeFilter));
      const travelMatch = !normalizedTravelFilter || [
        bailout.travelRequest.requestNumber,
        bailout.travelRequest.destination,
      ].some((value) => String(value).toLowerCase().includes(normalizedTravelFilter));
      return employeeMatch && travelMatch;
    }),
    [outstandingBailouts, normalizedEmployeeFilter, normalizedTravelFilter],
  );

  const controlRows = useMemo(() => {
    return postedJournals
      .flatMap((journal) =>
        journal.lines
          .filter((line) => CONTROL_ACCOUNT_CODES.includes(line.chartOfAccount.code as ControlAccountCode))
          .map((line) => {
            const bailoutInfo = journal.bailout?.id ? bailoutInfoMap.get(journal.bailout.id) : undefined;
            return {
              journalId: journal.id,
              journalNumber: journal.journalNumber,
              transactionDate: journal.transactionDate,
              sourceType: journal.sourceType ?? "MANUAL",
              referenceNumber: journal.referenceNumber,
              journalDescription: journal.description,
              lineDescription: line.description,
              accountCode: line.chartOfAccount.code as ControlAccountCode,
              accountName: line.chartOfAccount.name,
              bailoutId: journal.bailout?.id,
              bailoutNumber: journal.bailout?.bailoutNumber,
              employeeName: bailoutInfo?.requester.name ?? null,
              employeeId: bailoutInfo?.requester.employeeId ?? null,
              travelRequestNumber: bailoutInfo?.travelRequest.requestNumber ?? null,
              destination: bailoutInfo?.travelRequest.destination ?? null,
              debit: Number(line.debitAmount ?? 0),
              credit: Number(line.creditAmount ?? 0),
              netAmount: Number(line.debitAmount ?? 0) - Number(line.creditAmount ?? 0),
            };
          }),
      )
      .filter((row) => accountFilter === "ALL" || row.accountCode === accountFilter)
      .filter((row) => {
        const employeeMatch = !normalizedEmployeeFilter || [row.employeeName, row.employeeId]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedEmployeeFilter));
        const travelMatch = !normalizedTravelFilter || [row.travelRequestNumber, row.destination, row.bailoutNumber]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedTravelFilter));
        return employeeMatch && travelMatch;
      })
      .sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime());
  }, [postedJournals, accountFilter, bailoutInfoMap, normalizedEmployeeFilter, normalizedTravelFilter]);

  const balances = useMemo(() => {
    const map = new Map<ControlAccountCode, { name: string; balance: number }>();
    for (const row of controlRows) {
      const current = map.get(row.accountCode) ?? { name: row.accountName, balance: 0 };
      current.balance += row.netAmount;
      map.set(row.accountCode, current);
    }
    return {
      advance: map.get("1131")?.balance ?? 0,
      receivable: map.get("1132")?.balance ?? 0,
      payable: Math.abs(map.get("2110")?.balance ?? 0),
    };
  }, [controlRows]);

  const sourceSummary = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>();
    for (const row of controlRows) {
      const current = map.get(row.sourceType) ?? { count: 0, amount: 0 };
      current.count += 1;
      current.amount += Math.abs(row.netAmount);
      map.set(row.sourceType, current);
    }
    return Array.from(map.entries())
      .map(([source, value]) => ({ source, ...value }))
      .sort((a, b) => b.amount - a.amount);
  }, [controlRows]);

  const advanceAgingRows = useMemo(() => (
    filteredOutstandingBailouts.map((bailout) => {
      const agingDate = bailout.disbursedAt ?? bailout.createdAt;
      const ageDays = diffDays(agingDate);
      return {
        key: bailout.id,
        bucket: getAgingBucket(ageDays),
        ageDays,
        amount: Number(bailout.amount ?? 0),
        employeeName: bailout.requester.name ?? "—",
        employeeId: bailout.requester.employeeId ?? "-",
        travelRequestNumber: bailout.travelRequest.requestNumber,
        destination: bailout.travelRequest.destination,
        referenceNumber: bailout.bailoutNumber,
        agingDate,
      };
    })
  ), [filteredOutstandingBailouts]);

  const exposureAgingRows = useMemo(() => {
    const grouped = new Map<string, {
      accountCode: ControlAccountCode;
      accountName: string;
      employeeName: string;
      employeeId: string;
      travelRequestNumber: string;
      destination: string;
      referenceNumber: string;
      amount: number;
      firstDate: string | Date;
    }>();

    for (const row of controlRows.filter((item) => item.accountCode === "1132" || item.accountCode === "2110")) {
      const key = [
        row.accountCode,
        row.employeeId ?? row.employeeName ?? "-",
        row.travelRequestNumber ?? row.bailoutNumber ?? row.journalNumber,
      ].join("::");
      const current = grouped.get(key) ?? {
        accountCode: row.accountCode,
        accountName: row.accountName,
        employeeName: row.employeeName ?? "—",
        employeeId: row.employeeId ?? "-",
        travelRequestNumber: row.travelRequestNumber ?? "—",
        destination: row.destination ?? "—",
        referenceNumber: row.bailoutNumber ?? row.journalNumber,
        amount: 0,
        firstDate: row.transactionDate,
      };
      current.amount += row.netAmount;
      if (new Date(row.transactionDate).getTime() < new Date(current.firstDate).getTime()) {
        current.firstDate = row.transactionDate;
      }
      grouped.set(key, current);
    }

    return Array.from(grouped.values())
      .filter((row) => (row.accountCode === "1132" ? row.amount > 0.001 : row.amount < -0.001))
      .map((row) => {
        const absoluteAmount = Math.abs(row.amount);
        const ageDays = diffDays(row.firstDate);
        return {
          ...row,
          amount: absoluteAmount,
          ageDays,
          bucket: getAgingBucket(ageDays),
        };
      })
      .sort((a, b) => b.ageDays - a.ageDays);
  }, [controlRows]);

  const receivableAgingRows = useMemo(
    () => exposureAgingRows.filter((row) => row.accountCode === "1132"),
    [exposureAgingRows],
  );
  const payableAgingRows = useMemo(
    () => exposureAgingRows.filter((row) => row.accountCode === "2110"),
    [exposureAgingRows],
  );

  const agingSummary = useMemo(() => {
    const summarize = (rows: Array<{ bucket: string; amount: number }>) => {
      const buckets = {
        "0-30 hari": 0,
        "31-60 hari": 0,
        "61-90 hari": 0,
        ">90 hari": 0,
      } as Record<string, number>;
      for (const row of rows) {
        buckets[row.bucket] = (buckets[row.bucket] ?? 0) + row.amount;
      }
      return buckets;
    };

    return {
      advance: summarize(advanceAgingRows),
      receivable: summarize(receivableAgingRows),
      payable: summarize(payableAgingRows),
    };
  }, [advanceAgingRows, receivableAgingRows, payableAgingRows]);

  function exportExcel() {
    const summaryRows = [
      { metric: "Tenant Aktif", value: activeTenantName },
      { metric: "Outstanding Uang Muka", value: outstandingAdvanceAmountValue },
      { metric: "Piutang Karyawan", value: balances.receivable },
      { metric: "Hutang Karyawan", value: balances.payable },
      { metric: "Filter Employee", value: employeeFilter || "ALL" },
      { metric: "Filter Travel", value: travelFilter || "ALL" },
      { metric: "Filter Source", value: sourceFilter },
      { metric: "Filter Account", value: accountFilter },
    ];

    const outstandingRows = filteredOutstandingBailouts.map((bailout) => ({
      bailoutNumber: bailout.bailoutNumber,
      requester: bailout.requester.name ?? bailout.requester.employeeId ?? "-",
      employeeId: bailout.requester.employeeId ?? "-",
      travelRequestNumber: bailout.travelRequest.requestNumber,
      destination: bailout.travelRequest.destination,
      amount: Number(bailout.amount ?? 0),
      disbursedAt: bailout.disbursedAt ? formatDate(bailout.disbursedAt) : formatDate(bailout.createdAt),
      description: bailout.description,
    }));

    const movementRows = controlRows.map((row) => ({
      transactionDate: formatDate(row.transactionDate),
      journalNumber: row.journalNumber,
      sourceType: row.sourceType,
      accountCode: row.accountCode,
      accountName: row.accountName,
      employeeName: row.employeeName ?? "-",
      employeeId: row.employeeId ?? "-",
      travelRequestNumber: row.travelRequestNumber ?? "-",
      destination: row.destination ?? "-",
      bailoutNumber: row.bailoutNumber ?? "-",
      description: row.lineDescription ?? row.journalDescription,
      referenceNumber: row.referenceNumber ?? "-",
      debit: row.debit,
      credit: row.credit,
      netAmount: row.netAmount,
    }));

    const advanceAgingSheet = advanceAgingRows.map((row) => ({
      bucket: row.bucket,
      ageDays: row.ageDays,
      referenceNumber: row.referenceNumber,
      employeeName: row.employeeName,
      employeeId: row.employeeId,
      travelRequestNumber: row.travelRequestNumber,
      destination: row.destination,
      amount: row.amount,
      agingDate: formatDate(row.agingDate),
    }));

    const receivableAgingSheet = receivableAgingRows.map((row) => ({
      bucket: row.bucket,
      ageDays: row.ageDays,
      employeeName: row.employeeName,
      employeeId: row.employeeId,
      travelRequestNumber: row.travelRequestNumber,
      destination: row.destination,
      referenceNumber: row.referenceNumber,
      amount: row.amount,
      firstDate: formatDate(row.firstDate),
    }));

    const payableAgingSheet = payableAgingRows.map((row) => ({
      bucket: row.bucket,
      ageDays: row.ageDays,
      employeeName: row.employeeName,
      employeeId: row.employeeId,
      travelRequestNumber: row.travelRequestNumber,
      destination: row.destination,
      referenceNumber: row.referenceNumber,
      amount: row.amount,
      firstDate: formatDate(row.firstDate),
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(outstandingRows), "OutstandingAdvance");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(movementRows), "ControlMovements");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(advanceAgingSheet), "AgingAdvance");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(receivableAgingSheet), "AgingReceivable");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(payableAgingSheet), "AgingPayable");
    XLSX.writeFile(wb, `employee-advance-control-${Date.now()}.xlsx`);
  }

  const outstandingAdvanceAmountValue = filteredOutstandingBailouts.reduce(
    (sum, item) => sum + Number(item.amount ?? 0),
    0,
  );

  const activeTenantName =
    session?.user.memberships?.find((item) => item.tenantId === session.user.activeTenantId)?.tenantName ?? "-";

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee Advance & Settlement Control"
        description="Dashboard kontrol uang muka perjalanan, piutang karyawan, dan hutang karyawan berdasarkan jurnal posted tenant aktif"
        primaryAction={{ label: "Export Excel", onClick: exportExcel }}
        secondaryAction={{ label: "Halaman Finance", href: "/finance" }}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Tenant Aktif" value={activeTenantName} helper="Data mengikuti tenant aktif" />
        <SummaryCard label="Outstanding Uang Muka" value={formatCurrency(outstandingAdvanceAmountValue)} helper={`${filteredOutstandingBailouts.length} bailout belum settlement`} tone="amber" />
        <SummaryCard label="Piutang Karyawan" value={formatCurrency(balances.receivable)} helper="Saldo akun 1132 pada filter aktif" tone="blue" />
        <SummaryCard label="Hutang Karyawan" value={formatCurrency(balances.payable)} helper="Saldo akun 2110 pada filter aktif" tone="purple" />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-7">
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
              <option value="BAILOUT">BAILOUT</option>
              <option value="SETTLEMENT">SETTLEMENT</option>
              <option value="ADJUSTMENT">ADJUSTMENT</option>
              <option value="MANUAL">MANUAL</option>
              <option value="FUNDING">FUNDING</option>
              <option value="CLAIM">CLAIM</option>
            </select>
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-gray-700">Akun Kontrol</span>
            <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value as ControlAccountCode | "ALL")} className="w-full rounded-lg border border-gray-300 px-3 py-2">
              <option value="ALL">Semua akun kontrol</option>
              <option value="1131">1131 - Uang Muka Perjalanan Dinas</option>
              <option value="1132">1132 - Piutang Karyawan</option>
              <option value="2110">2110 - Hutang Karyawan</option>
            </select>
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-gray-700">Karyawan</span>
            <input
              type="text"
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              placeholder="Nama / NIK karyawan"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-gray-700">Perjalanan / Bailout</span>
            <input
              type="text"
              value={travelFilter}
              onChange={(e) => setTravelFilter(e.target.value)}
              placeholder="TR / tujuan / nomor bailout"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void journalQuery.refetch()}>Terapkan Filter</Button>
          <Button size="sm" variant="secondary" onClick={exportExcel}>Export Excel</Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const now = new Date();
              setStartDate(toDateInputValue(new Date(now.getFullYear(), 0, 1)));
              setEndDate(toDateInputValue(now));
              setStatusFilter("POSTED");
              setSourceFilter("ALL");
              setAccountFilter("ALL");
              setEmployeeFilter("");
              setTravelFilter("");
            }}
          >
            Reset
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Outstanding Advance per Bailout" description="Bailout disbursed yang belum memiliki settlement posted">
          {filteredOutstandingBailouts.length === 0 ? (
            <EmptyLine text="Tidak ada bailout outstanding pada tenant aktif / filter aktif." />
          ) : (
            <div className="space-y-3">
              {filteredOutstandingBailouts.map((bailout) => (
                <div key={bailout.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{bailout.bailoutNumber} · {bailout.requester.name ?? bailout.requester.employeeId ?? "-"}</p>
                    <p className="text-xs text-gray-500">{bailout.travelRequest.requestNumber} · {bailout.travelRequest.destination}</p>
                    <p className="text-xs text-gray-400">Disbursed: {bailout.disbursedAt ? formatDate(bailout.disbursedAt) : formatDate(bailout.createdAt)}</p>
                  </div>
                  <p className="text-sm font-semibold text-amber-700">{formatCurrency(Number(bailout.amount ?? 0))}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Rekap Mutasi per Sumber" description="Distribusi mutasi akun kontrol berdasarkan source jurnal">
          {sourceSummary.length === 0 ? (
            <EmptyLine text="Belum ada mutasi akun kontrol pada filter ini." />
          ) : (
            <div className="space-y-3">
              {sourceSummary.map((item) => (
                <div key={item.source} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{item.source}</p>
                    <p className="text-xs text-gray-500">{item.count} line jurnal</p>
                  </div>
                  <p className="text-sm font-semibold text-blue-700">{formatCurrency(item.amount)}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Aging Outstanding Advance" description="Umur bailout disbursed yang belum settlement berdasarkan tanggal pencairan">
          <AgingBucketList buckets={agingSummary.advance} tone="amber" />
        </Panel>
        <Panel title="Aging Piutang Karyawan" description="Umur saldo piutang karyawan berdasarkan tanggal awal eksposur">
          <AgingBucketList buckets={agingSummary.receivable} tone="blue" />
        </Panel>
        <Panel title="Aging Hutang Karyawan" description="Umur saldo hutang karyawan berdasarkan tanggal awal eksposur">
          <AgingBucketList buckets={agingSummary.payable} tone="purple" />
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Detail Aging Advance" description="Item outstanding uang muka per bucket umur">
          {advanceAgingRows.length === 0 ? (
            <EmptyLine text="Tidak ada outstanding advance pada filter ini." />
          ) : (
            <AgingDetailList rows={advanceAgingRows} />
          )}
        </Panel>
        <Panel title="Detail Aging Piutang" description="Item piutang karyawan per bucket umur">
          {receivableAgingRows.length === 0 ? (
            <EmptyLine text="Tidak ada piutang karyawan pada filter ini." />
          ) : (
            <AgingDetailList rows={receivableAgingRows} />
          )}
        </Panel>
        <Panel title="Detail Aging Hutang" description="Item hutang karyawan per bucket umur">
          {payableAgingRows.length === 0 ? (
            <EmptyLine text="Tidak ada hutang karyawan pada filter ini." />
          ) : (
            <AgingDetailList rows={payableAgingRows} />
          )}
        </Panel>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Mutasi Akun Kontrol</h2>
          <p className="text-sm text-gray-500">Line jurnal untuk akun 1131, 1132, dan 2110 pada tenant aktif</p>
        </div>
        {journalQuery.isLoading || bailoutQuery.isLoading ? (
          <div className="px-5 py-6 text-sm text-gray-500">Memuat data kontrol advance & settlement...</div>
        ) : controlRows.length === 0 ? (
          <EmptyState icon="📘" title="Belum ada mutasi akun kontrol" description="Tidak ada line jurnal control account pada periode dan filter yang dipilih." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Tanggal</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">No. Jurnal</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Karyawan</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Perjalanan</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Akun</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Deskripsi</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Sumber</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Debit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Kredit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Saldo Bersih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {controlRows.map((row, index) => (
                  <tr key={`${row.journalId}-${row.accountCode}-${index}`}>
                    <td className="px-4 py-3 text-gray-600">{formatDate(row.transactionDate)}</td>
                    <td className="px-4 py-3 font-mono text-gray-900">{row.journalNumber}</td>
                    <td className="px-4 py-3 text-gray-600">
                      <p className="font-medium text-gray-900">{row.employeeName ?? "—"}</p>
                      <p className="text-xs text-gray-400">{row.employeeId ?? "-"}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <p className="font-mono text-gray-900">{row.travelRequestNumber ?? "—"}</p>
                      <p className="text-xs text-gray-400">{row.destination ?? row.bailoutNumber ?? "-"}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.accountCode} · {row.accountName}</td>
                    <td className="px-4 py-3 text-gray-600">
                      <p>{row.lineDescription ?? row.journalDescription}</p>
                      {row.referenceNumber ? <p className="text-xs text-gray-400">Ref: {row.referenceNumber}</p> : null}
                      {row.bailoutNumber ? <p className="text-xs text-gray-400">Bailout: {row.bailoutNumber}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{row.sourceType}</td>
                    <td className="px-4 py-3 text-right font-medium text-blue-700">{row.debit > 0 ? formatCurrency(row.debit) : "—"}</td>
                    <td className="px-4 py-3 text-right font-medium text-green-700">{row.credit > 0 ? formatCurrency(row.credit) : "—"}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${row.netAmount >= 0 ? "text-gray-900" : "text-red-600"}`}>{formatCurrency(Math.abs(row.netAmount))}</td>
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

function SummaryCard({
  label,
  value,
  helper,
  tone = "gray",
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: "gray" | "blue" | "green" | "amber" | "purple";
}) {
  const styles = {
    gray: "border-gray-200 bg-gray-50 text-gray-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    green: "border-green-200 bg-green-50 text-green-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    purple: "border-purple-200 bg-purple-50 text-purple-800",
  } as const;

  return (
    <div className={`rounded-xl border p-5 ${styles[tone]}`}>
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {helper ? <p className="mt-1 text-xs text-gray-500">{helper}</p> : null}
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
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-500">{text}</div>;
}

function AgingBucketList({
  buckets,
  tone,
}: {
  buckets: Record<string, number>;
  tone: "amber" | "blue" | "purple";
}) {
  const tones = {
    amber: "text-amber-700",
    blue: "text-blue-700",
    purple: "text-purple-700",
  } as const;

  return (
    <div className="space-y-3">
      {Object.entries(buckets).map(([bucket, amount]) => (
        <div key={bucket} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-3">
          <p className="text-sm font-medium text-gray-800">{bucket}</p>
          <p className={`text-sm font-semibold ${tones[tone]}`}>{formatCurrency(amount)}</p>
        </div>
      ))}
    </div>
  );
}

function AgingDetailList({
  rows,
}: {
  rows: Array<{
    bucket: string;
    ageDays: number;
    amount: number;
    employeeName: string;
    employeeId: string;
    travelRequestNumber: string;
    destination: string;
    referenceNumber: string;
  }>;
}) {
  return (
    <div className="space-y-3">
      {rows.slice(0, 8).map((row, index) => (
        <div key={`${row.referenceNumber}-${row.employeeId}-${index}`} className="rounded-lg border border-gray-100 px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">{row.referenceNumber}</p>
              <p className="text-xs text-gray-500">{row.employeeName} · {row.employeeId}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-900">{formatCurrency(row.amount)}</p>
              <p className="text-xs text-gray-500">{row.bucket} · {row.ageDays} hari</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500">{row.travelRequestNumber} · {row.destination}</p>
        </div>
      ))}
    </div>
  );
}
