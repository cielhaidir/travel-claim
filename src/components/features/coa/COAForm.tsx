"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { COAType } from "../../../../generated/prisma";

export interface COAFormData {
  code: string;
  name: string;
  accountType: COAType;
  category: string;
  subcategory: string;
  parentId: string;
  description: string;
  isActive: boolean;
}

interface COAFormProps {
  initialData?: Partial<COAFormData> & { id?: string };
  availableParents: Array<{
    id: string;
    code: string;
    name: string;
    accountType: COAType;
    parentId: string | null;
  }>;
  isLoading?: boolean;
  onSubmit: (data: COAFormData) => void;
  onCancel: () => void;
}

const ACCOUNT_TYPES: Array<{ value: COAType; label: string }> = [
  { value: "ASSET", label: "Aset" },
  { value: "LIABILITY", label: "Liabilitas" },
  { value: "EQUITY", label: "Ekuitas" },
  { value: "REVENUE", label: "Pendapatan" },
  { value: "EXPENSE", label: "Beban" },
];

export function COAForm({
  initialData,
  availableParents,
  isLoading,
  onSubmit,
  onCancel,
}: COAFormProps) {
  const [formData, setFormData] = useState<COAFormData>({
    code: initialData?.code ?? "",
    name: initialData?.name ?? "",
    accountType: initialData?.accountType ?? "EXPENSE",
    category: initialData?.category ?? "",
    subcategory: initialData?.subcategory ?? "",
    parentId: initialData?.parentId ?? "",
    description: initialData?.description ?? "",
    isActive: initialData?.isActive ?? true,
  });

  const [errors, setErrors] = useState<Partial<Record<keyof COAFormData, string>>>({});

  // Filter parents by selected account type
  const filteredParents = availableParents.filter(
    (parent) =>
      parent.accountType === formData.accountType &&
      parent.id !== initialData?.id // Prevent self-parenting
  );

  // Build hierarchical parent list for display
  const buildHierarchicalName = (parent: typeof availableParents[0]): string => {
    const parentOfParent = availableParents.find((p) => p.id === parent.parentId);
    if (parentOfParent) {
      return `${buildHierarchicalName(parentOfParent)} > ${parent.code} - ${parent.name}`;
    }
    return `${parent.code} - ${parent.name}`;
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof COAFormData, string>> = {};

    if (!formData.code.trim()) {
      newErrors.code = "Kode akun wajib diisi";
    } else if (!/^[A-Z0-9-]+$/.test(formData.code)) {
      newErrors.code = "Kode hanya boleh berisi huruf kapital, angka, dan tanda hubung";
    }

    if (!formData.name.trim()) {
      newErrors.name = "Nama akun wajib diisi";
    }

    if (!formData.category.trim()) {
      newErrors.category = "Kategori wajib diisi";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSubmit(formData);
    }
  };

  const handleChange = (
    field: keyof COAFormData,
    value: string | boolean
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Account Code */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Kode Akun <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.code}
            onChange={(e) => handleChange("code", e.target.value.toUpperCase())}
            placeholder="contoh: BEB-001"
            className={`w-full rounded-lg border px-4 py-2 text-sm font-mono focus:outline-none focus:ring-2 ${
              errors.code
                ? "border-red-500 focus:ring-red-500"
                : "border-gray-300 focus:ring-blue-500"
            }`}
            disabled={isLoading}
          />
          {errors.code && (
            <p className="mt-1 text-sm text-red-600">{errors.code}</p>
          )}
        </div>

        {/* Account Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Nama Akun <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => handleChange("name", e.target.value)}
            placeholder="contoh: Biaya Perjalanan Dinas"
            className={`w-full rounded-lg border px-4 py-2 text-sm focus:outline-none focus:ring-2 ${
              errors.name
                ? "border-red-500 focus:ring-red-500"
                : "border-gray-300 focus:ring-blue-500"
            }`}
            disabled={isLoading}
          />
          {errors.name && (
            <p className="mt-1 text-sm text-red-600">{errors.name}</p>
          )}
        </div>

        {/* Account Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Jenis Akun <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.accountType}
            onChange={(e) => {
              handleChange("accountType", e.target.value as COAType);
              // Reset parent when account type changes
              handleChange("parentId", "");
            }}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          >
            {ACCOUNT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Kategori <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.category}
            onChange={(e) => handleChange("category", e.target.value)}
            placeholder="contoh: Beban Operasional"
            className={`w-full rounded-lg border px-4 py-2 text-sm focus:outline-none focus:ring-2 ${
              errors.category
                ? "border-red-500 focus:ring-red-500"
                : "border-gray-300 focus:ring-blue-500"
            }`}
            disabled={isLoading}
          />
          {errors.category && (
            <p className="mt-1 text-sm text-red-600">{errors.category}</p>
          )}
        </div>

        {/* Subcategory */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Subkategori
          </label>
          <input
            type="text"
            value={formData.subcategory}
            onChange={(e) => handleChange("subcategory", e.target.value)}
            placeholder="contoh: Perjalanan Luar Kota"
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
        </div>

        {/* Parent Account */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Akun Induk
          </label>
          <select
            value={formData.parentId}
            onChange={(e) => handleChange("parentId", e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          >
            <option value="">Tidak ada (Akun Utama)</option>
            {filteredParents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {buildHierarchicalName(parent)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Hanya akun dengan jenis {formData.accountType} yang ditampilkan
          </p>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Deskripsi
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => handleChange("description", e.target.value)}
          placeholder="Deskripsi akun (opsional)..."
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isLoading}
        />
      </div>

      {/* Active Status */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="isActive"
          checked={formData.isActive}
          onChange={(e) => handleChange("isActive", e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          disabled={isLoading}
        />
        <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
          Aktif (dapat digunakan pada klaim)
        </label>
      </div>

      {/* Form Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={isLoading}
        >
          Batal
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent mr-2"></span>
              {initialData?.id ? "Menyimpan perubahan..." : "Membuat akun..."}
            </>
          ) : (
            <>{initialData?.id ? "Simpan Perubahan" : "Tambah Akun"}</>
          )}
        </Button>
      </div>
    </form>
  );
}
