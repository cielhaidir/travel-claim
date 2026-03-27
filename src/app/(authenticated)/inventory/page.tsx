"use client";

import { useMemo, useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/features/PageHeader";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { hasPermissionMap } from "@/lib/auth/permissions";
import { api } from "@/trpc/react";
import { formatCurrency, formatDate } from "@/lib/utils/format";

type InventoryTab = "items" | "warehouses" | "stock";

const DEFAULT_ITEM_FORM = {
  sku: "",
  name: "",
  description: "",
  unitOfMeasure: "PCS",
  category: "",
  isStockTracked: true,
  minStock: "0",
  reorderPoint: "0",
  standardCost: "",
  inventoryCoaId: "",
  temporaryAssetCoaId: "",
  cogsCoaId: "",
  isActive: true,
};

const DEFAULT_WAREHOUSE_FORM = {
  code: "",
  name: "",
  description: "",
  isActive: true,
};

const DEFAULT_RECEIPT_FORM = {
  itemId: "",
  warehouseId: "",
  saleQuantity: "1",
  temporaryAssetQuantity: "0",
  unitCost: "",
  referenceType: "MANUAL_RECEIPT",
  referenceId: "",
  notes: "",
};

const DEFAULT_RECLASS_FORM = {
  itemId: "",
  warehouseId: "",
  quantity: "1",
  referenceType: "InventoryReclassification",
  referenceId: "",
  notes: "",
};

export default function InventoryPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<InventoryTab>("items");
  const [itemSearch, setItemSearch] = useState("");
  const [warehouseSearch, setWarehouseSearch] = useState("");
  const [showCreateItem, setShowCreateItem] = useState(false);
  const [showCreateWarehouse, setShowCreateWarehouse] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showReclassModal, setShowReclassModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<any | null>(null);
  const [selectedBalance, setSelectedBalance] = useState<any | null>(null);
  const [itemForm, setItemForm] = useState(DEFAULT_ITEM_FORM);
  const [warehouseForm, setWarehouseForm] = useState(DEFAULT_WAREHOUSE_FORM);
  const [receiptForm, setReceiptForm] = useState(DEFAULT_RECEIPT_FORM);
  const [reclassForm, setReclassForm] = useState(DEFAULT_RECLASS_FORM);

  const isRoot = session?.user?.isRoot ?? false;
  const permissions = session?.user?.permissions;
  const canReadInventory =
    isRoot || hasPermissionMap(permissions, "inventory", "read");
  const canCreateInventory =
    isRoot || hasPermissionMap(permissions, "inventory", "create");

  useEffect(() => {
    if (session && !canReadInventory) {
      void router.replace("/dashboard");
    }
  }, [session, canReadInventory, router]);

  const itemsQuery = api.inventory.listItems.useQuery(
    { search: itemSearch || undefined, limit: 100 },
    { enabled: canReadInventory, refetchOnWindowFocus: false },
  );

  const warehousesQuery = api.inventory.listWarehouses.useQuery(
    { search: warehouseSearch || undefined },
    { enabled: canReadInventory, refetchOnWindowFocus: false },
  );

  const stockOverviewQuery = api.inventory.stockOverview.useQuery(
    { lowStockOnly: false },
    { enabled: canReadInventory, refetchOnWindowFocus: false },
  );

  const coaOptionsQuery = api.inventory.listCoaOptions.useQuery(
    {},
    { enabled: canReadInventory, refetchOnWindowFocus: false },
  );

  const itemDetailQuery = api.inventory.getItemById.useQuery(
    { id: selectedItem?.id ?? "" },
    { enabled: canReadInventory && !!selectedItem?.id, refetchOnWindowFocus: false },
  );

  const createItemMutation = api.inventory.createItem.useMutation({
    onSuccess: async () => {
      setShowCreateItem(false);
      setItemForm(DEFAULT_ITEM_FORM);
      showToast({ title: "Berhasil", message: "Item inventory berhasil dibuat.", variant: "success" });
      await itemsQuery.refetch();
      await stockOverviewQuery.refetch();
    },
    onError: (error) => {
      showToast({ title: "Gagal", message: error.message, variant: "error" });
    },
  });

  const createWarehouseMutation = api.inventory.createWarehouse.useMutation({
    onSuccess: async () => {
      setShowCreateWarehouse(false);
      setWarehouseForm(DEFAULT_WAREHOUSE_FORM);
      showToast({ title: "Berhasil", message: "Gudang berhasil dibuat.", variant: "success" });
      await warehousesQuery.refetch();
      await stockOverviewQuery.refetch();
    },
    onError: (error) => {
      showToast({ title: "Gagal", message: error.message, variant: "error" });
    },
  });

  const createReceiptMutation = api.inventory.createStockReceipt.useMutation({
    onSuccess: async () => {
      setShowReceiptModal(false);
      setReceiptForm(DEFAULT_RECEIPT_FORM);
      showToast({ title: "Berhasil", message: "Mutasi stok masuk berhasil dicatat.", variant: "success" });
      await itemsQuery.refetch();
      await warehousesQuery.refetch();
      await stockOverviewQuery.refetch();
    },
    onError: (error) => {
      showToast({ title: "Gagal", message: error.message, variant: "error" });
    },
  });

  const reclassifyMutation = api.inventory.reclassifyTemporaryAssetToSaleStock.useMutation({
    onSuccess: async () => {
      setShowReclassModal(false);
      setReclassForm(DEFAULT_RECLASS_FORM);
      showToast({ title: "Berhasil", message: "Stok temporary asset berhasil direklasifikasi ke sale stock.", variant: "success" });
      await itemsQuery.refetch();
      await warehousesQuery.refetch();
      await stockOverviewQuery.refetch();
    },
    onError: (error) => {
      showToast({ title: "Gagal", message: error.message, variant: "error" });
    },
  });

  const items = useMemo<Array<any>>(
    () => (itemsQuery.data?.items as Array<any> | undefined) ?? [],
    [itemsQuery.data],
  );
  const warehouses = useMemo<Array<any>>(
    () => (warehousesQuery.data?.warehouses as Array<any> | undefined) ?? [],
    [warehousesQuery.data],
  );
  const balances = useMemo<Array<any>>(
    () => (stockOverviewQuery.data?.balances as Array<any> | undefined) ?? [],
    [stockOverviewQuery.data],
  );
  const coaOptions = useMemo<Array<any>>(
    () => (coaOptionsQuery.data?.accounts as Array<any> | undefined) ?? [],
    [coaOptionsQuery.data],
  );
  const itemDetail = (itemDetailQuery.data as any) ?? null;

  const summary = useMemo(() => {
    const totalItems = items.length;
    const trackedItems = items.filter((item: any) => item.isStockTracked).length;
    const totalWarehouses = warehouses.length;
    const lowStockCount = balances.filter(
      (row: any) => Number(row.qtyOnHand) <= Number(row.item.reorderPoint ?? 0),
    ).length;
    return { totalItems, trackedItems, totalWarehouses, lowStockCount };
  }, [items, warehouses, balances]);

  if (!session || !canReadInventory) return null;

  async function handleCreateItem() {
    await createItemMutation.mutateAsync({
      sku: itemForm.sku,
      name: itemForm.name,
      description: itemForm.description || undefined,
      unitOfMeasure: itemForm.unitOfMeasure,
      category: itemForm.category || undefined,
      isStockTracked: itemForm.isStockTracked,
      minStock: Number(itemForm.minStock || 0),
      reorderPoint: Number(itemForm.reorderPoint || 0),
      standardCost: itemForm.standardCost ? Number(itemForm.standardCost) : undefined,
      inventoryCoaId: itemForm.inventoryCoaId || undefined,
      temporaryAssetCoaId: itemForm.temporaryAssetCoaId || undefined,
      cogsCoaId: itemForm.cogsCoaId || undefined,
      isActive: itemForm.isActive,
    });
  }

  async function handleCreateWarehouse() {
    await createWarehouseMutation.mutateAsync({
      code: warehouseForm.code,
      name: warehouseForm.name,
      description: warehouseForm.description || undefined,
      isActive: warehouseForm.isActive,
    });
  }

  async function handleCreateReceipt() {
    await createReceiptMutation.mutateAsync({
      itemId: receiptForm.itemId,
      warehouseId: receiptForm.warehouseId,
      saleQuantity: Number(receiptForm.saleQuantity || 0),
      temporaryAssetQuantity: Number(receiptForm.temporaryAssetQuantity || 0),
      unitCost: receiptForm.unitCost ? Number(receiptForm.unitCost) : undefined,
      referenceType: receiptForm.referenceType || undefined,
      referenceId: receiptForm.referenceId || undefined,
      notes: receiptForm.notes || undefined,
    });
  }

  async function handleReclassification() {
    await reclassifyMutation.mutateAsync({
      itemId: reclassForm.itemId,
      warehouseId: reclassForm.warehouseId,
      quantity: Number(reclassForm.quantity || 0),
      referenceType: reclassForm.referenceType || undefined,
      referenceId: reclassForm.referenceId || undefined,
      notes: reclassForm.notes || undefined,
    });
  }

  function openReclassification(balance: any) {
    setReclassForm({
      itemId: balance.item.id,
      warehouseId: balance.warehouse.id,
      quantity: "1",
      referenceType: "InventoryReclassification",
      referenceId: "",
      notes: `${balance.item.sku} - ${balance.warehouse.code}`,
    });
    setShowReclassModal(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Kelola item, gudang, saldo stok, dan pondasi fulfillment CRM ke inventory."
        primaryAction={
          canCreateInventory
            ? {
                label:
                  activeTab === "warehouses"
                    ? "Tambah Gudang"
                    : activeTab === "stock"
                      ? "Stok Masuk"
                      : "Tambah Item",
                onClick: () => {
                  if (activeTab === "warehouses") {
                    setShowCreateWarehouse(true);
                    return;
                  }
                  if (activeTab === "stock") {
                    setShowReceiptModal(true);
                    return;
                  }
                  setShowCreateItem(true);
                },
              }
            : undefined
        }
        secondaryAction={{
          label: "Muat Ulang",
          onClick: () => {
            void itemsQuery.refetch();
            void warehousesQuery.refetch();
            void stockOverviewQuery.refetch();
          },
        }}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Item" value={summary.totalItems.toString()} helper="Seluruh SKU inventory tenant aktif" />
        <MetricCard label="Tracked Item" value={summary.trackedItems.toString()} helper="Item yang dihitung dalam stok" tone="info" />
        <MetricCard label="Gudang" value={summary.totalWarehouses.toString()} helper="Lokasi penyimpanan aktif" tone="success" />
        <MetricCard label="Low Stock" value={summary.lowStockCount.toString()} helper="Baris saldo yang sudah di bawah reorder point" tone="warning" />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {[
            { id: "items", label: "Items" },
            { id: "warehouses", label: "Warehouses" },
            { id: "stock", label: "Stock Overview" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as InventoryTab)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "items" ? (
        <section className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <input
              value={itemSearch}
              onChange={(event) => setItemSearch(event.target.value)}
              placeholder="Cari item berdasarkan SKU, nama, atau kategori"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">SKU</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Nama</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Kategori</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Unit</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Saldo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">CRM</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {itemsQuery.isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-sm text-gray-500">
                      Memuat item inventory...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-sm text-gray-500">
                      Belum ada item inventory.
                    </td>
                  </tr>
                ) : (
                  items.map((item: any) => {
                    const totalOnHand = item.balances.reduce(
                      (sum: number, balance: any) => sum + Number(balance.qtyOnHand ?? 0),
                      0,
                    );
                    const linkedProducts = item.crmProducts.length;
                    return (
                      <tr key={item.id}>
                        <td className="px-4 py-3 font-mono text-gray-700">{item.sku}</td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-900">{item.name}</p>
                            {item.description ? (
                              <p className="text-xs text-gray-500">{item.description}</p>
                            ) : null}
                            <p className="mt-1 text-xs text-gray-500">
                              COA Stock: {item.inventoryCoa?.code ?? "-"} · COA Asset: {item.temporaryAssetCoa?.code ?? "-"}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{item.category ?? "-"}</td>
                        <td className="px-4 py-3 text-gray-600">{item.unitOfMeasure}</td>
                        <td className="px-4 py-3 text-gray-600">{totalOnHand}</td>
                        <td className="px-4 py-3 text-gray-600">{linkedProducts} produk</td>
                        <td className="px-4 py-3">
                          <StatusPill label={item.isActive ? "Active" : "Inactive"} tone={item.isActive ? "green" : "gray"} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="secondary" onClick={() => setSelectedItem(item)}>
                            Detail
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === "warehouses" ? (
        <section className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <input
              value={warehouseSearch}
              onChange={(event) => setWarehouseSearch(event.target.value)}
              placeholder="Cari gudang berdasarkan kode atau nama"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {warehousesQuery.isLoading ? (
              <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500 shadow-sm">
                Memuat gudang...
              </div>
            ) : warehouses.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500 shadow-sm">
                Belum ada gudang.
              </div>
            ) : (
              warehouses.map((warehouse: any) => (
                <div key={warehouse.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">{warehouse.name}</p>
                      <p className="text-sm text-gray-500">{warehouse.code}</p>
                    </div>
                    <StatusPill label={warehouse.isActive ? "Active" : "Inactive"} tone={warehouse.isActive ? "green" : "gray"} />
                  </div>
                  <p className="mt-3 text-sm text-gray-600">{warehouse.description ?? "Tanpa deskripsi"}</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <MiniMetric label="Item Balance" value={warehouse.balances.length.toString()} />
                    <MiniMetric
                      label="Total On Hand"
                      value={warehouse.balances
                        .reduce((sum: number, balance: any) => sum + Number(balance.qtyOnHand ?? 0), 0)
                        .toString()}
                    />
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button size="sm" variant="secondary" onClick={() => setSelectedWarehouse(warehouse)}>
                      Detail
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      {activeTab === "stock" ? (
        <section className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Item</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Gudang</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Klasifikasi</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">On Hand</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Reserved</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Available</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Threshold / COA</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {stockOverviewQuery.isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-sm text-gray-500">
                      Memuat saldo stok...
                    </td>
                  </tr>
                ) : balances.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-sm text-gray-500">
                      Belum ada saldo stok.
                    </td>
                  </tr>
                ) : (
                  balances.map((balance: any) => {
                    const onHand = Number(balance.qtyOnHand ?? 0);
                    const reserved = Number(balance.qtyReserved ?? 0);
                    const available = onHand - reserved;
                    const reorderPoint = Number(balance.item.reorderPoint ?? 0);
                    const isLow = onHand <= reorderPoint;
                    const canReclassify =
                      canCreateInventory &&
                      balance.bucketType === "TEMP_ASSET" &&
                      available > 0;

                    return (
                      <tr key={balance.id}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{balance.item.name}</p>
                          <p className="text-xs text-gray-500">{balance.item.sku} · {balance.item.unitOfMeasure}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{balance.warehouse.name}</td>
                        <td className="px-4 py-3">
                          <StatusPill
                            label={balance.bucketType === "TEMP_ASSET" ? "Temporary Asset" : "Sale Stock"}
                            tone={balance.bucketType === "TEMP_ASSET" ? "gray" : "green"}
                          />
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">{onHand}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{reserved}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{available}</td>
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-600">ROP {reorderPoint}</span>
                              {isLow ? <StatusPill label="Low" tone="amber" /> : null}
                            </div>
                            <p className="text-xs text-gray-500">
                              COA: {balance.bucketType === "TEMP_ASSET"
                                ? balance.item.temporaryAssetCoa?.code ?? "Belum dipilih"
                                : balance.item.inventoryCoa?.code ?? "Belum dipilih"}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setSelectedBalance(balance)}
                            >
                              Detail
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => openReclassification(balance)}
                              disabled={!canReclassify}
                            >
                              Reklasifikasi
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <Modal isOpen={showCreateItem} onClose={() => setShowCreateItem(false)} title="Tambah Item Inventory" size="lg">
        <div className="space-y-5">
          <p className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            Lengkapi identitas item, aturan stok, dan status operasional agar SKU mudah dikenali saat dipakai di CRM maupun fulfillment.
          </p>

          <FormSection title="Informasi Utama" description="Field identitas utama item inventory.">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="SKU" required helper="Kode unik item, misalnya INV-001 atau PRD-A01.">
                <input
                  value={itemForm.sku}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, sku: e.target.value }))}
                  placeholder="Contoh: INV-001"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Nama Item" required helper="Nama yang tampil di inventory dan referensi CRM.">
                <input
                  value={itemForm.name}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Contoh: Router Mikrotik RB750"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Unit" required helper="Satuan dasar stok, misalnya PCS, BOX, UNIT.">
                <input
                  value={itemForm.unitOfMeasure}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, unitOfMeasure: e.target.value }))}
                  placeholder="PCS"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Kategori" helper="Kelompok item untuk pencarian dan pelaporan.">
                <input
                  value={itemForm.category}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, category: e.target.value }))}
                  placeholder="Networking / Accessories / Sparepart"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Deskripsi" className="md:col-span-2" helper="Tambahkan spesifikasi singkat atau catatan item.">
                <textarea
                  value={itemForm.description}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Contoh: Router untuk kebutuhan cabang, support dual WAN."
                  className={TEXTAREA_CLASS}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Kontrol Persediaan" description="Atur threshold minimal dan biaya standar item.">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Minimum Stock" helper="Batas minimum aman untuk stok.">
                <input
                  type="number"
                  min="0"
                  value={itemForm.minStock}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, minStock: e.target.value }))}
                  placeholder="0"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Reorder Point" helper="Saat saldo <= nilai ini, item dianggap perlu reorder.">
                <input
                  type="number"
                  min="0"
                  value={itemForm.reorderPoint}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, reorderPoint: e.target.value }))}
                  placeholder="0"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Standard Cost" helper="Biaya standar per unit untuk referensi valuasi.">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={itemForm.standardCost}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, standardCost: e.target.value }))}
                  placeholder="0.00"
                  className={INPUT_CLASS}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Relasi COA" description="Hubungkan item ke akun COA agar stok manual bisa dipisahkan antara stok jual dan aset sementara.">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="COA Persediaan Jual" helper="Dipakai saat stok masuk ke bucket sale stock / persediaan untuk dijual.">
                <select
                  value={itemForm.inventoryCoaId}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, inventoryCoaId: e.target.value }))}
                  className={SELECT_CLASS}
                >
                  <option value="">Pilih COA persediaan</option>
                  {coaOptions.map((account: any) => (
                    <option key={account.id} value={account.id}>
                      {account.code} · {account.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="COA Aset Sementara" helper="Dipakai saat stok masuk ke bucket temporary asset / aset sementara.">
                <select
                  value={itemForm.temporaryAssetCoaId}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, temporaryAssetCoaId: e.target.value }))}
                  className={SELECT_CLASS}
                >
                  <option value="">Pilih COA aset sementara</option>
                  {coaOptions.map((account: any) => (
                    <option key={account.id} value={account.id}>
                      {account.code} · {account.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="COA COGS / Beban Pokok" helper="Dipakai saat stok dijual / issue stock untuk jurnal debit COGS.">
                <select
                  value={itemForm.cogsCoaId}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, cogsCoaId: e.target.value }))}
                  className={SELECT_CLASS}
                >
                  <option value="">Pilih COA COGS</option>
                  {coaOptions.map((account: any) => (
                    <option key={account.id} value={account.id}>
                      {account.code} · {account.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </FormSection>

          <FormSection title="Status Item" description="Tentukan apakah stok item dilacak dan apakah item aktif digunakan.">
            <div className="grid gap-3 md:grid-cols-2">
              <CheckboxCard
                title="Track stock"
                description="Jika aktif, item ikut tercatat dalam on-hand, reserved, receipt, dan issue."
                checked={itemForm.isStockTracked}
                onChange={(checked) => setItemForm((prev) => ({ ...prev, isStockTracked: checked }))}
              />
              <CheckboxCard
                title="Item aktif"
                description="Jika nonaktif, item tetap tersimpan namun sebaiknya tidak dipakai untuk transaksi baru."
                checked={itemForm.isActive}
                onChange={(checked) => setItemForm((prev) => ({ ...prev, isActive: checked }))}
              />
            </div>
          </FormSection>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4">
          <Button variant="secondary" onClick={() => setShowCreateItem(false)}>Batal</Button>
          <Button onClick={() => void handleCreateItem()} isLoading={createItemMutation.isPending}>Simpan Item</Button>
        </div>
      </Modal>

      <Modal isOpen={showCreateWarehouse} onClose={() => setShowCreateWarehouse(false)} title="Tambah Gudang" size="lg">
        <div className="space-y-5">
          <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Buat gudang baru agar stok receipt, reservasi, dan issue bisa diarahkan ke lokasi yang jelas.
          </p>

          <FormSection title="Informasi Gudang" description="Isi identitas gudang yang akan dipakai di inventory.">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Kode Gudang" required helper="Kode singkat lokasi, misalnya JKT-01 atau MAIN-WH.">
                <input
                  value={warehouseForm.code}
                  onChange={(e) => setWarehouseForm((prev) => ({ ...prev, code: e.target.value }))}
                  placeholder="Contoh: MAIN-WH"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Nama Gudang" required helper="Nama yang tampil di transaksi receipt dan fulfillment.">
                <input
                  value={warehouseForm.name}
                  onChange={(e) => setWarehouseForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Contoh: Gudang Pusat Jakarta"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Deskripsi" className="md:col-span-2" helper="Catatan lokasi, fungsi gudang, atau area penyimpanan.">
                <textarea
                  value={warehouseForm.description}
                  onChange={(e) => setWarehouseForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Contoh: Menangani stok utama untuk penjualan area Jabodetabek."
                  className={TEXTAREA_CLASS}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Status Gudang" description="Aktifkan gudang agar bisa dipakai pada transaksi inventory baru.">
            <CheckboxCard
              title="Gudang aktif"
              description="Gudang aktif tersedia untuk stock receipt, reservation, dan issue stock."
              checked={warehouseForm.isActive}
              onChange={(checked) => setWarehouseForm((prev) => ({ ...prev, isActive: checked }))}
            />
          </FormSection>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4">
          <Button variant="secondary" onClick={() => setShowCreateWarehouse(false)}>Batal</Button>
          <Button onClick={() => void handleCreateWarehouse()} isLoading={createWarehouseMutation.isPending}>Simpan Gudang</Button>
        </div>
      </Modal>

      <Modal isOpen={showReceiptModal} onClose={() => setShowReceiptModal(false)} title="Mutasi Stok Masuk" size="lg">
        <div className="space-y-5">
          <p className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Gunakan form ini untuk mencatat stok masuk ke gudang tertentu. Pastikan item, gudang, quantity, dan biaya per unit terisi dengan benar.
          </p>

          <FormSection title="Tujuan Receipt" description="Tentukan item dan gudang penerima stok.">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Item Inventory" required helper="Pilih SKU yang menerima penambahan stok.">
                <select
                  value={receiptForm.itemId}
                  onChange={(e) => setReceiptForm((prev) => ({ ...prev, itemId: e.target.value }))}
                  className={SELECT_CLASS}
                >
                  <option value="">Pilih item inventory</option>
                  {items.map((item: any) => (
                    <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Gudang" required helper="Pilih lokasi penyimpanan stok masuk.">
                <select
                  value={receiptForm.warehouseId}
                  onChange={(e) => setReceiptForm((prev) => ({ ...prev, warehouseId: e.target.value }))}
                  className={SELECT_CLASS}
                >
                  <option value="">Pilih gudang</option>
                  {warehouses.map((warehouse: any) => (
                    <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>
                  ))}
                </select>
              </Field>
            </div>
          </FormSection>

          <FormSection title="Alokasi Quantity" description="Pisahkan barang masuk ke stok jual dan aset sementara sesuai kebutuhan operasional.">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Qty Sale Stock" required helper="Jumlah unit yang langsung masuk ke persediaan untuk dijual.">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={receiptForm.saleQuantity}
                  onChange={(e) => setReceiptForm((prev) => ({ ...prev, saleQuantity: e.target.value }))}
                  placeholder="5"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Qty Temporary Asset" required helper="Jumlah unit yang sementara diperlakukan sebagai aset, namun masih bisa dijual nanti.">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={receiptForm.temporaryAssetQuantity}
                  onChange={(e) => setReceiptForm((prev) => ({ ...prev, temporaryAssetQuantity: e.target.value }))}
                  placeholder="5"
                  className={INPUT_CLASS}
                />
              </Field>
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              Total receipt: <span className="font-semibold text-slate-900">{(Number(receiptForm.saleQuantity || 0) + Number(receiptForm.temporaryAssetQuantity || 0)).toLocaleString()}</span>
              <span className="ml-2 text-slate-500">unit</span>
            </div>
          </FormSection>

          <FormSection title="Nilai & Referensi" description="Isi biaya dan referensi dokumen receipt.">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Unit Cost" helper="Opsional. Akan membantu pembentukan cost standar item.">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={receiptForm.unitCost}
                  onChange={(e) => setReceiptForm((prev) => ({ ...prev, unitCost: e.target.value }))}
                  placeholder="0.00"
                  className={INPUT_CLASS}
                />
              </Field>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-semibold text-slate-900">Relasi COA otomatis</p>
                <p className="mt-1">
                  Qty <span className="font-medium">Sale Stock</span> akan mengikuti COA persediaan item, sedangkan qty <span className="font-medium">Temporary Asset</span> akan mengikuti COA aset sementara item.
                </p>
              </div>
              <Field label="Reference Type" helper="Jenis dokumen sumber receipt, misalnya PO, Adjustment, Manual.">
                <input
                  value={receiptForm.referenceType}
                  onChange={(e) => setReceiptForm((prev) => ({ ...prev, referenceType: e.target.value }))}
                  placeholder="MANUAL_RECEIPT"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Reference ID" helper="Nomor dokumen sumber atau nomor penerimaan barang.">
                <input
                  value={receiptForm.referenceId}
                  onChange={(e) => setReceiptForm((prev) => ({ ...prev, referenceId: e.target.value }))}
                  placeholder="Contoh: GRN-2026-0001"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Catatan" className="md:col-span-2" helper="Tambahkan supplier, batch, atau keterangan penerimaan.">
                <textarea
                  value={receiptForm.notes}
                  onChange={(e) => setReceiptForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Contoh: Penerimaan batch pertama dari supplier utama."
                  className={TEXTAREA_CLASS}
                />
              </Field>
            </div>
          </FormSection>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4">
          <Button variant="secondary" onClick={() => setShowReceiptModal(false)}>Batal</Button>
          <Button onClick={() => void handleCreateReceipt()} isLoading={createReceiptMutation.isPending}>Simpan Receipt</Button>
        </div>
      </Modal>

      <Modal isOpen={selectedItem !== null} onClose={() => setSelectedItem(null)} title="Detail Item Inventory" size="xl">
        {selectedItem ? (
          itemDetailQuery.isLoading ? (
            <div className="py-8 text-sm text-gray-500">Memuat detail item, ledger stok, dan posting jurnal...</div>
          ) : itemDetail ? (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MiniMetric label="SKU" value={itemDetail.sku} />
                <MiniMetric label="Unit" value={itemDetail.unitOfMeasure} />
                <MiniMetric label="CRM Linked" value={`${itemDetail.crmProducts?.length ?? 0} produk`} />
                <MiniMetric label="Status" value={itemDetail.isActive ? "Active" : "Inactive"} />
              </div>

              <FormSection title="Informasi Item" description="Ringkasan master data item inventory.">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <DetailRow label="Nama Item" value={itemDetail.name} />
                  <DetailRow label="Kategori" value={itemDetail.category ?? "-"} />
                  <DetailRow label="Standard Cost" value={itemDetail.standardCost !== null && itemDetail.standardCost !== undefined ? formatCurrency(Number(itemDetail.standardCost)) : "-"} />
                  <DetailRow label="Track Stock" value={itemDetail.isStockTracked ? "Ya" : "Tidak"} />
                  <DetailRow label="Minimum Stock" value={itemDetail.minStock?.toString?.() ?? "0"} />
                  <DetailRow label="Reorder Point" value={itemDetail.reorderPoint?.toString?.() ?? "0"} />
                  <DetailRow label="COA Persediaan" value={itemDetail.inventoryCoa ? `${itemDetail.inventoryCoa.code} · ${itemDetail.inventoryCoa.name}` : "Belum dipilih"} />
                  <DetailRow label="COA Aset Sementara" value={itemDetail.temporaryAssetCoa ? `${itemDetail.temporaryAssetCoa.code} · ${itemDetail.temporaryAssetCoa.name}` : "Belum dipilih"} />
                  <DetailRow label="COA COGS" value={itemDetail.cogsCoa ? `${itemDetail.cogsCoa.code} · ${itemDetail.cogsCoa.name}` : "Belum dipilih"} />
                </div>
                <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">Deskripsi</p>
                  <p className="mt-1">{itemDetail.description ?? "Tidak ada deskripsi."}</p>
                </div>
              </FormSection>

              <FormSection title="Saldo per Gudang / Bucket" description="Ringkasan posisi stok item pada seluruh gudang.">
                <div className="space-y-3">
                  {(itemDetail.balances ?? []).length === 0 ? (
                    <p className="text-sm text-gray-500">Belum ada saldo untuk item ini.</p>
                  ) : (
                    itemDetail.balances.map((balance: any) => (
                      <div key={balance.id} className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">{balance.warehouse?.name ?? "-"}</p>
                            <p className="text-xs text-slate-500">{balance.warehouse?.code ?? "-"}</p>
                          </div>
                          <StatusPill label={balance.bucketType === "TEMP_ASSET" ? "Temporary Asset" : "Sale Stock"} tone={balance.bucketType === "TEMP_ASSET" ? "gray" : "green"} />
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                          <MiniMetric label="On Hand" value={Number(balance.qtyOnHand ?? 0).toString()} />
                          <MiniMetric label="Reserved" value={Number(balance.qtyReserved ?? 0).toString()} />
                          <MiniMetric label="Available" value={(Number(balance.qtyOnHand ?? 0) - Number(balance.qtyReserved ?? 0)).toString()} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </FormSection>

              <FormSection title="Stock Ledger" description="Riwayat mutasi stok terbaru untuk item ini.">
                {(itemDetail.ledgerEntries ?? []).length === 0 ? (
                  <p className="text-sm text-gray-500">Belum ada ledger stok.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Tanggal</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Gudang / Bucket</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Movement</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Referensi</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Qty</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">COA</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {itemDetail.ledgerEntries.map((entry: any) => (
                          <tr key={entry.id}>
                            <td className="px-4 py-3 text-gray-700">{formatDate(entry.movementDate ?? entry.createdAt)}</td>
                            <td className="px-4 py-3 text-gray-600">
                              {entry.warehouse?.code ?? "-"} · {entry.bucketType === "TEMP_ASSET" ? "Temporary Asset" : "Sale Stock"}
                            </td>
                            <td className="px-4 py-3 text-gray-700">{entry.movementType}</td>
                            <td className="px-4 py-3 text-gray-600">{entry.referenceType ?? "-"} · {entry.referenceId ?? "-"}</td>
                            <td className={`px-4 py-3 text-right font-medium ${Number(entry.quantityChange ?? 0) >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                              {Number(entry.quantityChange ?? 0).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-gray-600">{entry.chartOfAccount ? `${entry.chartOfAccount.code} · ${entry.chartOfAccount.name}` : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </FormSection>

              <FormSection title="Journal Posting" description="Posting accounting yang terkait dengan mutasi item ini, termasuk COGS otomatis.">
                {(itemDetail.relatedJournals ?? []).length === 0 ? (
                  <p className="text-sm text-gray-500">Belum ada journal posting terkait item ini.</p>
                ) : (
                  <div className="space-y-4">
                    {itemDetail.relatedJournals.map((journal: any) => (
                      <div key={journal.id} className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">{journal.journalNumber}</p>
                            <p className="text-sm text-slate-600">{journal.description}</p>
                            <p className="text-xs text-slate-500">{formatDate(journal.transactionDate)}</p>
                          </div>
                          <Button size="sm" variant="secondary" onClick={() => router.push('/journal')}>
                            Lihat Jurnal
                          </Button>
                        </div>
                        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                          <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Line</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">COA</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Deskripsi</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Debit</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Credit</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {(journal.lines ?? []).map((line: any) => (
                                <tr key={line.id}>
                                  <td className="px-4 py-3 text-gray-700">#{line.lineNumber}</td>
                                  <td className="px-4 py-3 text-gray-700">{line.chartOfAccount?.code} · {line.chartOfAccount?.name}</td>
                                  <td className="px-4 py-3 text-gray-600">{line.description ?? '-'}</td>
                                  <td className="px-4 py-3 text-right font-medium text-emerald-700">{formatCurrency(Number(line.debitAmount ?? 0))}</td>
                                  <td className="px-4 py-3 text-right font-medium text-red-600">{formatCurrency(Number(line.creditAmount ?? 0))}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </FormSection>
            </div>
          ) : null
        ) : null}
      </Modal>

      <Modal isOpen={selectedWarehouse !== null} onClose={() => setSelectedWarehouse(null)} title="Detail Gudang" size="lg">
        {selectedWarehouse ? (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <MiniMetric label="Kode" value={selectedWarehouse.code} />
              <MiniMetric label="Status" value={selectedWarehouse.isActive ? "Active" : "Inactive"} />
              <MiniMetric label="Total Balance Row" value={`${selectedWarehouse.balances?.length ?? 0}`} />
            </div>

            <FormSection title="Informasi Gudang" description="Ringkasan data gudang dan posisi stok di dalamnya.">
              <div className="grid gap-4 md:grid-cols-2">
                <DetailRow label="Nama Gudang" value={selectedWarehouse.name} />
                <DetailRow label="Deskripsi" value={selectedWarehouse.description ?? "Tanpa deskripsi"} />
              </div>
            </FormSection>

            <FormSection title="Saldo yang Tersimpan" description="Daftar item yang saat ini memiliki balance di gudang ini.">
              <div className="space-y-3">
                {(selectedWarehouse.balances ?? []).length === 0 ? (
                  <p className="text-sm text-gray-500">Belum ada stok pada gudang ini.</p>
                ) : (
                  selectedWarehouse.balances.map((balance: any) => (
                    <div key={balance.id} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{balance.item?.name ?? "-"}</p>
                          <p className="text-xs text-slate-500">{balance.item?.sku ?? "-"}</p>
                        </div>
                        <StatusPill label={balance.bucketType === "TEMP_ASSET" ? "Temporary Asset" : "Sale Stock"} tone={balance.bucketType === "TEMP_ASSET" ? "gray" : "green"} />
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <MiniMetric label="On Hand" value={Number(balance.qtyOnHand ?? 0).toString()} />
                        <MiniMetric label="Reserved" value={Number(balance.qtyReserved ?? 0).toString()} />
                        <MiniMetric label="Available" value={(Number(balance.qtyOnHand ?? 0) - Number(balance.qtyReserved ?? 0)).toString()} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </FormSection>
          </div>
        ) : null}
      </Modal>

      <Modal isOpen={selectedBalance !== null} onClose={() => setSelectedBalance(null)} title="Detail Saldo Stok" size="lg">
        {selectedBalance ? (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MiniMetric label="Item" value={selectedBalance.item?.sku ?? "-"} />
              <MiniMetric label="Gudang" value={selectedBalance.warehouse?.code ?? "-"} />
              <MiniMetric label="Bucket" value={selectedBalance.bucketType === "TEMP_ASSET" ? "Temporary Asset" : "Sale Stock"} />
              <MiniMetric label="Status" value={Number(selectedBalance.qtyOnHand ?? 0) <= Number(selectedBalance.item?.reorderPoint ?? 0) ? "Low Stock" : "Normal"} />
            </div>

            <FormSection title="Ringkasan Saldo" description="Posisi stok saat ini untuk kombinasi item, gudang, dan bucket yang dipilih.">
              <div className="grid gap-4 md:grid-cols-2">
                <DetailRow label="Nama Item" value={selectedBalance.item?.name ?? "-"} />
                <DetailRow label="Unit" value={selectedBalance.item?.unitOfMeasure ?? "-"} />
                <DetailRow label="Gudang" value={selectedBalance.warehouse?.name ?? "-"} />
                <DetailRow label="Reorder Point" value={Number(selectedBalance.item?.reorderPoint ?? 0).toString()} />
                <DetailRow label="COA" value={selectedBalance.bucketType === "TEMP_ASSET" ? (selectedBalance.item?.temporaryAssetCoa ? `${selectedBalance.item.temporaryAssetCoa.code} · ${selectedBalance.item.temporaryAssetCoa.name}` : "Belum dipilih") : (selectedBalance.item?.inventoryCoa ? `${selectedBalance.item.inventoryCoa.code} · ${selectedBalance.item.inventoryCoa.name}` : "Belum dipilih")} />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <MiniMetric label="On Hand" value={Number(selectedBalance.qtyOnHand ?? 0).toString()} />
                <MiniMetric label="Reserved" value={Number(selectedBalance.qtyReserved ?? 0).toString()} />
                <MiniMetric label="Available" value={(Number(selectedBalance.qtyOnHand ?? 0) - Number(selectedBalance.qtyReserved ?? 0)).toString()} />
              </div>
            </FormSection>
          </div>
        ) : null}
      </Modal>

      <Modal isOpen={showReclassModal} onClose={() => setShowReclassModal(false)} title="Reklasifikasi Temporary Asset ke Sale Stock" size="lg">
        <div className="space-y-5">
          <p className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-900">
            Gunakan form ini untuk memindahkan stok dari bucket temporary asset ke sale stock tanpa mengubah barang atau gudangnya.
          </p>

          <FormSection title="Item yang Direklasifikasi" description="Barang dan gudang mengikuti saldo temporary asset yang dipilih dari stock overview.">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Item Inventory" required>
                <select value={reclassForm.itemId} onChange={(e) => setReclassForm((prev) => ({ ...prev, itemId: e.target.value }))} className={SELECT_CLASS}>
                  <option value="">Pilih item inventory</option>
                  {items.map((item: any) => (
                    <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Gudang" required>
                <select value={reclassForm.warehouseId} onChange={(e) => setReclassForm((prev) => ({ ...prev, warehouseId: e.target.value }))} className={SELECT_CLASS}>
                  <option value="">Pilih gudang</option>
                  {warehouses.map((warehouse: any) => (
                    <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>
                  ))}
                </select>
              </Field>
            </div>
          </FormSection>

          <FormSection title="Jumlah Reklasifikasi" description="Quantity akan dikurangi dari temporary asset dan ditambahkan ke sale stock.">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Quantity" required helper="Masukkan jumlah unit yang dipindahkan ke stok jual.">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={reclassForm.quantity}
                  onChange={(e) => setReclassForm((prev) => ({ ...prev, quantity: e.target.value }))}
                  placeholder="1"
                  className={INPUT_CLASS}
                />
              </Field>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-semibold text-slate-900">Dampak reklasifikasi</p>
                <p className="mt-1">Temporary Asset akan berkurang, Sale Stock akan bertambah, dan sistem membuat ledger transfer out + transfer in.</p>
              </div>
            </div>
          </FormSection>

          <FormSection title="Referensi" description="Tambahkan referensi dokumen atau alasan reklasifikasi.">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Reference Type">
                <input
                  value={reclassForm.referenceType}
                  onChange={(e) => setReclassForm((prev) => ({ ...prev, referenceType: e.target.value }))}
                  placeholder="InventoryReclassification"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Reference ID">
                <input
                  value={reclassForm.referenceId}
                  onChange={(e) => setReclassForm((prev) => ({ ...prev, referenceId: e.target.value }))}
                  placeholder="Contoh: RECLASS-2026-0001"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Catatan" className="md:col-span-2">
                <textarea
                  value={reclassForm.notes}
                  onChange={(e) => setReclassForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Contoh: Unit tidak jadi dipakai operasional dan dipindahkan ke stok jual."
                  className={TEXTAREA_CLASS}
                />
              </Field>
            </div>
          </FormSection>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4">
          <Button variant="secondary" onClick={() => setShowReclassModal(false)}>Batal</Button>
          <Button onClick={() => void handleReclassification()} isLoading={reclassifyMutation.isPending}>Proses Reklasifikasi</Button>
        </div>
      </Modal>
    </div>
  );
}

function MetricCard({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: string;
  helper: string;
  tone?: "default" | "info" | "success" | "warning";
}) {
  const tones = {
    default: "border-gray-200 bg-white",
    info: "border-blue-200 bg-white",
    success: "border-green-200 bg-white",
    warning: "border-amber-200 bg-white",
  };

  return (
    <div className={`rounded-xl border p-5 shadow-sm ${tones[tone]}`}>
      <p className="text-sm text-gray-600">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-2 text-xs text-gray-500">{helper}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "gray" | "amber";
}) {
  const tones = {
    green: "bg-green-100 text-green-700",
    gray: "bg-gray-100 text-gray-700",
    amber: "bg-amber-100 text-amber-700",
  };

  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${tones[tone]}`}>
      {label}
    </span>
  );
}

const INPUT_CLASS =
  "w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100";
const SELECT_CLASS =
  "w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100";
const TEXTAREA_CLASS = `${INPUT_CLASS} min-h-[110px] resize-y`;

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 md:p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-900">{title}</h3>
        <p className="mt-1 text-sm text-gray-600">{description}</p>
      </div>
      {children}
    </section>
  );
}

function CheckboxCard({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition ${checked ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <div>
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="mt-1 text-sm text-gray-600">{description}</p>
      </div>
    </label>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
  helper,
  required = false,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  helper?: string;
  required?: boolean;
}) {
  return (
    <div className={className}>
      <label className="mb-2 block text-sm font-semibold text-gray-800">
        {label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </label>
      {children}
      {helper ? <p className="mt-2 text-xs leading-5 text-gray-500">{helper}</p> : null}
    </div>
  );
}
