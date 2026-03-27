"use client";

import Link from "next/link";
import type { Session } from "next-auth";
import {
  hasPermissionMap,
  type PermissionAction,
} from "@/lib/auth/permissions";
import {
  hasAnyRole,
  normalizeRoles,
  type Role,
} from "@/lib/constants/roles";
import { CRM_ACTIVE_MODULES } from "@/lib/constants/crm";

type NavAccessContext = {
  isRoot: boolean;
  permissions: Session["user"]["permissions"] | null | undefined;
  roles: Role[];
};

interface NavItem {
  label: string;
  href: string;
  icon?: string;
  moduleKey?: string;
  action?: PermissionAction;
  roles?: Role[];
  children?: NavItem[];
  comingSoon?: boolean;
  visibleWhen?: (context: NavAccessContext) => boolean;
}

type ResolvedNavItem = NavItem & {
  children: NavItem[];
};

const crmChildren: NavItem[] = CRM_ACTIVE_MODULES.map((item) => ({
  label: item.label,
  href: item.href,
}));

function canAccessFinanceDashboard(
  permissions: Session["user"]["permissions"] | null | undefined,
  isRoot: boolean,
): boolean {
  const canReadBailout =
    isRoot || hasPermissionMap(permissions, "bailout", "read");
  const canDisburseBailout =
    isRoot || hasPermissionMap(permissions, "bailout", "disburse");
  const canReadClaims =
    isRoot || hasPermissionMap(permissions, "claims", "read");
  const canPayClaims = isRoot || hasPermissionMap(permissions, "claims", "pay");
  const canReadTravel =
    isRoot || hasPermissionMap(permissions, "travel", "read");
  const canLockTravel =
    isRoot || hasPermissionMap(permissions, "travel", "lock");
  const canCloseTravel =
    isRoot || hasPermissionMap(permissions, "travel", "close");
  const canReadJournals =
    isRoot || hasPermissionMap(permissions, "journals", "read");
  const canCreateJournals =
    isRoot || hasPermissionMap(permissions, "journals", "create");
  const canReadCoa =
    isRoot || hasPermissionMap(permissions, "chart-of-accounts", "read");
  const canReadBalanceAccounts =
    isRoot || hasPermissionMap(permissions, "balance-accounts", "read");

  const canUseBailoutDisbursement =
    canReadBailout &&
    canDisburseBailout &&
    canReadCoa &&
    canReadBalanceAccounts;
  const canUseClaimPayment =
    canReadClaims && canPayClaims && canReadCoa && canReadBalanceAccounts;
  const canUseSettlement =
    canReadBailout && canReadJournals && canCreateJournals && canReadCoa;
  const canUseTravelActions =
    canReadTravel && (canLockTravel || canCloseTravel);

  return (
    canUseBailoutDisbursement ||
    canUseClaimPayment ||
    canUseSettlement ||
    canUseTravelActions
  );
}

const accountingChildren: NavItem[] = [
  {
    label: "Finance",
    href: "/finance",
    visibleWhen: ({ permissions, isRoot }) =>
      canAccessFinanceDashboard(permissions, isRoot),
  },
  {
    label: "Jurnal",
    href: "/journal",
    moduleKey: "journals",
  },
  {
    label: "Bagan Akun",
    href: "/chart-of-accounts",
    moduleKey: "chart-of-accounts",
  },
  {
    label: "Employee Advance Control",
    href: "/reports/employee-advance-control",
    moduleKey: "reports",
  },
  {
    label: "General Ledger",
    href: "/reports/general-ledger",
    moduleKey: "reports",
  },
  {
    label: "Trial Balance",
    href: "/reports/trial-balance",
    moduleKey: "reports",
  },
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
    icon: "CR",
    moduleKey: "crm",
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

function hasDirectAccess(item: NavItem, context: NavAccessContext): boolean {
  if (context.isRoot) {
    return true;
  }

  const hasAccessRule =
    item.moduleKey !== undefined ||
    (item.roles?.length ?? 0) > 0 ||
    item.visibleWhen !== undefined;

  if (!hasAccessRule) {
    return true;
  }

  if (item.visibleWhen?.(context) === true) {
    return true;
  }

  const itemRoles = item.roles ?? [];
  if (itemRoles.length > 0 && hasAnyRole(context.roles, itemRoles)) {
    return true;
  }

  if (item.moduleKey !== undefined) {
    return hasPermissionMap(
      context.permissions,
      item.moduleKey,
      item.action ?? "read",
    );
  }

  return false;
}

function matchesPath(currentPath: string, href: string): boolean {
  return (
    currentPath === href || (href !== "/" && currentPath.startsWith(`${href}/`))
  );
}

function isItemActive(item: NavItem, currentPath: string): boolean {
  return (
    matchesPath(currentPath, item.href) ||
    (item.children?.some((child) => isItemActive(child, currentPath)) ?? false)
  );
}

export function SidebarNav({
  session,
  currentPath,
  onNavigate,
}: SidebarNavProps) {
  const context: NavAccessContext = {
    isRoot: session.user.isRoot === true,
    permissions: session.user.permissions,
    roles: normalizeRoles({
      roles: session.user.roles,
      role: session.user.role,
      includeDefault: false,
    }),
  };

  const allowedItems: ResolvedNavItem[] = navigationItems.reduce<
    ResolvedNavItem[]
  >((items, item) => {
    const directAccess = hasDirectAccess(item, context);
    const children = (item.children ?? []).filter((child) =>
      hasDirectAccess(child, context),
    );

    if (!directAccess && children.length === 0) {
      return items;
    }

    items.push({
      ...item,
      href: directAccess ? item.href : (children[0]?.href ?? item.href),
      children,
    });

    return items;
  }, []);

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto p-4">
      {allowedItems.map((item: ResolvedNavItem) => {
        const isActive = isItemActive(item, currentPath);

        return (
          <div key={item.label} className="space-y-1">
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
              {item.children?.length ? (
                <span className="text-xs text-gray-400">
                  {isActive ? "v" : ">"}
                </span>
              ) : null}
            </Link>

            {item.children?.length && isActive ? (
              <div className="ml-5 space-y-1 border-l border-gray-200 pl-3">
                {item.children.map((child) => {
                  const childActive = matchesPath(currentPath, child.href);

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
