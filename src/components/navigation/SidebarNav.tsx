"use client";

import Link from "next/link";
import type { Session } from "next-auth";
import {
  hasPermissionMap,
  type PermissionAction,
} from "@/lib/auth/permissions";

interface NavItem {
  label: string;
  href: string;
  icon: string;
  moduleKey: string;
  action?: PermissionAction;
}

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
    label: "Akuntansi & Keuangan",
    href: "/accounting",
    icon: "AK",
    moduleKey: "accounting",
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

export function SidebarNav({
  session,
  currentPath,
  onNavigate,
}: SidebarNavProps) {
  const canAccessAsRoot = session.user.isRoot === true;

  const allowedItems = navigationItems.filter((item) => {
    if (canAccessAsRoot) {
      return true;
    }

    return hasPermissionMap(
      session.user.permissions,
      item.moduleKey,
      item.action ?? "read",
    );
  });

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto p-4">
      {allowedItems.map((item) => {
        const isActive =
          currentPath === item.href ||
          (item.href !== "/" && currentPath.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-blue-50 text-blue-700"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gray-100 text-[10px] font-semibold tracking-[0.14em] text-gray-600">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
