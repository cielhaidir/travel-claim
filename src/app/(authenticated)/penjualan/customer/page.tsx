"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/features/PageHeader";
import { CrmEmptyHint, crmInputClassName, CrmMetricCard } from "@/components/features/crm/shared";
import { userHasPermission } from "@/lib/auth/role-check";
import { getCrmLabel } from "@/lib/constants/crm";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";

export default function CustomerSalesPage() {
  const { data: session } = useSession();
  const [search, setSearch] = useState("");
  const isAllowed = session?.user ? userHasPermission(session.user, "sales", "read") : false;

  const { data: organizations, isLoading } = api.crm.listOrganizations.useQuery(
    { search: search || undefined, usage: "customer" },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );

  const rows = organizations ?? [];
  const activeRows = rows.filter((item) => item.status === "ACTIVE");
  const totalDeals = rows.reduce((sum, item) => sum + item.deals.length, 0);
  const totalContacts = rows.reduce((sum, item) => sum + item.contacts.length, 0);
  const totalRevenue = rows.reduce((sum, item) => sum + Number(item.annualRevenue ?? 0), 0);

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer"
        description="Master customer penjualan memakai data organization dari CRM sebagai sumber utama."
        badge={<Badge variant="success">Sinkron dengan CRM Organizations</Badge>}
        primaryAction={{ label: "Buka CRM Organizations", href: "/crm/organizations" }}
        secondaryAction={{ label: "Kembali ke Penjualan", href: "/penjualan" }}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <CrmMetricCard label="Total Customer" value={String(rows.length)} helper="Seluruh organization CRM" />
        <CrmMetricCard label="Status Active" value={String(activeRows.length)} helper="Siap dipakai quotation & sales order" />
        <CrmMetricCard label="Total Contacts" value={String(totalContacts)} helper="PIC/contact yang terhubung" />
        <CrmMetricCard label="Annual Revenue" value={formatCurrency(totalRevenue)} helper={`Total ${totalDeals} deals tercatat`} />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari nama organization, website, atau catatan CRM"
          className={crmInputClassName}
        />
        <p className="mt-2 text-xs text-gray-500">
          Data customer penjualan mengikuti master organization CRM agar tidak ada duplikasi customer lintas modul.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Daftar Customer dari CRM</h2>
          <p className="text-sm text-gray-500">{rows.length} records</p>
        </div>

        {isLoading ? (
          <div className="p-5 text-sm text-gray-500">Memuat data customer dari CRM...</div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <CrmEmptyHint text="Belum ada organization CRM yang bisa dipakai sebagai customer." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Customer / Organization</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Website</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Industry</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Revenue</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Contacts</th>
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
                        <Badge variant="info">{organization.deals.length} deals</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{organization.website ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-600">{getCrmLabel(organization.industry)}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {organization.annualRevenue ? formatCurrency(Number(organization.annualRevenue)) : "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{organization.contacts.length}</td>
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
