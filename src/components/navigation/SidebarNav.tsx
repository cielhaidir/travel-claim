"use client";

import { useState } from "react";
import Link from "next/link";
import type { Session } from "next-auth";
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  HandCoins,
  LayoutDashboard,
  Package,
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
import {
  hasAnyRole,
  normalizeRoles,
  type Role,
} from "@/lib/constants/roles";
import { CRM_ACTIVE_MODULES } from "@/lib/constants/crm";
import { api } from "@/trpc/react";

type NavAccessContext = {
  isRoot: boolean;
  permissions: Session["user"]["permissions"] | null | undefined;
  roles: Role[];
};

type NavIcon = LucideIcon | string;

interface NavLinkItem {
  label: string;
  href: string;
  moduleKey?: string;
  action?: PermissionAction;
  roles?: Role[];
  children?: NavLinkItem[];
  comingSoon?: boolean;
  badgeKey?: "inventoryFulfillment";
  visibleWhen?: (context: NavAccessContext) => boolean;
}

interface NavItem extends NavLinkItem {
  icon: NavIcon;
}

type ResolvedNavItem = NavItem & {
  children: NavLinkItem[];
};

const crmChildren: NavLinkItem[] = CRM_ACTIVE_MODULES.map((item) => ({
  label: item.label,
  href: item.href,
}));

const inventoryChildren: NavLinkItem[] = [
  {
    label: "Overview",
    href: "/inventory",
    moduleKey: "inventory",
  },
  {
    label: "Fulfillment",
    href: "/inventory/fulfillment",
    moduleKey: "inventory",
    badgeKey: "inventoryFulfillment",
  },
];

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

const accountingChildren: NavLinkItem[] = [
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
    label: "CRM",
    href: "/crm",
    icon: "CR",
    moduleKey: "crm",
    children: crmChildren,
  },
  {
    label: "Inventory",
    href: "/inventory",
    icon: Package,
    moduleKey: "inventory",
    badgeKey: "inventoryFulfillment",
    children: inventoryChildren,
  },
  {
    label: "Akuntansi & Keuangan",
    href: "/accounting",
    icon: Wallet,
    moduleKey: "accounting",
    children: accountingChildren,
  },
  {
    label: "Manajemen Pengguna",
    href: "/admin/users",
    icon: Users,
    moduleKey: "users",
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

function hasDirectAccess(
  item: NavLinkItem,
  context: NavAccessContext,
): boolean {
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

function isItemActive(item: NavLinkItem, currentPath: string): boolean {
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
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>(
    {},
  );
  const context: NavAccessContext = {
    isRoot: session.user.isRoot === true,
    permissions: session.user.permissions,
    roles: normalizeRoles({
      roles: session.user.roles,
      role: session.user.role,
      includeDefault: false,
    }),
  };

  const canReadInventory =
    context.isRoot || hasPermissionMap(context.permissions, "inventory", "read");
  const { data: inventorySummary } = api.inventory.fulfillmentSummary.useQuery(
    {},
    { enabled: canReadInventory, refetchOnWindowFocus: false },
  );
  const inventoryFulfillmentCount =
    (inventorySummary?.requests?.reserved ?? 0) +
    (inventorySummary?.requests?.partial ?? 0) +
    (inventorySummary?.requests?.ready ?? 0);

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
    <nav className="flex-1 overflow-y-auto px-3 py-4 bg-white">
      {allowedItems.map((item) => {
        const Icon = typeof item.icon === "string" ? null : item.icon;
        const iconLabel = typeof item.icon === "string" ? item.icon : null;
        const isActive = isItemActive(item, currentPath);
        const hasChildren = item.children.length > 0;
        const isExpanded = hasChildren
          ? (expandedItems[item.href] ?? isActive)
          : false;
        const itemClassName = `flex items-center gap-2 rounded-md transition-colors ${
          isActive
            ? "bg-[#2f5ec7] text-white shadow-sm"
            : "text-[#3e3e42] hover:bg-gray-100"
        }`;

        const itemBadge =
          item.badgeKey === "inventoryFulfillment"
            ? inventoryFulfillmentCount
            : undefined;

        return (
          <div key={item.href} className="mb-1">
            <div className={itemClassName}>
              <Link
                href={item.href}
                onClick={onNavigate}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5"
              >
                <span
                  className={`inline-flex h-8 w-8 items-center justify-center ${
                    isActive ? "text-white" : "text-[#4a4a4e]"
                  }`}
                >
                  {Icon ? (
                    <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                  ) : (
                    <span className="text-[11px] font-semibold uppercase tracking-wide">
                      {iconLabel}
                    </span>
                  )}
                </span>
                <span className="truncate text-sm font-medium">
                  {item.label}
                </span>
                {itemBadge !== undefined && itemBadge > 0 ? (
                  <span
                    className={`ml-auto inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                      isActive ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {itemBadge}
                  </span>
                ) : null}
              </Link>

              {hasChildren ? (
                <button
                  type="button"
                  onClick={() =>
                    setExpandedItems((prev) => ({
                      ...prev,
                      [item.href]: !(prev[item.href] ?? isActive),
                    }))
                  }
                  className={`mr-2 inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                    isActive
                      ? "text-white/90 hover:bg-white/10"
                      : "text-[#4a4a4e] hover:bg-gray-200"
                  }`}
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? "Collapse" : "Expand"} ${item.label} submenu`}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" strokeWidth={2.25} />
                  ) : (
                    <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
                  )}
                </button>
              ) : null}
            </div>

            {hasChildren && isExpanded ? (
              <div className="ml-7 mt-1 border-l border-gray-200 pl-3">
                {item.children.map((child) => {
                  const childIsActive = matchesPath(currentPath, child.href);
                  const childBadge =
                    child.badgeKey === "inventoryFulfillment"
                      ? inventoryFulfillmentCount
                      : undefined;

                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={onNavigate}
                      className={`mb-1 flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                        childIsActive
                          ? "bg-[#e7eefc] font-medium text-[#2f5ec7]"
                          : "text-[#5a5a5f] hover:bg-gray-100 hover:text-[#2f5ec7]"
                      }`}
                    >
                      <span>{child.label}</span>
                      {childBadge !== undefined && childBadge > 0 ? (
                        <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          {childBadge}
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
