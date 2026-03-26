import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/features/EmptyState";
import { PageHeader } from "@/components/features/PageHeader";

type CrmModulePlaceholderProps = {
  title: string;
  description: string;
  status?: "active" | "coming-soon";
  notes?: string[];
  primaryHref?: string;
  primaryLabel?: string;
};

export function CrmModulePlaceholder({
  title,
  description,
  status = "coming-soon",
  notes = [],
  primaryHref = "/crm",
  primaryLabel = "Kembali ke CRM Dashboard",
}: CrmModulePlaceholderProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        badge={
          <Badge variant={status === "active" ? "success" : "warning"}>
            {status === "active" ? "Aktif" : "Coming Soon"}
          </Badge>
        }
        secondaryAction={{
          label: "CRM Dashboard",
          href: "/crm",
        }}
      />

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">Status Modul</h2>
        <p className="mt-2 text-sm text-gray-600">{description}</p>

        {notes.length > 0 && (
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-600">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <EmptyState
          icon={status === "active" ? "🤝" : "🚧"}
          title={status === "active" ? `${title} siap digunakan` : `${title} sedang disiapkan`}
          description={
            status === "active"
              ? "Modul ini sudah tersedia dalam struktur CRM dan siap dikembangkan lebih lanjut."
              : "Halaman ini sudah disiapkan dalam struktur menu CRM, tetapi fitur detailnya masih akan dibangun bertahap."
          }
          action={{ label: primaryLabel, href: primaryHref }}
        />
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/crm/customers" className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50">
          Customers
        </Link>
        <Link href="/crm/leads" className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50">
          Leads
        </Link>
        <Link href="/crm/activities" className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50">
          Activities
        </Link>
      </div>
    </div>
  );
}
