"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { COAType } from "../../../../generated/prisma";

export interface COAAccount {
  id: string;
  code: string;
  name: string;
  accountType: COAType;
  category: string;
  subcategory: string | null;
  isActive: boolean;
  parentId: string | null;
  parent?: {
    id: string;
    code: string;
    name: string;
  } | null;
  _count?: {
    claims: number;
    children: number;
  };
}

interface COATableProps {
  accounts: COAAccount[];
  isLoading?: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (account: COAAccount) => void;
  onDelete: (account: COAAccount) => void;
  onToggleActive: (account: COAAccount) => void;
}

export function COATable({
  accounts,
  isLoading,
  canUpdate,
  canDelete,
  onEdit,
  onDelete,
  onToggleActive,
}: COATableProps) {
  const [sortField, setSortField] = useState<keyof COAAccount>("code");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const canManage = canUpdate || canDelete;

  const handleSort = (field: keyof COAAccount) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
      return;
    }

    setSortField(field);
    setSortDirection("asc");
  };

  const sortedAccounts = [...accounts].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];

    if (aValue === null || aValue === undefined) return 1;
    if (bValue === null || bValue === undefined) return -1;

    if (typeof aValue === "string" && typeof bValue === "string") {
      return sortDirection === "asc"
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }

    return 0;
  });

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

  const getIndentation = (account: COAAccount) => {
    return account.parentId ? "pl-8" : "";
  };

  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-lg border bg-white">
        <div className="p-12 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-4 text-sm text-gray-600">Memuat akun...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b bg-gray-50">
            <tr>
              <th
                className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-gray-100"
                onClick={() => handleSort("code")}
              >
                <div className="flex items-center gap-1">
                  Kode
                  {sortField === "code" && (
                    <span>{sortDirection === "asc" ? "↑" : "↓"}</span>
                  )}
                </div>
              </th>
              <th
                className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-gray-100"
                onClick={() => handleSort("name")}
              >
                <div className="flex items-center gap-1">
                  Nama
                  {sortField === "name" && (
                    <span>{sortDirection === "asc" ? "↑" : "↓"}</span>
                  )}
                </div>
              </th>
              <th
                className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-gray-100"
                onClick={() => handleSort("accountType")}
              >
                <div className="flex items-center gap-1">
                  Jenis
                  {sortField === "accountType" && (
                    <span>{sortDirection === "asc" ? "↑" : "↓"}</span>
                  )}
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Kategori
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Penggunaan
              </th>
              {canManage ? (
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Aksi
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {sortedAccounts.map((account) => (
              <tr key={account.id} className="hover:bg-gray-50">
                <td className={`whitespace-nowrap px-6 py-4 ${getIndentation(account)}`}>
                  <div className="flex items-center gap-2">
                    {account.parentId ? (
                      <span className="text-gray-400">|-</span>
                    ) : null}
                    <span className="text-sm font-mono font-medium text-gray-900">
                      {account.code}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-900">{account.name}</div>
                  {account.parent ? (
                    <div className="text-xs text-gray-500">
                      Induk: {account.parent.code}
                    </div>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${getAccountTypeColor(account.accountType)}`}
                  >
                    {account.accountType}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-900">{account.category}</div>
                  {account.subcategory ? (
                    <div className="text-xs text-gray-500">{account.subcategory}</div>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <Badge variant={account.isActive ? "success" : "default"}>
                    {account.isActive ? "Aktif" : "Nonaktif"}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="text-sm text-gray-600">
                    {account._count?.claims ?? 0} klaim
                    {account._count && account._count.children > 0 ? (
                      <span className="ml-2 text-gray-400">
                        • {account._count.children} akun turunan
                      </span>
                    ) : null}
                  </div>
                </td>
                {canManage ? (
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      {canUpdate ? (
                        <>
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
                        </>
                      ) : null}
                      {canDelete ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onDelete(account)}
                          title="Hapus akun"
                          disabled={
                            (account._count?.claims ?? 0) > 0 ||
                            (account._count?.children ?? 0) > 0
                          }
                        >
                          Hapus
                        </Button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
