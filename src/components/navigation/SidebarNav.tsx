"use client";

import Link from "next/link";
import type { Session } from "next-auth";

interface NavItem {
  label: string;
  href: string;
  icon: string;
  roles?: string[];
}

const navigationItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/",
    icon: "📊",
  },
  {
    label: "Business Trip Requests",
    href: "/travel",
    icon: "✈️",
  },
  {
    label: "Claims",
    href: "/claims",
    icon: "💰",
  },
  {
    label: "Approvals",
    href: "/approvals",
    icon: "✅",
    roles: ["SUPERVISOR", "MANAGER", "DIRECTOR", "FINANCE_MANAGER", "ADMIN"],
  },
  {
    label: "Chart of Accounts",
    href: "/chart-of-accounts",
    icon: "📋",
    roles: ["FINANCE_MANAGER", "ADMIN"],
  },
  {
    label: "Finance",
    href: "/finance",
    icon: "💳",
    roles: ["FINANCE_MANAGER", "ADMIN"],
  },
  {
    label: "Admin",
    href: "/admin",
    icon: "⚙️",
    roles: ["ADMIN"],
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

  const allowedItems = navigationItems.filter(
    (item) => !item.roles || item.roles.includes(userRole)
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