import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/features/EmptyState";
import { PageHeader } from "@/components/features/PageHeader";

type BusinessModulePlaceholderProps = {
  title: string;
  description: string;
  status?: "active" | "coming-soon";
  notes?: string[];
  primaryHref?: string;
  primaryLabel?: string;
  relatedLinks?: Array<{ label: string; href: string }>;
};

export function BusinessModulePlaceholder({
  title,
  description,
  status = "active",
  notes = [],
  primaryHref = "/dashboard",
  primaryLabel = "Kembali ke Dashboard",
  relatedLinks = [],
}: BusinessModulePlaceholderProps) {
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
      />

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">Ringkasan Modul</h2>
        <p className="mt-2 text-sm text-gray-600">{description}</p>

        {notes.length > 0 ? (
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-600">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <EmptyState
          icon={status === "active" ? "🧩" : "🚧"}
          title={status === "active" ? `${title} siap dikembangkan` : `${title} sedang disiapkan`}
          description={
            status === "active"
              ? "Struktur menu dan halaman sudah tersedia. Langkah berikutnya tinggal menambahkan flow transaksi, master data, dan laporan sesuai kebutuhan bisnis Anda."
              : "Halaman ini sudah disiapkan namun fitur detailnya masih akan dibangun bertahap."
          }
          action={{ label: primaryLabel, href: primaryHref }}
        />
      </div>

      {relatedLinks.length > 0 ? (
        <div className="flex flex-wrap gap-3 text-sm">
          {relatedLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50"
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
