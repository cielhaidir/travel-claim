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
  canUpdate: boolean;
  onEdit: (account: HierarchyAccount) => void;
  onToggleActive: (account: HierarchyAccount) => void;
}

function HierarchyNode({
  account,
  level = 0,
  canUpdate,
  onEdit,
  onToggleActive,
}: {
  account: HierarchyAccount;
  level?: number;
  canUpdate: boolean;
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
        className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-colors hover:bg-gray-50 ${
          !account.isActive ? "opacity-60" : ""
        }`}
        style={{ paddingLeft: `${level * 2 + 1}rem` }}
      >
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-gray-400 hover:text-gray-600"
          disabled={!hasChildren}
        >
          {hasChildren ? (
            <span className="text-base">{isExpanded ? "v" : ">"}</span>
          ) : (
            <span className="text-gray-300">•</span>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-mono font-semibold text-gray-900">
              {account.code}
            </span>
            <span className="text-sm text-gray-700">{account.name}</span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${getAccountTypeColor(account.accountType)}`}
            >
              {account.accountType}
            </span>
            <Badge
              variant={account.isActive ? "success" : "default"}
              className="text-xs"
            >
              {account.isActive ? "Aktif" : "Nonaktif"}
            </Badge>
            {account._count && account._count.claims > 0 ? (
              <span className="text-xs text-gray-500">
                {account._count.claims} klaim
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-xs text-gray-500">{account.category}</div>
        </div>

        {canUpdate ? (
          <div className="flex flex-shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onEdit(account)}
              title="Ubah akun"
            >
              Ubah
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onToggleActive(account)}
              title={account.isActive ? "Nonaktifkan" : "Aktifkan"}
            >
              {account.isActive ? "Nonaktifkan" : "Aktifkan"}
            </Button>
          </div>
        ) : null}
      </div>

      {hasChildren && isExpanded ? (
        <div className="ml-2">
          {account.children!.map((child) => (
            <HierarchyNode
              key={child.id}
              account={child}
              level={level + 1}
              canUpdate={canUpdate}
              onEdit={onEdit}
              onToggleActive={onToggleActive}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function COAHierarchyView({
  accounts,
  isLoading,
  canUpdate,
  onEdit,
  onToggleActive,
}: COAHierarchyViewProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
        <p className="mt-4 text-sm text-gray-600">Memuat hierarki akun...</p>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center">
        <div className="mb-4 text-6xl">Tree</div>
        <p className="text-sm text-gray-600">Tidak ada akun untuk ditampilkan</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <div className="space-y-1 p-4">
        {accounts.map((account) => (
          <HierarchyNode
            key={account.id}
            account={account}
            level={0}
            canUpdate={canUpdate}
            onEdit={onEdit}
            onToggleActive={onToggleActive}
          />
        ))}
      </div>
    </div>
  );
}
