import { CrmModulePlaceholder } from "@/components/features/crm/CrmModulePlaceholder";

export default function CrmSupportTicketsPage() {
  return (
    <CrmModulePlaceholder
      title="CRM Support Tickets"
      description="Modul support ticketing untuk keluhan pelanggan, status penyelesaian, dan SLA."
      notes={[
        "Belum ada ticketing pelanggan saat ini.",
        "Modul ini bisa menjadi penghubung antara customer support dan account management.",
      ]}
    />
  );
}
