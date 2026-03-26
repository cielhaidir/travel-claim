import { CrmModulePlaceholder } from "@/components/features/crm/CrmModulePlaceholder";

export default function CrmProductsServicesPage() {
  return (
    <CrmModulePlaceholder
      title="CRM Products / Services"
      description="Modul products/services untuk katalog produk, jasa, harga, dan integrasi stok."
      notes={[
        "Belum ada katalog produk/jasa CRM saat ini.",
        "Modul ini akan berguna untuk quotation dan deals agar nilai transaksi lebih terstruktur.",
      ]}
    />
  );
}
