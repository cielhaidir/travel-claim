import { CrmModulePlaceholder } from "@/components/features/crm/CrmModulePlaceholder";

export default function CrmCommunicationPage() {
  return (
    <CrmModulePlaceholder
      title="CRM Communication"
      description="Modul komunikasi untuk email integration, WhatsApp/SMS, dan template pesan CRM."
      notes={[
        "Belum ada integrasi komunikasi langsung saat ini.",
        "Modul ini akan menjadi pusat outbound communication untuk sales dan account management.",
      ]}
    />
  );
}
