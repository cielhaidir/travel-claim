"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/features/PageHeader";
import { CrmEmptyHint, crmInputClassName, CrmMetricCard } from "@/components/features/crm/shared";
import { userHasPermission } from "@/lib/auth/role-check";
import { getCrmLabel } from "@/lib/constants/crm";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";

export default function SalesInvoicePage() {
  const { data: session } = useSession();
  const [customerId, setCustomerId] = useState("");
  const [search, setSearch] = useState("");
  const isAllowed = session?.user ? userHasPermission(session.user, "sales", "read") : false;

  const { data: customers, isLoading } = api.crm.listOrganizations.useQuery(
    { search: search || undefined, usage: "customer" },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );

  const rows = useMemo(() => customers ?? [], [customers]);
  const selectedCustomer = useMemo(() => rows.find((item) => item.id === customerId) ?? null, [rows, customerId]);
  const totalRevenue = useMemo(
    () => rows.reduce((sum, item) => sum + Number(item.annualRevenue ?? 0), 0),
    [rows],
  );

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoice Penjualan"
        description="Invoice penjualan memakai customer CRM yang sama dengan quotation, sales order, dan delivery order."
        badge={<Badge variant="success">Customer Source: CRM</Badge>}
        primaryAction={{ label: "Buka Customer (CRM)", href: "/penjualan/customer" }}
        secondaryAction={{ label: "Kembali ke Penjualan", href: "/penjualan" }}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <CrmMetricCard label="Customer CRM" value={String(rows.length)} helper="Customer tersedia untuk billing" />
        <CrmMetricCard label="Aktif" value={String(rows.filter((item) => item.status === "ACTIVE").length)} helper="Siap ditagih" />
        <CrmMetricCard label="Total Contacts" value={String(rows.reduce((sum, item) => sum + item.contacts.length, 0))} helper="PIC billing / account" />
        <CrmMetricCard label="Annual Revenue" value={formatCurrency(totalRevenue)} helper="Akumulasi revenue organization" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Draft Invoice Penjualan</h2>
              <p className="mt-1 text-sm text-gray-500">Pilih customer dari CRM lalu kaitkan invoice ke SO/DO agar penagihan tetap konsisten.</p>
            </div>
            <Badge variant="success">Linked</Badge>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-gray-700">Customer dari CRM</span>
              <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className={crmInputClassName}>
                <option value="">Pilih customer</option>
                {rows.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.company}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-gray-700">Nomor Invoice</span>
              <input placeholder="INV-S-XXXX" className={crmInputClassName} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-gray-700">Nomor SO</span>
              <input placeholder="SO-2026-0022" className={crmInputClassName} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-gray-700">Nomor Delivery Order</span>
              <input placeholder="DO-2026-0019" className={crmInputClassName} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-gray-700">Jatuh Tempo</span>
              <input type="date" className={crmInputClassName} />
            </label>
          </div>

          {selectedCustomer ? (
            <div className="mt-5 rounded-xl border border-violet-100 bg-violet-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-violet-950">{selectedCustomer.company}</p>
                <Badge variant={selectedCustomer.status === "ACTIVE" ? "success" : "default"}>{getCrmLabel(selectedCustomer.status)}</Badge>
                <Badge variant="info">{selectedCustomer.contacts.length} contact</Badge>
                <Badge variant="warning">{selectedCustomer.deals.length} deals</Badge>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-violet-900 md:grid-cols-2">
                <p>Website: {selectedCustomer.website ?? "-"}</p>
                <p>Industry: {getCrmLabel(selectedCustomer.industry)}</p>
                <p>Revenue: {selectedCustomer.annualRevenue ? formatCurrency(Number(selectedCustomer.annualRevenue)) : "-"}</p>
                <p>Updated: {formatDate(selectedCustomer.updatedAt)}</p>
              </div>
              <div className="mt-4">
                <Link href={`/crm/organizations/${selectedCustomer.id}`} className="text-sm font-semibold text-violet-700 hover:text-violet-800">
                  Buka detail CRM →
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-5">
              <CrmEmptyHint text="Pilih customer CRM untuk melihat master account yang akan dipakai pada invoice penjualan." />
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary">Simpan Draft</Button>
            <Button>Buat Invoice</Button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">Cari Customer CRM</h2>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari company, website, atau notes"
              className={`${crmInputClassName} mt-4`}
            />
            <p className="mt-2 text-xs text-gray-500">Invoice penjualan hanya memakai organization yang ditandai sebagai customer.</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">Alur Integrasi</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-600">
              <li>Customer dipilih dari CRM berdasarkan flag customer.</li>
              <li>Invoice merujuk ke sales order dan delivery order yang sama.</li>
              <li>Setelah valid, invoice dapat diteruskan ke accounting untuk AR dan revenue.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Preview Customer CRM untuk Invoice Penjualan</h2>
          <p className="text-sm text-gray-500">{rows.length} customer tersedia</p>
        </div>
        {isLoading ? (
          <div className="p-5 text-sm text-gray-500">Memuat customer dari CRM...</div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <CrmEmptyHint text="Belum ada organization CRM yang ditandai sebagai customer." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Industry</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Revenue</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Contacts</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {rows.map((customer) => (
                  <tr key={customer.id}>
                    <td className="px-4 py-3 font-medium text-gray-900">{customer.company}</td>
                    <td className="px-4 py-3 text-gray-600">{getCrmLabel(customer.industry)}</td>
                    <td className="px-4 py-3 text-gray-600">{customer.annualRevenue ? formatCurrency(Number(customer.annualRevenue)) : "-"}</td>
                    <td className="px-4 py-3 text-gray-600">{customer.contacts.length}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(customer.updatedAt)}</td>
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
