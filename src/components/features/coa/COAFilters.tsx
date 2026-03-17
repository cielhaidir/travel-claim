"use client";

import { type COAType } from "../../../../generated/prisma";

interface COAFiltersProps {
  accountType: COAType | "ALL";
  onAccountTypeChange: (type: COAType | "ALL") => void;
  isActive: boolean | "ALL";
  onIsActiveChange: (active: boolean | "ALL") => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

const ACCOUNT_TYPES: Array<{ value: COAType | "ALL"; label: string }> = [
  { value: "ALL", label: "Semua Jenis" },
  { value: "ASSET", label: "Aset" },
  { value: "LIABILITY", label: "Liabilitas" },
  { value: "EQUITY", label: "Ekuitas" },
  { value: "REVENUE", label: "Pendapatan" },
  { value: "EXPENSE", label: "Beban" },
];

export function COAFilters({
  accountType,
  onAccountTypeChange,
  isActive,
  onIsActiveChange,
  searchQuery,
  onSearchChange,
}: COAFiltersProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-wrap gap-3">
        {/* Search Input */}
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Cari berdasarkan kode atau nama..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Account Type Filter */}
        <select
          value={accountType}
          onChange={(e) =>
            onAccountTypeChange(e.target.value as COAType | "ALL")
          }
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {ACCOUNT_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>

        {/* Active/Inactive Filter */}
        <select
          value={isActive === "ALL" ? "ALL" : isActive ? "true" : "false"}
          onChange={(e) => {
            if (e.target.value === "ALL") {
              onIsActiveChange("ALL");
            } else {
              onIsActiveChange(e.target.value === "true");
            }
          }}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="ALL">Semua Status</option>
          <option value="true">Aktif</option>
          <option value="false">Nonaktif</option>
        </select>
      </div>
    </div>
  );
}
