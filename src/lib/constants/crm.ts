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
  { label: "CRM Dashboard", href: "/crm" },
  { label: "Leads", href: "/crm/leads" },
  { label: "Deals", href: "/crm/deals" },
  { label: "Contacts", href: "/crm/contacts" },
  { label: "Organizations", href: "/crm/organizations" },
  { label: "Tasks", href: "/crm/tasks" },
  { label: "Notes", href: "/crm/notes" },
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
  MALE: "Male",
  FEMALE: "Female",
  OTHER: "Other",
  NEW: "New",
  CONTACTED: "Contacted",
  NURTURE: "Nurture",
  QUALIFIED: "Qualified",
  CONVERTED: "Converted",
  UNQUALIFIED: "Unqualified",
  JUNK: "Junk",
  QUALIFICATION: "Qualification",
  DEMO_MAKING: "Demo / Making",
  PROPOSAL_QUOTATION: "Proposal / Quotation",
  NEGOTIATION: "Negotiation",
  READY_TO_CLOSE: "Ready To Close",
  WON: "Won",
  LOST: "Lost",
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  ONE_TO_TEN: "1-10",
  ELEVEN_TO_FIFTY: "11-50",
  FIFTY_ONE_TO_TWO_HUNDRED: "51-200",
  TWO_HUNDRED_ONE_TO_FIVE_HUNDRED: "201-500",
  FIVE_HUNDRED_ONE_TO_ONE_THOUSAND: "501-1,000",
  OVER_ONE_THOUSAND: "1,000+",
  TECHNOLOGY: "Technology",
  FINANCE: "Finance",
  HEALTHCARE: "Healthcare",
  EDUCATION: "Education",
  MANUFACTURING: "Manufacturing",
  RETAIL: "Retail",
  LOGISTICS: "Logistics",
  HOSPITALITY: "Hospitality",
  GOVERNMENT: "Government",
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
