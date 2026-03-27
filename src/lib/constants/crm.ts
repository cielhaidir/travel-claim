export type CrmBadgeVariant =
  | "default"
  | "info"
  | "warning"
  | "success"
  | "danger";

export type CrmActiveModule = {
  label: string;
  href: string;
};

export const CRM_ACTIVE_MODULES: CrmActiveModule[] = [
  { label: "Dasbor CRM", href: "/crm" },
  { label: "Prospek", href: "/crm/leads" },
  { label: "Peluang", href: "/crm/deals" },
  { label: "Kontak", href: "/crm/contacts" },
  { label: "Organisasi", href: "/crm/organizations" },
  { label: "Tugas", href: "/crm/tasks" },
  { label: "Catatan", href: "/crm/notes" },
];

export const CRM_GENDER_OPTIONS = ["MALE", "FEMALE", "OTHER"] as const;
export const CRM_LEAD_STATUS_OPTIONS = [
  "NEW",
  "CONTACTED",
  "NURTURE",
  "QUALIFIED",
  "CONVERTED",
  "UNQUALIFIED",
  "JUNK",
] as const;
export const CRM_LEAD_MANUAL_STATUS_OPTIONS = [
  "NEW",
  "CONTACTED",
  "NURTURE",
  "QUALIFIED",
  "UNQUALIFIED",
  "JUNK",
] as const;
export const CRM_DEAL_STATUS_OPTIONS = [
  "QUALIFICATION",
  "DEMO_MAKING",
  "PROPOSAL_QUOTATION",
  "NEGOTIATION",
  "READY_TO_CLOSE",
  "WON",
  "LOST",
] as const;
export const CRM_TASK_STATUS_OPTIONS = [
  "OPEN",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;
export const CRM_TASK_PRIORITY_OPTIONS = ["LOW", "MEDIUM", "HIGH"] as const;
export const CRM_EMPLOYEE_RANGE_OPTIONS = [
  "ONE_TO_TEN",
  "ELEVEN_TO_FIFTY",
  "FIFTY_ONE_TO_TWO_HUNDRED",
  "TWO_HUNDRED_ONE_TO_FIVE_HUNDRED",
  "FIVE_HUNDRED_ONE_TO_ONE_THOUSAND",
  "OVER_ONE_THOUSAND",
] as const;
export const CRM_INDUSTRY_OPTIONS = [
  "TECHNOLOGY",
  "FINANCE",
  "HEALTHCARE",
  "EDUCATION",
  "MANUFACTURING",
  "RETAIL",
  "LOGISTICS",
  "HOSPITALITY",
  "GOVERNMENT",
  "OTHER",
] as const;

const CRM_LABELS: Record<string, string> = {
  MALE: "Laki-laki",
  FEMALE: "Perempuan",
  OTHER: "Lainnya",
  NEW: "Baru",
  CONTACTED: "Sudah Dihubungi",
  NURTURE: "Dipelihara",
  QUALIFIED: "Terkualifikasi",
  CONVERTED: "Dikonversi",
  UNQUALIFIED: "Tidak Terkualifikasi",
  JUNK: "Tidak Valid",
  QUALIFICATION: "Kualifikasi",
  DEMO_MAKING: "Demo / Presentasi",
  PROPOSAL_QUOTATION: "Proposal / Penawaran",
  NEGOTIATION: "Negosiasi",
  READY_TO_CLOSE: "Siap Ditutup",
  WON: "Menang",
  LOST: "Kalah",
  OPEN: "Terbuka",
  IN_PROGRESS: "Sedang Dikerjakan",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
  LOW: "Rendah",
  MEDIUM: "Sedang",
  HIGH: "Tinggi",
  ONE_TO_TEN: "1-10",
  ELEVEN_TO_FIFTY: "11-50",
  FIFTY_ONE_TO_TWO_HUNDRED: "51-200",
  TWO_HUNDRED_ONE_TO_FIVE_HUNDRED: "201-500",
  FIVE_HUNDRED_ONE_TO_ONE_THOUSAND: "501-1,000",
  OVER_ONE_THOUSAND: "1,000+",
  TECHNOLOGY: "Teknologi",
  FINANCE: "Keuangan",
  HEALTHCARE: "Kesehatan",
  EDUCATION: "Pendidikan",
  MANUFACTURING: "Manufaktur",
  RETAIL: "Ritel",
  LOGISTICS: "Logistik",
  HOSPITALITY: "Perhotelan",
  GOVERNMENT: "Pemerintahan",
  REFERRAL: "Referensi",
  WEBSITE: "Situs Web",
  EVENT: "Acara",
  OUTBOUND: "Penjangkauan Aktif",
  PARTNER: "Mitra",
  ENTERPRISE: "Perusahaan Besar",
  SMB: "UKM",
  ACTIVE: "Aktif",
  INACTIVE: "Tidak Aktif",
  VIP: "VIP",
  DISCOVERY: "Eksplorasi",
  PROPOSAL: "Proposal",
  VERBAL_WON: "Verbal Menang",
  ON_HOLD: "Ditunda",
  CALL: "Panggilan",
  MEETING: "Pertemuan",
  EMAIL: "Email",
  FOLLOW_UP: "Tindak Lanjut",
  CHAT: "Obrolan",
  STAGE_CHANGE: "Perubahan Tahap",
  NOTE: "Catatan",
  TASK: "Tugas",
  ATTACHMENT: "Lampiran",
  SYSTEM: "Sistem",
  WAITING_REPLY: "Menunggu Balasan",
  CLOSED: "Ditutup",
  DRAFT: "Draf",
  SENT: "Terkirim",
  RECEIVED: "Diterima",
};

const CRM_BADGE_VARIANTS: Record<string, CrmBadgeVariant> = {
  NEW: "default",
  CONTACTED: "info",
  NURTURE: "warning",
  QUALIFIED: "success",
  CONVERTED: "success",
  UNQUALIFIED: "danger",
  JUNK: "danger",
  QUALIFICATION: "default",
  DEMO_MAKING: "info",
  PROPOSAL_QUOTATION: "warning",
  NEGOTIATION: "warning",
  READY_TO_CLOSE: "success",
  WON: "success",
  LOST: "danger",
  OPEN: "default",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  CANCELLED: "danger",
  LOW: "default",
  MEDIUM: "warning",
  HIGH: "danger",
};

export function getCrmLabel(value: string | null | undefined) {
  if (!value) return "-";
  return CRM_LABELS[value] ?? value;
}

export function getCrmBadgeVariant(value: string | null | undefined): CrmBadgeVariant {
  if (!value) return "default";
  return CRM_BADGE_VARIANTS[value] ?? "default";
}

export function canConvertLeadStatus(value: string | null | undefined) {
  return value === "QUALIFIED";
}

export function getLeadConversionBlockedReason(value: string | null | undefined) {
  switch (value) {
    case "NEW":
      return "Prospek masih baru dan belum lolos kualifikasi.";
    case "CONTACTED":
      return "Prospek sudah dihubungi, tetapi peluangnya belum terverifikasi.";
    case "NURTURE":
      return "Prospek masih dalam tahap pemeliharaan dan belum siap menjadi peluang.";
    case "UNQUALIFIED":
      return "Prospek dengan status Tidak Terkualifikasi tidak dapat dikonversi.";
    case "JUNK":
      return "Prospek dengan status Tidak Valid tidak dapat dikonversi.";
    case "CONVERTED":
      return "Prospek ini sudah pernah dikonversi menjadi peluang.";
    default:
      return null;
  }
}
