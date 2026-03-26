"use client";

import { useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/features/PageHeader";
import { EmptyState } from "@/components/features/EmptyState";
import { hasPermissionMap } from "@/lib/auth/permissions";
import { formatCurrency, formatDate } from "@/lib/utils/format";

type BalanceAccountDetail = {
  id: string;
  code: string;
  name: string;
  balance: number;
  isActive: boolean;
  description?: string | null;
  defaultChartOfAccount?: {
    id: string;
    code: string;
    name: string;
    accountType: string;
  } | null;
  journalTransactions: Array<{
    id: string;
    transactionNumber: string;
    transactionDate: string | Date;
    amount: number;
    entryType: string;
    description: string;
    referenceNumber?: string | null;
    chartOfAccount?: {
      id: string;
      code: string;
      name: string;
    } | null;
    bailout?: {
      id: string;
      bailoutNumber: string;
      category: string;
    } | null;
    claim?: {
      id: string;
      claimNumber: string;
      claimType: string;
    } | null;
  }>;
};

export default function BalanceAccountDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const accountId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const isAllowed =
    (session?.user?.isRoot ?? false) ||
    hasPermissionMap(session?.user?.permissions, "balance-accounts", "read");
  const canReadAccounting =
    (session?.user?.isRoot ?? false) ||
    hasPermissionMap(session?.user?.permissions, "accounting", "read");
  const canReadDashboard =
    (session?.user?.isRoot ?? false) ||
    hasPermissionMap(session?.user?.permissions, "dashboard", "read");

  useEffect(() => {
    if (session && !isAllowed) {
      void router.replace("/dashboard");
    }
  }, [isAllowed, router, session]);

  const { data, isLoading, refetch } = api.balanceAccount.getById.useQuery(
    { id: accountId ?? "" },
    {
      enabled: !!accountId && isAllowed,
      refetchOnWindowFocus: false,
    },
  );

  const account = data as BalanceAccountDetail | undefined;

  const summary = useMemo(() => {
    const transactions = account?.journalTransactions ?? [];
    return transactions.reduce(
      (acc, tx) => {
        acc.total += 1;
        if (tx.entryType === "DEBIT") {
          acc.debit += Number(tx.amount ?? 0);
        } else {
          acc.credit += Number(tx.amount ?? 0);
        }
        return acc;
      },
      { total: 0, debit: 0, credit: 0 },
    );
  }, [account]);

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={account ? `${account.code} · ${account.name}` : "Detail Akun Saldo"}
        description="Lihat saldo, COA default, dan histori mutasi akun saldo tenant aktif"
        primaryAction={{
          label: "Muat Ulang",
          onClick: () => void refetch(),
        }}
        secondaryAction={
          canReadAccounting
            ? {
                label: "Kembali ke Accounting",
                href: "/accounting",
              }
            : canReadDashboard
              ? {
                  label: "Kembali ke Dashboard",
                  href: "/dashboard",
                }
              : undefined
        }
      />

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Memuat detail akun saldo...
        </div>
      ) : !account ? (
        <div className="rounded-lg border bg-white">
          <EmptyState
            icon="🏦"
            title="Akun saldo tidak ditemukan"
            description="Akun saldo ini tidak tersedia pada tenant aktif atau sudah dihapus."
            action={
              canReadAccounting
                ? { label: "Kembali ke Accounting", href: "/accounting" }
                : canReadDashboard
                  ? { label: "Kembali ke Dashboard", href: "/dashboard" }
                  : undefined
            }
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Saldo Saat Ini" value={formatCurrency(Number(account.balance ?? 0))} helper="Posisi saldo akun saat ini" tone="blue" />
            <SummaryCard label="Status" value={account.isActive ? "Aktif" : "Nonaktif"} helper="Status akun saldo pada tenant aktif" tone={account.isActive ? "green" : "amber"} />
            <SummaryCard label="Mutasi Tercatat" value={summary.total.toString()} helper="20 transaksi terakhir yang terkait" />
            <SummaryCard label="COA Default" value={account.defaultChartOfAccount ? `${account.defaultChartOfAccount.code}` : "-"} helper={account.defaultChartOfAccount?.name ?? "Belum ada COA default"} tone="emerald" />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Panel title="Informasi Akun" description="Metadata akun saldo tenant aktif">
              <InfoRow label="Kode" value={account.code} mono />
              <InfoRow label="Nama" value={account.name} />
              <InfoRow label="COA Default" value={account.defaultChartOfAccount ? `${account.defaultChartOfAccount.code} - ${account.defaultChartOfAccount.name}` : "-"} />
              <InfoRow label="Tipe COA" value={account.defaultChartOfAccount?.accountType ?? "-"} />
              <InfoRow label="Deskripsi" value={account.description ?? "-"} multiline />
            </Panel>

            <Panel title="Ringkasan Mutasi" description="Akumulasi debit dan kredit dari histori yang ditampilkan">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <MiniMetric label="Total Debit" value={formatCurrency(summary.debit)} tone="blue" />
                <MiniMetric label="Total Kredit" value={formatCurrency(summary.credit)} tone="green" />
              </div>
            </Panel>

            <Panel title="Catatan" description="Panduan membaca histori akun saldo">
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                <p>• Histori di bawah diambil dari 20 journal transaction terakhir yang terhubung ke akun ini.</p>
                <p>• Nilai DEBIT/KREDIT mengikuti entry type pada transaksi legacy balance account.</p>
                <p>• Untuk analisa formal, kombinasikan dengan report jurnal dan general ledger tenant aktif.</p>
              </div>
            </Panel>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Histori Mutasi Akun Saldo</h2>
              <p className="text-sm text-gray-500">20 journal transaction terakhir yang terkait ke akun saldo ini</p>
            </div>
            {account.journalTransactions.length === 0 ? (
              <EmptyState
                icon="📚"
                title="Belum ada histori mutasi"
                description="Akun saldo ini belum memiliki journal transaction yang tercatat."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">No. Transaksi</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Tanggal</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Tipe</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">COA</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Deskripsi</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Sumber</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Jumlah</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {account.journalTransactions.map((tx) => (
                      <tr key={tx.id}>
                        <td className="px-4 py-3 font-mono text-gray-900">{tx.transactionNumber}</td>
                        <td className="px-4 py-3 text-gray-600">{formatDate(tx.transactionDate)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tx.entryType === "DEBIT" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                            {tx.entryType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {tx.chartOfAccount ? `${tx.chartOfAccount.code} - ${tx.chartOfAccount.name}` : "-"}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          <div>
                            <p>{tx.description}</p>
                            {tx.referenceNumber ? <p className="text-xs text-gray-400">Ref: {tx.referenceNumber}</p> : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {tx.claim ? `Claim · ${tx.claim.claimNumber}` : tx.bailout ? `Bailout · ${tx.bailout.bailoutNumber}` : "Manual/Adjustment"}
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold ${tx.entryType === "DEBIT" ? "text-blue-700" : "text-green-700"}`}>
                          {formatCurrency(Number(tx.amount ?? 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
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

function MiniMetric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "blue" | "green" }) {
  const tones = {
    default: "border-gray-200 bg-gray-50",
    blue: "border-blue-200 bg-blue-50",
    green: "border-green-200 bg-green-50",
  };

  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function InfoRow({ label, value, mono = false, multiline = false }: { label: string; value: string; mono?: boolean; multiline?: boolean }) {
  return (
    <div className="border-b border-gray-100 py-3 last:border-b-0">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-sm text-gray-900 ${mono ? "font-mono" : ""} ${multiline ? "whitespace-pre-line" : ""}`}>{value}</p>
    </div>
  );
}
