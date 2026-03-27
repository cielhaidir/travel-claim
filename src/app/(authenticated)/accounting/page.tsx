"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/features/PageHeader";
import { EmptyState } from "@/components/features/EmptyState";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { hasPermissionMap } from "@/lib/auth/permissions";
import { formatCurrency } from "@/lib/utils/format";
import type { JournalEntryType } from "../../../../generated/prisma";

type BalanceAccount = {
  id: string;
  code: string;
  name: string;
  balance: number;
  isActive: boolean;
  description?: string | null;
  defaultChartOfAccountId?: string | null;
  defaultChartOfAccount?: {
    id: string;
    code: string;
    name: string;
    accountType: string;
  } | null;
};

type COAAccount = {
  id: string;
  code: string;
  name: string;
  accountType?: string;
};

const DEFAULT_CREATE_FORM = {
  code: "",
  name: "",
  balance: "0",
  defaultChartOfAccountId: "",
  description: "",
  isActive: true,
};

const DEFAULT_ADJUST_FORM = {
  amount: "",
  entryType: "CREDIT" as JournalEntryType,
  chartOfAccountId: "",
  description: "",
  referenceNumber: "",
  notes: "",
};

export default function AccountingPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const isRoot = session?.user?.isRoot ?? false;
  const canReadAccounting =
    isRoot || hasPermissionMap(session?.user?.permissions, "accounting", "read");
  const canReadDashboard =
    isRoot || hasPermissionMap(session?.user?.permissions, "dashboard", "read");
  const canReadBalanceAccounts =
    isRoot ||
    hasPermissionMap(session?.user?.permissions, "balance-accounts", "read");
  const canReadCoa =
    isRoot ||
    hasPermissionMap(session?.user?.permissions, "chart-of-accounts", "read");
  const canReadJournals =
    isRoot || hasPermissionMap(session?.user?.permissions, "journals", "read");
  const canReadReports =
    isRoot ||
    (hasPermissionMap(session?.user?.permissions, "reports", "read") &&
      canReadJournals);
  const canAccessFinanceDashboard =
    isRoot ||
    (hasPermissionMap(session?.user?.permissions, "bailout", "read") &&
      hasPermissionMap(session?.user?.permissions, "bailout", "disburse") &&
      canReadCoa &&
      canReadBalanceAccounts) ||
    (hasPermissionMap(session?.user?.permissions, "claims", "read") &&
      hasPermissionMap(session?.user?.permissions, "claims", "pay") &&
      canReadCoa &&
      canReadBalanceAccounts) ||
    (hasPermissionMap(session?.user?.permissions, "bailout", "read") &&
      canReadJournals &&
      hasPermissionMap(session?.user?.permissions, "journals", "create") &&
      canReadCoa) ||
    (hasPermissionMap(session?.user?.permissions, "travel", "read") &&
      (hasPermissionMap(session?.user?.permissions, "travel", "lock") ||
        hasPermissionMap(session?.user?.permissions, "travel", "close")));
  const canCreateBalanceAccounts =
    (isRoot ||
      hasPermissionMap(
        session?.user?.permissions,
        "balance-accounts",
        "create",
      )) &&
    canReadBalanceAccounts &&
    canReadCoa;
  const canUpdateBalanceAccounts =
    (isRoot ||
      hasPermissionMap(
        session?.user?.permissions,
        "balance-accounts",
        "update",
      )) &&
    canReadBalanceAccounts &&
    canReadCoa;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BalanceAccount | null>(null);
  const [adjustingAccount, setAdjustingAccount] = useState<BalanceAccount | null>(null);
  const [activeFilter, setActiveFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [createForm, setCreateForm] = useState(DEFAULT_CREATE_FORM);
  const [editForm, setEditForm] = useState({
    name: "",
    defaultChartOfAccountId: "",
    description: "",
    isActive: true,
  });
  const [adjustForm, setAdjustForm] = useState(DEFAULT_ADJUST_FORM);

  useEffect(() => {
    if (session && !canReadAccounting) {
      void router.replace("/dashboard");
    }
  }, [canReadAccounting, router, session]);

  const {
    data: accountsRaw,
    isLoading,
    refetch,
  } = api.balanceAccount.list.useQuery(
    {
      limit: 100,
      isActive:
        activeFilter === "ALL" ? undefined : activeFilter === "ACTIVE",
    },
    {
      enabled: canReadBalanceAccounts,
      refetchOnWindowFocus: false,
    },
  );

  const { data: coaRaw } = api.chartOfAccount.getActiveAccounts.useQuery(
    {},
    {
      enabled:
        canReadCoa &&
        (canCreateBalanceAccounts || canUpdateBalanceAccounts),
      refetchOnWindowFocus: false,
    },
  );

  const accounts =
    (accountsRaw as { balanceAccounts: BalanceAccount[] } | undefined)?.balanceAccounts ?? [];
  const coaAccounts = (coaRaw as COAAccount[] | undefined) ?? [];

  const totalBalance = useMemo(
    () => accounts.reduce((sum, account) => sum + Number(account.balance ?? 0), 0),
    [accounts],
  );

  const createMutation = api.balanceAccount.create.useMutation({
    onSuccess: () => {
      void refetch();
      setIsCreateOpen(false);
      setCreateForm(DEFAULT_CREATE_FORM);
    },
  });

  const updateMutation = api.balanceAccount.update.useMutation({
    onSuccess: () => {
      void refetch();
      setEditingAccount(null);
    },
  });

  const adjustMutation = api.balanceAccount.adjustBalance.useMutation({
    onSuccess: () => {
      void refetch();
      setAdjustingAccount(null);
      setAdjustForm(DEFAULT_ADJUST_FORM);
    },
  });

  function openEdit(account: BalanceAccount) {
    if (!canUpdateBalanceAccounts) return;
    setEditingAccount(account);
    setEditForm({
      name: account.name,
      defaultChartOfAccountId: account.defaultChartOfAccountId ?? "",
      description: account.description ?? "",
      isActive: account.isActive,
    });
  }

  function openAdjust(account: BalanceAccount) {
    if (!canUpdateBalanceAccounts) return;
    setAdjustingAccount(account);
    setAdjustForm({
      ...DEFAULT_ADJUST_FORM,
      chartOfAccountId: coaAccounts[0]?.id ?? "",
      description: `Penyesuaian untuk ${account.code} - ${account.name}`,
    });
  }

  if (!session || !canReadAccounting) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Akuntansi & Keuangan"
        description="Pusat menu finance, jurnal, laporan, COA, dan pengelolaan akun saldo dalam satu halaman"
        primaryAction={
          canCreateBalanceAccounts
            ? {
                label: "Tambah Akun",
                onClick: () => setIsCreateOpen(true),
              }
            : undefined
        }
        secondaryAction={{
          label: "Muat Ulang",
          onClick: () => void refetch(),
        }}
      />

      <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-4">
        <ModuleLinkCard
          href="/finance"
          title="Keuangan"
          description="Proses claim, bailout, settlement, dan transaksi operasional finance"
        />
        <ModuleLinkCard
          href="/journal"
          title="Jurnal"
          description="Lihat daftar jurnal perusahaan dan detail double-entry"
        />
        <ModuleLinkCard
          href="/chart-of-accounts"
          title="Bagan Akun"
          description="Kelola COA perusahaan, struktur akun, dan status akun"
        />
        <ModuleLinkCard
          href="/reports/journal"
          title="Laporan Jurnal"
          description="Rekap jurnal perusahaan berdasarkan periode, status, dan sumber"
        />
        <ModuleLinkCard
          href="/reports/trial-balance"
          title="Trial Balance"
          description="Lihat neraca saldo perusahaan dari jurnal pada periode tertentu"
        />
        <ModuleLinkCard
          href="/reports/general-ledger"
          title="General Ledger"
          description="Buku besar per akun COA dengan running balance perusahaan"
        />
        <ModuleLinkCard
          href="/reports/income-statement"
          title="Laba Rugi"
          description="Laporan pendapatan, beban, dan laba rugi bersih tenant aktif"
        />
        <ModuleLinkCard
          href="/reports/balance-sheet"
          title="Neraca"
          description="Posisi aset, kewajiban, dan ekuitas tenant aktif sampai tanggal laporan"
        />
        <ModuleLinkCard
          href="/reports/expense-summary"
          title="Expense Summary"
          description="Ringkasan beban perusahaan per akun expense dan sumber jurnal"
        />
        <ModuleLinkCard
          href="/reports/employee-advance-control"
          title="Employee Advance Control"
          description="Kontrol uang muka perjalanan, piutang karyawan, dan hutang karyawan perusahaan"
        />
        <ModuleLinkCard
          href="/dashboard"
          title="Dashboard"
          description="Kembali ke ringkasan operasional dan keuangan perusahaan"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Total Akun" value={accounts.length.toString()} />
        <SummaryCard label="Akun Aktif" value={accounts.filter((item) => item.isActive).length.toString()} color="green" />
        <SummaryCard label="Total Saldo" value={formatCurrency(totalBalance)} color="blue" />
      </div>

      <div className="content-section p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">Filter Status Akun</p>
            <p className="text-xs text-gray-500">Tampilkan semua akun, hanya aktif, atau hanya nonaktif</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["ALL", "ACTIVE", "INACTIVE"] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={activeFilter === value ? "primary" : "secondary"}
                onClick={() => setActiveFilter(value)}
              >
                {value === "ALL" ? "Semua" : value === "ACTIVE" ? "Aktif" : "Nonaktif"}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {!canReadBalanceAccounts ? (
        <div className="content-section">
          <EmptyState
            icon="🏦"
            title="Akses akun saldo dibatasi"
            description="Halaman ini tetap menampilkan pintasan akuntansi, tetapi daftar akun saldo memerlukan izin baca akun saldo."
          />
        </div>
      ) : isLoading ? (
        <Skeleton />
      ) : accounts.length === 0 ? (
        <div className="content-section">
          <EmptyState
            icon="🏦"
            title="Belum ada akun saldo"
            description="Tambahkan akun perusahaan untuk mulai mencatat saldo dan penyesuaian jurnal."
            action={
              canCreateBalanceAccounts
                ? {
                    label: "Tambah Akun",
                    onClick: () => setIsCreateOpen(true),
                  }
                : undefined
            }
          />
        </div>
      ) : (
        <div className="content-table overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Kode</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Nama Akun</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">COA Default Kas/Bank</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Deskripsi</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Saldo</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {accounts.map((account) => (
                <tr key={account.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-semibold text-gray-900">{account.code}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{account.name}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {account.defaultChartOfAccount
                      ? `${account.defaultChartOfAccount.code} - ${account.defaultChartOfAccount.name}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{account.description ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">
                    {formatCurrency(Number(account.balance ?? 0))}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        account.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {account.isActive ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/accounting/${account.id}`}
                        className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Detail
                      </Link>
                      {canUpdateBalanceAccounts ? (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => openEdit(account)}>
                            Ubah
                          </Button>
                          <Button size="sm" variant="primary" onClick={() => openAdjust(account)}>
                            Sesuaikan
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={isCreateOpen && canCreateBalanceAccounts}
        onClose={() => {
          setIsCreateOpen(false);
          setCreateForm(DEFAULT_CREATE_FORM);
        }}
        title="Tambah Akun Saldo"
      >
        <div className="space-y-4">
          <FormRow label="Kode">
            <input
              type="text"
              value={createForm.code}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, code: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="Mis. BANK-OPS"
            />
          </FormRow>
          <FormRow label="Nama Akun">
            <input
              type="text"
              value={createForm.name}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="Mis. Rekening Operasional"
            />
          </FormRow>
          <FormRow label="Saldo Awal">
            <input
              type="number"
              value={createForm.balance}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, balance: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </FormRow>
          <FormRow label="COA Default Kas/Bank">
            <select
              value={createForm.defaultChartOfAccountId}
              onChange={(e) =>
                setCreateForm((prev) => ({ ...prev, defaultChartOfAccountId: e.target.value }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Pilih Bagan Akun</option>
              {coaAccounts
                .filter((coa) => coa.accountType === "ASSET")
                .map((coa) => (
                  <option key={coa.id} value={coa.id}>
                    {coa.code} - {coa.name}
                  </option>
                ))}
            </select>
          </FormRow>
          <FormRow label="Deskripsi">
            <textarea
              value={createForm.description}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              rows={3}
            />
          </FormRow>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={createForm.isActive}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, isActive: e.target.checked }))}
            />
            Aktif
          </label>
          {createMutation.error ? (
            <p className="text-sm text-red-600">{createMutation.error.message}</p>
          ) : null}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsCreateOpen(false)}>
              Batal
            </Button>
            <Button
              isLoading={createMutation.isPending}
              disabled={!createForm.code.trim() || !createForm.name.trim()}
              onClick={() => {
                createMutation.mutate({
                  code: createForm.code.trim(),
                  name: createForm.name.trim(),
                  balance: Number(createForm.balance || 0),
                  defaultChartOfAccountId:
                    createForm.defaultChartOfAccountId || undefined,
                  description: createForm.description.trim() || undefined,
                  isActive: createForm.isActive,
                });
              }}
            >
              Simpan
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!editingAccount && canUpdateBalanceAccounts}
        onClose={() => setEditingAccount(null)}
        title="Ubah Akun Saldo"
      >
        <div className="space-y-4">
          <FormRow label="Kode">
            <input
              type="text"
              value={editingAccount?.code ?? ""}
              disabled
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
            />
          </FormRow>
          <FormRow label="Nama Akun">
            <input
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </FormRow>
          <FormRow label="COA Default Kas/Bank">
            <select
              value={editForm.defaultChartOfAccountId}
              onChange={(e) =>
                setEditForm((prev) => ({ ...prev, defaultChartOfAccountId: e.target.value }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Pilih Bagan Akun</option>
              {coaAccounts
                .filter((coa) => coa.accountType === "ASSET")
                .map((coa) => (
                  <option key={coa.id} value={coa.id}>
                    {coa.code} - {coa.name}
                  </option>
                ))}
            </select>
          </FormRow>
          <FormRow label="Deskripsi">
            <textarea
              value={editForm.description}
              onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              rows={3}
            />
          </FormRow>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={editForm.isActive}
              onChange={(e) => setEditForm((prev) => ({ ...prev, isActive: e.target.checked }))}
            />
            Aktif
          </label>
          {updateMutation.error ? (
            <p className="text-sm text-red-600">{updateMutation.error.message}</p>
          ) : null}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setEditingAccount(null)}>
              Batal
            </Button>
            <Button
              isLoading={updateMutation.isPending}
              disabled={!editingAccount || !editForm.name.trim()}
              onClick={() => {
                if (!editingAccount) return;
                updateMutation.mutate({
                  id: editingAccount.id,
                  name: editForm.name.trim(),
                  defaultChartOfAccountId:
                    editForm.defaultChartOfAccountId || null,
                  description: editForm.description.trim() || undefined,
                  isActive: editForm.isActive,
                });
              }}
            >
              Simpan Perubahan
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!adjustingAccount && canUpdateBalanceAccounts}
        onClose={() => {
          setAdjustingAccount(null);
          setAdjustForm(DEFAULT_ADJUST_FORM);
        }}
        title="Penyesuaian Saldo"
      >
        <div className="space-y-4">
          {adjustingAccount ? (
            <div className="content-subcard p-4 text-sm">
              <p className="font-semibold text-gray-900">{adjustingAccount.code} - {adjustingAccount.name}</p>
              <p className="mt-1 text-gray-500">Saldo saat ini: {formatCurrency(Number(adjustingAccount.balance ?? 0))}</p>
            </div>
          ) : null}

          <FormRow label="Tipe Penyesuaian">
            <select
              value={adjustForm.entryType}
              onChange={(e) =>
                setAdjustForm((prev) => ({
                  ...prev,
                  entryType: e.target.value as JournalEntryType,
                }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="CREDIT">KREDIT (menambah saldo)</option>
              <option value="DEBIT">DEBIT (mengurangi saldo)</option>
            </select>
          </FormRow>

          <FormRow label="Nominal">
            <input
              type="number"
              min="0"
              value={adjustForm.amount}
              onChange={(e) => setAdjustForm((prev) => ({ ...prev, amount: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </FormRow>

          <FormRow label="Bagan Akun (COA)">
            <select
              value={adjustForm.chartOfAccountId}
              onChange={(e) =>
                setAdjustForm((prev) => ({ ...prev, chartOfAccountId: e.target.value }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Pilih Bagan Akun</option>
              {coaAccounts.map((coa) => (
                <option key={coa.id} value={coa.id}>
                  {coa.code} - {coa.name}
                </option>
              ))}
            </select>
          </FormRow>

          <FormRow label="Deskripsi">
            <textarea
              value={adjustForm.description}
              onChange={(e) => setAdjustForm((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              rows={3}
            />
          </FormRow>

          <FormRow label="Nomor Referensi (opsional)">
            <input
              type="text"
              value={adjustForm.referenceNumber}
              onChange={(e) =>
                setAdjustForm((prev) => ({ ...prev, referenceNumber: e.target.value }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </FormRow>

          <FormRow label="Catatan (opsional)">
            <textarea
              value={adjustForm.notes}
              onChange={(e) => setAdjustForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              rows={2}
            />
          </FormRow>

          {adjustMutation.error ? (
            <p className="text-sm text-red-600">{adjustMutation.error.message}</p>
          ) : null}
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setAdjustingAccount(null);
                setAdjustForm(DEFAULT_ADJUST_FORM);
              }}
            >
              Batal
            </Button>
            <Button
              isLoading={adjustMutation.isPending}
              disabled={
                !adjustingAccount ||
                !adjustForm.amount ||
                !adjustForm.chartOfAccountId ||
                !adjustForm.description.trim()
              }
              onClick={() => {
                if (!adjustingAccount) return;
                adjustMutation.mutate({
                  id: adjustingAccount.id,
                  amount: Number(adjustForm.amount),
                  entryType: adjustForm.entryType,
                  chartOfAccountId: adjustForm.chartOfAccountId,
                  description: adjustForm.description.trim(),
                  referenceNumber: adjustForm.referenceNumber.trim() || undefined,
                  notes: adjustForm.notes.trim() || undefined,
                });
              }}
            >
              Simpan Penyesuaian
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ModuleLinkCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
    >
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <p className="mt-1 text-xs leading-5 text-gray-500">{description}</p>
      <p className="mt-3 text-xs font-semibold text-blue-600">Buka menu →</p>
    </Link>
  );
}

function FormRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
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
    gray: "border-gray-200 bg-white text-gray-900",
    blue: "border-blue-200 bg-white text-blue-900",
    green: "border-green-200 bg-white text-green-900",
  } as const;

  return (
    <div className={`rounded-xl border p-5 shadow-sm ${colors[color]}`}>
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="content-section p-5">
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-12 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    </div>
  );
}
