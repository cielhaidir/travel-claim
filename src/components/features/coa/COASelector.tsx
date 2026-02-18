"use client";

import { useState, useMemo } from "react";
import type { COAType } from "../../../../generated/prisma";

interface COASelectorOption {
  id: string;
  code: string;
  name: string;
  accountType: COAType;
  category: string;
  subcategory: string | null;
  parentId: string | null;
}

interface COASelectorProps {
  accounts: COASelectorOption[];
  value: string;
  onChange: (accountId: string) => void;
  accountType?: COAType;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  label?: string;
}

export function COASelector({
  accounts,
  value,
  onChange,
  accountType,
  placeholder = "Select an account...",
  error,
  disabled,
  required,
  label = "Chart of Account",
}: COASelectorProps) {
  // Filter by account type if specified
  const filteredAccounts = useMemo(() => {
    if (accountType) {
      return accounts.filter((acc) => acc.accountType === accountType);
    }
    return accounts;
  }, [accounts, accountType]);

  // Group accounts by type for better organization
  const groupedAccounts = useMemo(() => {
    const groups: Record<COAType, COASelectorOption[]> = {
      ASSET: [],
      LIABILITY: [],
      EQUITY: [],
      REVENUE: [],
      EXPENSE: [],
    };

    filteredAccounts.forEach((account) => {
      groups[account.accountType].push(account);
    });

    return groups;
  }, [filteredAccounts]);

  // Build hierarchical display name
  const buildHierarchicalName = (account: COASelectorOption): string => {
    const parent = accounts.find((a) => a.id === account.parentId);
    if (parent) {
      return `${buildHierarchicalName(parent)} > ${account.code}`;
    }
    return account.code;
  };

  const getAccountTypeLabel = (type: COAType): string => {
    const labels: Record<COAType, string> = {
      ASSET: "Assets",
      LIABILITY: "Liabilities",
      EQUITY: "Equity",
      REVENUE: "Revenue",
      EXPENSE: "Expenses",
    };
    return labels[type];
  };

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`w-full rounded-lg border px-4 py-2 text-sm focus:outline-none focus:ring-2 ${
          error
            ? "border-red-500 focus:ring-red-500"
            : "border-gray-300 focus:ring-blue-500"
        } ${disabled ? "bg-gray-100 cursor-not-allowed" : "bg-white"}`}
      >
        <option value="">{placeholder}</option>
        
        {accountType ? (
          // Single type view - flat list
          filteredAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {buildHierarchicalName(account)} - {account.name}
              {account.subcategory && ` (${account.subcategory})`}
            </option>
          ))
        ) : (
          // All types view - grouped by type
          Object.entries(groupedAccounts).map(([type, typeAccounts]) => {
            if (typeAccounts.length === 0) return null;
            return (
              <optgroup key={type} label={getAccountTypeLabel(type as COAType)}>
                {typeAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {buildHierarchicalName(account)} - {account.name}
                    {account.subcategory && ` (${account.subcategory})`}
                  </option>
                ))}
              </optgroup>
            );
          })
        )}
      </select>

      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      
      {!error && accountType && (
        <p className="mt-1 text-xs text-gray-500">
          Showing {filteredAccounts.length} {accountType.toLowerCase()} account(s)
        </p>
      )}
    </div>
  );
}
