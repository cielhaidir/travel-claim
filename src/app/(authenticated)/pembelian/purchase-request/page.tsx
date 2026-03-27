"use client";

import { BusinessListPlaceholderPage } from "@/components/features/module-placeholders/BusinessWorkspacePage";

export default function PurchaseRequestPage() {
  return (
    <BusinessListPlaceholderPage
      permissionModule="purchases"
      title="Purchase Request"
      description="Daftar permintaan pembelian dari user atau departemen."
      backHref="/pembelian"
      backLabel="Kembali ke Pembelian"
      createLabel="Buat Purchase Request"
      searchPlaceholder="Cari nomor PR, peminta, atau departemen"
      columns={[
        { key: "number", label: "Nomor PR" },
        { key: "requester", label: "Peminta" },
        { key: "department", label: "Departemen" },
        { key: "needDate", label: "Butuh Tanggal" },
        { key: "amount", label: "Estimasi" },
        { key: "status", label: "Status", kind: "badge" },
      ]}
      rows={[
        { number: "PR-2026-0012", requester: "Dewi Lestari", department: "Operasional", needDate: "04 Apr 2026", amount: "Rp 12.500.000", status: "Submitted", statusVariant: "info" },
        { number: "PR-2026-0011", requester: "Hendra Kurnia", department: "IT", needDate: "02 Apr 2026", amount: "Rp 8.750.000", status: "Approved", statusVariant: "success" },
        { number: "PR-2026-0010", requester: "Rafael Gunawan", department: "GA", needDate: "30 Mar 2026", amount: "Rp 3.200.000", status: "Draft", statusVariant: "default" },
      ]}
      metrics={[
        { label: "Draft PR", value: "4", delta: "Perlu dilengkapi", trend: "neutral", variant: "default" },
        { label: "Menunggu Approval", value: "6", delta: "+2 dari minggu lalu", trend: "up", variant: "warning" },
        { label: "Approved", value: "10", delta: "Siap dikonversi ke PO", trend: "up", variant: "success" },
        { label: "Converted to PO", value: "7", delta: "Realisasi pembelian berjalan", trend: "up", variant: "info" },
      ]}
      stages={[
        "User/departemen mengajukan kebutuhan barang atau jasa.",
        "PR melewati approval sesuai struktur perusahaan atau anggaran.",
        "PR yang disetujui dikonversi menjadi purchase order ke vendor.",
        "Status PR dipantau sampai closed atau canceled.",
      ]}
      relatedLinks={[
        { label: "Vendor", href: "/pembelian/vendor", description: "Vendor master dipakai saat PR naik menjadi PO." },
        { label: "Purchase Order", href: "/pembelian/purchase-order", description: "PR approved akan menjadi referensi pembuatan PO." },
      ]}
      notes={[
        "Tambahkan status draft, submitted, approved, rejected, dan converted to PO.",
        "Sediakan line item kebutuhan barang/jasa dan estimasi anggaran.",
        "Bisa dihubungkan ke approval workflow perusahaan yang sudah ada.",
      ]}
    />
  );
}
