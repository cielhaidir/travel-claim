import { CrmModulePlaceholder } from "@/components/features/crm/CrmModulePlaceholder";

export default function CrmMarketingAutomationPage() {
  return (
    <CrmModulePlaceholder
      title="CRM Marketing Automation"
      description="Modul marketing automation untuk campaign, broadcast message, dan workflow otomatis."
      notes={[
        "Belum ada campaign automation saat ini.",
        "Ke depan modul ini dapat mendukung drip campaign dan segment-based outreach.",
      ]}
    />
  );
}
