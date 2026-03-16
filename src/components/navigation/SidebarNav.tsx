"use client";

import Link from "next/link";
import type { Session } from "next-auth";
import { hasAnyRole, normalizeRoles, type Role } from "@/lib/constants/roles";

interface NavItem {
  label: string;
  href: string;
  icon: string;
  roles?: Role[];
}

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
    label: "Keuangan",
    href: "/finance",
    icon: "💵",
    roles: ["FINANCE", "ADMIN"],
  },
  {
    label: "Jurnal",
    href: "/journal",
    icon: "🧾",
    roles: ["FINANCE", "ADMIN"],
  },
  {
    label: "Akuntansi Perusahaan",
    href: "/accounting",
    icon: "🏦",
    roles: ["FINANCE", "ADMIN"],
  },
  {
    label: "Bagan Akun",
    href: "/chart-of-accounts",
    icon: "📋",
    roles: ["FINANCE", "ADMIN"],
  },
  {
    label: "Manajemen Pengguna",
    href: "/admin/users",
    icon: "👥",
    roles: ["ADMIN"],
  },
  {
    label: "Profil",
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

  const allowedItems = navigationItems.filter(
    (item) => !item.roles || hasAnyRole(userRoles, item.roles),
  );

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
            <span className="text-xl">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
