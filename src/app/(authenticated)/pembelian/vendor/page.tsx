"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/features/PageHeader";
import { CrmEmptyHint, crmInputClassName, CrmMetricCard } from "@/components/features/crm/shared";
import { userHasPermission } from "@/lib/auth/role-check";
import { getCrmLabel } from "@/lib/constants/crm";
import { formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";
import { useState } from "react";

export default function PembelianVendorPage() {
  const { data: session, status } = useSession();
  const [search, setSearch] = useState("");
  const isAllowed = session?.user ? userHasPermission(session.user, "purchases", "read") : false;

  const { data: organizations, isLoading } = api.crm.listOrganizations.useQuery(
    { search: search || undefined, usage: "vendor" },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );

  const rows = organizations ?? [];
  const activeRows = rows.filter((item) => item.status === "ACTIVE");
  const withContacts = rows.filter((item) => item.contacts.length > 0);
  const withDeals = rows.filter((item) => item.deals.length > 0);

  if (status === "loading") {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
        Memuat sesi dan data vendor pembelian...
      </div>
    );
  }

  if (status !== "authenticated" || !session?.user) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 shadow-sm">
        Sesi login tidak ditemukan. Silakan login ulang untuk mengakses data vendor pembelian.
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-900 shadow-sm">
        Anda tidak memiliki akses untuk melihat data vendor pembelian.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendor"
        description="Master vendor pembelian memakai data organization dari CRM sebagai single source of truth."
        badge={<Badge variant="info">Sumber: CRM Organizations</Badge>}
        primaryAction={{ label: "Buka CRM Organizations", href: "/crm/organizations" }}
        secondaryAction={{ label: "Kembali ke Pembelian", href: "/pembelian" }}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <CrmMetricCard label="Total Organization" value={String(rows.length)} helper="Semua kandidat vendor dari CRM" />
        <CrmMetricCard label="Status Active" value={String(activeRows.length)} helper="Siap dipakai pada transaksi pembelian" />
        <CrmMetricCard label="Memiliki Contact" value={String(withContacts.length)} helper="Organization dengan PIC/contact CRM" />
        <CrmMetricCard label="Punya Deal CRM" value={String(withDeals.length)} helper="Berguna untuk hubungan account lintas modul" />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari nama organization, website, atau catatan CRM"
          className={crmInputClassName}
        />
        <p className="mt-2 text-xs text-gray-500">
          Data vendor tidak disimpan terpisah. Modul pembelian membaca master organization dari CRM.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Daftar Vendor dari CRM</h2>
          <p className="text-sm text-gray-500">{rows.length} records</p>
        </div>

        {isLoading ? (
          <div className="p-5 text-sm text-gray-500">Memuat data vendor dari CRM...</div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <CrmEmptyHint text="Belum ada organization CRM yang bisa dipakai sebagai vendor." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Vendor / Organization</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Website</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Industry</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Employees</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">CRM Relations</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Updated</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {rows.map((organization) => (
                  <tr key={organization.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{organization.company}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant={organization.status === "ACTIVE" ? "success" : "default"}>
                          {getCrmLabel(organization.status)}
                        </Badge>
                        <Badge variant="info">{organization.contacts.length} contact</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{organization.website ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-600">{getCrmLabel(organization.industry)}</td>
                    <td className="px-4 py-3 text-gray-600">{getCrmLabel(organization.employeeCount)}</td>
                    <td className="px-4 py-3 text-gray-600">{organization.deals.length} deals</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(organization.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/crm/organizations/${organization.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-700">
                        Lihat di CRM
                      </Link>
                    </td>
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
