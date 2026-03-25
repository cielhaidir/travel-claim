"use client";

import Link from "next/link";
import type { Session } from "next-auth";
import {
  CRM_ROLES,
  hasAnyRole,
  normalizeRoles,
  type Role,
} from "@/lib/constants/roles";

interface NavItem {
  label: string;
  href: string;
  icon?: string;
  roles?: Role[];
  children?: NavItem[];
  comingSoon?: boolean;
}

const crmChildren: NavItem[] = [
  { label: "CRM Dashboard", href: "/crm" },
  { label: "Customers", href: "/crm/customers" },
  { label: "Leads", href: "/crm/leads" },
  { label: "Deals", href: "/crm/deals" },
  { label: "Activities", href: "/crm/activities" },
  { label: "Communication", href: "/crm/communication", comingSoon: true },
  { label: "Sales / Orders", href: "/crm/sales-orders", comingSoon: true },
  { label: "Reports", href: "/crm/reports" },
  { label: "Support Tickets", href: "/crm/support-tickets", comingSoon: true },
  {
    label: "Marketing Automation",
    href: "/crm/marketing-automation",
    comingSoon: true,
  },
  {
    label: "Products / Services",
    href: "/crm/products-services",
    comingSoon: true,
  },
];

const accountingChildren: NavItem[] = [
  { label: "Finance", href: "/finance" },
  { label: "Jurnal", href: "/journal" },
  { label: "Bagan Akun", href: "/chart-of-accounts" },
  { label: "Employee Advance Control", href: "/reports/employee-advance-control" },
  { label: "General Ledger", href: "/reports/general-ledger" },
  { label: "Trial Balance", href: "/reports/trial-balance" },
];

const navigationItems: NavItem[] = [
  {
    label: "Dasbor",
    href: "/dashboard",
    icon: "📊",
  },
  {
    label: "Pengajuan Perjalanan Dinas",
    href: "/travel",
    icon: "✈️",
  },
  {
    label: "Proyek",
    href: "/projects",
    icon: "📁",
    roles: ["MANAGER", "DIRECTOR", "ADMIN", "SALES_CHIEF", "SALES_EMPLOYEE"],
  },
  {
    label: "Persetujuan Bailout",
    href: "/bailout",
    icon: "💼",
    roles: ["SALES_CHIEF", "MANAGER", "DIRECTOR", "FINANCE", "ADMIN"],
  },
  {
    label: "Klaim",
    href: "/claims",
    icon: "💰",
  },
  {
    label: "Persetujuan",
    href: "/approvals",
    icon: "✅",
    roles: [
      "SUPERVISOR",
      "MANAGER",
      "DIRECTOR",
      "FINANCE",
      "ADMIN",
      "SALES_CHIEF",
    ],
  },
  {
    label: "CRM",
    href: "/crm",
    icon: "🤝",
    roles: CRM_ROLES,
    children: crmChildren,
  },
  {
    label: "Akuntansi & Keuangan",
    href: "/accounting",
    icon: "🏦",
    roles: ["FINANCE", "ADMIN"],
    children: accountingChildren,
  },
  {
    label: "Manajemen Pengguna",
    href: "/admin/users",
    icon: "👥",
    roles: ["ADMIN"],
  },
  {
    label: "Master Tenant",
    href: "/admin/tenants",
    icon: "🏢",
    roles: ["ROOT"],
  },
  {
    label: "Profile",
    href: "/profile",
    icon: "👤",
  },
];

interface SidebarNavProps {
  session: Session;
  currentPath: string;
  onNavigate?: () => void;
}

export function SidebarNav({
  session,
  currentPath,
  onNavigate,
}: SidebarNavProps) {
  const userRole = session.user.role ?? "EMPLOYEE";
  const userRoles = normalizeRoles({
    roles: session.user.roles,
    role: userRole,
  });
  const canAccessAsRoot = session.user.isRoot === true;

  const allowedItems = navigationItems.filter(
    (item) =>
      !item.roles ||
      canAccessAsRoot ||
      hasAnyRole(userRoles, [...item.roles, "ROOT"]),
  );

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto p-4">
      {allowedItems.map((item) => {
        const isActive =
          currentPath === item.href ||
          (item.href !== "/" && currentPath.startsWith(item.href));

        return (
          <div key={item.href} className="space-y-1">
            <Link
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <span className="flex items-center space-x-3">
                {item.icon ? <span className="text-xl">{item.icon}</span> : null}
                <span>{item.label}</span>
              </span>
              {item.children?.length ? (
                <span className="text-xs text-gray-400">{isActive ? "▾" : "▸"}</span>
              ) : null}
            </Link>

            {item.children?.length && isActive ? (
              <div className="ml-4 space-y-1 border-l border-gray-200 pl-3">
                {item.children.map((child) => {
                  const childActive =
                    currentPath === child.href ||
                    (child.href !== "/" && currentPath.startsWith(child.href));

                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={onNavigate}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                        childActive
                          ? "bg-blue-50 font-semibold text-blue-700"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      <span>{child.label}</span>
                      {child.comingSoon ? (
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                          Soon
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
