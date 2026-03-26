import { CrmModulePlaceholder } from "@/components/features/crm/CrmModulePlaceholder";

export default function CrmSalesOrdersPage() {
  return (
    <CrmModulePlaceholder
      title="CRM Sales / Orders"
      description="Modul sales & orders untuk quotation, data penjualan, dan invoice/faktur."
      notes={[
        "Belum ada integrasi quotation dan order saat ini.",
        "Modul ini cocok dihubungkan dengan deals agar proses closing sampai invoicing tersambung.",
      ]}
    />
  );
}
