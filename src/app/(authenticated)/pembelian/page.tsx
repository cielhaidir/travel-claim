"use client";

import { BusinessWorkspacePage } from "@/components/features/module-placeholders/BusinessWorkspacePage";

export default function PembelianPage() {
  return (
    <BusinessWorkspacePage
      permissionModule="purchases"
      title="Pembelian"
      description="Workspace pembelian untuk mengelola vendor, permintaan pembelian, purchase order, penerimaan barang, dan invoice vendor."
      links={[
        {
          label: "Vendor (CRM)",
          href: "/pembelian/vendor",
          description: "Master vendor pembelian yang membaca data organization dari CRM.",
        },
        {
          label: "Purchase Request",
          href: "/pembelian/purchase-request",
          description: "Pengajuan kebutuhan pembelian dari user atau departemen.",
        },
        {
          label: "Purchase Order",
          href: "/pembelian/purchase-order",
          description: "Pembuatan dan monitoring PO ke vendor.",
        },
        {
          label: "Goods Receipt",
          href: "/pembelian/goods-receipt",
          description: "Penerimaan barang dari vendor dan validasi kuantitas/barang datang.",
        },
        {
          label: "Invoice Vendor",
          href: "/pembelian/vendor-invoice",
          description: "Pencatatan tagihan vendor untuk proses matching dan pembayaran.",
        },
      ]}
    />
  );
}
