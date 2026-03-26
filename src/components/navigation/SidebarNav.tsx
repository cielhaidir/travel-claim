"use client";

import Link from "next/link";
import type { Session } from "next-auth";
import { hasPermissionMap, type PermissionAction } from "@/lib/auth/permissions";
import {
  CRM_ROLES,
  hasAnyRole,
  normalizeRoles,
  type Role,
} from "@/lib/constants/roles";

interface NavItem {
  label: string;
  href: string;
  icon: string;
  moduleKey?: string;
  action?: PermissionAction;
  roles?: Role[];
  children?: NavItem[];
  comingSoon?: boolean;
}

const crmChildren: NavItem[] = [
  { label: "CRM Dashboard", href: "/crm", icon: "CD" },
  { label: "Customers", href: "/crm/customers", icon: "CU" },
  { label: "Leads", href: "/crm/leads", icon: "LE" },
  { label: "Deals", href: "/crm/deals", icon: "DE" },
  { label: "Activities", href: "/crm/activities", icon: "AC" },
  {
    label: "Communication",
    href: "/crm/communication",
    icon: "CM",
    comingSoon: true,
  },
  {
    label: "Sales / Orders",
    href: "/crm/sales-orders",
    icon: "SO",
    comingSoon: true,
  },
  { label: "Reports", href: "/crm/reports", icon: "RP" },
  {
    label: "Support Tickets",
    href: "/crm/support-tickets",
    icon: "ST",
    comingSoon: true,
  },
  {
    label: "Marketing Automation",
    href: "/crm/marketing-automation",
    icon: "MA",
    comingSoon: true,
  },
  {
    label: "Products / Services",
    href: "/crm/products-services",
    icon: "PS",
    comingSoon: true,
  },
];

const accountingChildren: NavItem[] = [
  { label: "Finance", href: "/finance", icon: "FN" },
  { label: "Jurnal", href: "/journal", icon: "JR" },
  { label: "Bagan Akun", href: "/chart-of-accounts", icon: "CO" },
  {
    label: "Employee Advance Control",
    href: "/reports/employee-advance-control",
    icon: "EA",
  },
  { label: "General Ledger", href: "/reports/general-ledger", icon: "GL" },
  { label: "Trial Balance", href: "/reports/trial-balance", icon: "TB" },
  { label: "Laba Rugi", href: "/reports/income-statement", icon: "LR" },
  { label: "Neraca", href: "/reports/balance-sheet", icon: "NR" },
];

const navigationItems: NavItem[] = [
  {
    label: "Dasbor",
    href: "/dashboard",
    icon: "DS",
    moduleKey: "dashboard",
  },
  {
    label: "Pengajuan Perjalanan Dinas",
    href: "/travel",
    icon: "PD",
    moduleKey: "travel",
  },
  {
    label: "Proyek",
    href: "/projects",
    icon: "PR",
    moduleKey: "projects",
  },
  {
    label: "Persetujuan Bailout",
    href: "/bailout",
    icon: "BO",
    moduleKey: "bailout",
  },
  {
    label: "Klaim",
    href: "/claims",
    icon: "KL",
    moduleKey: "claims",
  },
  {
    label: "Persetujuan",
    href: "/approvals",
    icon: "AP",
    moduleKey: "approvals",
  },
  {
    label: "CRM",
    href: "/crm",
    icon: "CRM",
    roles: CRM_ROLES,
    children: crmChildren,
  },
  {
    label: "Akuntansi & Keuangan",
    href: "/accounting",
    icon: "AK",
    moduleKey: "accounting",
    children: accountingChildren,
  },
  {
    label: "Manajemen Pengguna",
    href: "/admin/users",
    icon: "US",
    moduleKey: "users",
  },
  {
    label: "Master Tenant",
    href: "/admin/tenants",
    icon: "TN",
    moduleKey: "tenants",
  },
  {
    label: "Manajemen Peran",
    href: "/admin/roles",
    icon: "RB",
    moduleKey: "roles",
  },
  {
    label: "Profil",
    href: "/profile",
    icon: "PF",
    moduleKey: "profile",
  },
];

interface SidebarNavProps {
  session: Session;
  currentPath: string;
  onNavigate?: () => void;
}

function canAccessItem(session: Session, item: NavItem) {
  if (session.user.isRoot) {
    return true;
  }

  if (item.roles?.length) {
    const roles = normalizeRoles({
      roles: session.user.roles,
      role: session.user.role,
    });
    return hasAnyRole(roles, item.roles);
  }

  if (item.moduleKey) {
    return hasPermissionMap(
      session.user.permissions,
      item.moduleKey,
      item.action ?? "read",
    );
  }

  return true;
}

export function SidebarNav({
  session,
  currentPath,
  onNavigate,
}: SidebarNavProps) {
  const allowedItems = navigationItems.filter((item) => canAccessItem(session, item));

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto p-4">
      {allowedItems.map((item) => {
        const isActive =
          currentPath === item.href ||
          (item.href !== "/" && currentPath.startsWith(item.href));

        const allowedChildren = item.children?.filter((child) =>
          canAccessItem(session, child),
        );

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
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gray-100 text-[10px] font-semibold tracking-[0.14em] text-gray-600">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </span>
              {allowedChildren?.length ? (
                <span className="text-xs text-gray-400">{isActive ? "▾" : "▸"}</span>
              ) : null}
            </Link>

            {allowedChildren?.length && isActive ? (
              <div className="ml-4 space-y-1 border-l border-gray-200 pl-3">
                {allowedChildren.map((child) => {
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
