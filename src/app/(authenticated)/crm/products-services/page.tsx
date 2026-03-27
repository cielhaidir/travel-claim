"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/features/PageHeader";
import { CRM_ROLES, hasAnyRole, normalizeRoles } from "@/lib/constants/roles";
import { api } from "@/trpc/react";
import { useToast } from "@/components/ui/Toast";

const DEFAULT_FORM = {
  code: "",
  name: "",
  description: "",
  type: "PRODUCT",
  inventoryItemId: "",
  isActive: true,
};

export default function CrmProductsServicesPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);

  const userRoles = normalizeRoles({
    roles: session?.user?.roles,
    role: session?.user?.role,
  });
  const isAllowed = session?.user?.isRoot === true || hasAnyRole(userRoles, CRM_ROLES);

  const productsQuery = api.crm.listProducts.useQuery(
    { search: search || undefined },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );
  const inventoryItemsQuery = api.inventory.listItems.useQuery(
    { limit: 100 },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );

  const createMutation = api.crm.createProduct.useMutation({
    onSuccess: async () => {
      setIsOpen(false);
      setForm(DEFAULT_FORM);
      showToast({ title: "Berhasil", message: "Produk/Jasa CRM berhasil dibuat.", variant: "success" });
      await productsQuery.refetch();
    },
    onError: (error) => {
      showToast({ title: "Gagal", message: error.message, variant: "error" });
    },
  });

  const products = useMemo<Array<any>>(
    () => (productsQuery.data?.products as Array<any> | undefined) ?? [],
    [productsQuery.data],
  );
  const inventoryItems = useMemo<Array<any>>(
    () => (inventoryItemsQuery.data?.items as Array<any> | undefined) ?? [],
    [inventoryItemsQuery.data],
  );

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM Products / Services"
        description="Katalog produk dan jasa CRM yang bisa dihubungkan ke inventory untuk lead dan fulfillment."
        badge={<Badge variant="success">Aktif</Badge>}
        primaryAction={{ label: "Tambah Produk/Jasa", onClick: () => setIsOpen(true) }}
        secondaryAction={{ label: "CRM Dashboard", href: "/crm" }}
      />

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari berdasarkan kode atau nama produk/jasa"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {productsQuery.isLoading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500 shadow-sm">
            Memuat katalog CRM...
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500 shadow-sm">
            Belum ada produk/jasa CRM.
          </div>
        ) : (
          products.map((product: any) => (
            <div key={product.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">{product.name}</p>
                  <p className="text-sm text-gray-500">{product.code}</p>
                </div>
                <Badge variant={product.type === "PRODUCT" ? "info" : "warning"}>
                  {product.type}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-gray-600">{product.description ?? "Tanpa deskripsi"}</p>
              <div className="mt-4 grid gap-2 text-sm text-gray-600">
                <div>
                  <span className="font-medium text-gray-800">Inventory:</span>{" "}
                  {product.inventoryItem ? `${product.inventoryItem.sku} · ${product.inventoryItem.name}` : "Tidak terhubung"}
                </div>
                <div>
                  <span className="font-medium text-gray-800">Status:</span>{" "}
                  {product.isActive ? "Active" : "Inactive"}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Tambah Produk / Jasa CRM">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Kode">
            <input value={form.code} onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))} className="input" />
          </Field>
          <Field label="Nama">
            <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} className="input" />
          </Field>
          <Field label="Tipe">
            <select value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))} className="input">
              <option value="PRODUCT">PRODUCT</option>
              <option value="SERVICE">SERVICE</option>
            </select>
          </Field>
          <Field label="Inventory Item (opsional)">
            <select value={form.inventoryItemId} onChange={(e) => setForm((prev) => ({ ...prev, inventoryItemId: e.target.value }))} className="input">
              <option value="">Tidak terhubung</option>
              {inventoryItems.map((item: any) => (
                <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Deskripsi" className="md:col-span-2">
            <textarea value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} className="input min-h-[88px]" />
          </Field>
          <label className="flex items-center gap-3 text-sm text-gray-700 md:col-span-2">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))} />
            Produk/Jasa aktif
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setIsOpen(false)}>Batal</Button>
          <Button
            onClick={() =>
              void createMutation.mutateAsync({
                code: form.code,
                name: form.name,
                description: form.description || undefined,
                type: form.type as "PRODUCT" | "SERVICE",
                inventoryItemId: form.inventoryItemId || undefined,
                isActive: form.isActive,
              })
            }
            isLoading={createMutation.isPending}
          >
            Simpan
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}
