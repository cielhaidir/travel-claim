"use client";

import Link from "next/link";
import type { Session } from "next-auth";
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Building2,
  FolderKanban,
  HandCoins,
  LayoutDashboard,
  PlaneTakeoff,
  ReceiptText,
  ShieldCheck,
  UserCircle2,
  Users,
  Wallet,
} from "lucide-react";
import {
  hasPermissionMap,
  type PermissionAction,
} from "@/lib/auth/permissions";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  moduleKey: string;
  action?: PermissionAction;
}

const navigationItems: NavItem[] = [
  {
    label: "Dasbor",
    href: "/dashboard",
    icon: LayoutDashboard,
    moduleKey: "dashboard",
  },
  {
    label: "Pengajuan Perjalanan Dinas",
    href: "/travel",
    icon: PlaneTakeoff,
    moduleKey: "travel",
  },
  {
    label: "Proyek",
    href: "/projects",
    icon: FolderKanban,
    moduleKey: "projects",
  },
  {
    label: "Persetujuan Bailout",
    href: "/bailout",
    icon: HandCoins,
    moduleKey: "bailout",
  },
  {
    label: "Klaim",
    href: "/claims",
    icon: ReceiptText,
    moduleKey: "claims",
  },
  {
    label: "Persetujuan",
    href: "/approvals",
    icon: BadgeCheck,
    moduleKey: "approvals",
  },
  {
    label: "Akuntansi & Keuangan",
    href: "/accounting",
    icon: Wallet,
    moduleKey: "accounting",
  },
  {
    label: "Manajemen Pengguna",
    href: "/admin/users",
    icon: Users,
    moduleKey: "users",
  },
  {
    label: "Master Tenant",
    href: "/admin/tenants",
    icon: Building2,
    moduleKey: "tenants",
  },
  {
    label: "Manajemen Peran",
    href: "/admin/roles",
    icon: ShieldCheck,
    moduleKey: "roles",
  },
  {
    label: "Profil",
    href: "/profile",
    icon: UserCircle2,
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
    <nav className="flex-1 overflow-y-auto px-3 py-4 bg-white">
      {allowedItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          currentPath === item.href ||
          (item.href !== "/" && currentPath.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`mb-1 flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors ${
              isActive
                ? "bg-[#2f5ec7] text-white shadow-sm"
                : "text-[#3e3e42] hover:bg-gray-100"
            }`}
          >
            <span
              className={`inline-flex h-8 w-8 items-center justify-center ${
                isActive ? "text-white" : "text-[#4a4a4e]"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
            <span className="text-sm font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
