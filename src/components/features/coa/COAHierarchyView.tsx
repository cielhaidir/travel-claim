"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { COAType } from "../../../../generated/prisma";

interface HierarchyAccount {
  id: string;
  code: string;
  name: string;
  accountType: COAType;
  category: string;
  isActive: boolean;
  children?: HierarchyAccount[];
  _count?: {
    claims: number;
  };
}

interface COAHierarchyViewProps {
  accounts: HierarchyAccount[];
  isLoading?: boolean;
  userRole: string;
  onEdit: (account: HierarchyAccount) => void;
  onToggleActive: (account: HierarchyAccount) => void;
}

function HierarchyNode({
  account,
  level = 0,
  isAdmin,
  onEdit,
  onToggleActive,
}: {
  account: HierarchyAccount;
  level?: number;
  isAdmin: boolean;
  onEdit: (account: HierarchyAccount) => void;
  onToggleActive: (account: HierarchyAccount) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = account.children && account.children.length > 0;

  const getAccountTypeColor = (type: COAType) => {
    const colors: Record<COAType, string> = {
      ASSET: "bg-blue-100 text-blue-700",
      LIABILITY: "bg-red-100 text-red-700",
      EQUITY: "bg-purple-100 text-purple-700",
      REVENUE: "bg-green-100 text-green-700",
      EXPENSE: "bg-orange-100 text-orange-700",
    };
    return colors[type];
  };

  return (
    <div className="select-none">
      <div
        className={`flex items-center gap-3 py-3 px-4 hover:bg-gray-50 rounded-lg transition-colors ${
          !account.isActive ? "opacity-60" : ""
        }`}
        style={{ paddingLeft: `${level * 2 + 1}rem` }}
      >
        {/* Expand/Collapse Icon */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600"
          disabled={!hasChildren}
        >
          {hasChildren ? (
            isExpanded ? (
              <span className="text-base">▼</span>
            ) : (
              <span className="text-base">▶</span>
            )
          ) : (
            <span className="text-gray-300">•</span>
          )}
        </button>

        {/* Account Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-mono font-semibold text-gray-900">
              {account.code}
            </span>
            <span className="text-sm text-gray-700">{account.name}</span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${getAccountTypeColor(account.accountType)}`}
            >
              {account.accountType}
            </span>
            <Badge variant={account.isActive ? "success" : "default"} className="text-xs">
              {account.isActive ? "Active" : "Inactive"}
            </Badge>
            {account._count && account._count.claims > 0 && (
              <span className="text-xs text-gray-500">
                {account._count.claims} claims
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-1">{account.category}</div>
        </div>

        {/* Actions */}
        {isAdmin && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onEdit(account)}
              title="Edit account"
            >
              ✏️
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onToggleActive(account)}
              title={account.isActive ? "Deactivate" : "Activate"}
            >
              {account.isActive ? "⏸️" : "▶️"}
            </Button>
          </div>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="ml-2">
          {account.children!.map((child) => (
            <HierarchyNode
              key={child.id}
              account={child}
              level={level + 1}
              isAdmin={isAdmin}
              onEdit={onEdit}
              onToggleActive={onToggleActive}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function COAHierarchyView({
  accounts,
  isLoading,
  userRole,
  onEdit,
  onToggleActive,
}: COAHierarchyViewProps) {
  const isAdmin = userRole === "ADMIN";

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
        <p className="mt-4 text-sm text-gray-600">Loading hierarchy...</p>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center">
        <div className="text-6xl mb-4">🌳</div>
        <p className="text-sm text-gray-600">No accounts to display</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      <div className="p-4 space-y-1">
        {accounts.map((account) => (
          <HierarchyNode
            key={account.id}
            account={account}
            level={0}
            isAdmin={isAdmin}
            onEdit={onEdit}
            onToggleActive={onToggleActive}
          />
        ))}
      </div>
    </div>
  );
}
