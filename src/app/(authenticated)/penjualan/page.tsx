"use client";

import { BusinessWorkspacePage } from "@/components/features/module-placeholders/BusinessWorkspacePage";

export default function PenjualanPage() {
  return (
    <BusinessWorkspacePage
      permissionModule="sales"
      title="Penjualan"
      description="Workspace penjualan untuk mengelola customer, quotation, sales order, delivery order, dan invoice penjualan."
      links={[
        {
          label: "Customer (CRM)",
          href: "/penjualan/customer",
          description: "Master customer penjualan yang membaca data organization dari CRM.",
        },
        {
          label: "Quotation",
          href: "/penjualan/quotation",
          description: "Pembuatan penawaran harga dan approval penawaran.",
        },
        {
          label: "Sales Order",
          href: "/penjualan/sales-order",
          description: "Order penjualan yang disetujui dan siap diproses lebih lanjut.",
        },
        {
          label: "Delivery Order",
          href: "/penjualan/delivery-order",
          description: "Pengiriman barang ke customer dan status fulfillment order.",
        },
        {
          label: "Invoice Penjualan",
          href: "/penjualan/invoice",
          description: "Tagihan customer dan monitoring status penagihan.",
        },
      ]}
    />
  );
}
