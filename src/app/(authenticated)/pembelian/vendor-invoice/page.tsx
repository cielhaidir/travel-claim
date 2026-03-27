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
import { formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";

export default function VendorInvoicePage() {
  const { data: session } = useSession();
  const [vendorId, setVendorId] = useState("");
  const [search, setSearch] = useState("");
  const isAllowed = session?.user ? userHasPermission(session.user, "purchases", "read") : false;

  const { data: vendors, isLoading } = api.crm.listOrganizations.useQuery(
    { search: search || undefined, usage: "vendor" },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );

  const rows = useMemo(() => vendors ?? [], [vendors]);
  const selectedVendor = useMemo(() => rows.find((item) => item.id === vendorId) ?? null, [rows, vendorId]);

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoice Vendor"
        description="Tagihan vendor memakai master vendor CRM yang sama dengan PO dan goods receipt untuk matching yang konsisten."
        badge={<Badge variant="info">Vendor Source: CRM</Badge>}
        primaryAction={{ label: "Buka Vendor (CRM)", href: "/pembelian/vendor" }}
        secondaryAction={{ label: "Kembali ke Pembelian", href: "/pembelian" }}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <CrmMetricCard label="Vendor CRM" value={String(rows.length)} helper="Vendor tersedia untuk matching" />
        <CrmMetricCard label="Vendor Aktif" value={String(rows.filter((item) => item.status === "ACTIVE").length)} helper="Layak dipakai di invoice" />
        <CrmMetricCard label="Dengan Contact" value={String(rows.filter((item) => item.contacts.length > 0).length)} helper="PIC penagihan/vendor" />
        <CrmMetricCard label="Dengan Website" value={String(rows.filter((item) => !!item.website).length)} helper="Referensi profil vendor" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Draft Invoice Vendor</h2>
              <p className="mt-1 text-sm text-gray-500">Pilih vendor CRM lalu hubungkan invoice ke PO dan goods receipt untuk 2-way/3-way matching.</p>
            </div>
            <Badge variant="success">Linked</Badge>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-gray-700">Vendor dari CRM</span>
              <select value={vendorId} onChange={(event) => setVendorId(event.target.value)} className={crmInputClassName}>
                <option value="">Pilih vendor</option>
                {rows.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.company}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-gray-700">Nomor Invoice</span>
              <input placeholder="INV-V-XXXX" className={crmInputClassName} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-gray-700">Nomor PO</span>
              <input placeholder="PO-2026-0045" className={crmInputClassName} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-gray-700">Nomor Goods Receipt</span>
              <input placeholder="GR-2026-0018" className={crmInputClassName} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-gray-700">Jatuh Tempo</span>
              <input type="date" className={crmInputClassName} />
            </label>
          </div>

          {selectedVendor ? (
            <div className="mt-5 rounded-xl border border-orange-100 bg-orange-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-orange-950">{selectedVendor.company}</p>
                <Badge variant={selectedVendor.status === "ACTIVE" ? "success" : "default"}>{getCrmLabel(selectedVendor.status)}</Badge>
                <Badge variant="info">{selectedVendor.contacts.length} contact</Badge>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-orange-900 md:grid-cols-2">
                <p>Website: {selectedVendor.website ?? "-"}</p>
                <p>Industry: {getCrmLabel(selectedVendor.industry)}</p>
                <p>Employee Range: {getCrmLabel(selectedVendor.employeeCount)}</p>
                <p>Updated: {formatDate(selectedVendor.updatedAt)}</p>
              </div>
              <div className="mt-4">
                <Link href={`/crm/organizations/${selectedVendor.id}`} className="text-sm font-semibold text-orange-700 hover:text-orange-800">
                  Buka detail CRM →
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-5">
              <CrmEmptyHint text="Pilih vendor CRM untuk melihat master data yang akan dipakai pada invoice vendor." />
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary">Simpan Draft</Button>
            <Button>Input Invoice Vendor</Button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">Cari Vendor CRM</h2>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari company, website, atau notes"
              className={`${crmInputClassName} mt-4`}
            />
            <p className="mt-2 text-xs text-gray-500">Vendor invoice memakai source master yang sama dengan PO dan receipt.</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">Alur Integrasi</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-600">
              <li>Vendor dipilih dari CRM berdasarkan flag vendor.</li>
              <li>Invoice vendor mengacu ke PO dan goods receipt untuk matching dokumen.</li>
              <li>Setelah valid, invoice vendor dapat diteruskan ke accounting sebagai hutang.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Preview Vendor CRM untuk Invoice Vendor</h2>
          <p className="text-sm text-gray-500">{rows.length} vendor tersedia</p>
        </div>
        {isLoading ? (
          <div className="p-5 text-sm text-gray-500">Memuat vendor dari CRM...</div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <CrmEmptyHint text="Belum ada organization CRM yang ditandai sebagai vendor." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Vendor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Website</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Industry</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Contacts</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {rows.map((vendor) => (
                  <tr key={vendor.id}>
                    <td className="px-4 py-3 font-medium text-gray-900">{vendor.company}</td>
                    <td className="px-4 py-3 text-gray-600">{vendor.website ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-600">{getCrmLabel(vendor.industry)}</td>
                    <td className="px-4 py-3 text-gray-600">{vendor.contacts.length}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(vendor.updatedAt)}</td>
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
