"use client";

import Link from "next/link";
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
type StockBucketFilter = "ALL" | "SALE_STOCK" | "TEMP_ASSET";
type ItemDetailTab = "overview" | "units" | "crm" | "reservations" | "balances" | "ledger" | "journals";
type WarehouseDetailTab = "overview" | "balances";
type BalanceDetailTab = "overview" | "units";

const DEFAULT_ITEM_FORM = {
  sku: "",
  name: "",
  description: "",
  unitOfMeasure: "PCS",
  category: "",
  brand: "",
  model: "",
  manufacturerPartNumber: "",
  barcode: "",
  technicalSpecs: "",
  trackingMode: "QUANTITY",
  usageType: "BOTH",
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

const createDefaultSerializedUnit = (bucketType: "SALE_STOCK" | "TEMP_ASSET" = "SALE_STOCK") => ({
  bucketType,
  serialNumber: "",
  assetTag: "",
  batchNumber: "",
  condition: "NEW",
  receivedDate: "",
  purchaseDate: "",
  warrantyExpiry: "",
  notes: "",
});

const DEFAULT_RECEIPT_FORM = {
  itemId: "",
  warehouseId: "",
  saleQuantity: "1",
  temporaryAssetQuantity: "0",
  serializedUnits: [createDefaultSerializedUnit("SALE_STOCK")],
  vendorName: "",
  vendorReference: "",
  batchNumber: "",
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

const DEFAULT_UNIT_ASSIGN_FORM = {
  userId: "",
  notes: "",
};

const DEFAULT_UNIT_RECLASS_FORM = {
  toBucketType: "SALE_STOCK",
  notes: "",
};

export default function InventoryPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<InventoryTab>("items");
  const [itemSearch, setItemSearch] = useState("");
  const [itemStatusFilter, setItemStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [warehouseSearch, setWarehouseSearch] = useState("");
  const [showCreateItem, setShowCreateItem] = useState(false);
  const [showEditItem, setShowEditItem] = useState(false);
  const [showCreateWarehouse, setShowCreateWarehouse] = useState(false);
  const [showEditWarehouse, setShowEditWarehouse] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showReclassModal, setShowReclassModal] = useState(false);
  const [showItemDetailModal, setShowItemDetailModal] = useState(false);
  const [showWarehouseDetailModal, setShowWarehouseDetailModal] = useState(false);
  const [showBalanceDetailModal, setShowBalanceDetailModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<any | null>(null);
  const [selectedBalance, setSelectedBalance] = useState<any | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<any | null>(null);
  const [showAssignUnitModal, setShowAssignUnitModal] = useState(false);
  const [showReclassUnitModal, setShowReclassUnitModal] = useState(false);
  const [itemForm, setItemForm] = useState(DEFAULT_ITEM_FORM);
  const [warehouseForm, setWarehouseForm] = useState(DEFAULT_WAREHOUSE_FORM);
  const [receiptForm, setReceiptForm] = useState(DEFAULT_RECEIPT_FORM);
  const [reclassForm, setReclassForm] = useState(DEFAULT_RECLASS_FORM);
  const [unitAssignForm, setUnitAssignForm] = useState(DEFAULT_UNIT_ASSIGN_FORM);
  const [unitReclassForm, setUnitReclassForm] = useState(DEFAULT_UNIT_RECLASS_FORM);
  const [stockWarehouseFilter, setStockWarehouseFilter] = useState("");
  const [stockBucketFilter, setStockBucketFilter] = useState<StockBucketFilter>("ALL");
  const [stockLowOnly, setStockLowOnly] = useState(false);
  const [expandedReceiptUnitIndexes, setExpandedReceiptUnitIndexes] = useState<number[]>([]);
  const [itemDetailSerialSearch, setItemDetailSerialSearch] = useState("");
  const [balanceDetailSerialSearch, setBalanceDetailSerialSearch] = useState("");
  const [itemDetailTab, setItemDetailTab] = useState<ItemDetailTab>("overview");
  const [warehouseDetailTab, setWarehouseDetailTab] = useState<WarehouseDetailTab>("overview");
  const [balanceDetailTab, setBalanceDetailTab] = useState<BalanceDetailTab>("overview");

  const isRoot = session?.user?.isRoot ?? false;
  const permissions = session?.user?.permissions;
  const canReadInventory =
    isRoot || hasPermissionMap(permissions, "inventory", "read");
  const canCreateInventory =
    isRoot || hasPermissionMap(permissions, "inventory", "create");
  const canUpdateInventory =
    isRoot || hasPermissionMap(permissions, "inventory", "update");

  useEffect(() => {
    if (session && !canReadInventory) {
      void router.replace("/dashboard");
    }
  }, [session, canReadInventory, router]);

  const itemsQuery = api.inventory.listItems.useQuery(
    {
      search: itemSearch || undefined,
      isActive:
        itemStatusFilter === "ALL"
          ? undefined
          : itemStatusFilter === "ACTIVE",
      limit: 100,
    },
    { enabled: canReadInventory, refetchOnWindowFocus: false },
  );

  const warehousesQuery = api.inventory.listWarehouses.useQuery(
    { search: warehouseSearch || undefined },
    { enabled: canReadInventory, refetchOnWindowFocus: false },
  );

  const stockOverviewQuery = api.inventory.stockOverview.useQuery(
    {
      lowStockOnly: stockLowOnly,
      warehouseId: stockWarehouseFilter || undefined,
    },
    { enabled: canReadInventory, refetchOnWindowFocus: false },
  );

  const fulfillmentSummaryQuery = api.inventory.fulfillmentSummary.useQuery(
    {},
    { enabled: canReadInventory, refetchOnWindowFocus: false },
  );

  const coaOptionsQuery = api.inventory.listCoaOptions.useQuery(
    {},
    { enabled: canReadInventory, refetchOnWindowFocus: false },
  );
  const assignableUsersQuery = api.inventory.listAssignableUsers.useQuery(
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

  const updateItemMutation = api.inventory.updateItem.useMutation({
    onSuccess: async () => {
      setShowEditItem(false);
      showToast({ title: "Berhasil", message: "Item inventory berhasil diperbarui.", variant: "success" });
      await itemsQuery.refetch();
      await stockOverviewQuery.refetch();
      if (selectedItem?.id) {
        await itemDetailQuery.refetch();
      }
    },
    onError: (error) => {
      showToast({ title: "Gagal", message: error.message, variant: "error" });
    },
  });

  const updateWarehouseMutation = api.inventory.updateWarehouse.useMutation({
    onSuccess: async () => {
      setShowEditWarehouse(false);
      showToast({ title: "Berhasil", message: "Gudang berhasil diperbarui.", variant: "success" });
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
      setExpandedReceiptUnitIndexes([]);
      setReceiptForm({
        ...DEFAULT_RECEIPT_FORM,
        serializedUnits: [createDefaultSerializedUnit("SALE_STOCK")],
      });
      showToast({ title: "Berhasil", message: "Mutasi stok masuk berhasil dicatat.", variant: "success" });
      await itemsQuery.refetch();
      await warehousesQuery.refetch();
      await stockOverviewQuery.refetch();
      if (selectedItem?.id) {
        await itemDetailQuery.refetch();
      }
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

  const assignUnitMutation = api.inventory.assignInventoryUnit.useMutation({
    onSuccess: async () => {
      setShowAssignUnitModal(false);
      setSelectedUnit(null);
      setUnitAssignForm(DEFAULT_UNIT_ASSIGN_FORM);
      showToast({ title: "Berhasil", message: "Serialized unit berhasil di-assign ke user.", variant: "success" });
      await itemDetailQuery.refetch();
    },
    onError: (error) => showToast({ title: "Gagal", message: error.message, variant: "error" }),
  });

  const unassignUnitMutation = api.inventory.unassignInventoryUnit.useMutation({
    onSuccess: async () => {
      showToast({ title: "Berhasil", message: "Assignment unit berhasil dilepas.", variant: "success" });
      await itemDetailQuery.refetch();
    },
    onError: (error) => showToast({ title: "Gagal", message: error.message, variant: "error" }),
  });

  const reclassifySerializedUnitMutation = api.inventory.reclassifySerializedUnits.useMutation({
    onSuccess: async () => {
      setShowReclassUnitModal(false);
      setSelectedUnit(null);
      setUnitReclassForm(DEFAULT_UNIT_RECLASS_FORM);
      showToast({ title: "Berhasil", message: "Bucket serialized unit berhasil direklasifikasi.", variant: "success" });
      await itemDetailQuery.refetch();
      await itemsQuery.refetch();
      await stockOverviewQuery.refetch();
    },
    onError: (error) => showToast({ title: "Gagal", message: error.message, variant: "error" }),
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
  const filteredBalances = useMemo(
    () => balances.filter((balance: any) => stockBucketFilter === "ALL" || balance.bucketType === stockBucketFilter),
    [balances, stockBucketFilter],
  );
  const coaOptions = useMemo<Array<any>>(
    () => (coaOptionsQuery.data?.accounts as Array<any> | undefined) ?? [],
    [coaOptionsQuery.data],
  );
  const assignableUsers = useMemo<Array<any>>(
    () => (assignableUsersQuery.data?.users as Array<any> | undefined) ?? [],
    [assignableUsersQuery.data],
  );
  const itemDetail = (itemDetailQuery.data as any) ?? null;
  const selectedReceiptItem = useMemo(
    () => items.find((item: any) => item.id === receiptForm.itemId) ?? null,
    [items, receiptForm.itemId],
  );
  const fulfillmentSummary = fulfillmentSummaryQuery.data as any;

  const filteredItemDetailUnits = useMemo(
    () =>
      ((itemDetail?.units as Array<any> | undefined) ?? []).filter((unit: any) => {
        if (!itemDetailSerialSearch) return true;
        const keyword = itemDetailSerialSearch.toLowerCase();
        return [
          unit.serialNumber,
          unit.assetTag,
          unit.batchNumber,
          unit.status,
          unit.condition,
          unit.assignedToUser?.name,
          unit.assignedToUser?.email,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword));
      }),
    [itemDetail?.units, itemDetailSerialSearch],
  );

  const filteredBalanceDetailUnits = useMemo(
    () =>
      ((selectedBalance?.serializedUnits as Array<any> | undefined) ?? []).filter((unit: any) => {
        if (!balanceDetailSerialSearch) return true;
        const keyword = balanceDetailSerialSearch.toLowerCase();
        return [
          unit.serialNumber,
          unit.assetTag,
          unit.status,
          unit.condition,
          unit.assignedToUser?.name,
          unit.assignedToUser?.email,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword));
      }),
    [selectedBalance?.serializedUnits, balanceDetailSerialSearch],
  );

  const summary = useMemo(() => {
    const totalItems = items.length;
    const trackedItems = items.filter((item: any) => item.isStockTracked).length;
    const totalWarehouses = warehouses.length;
    const lowStockCount = balances.filter(
      (row: any) => Number(row.qtyOnHand) <= Number(row.item.reorderPoint ?? 0),
    ).length;
    return { totalItems, trackedItems, totalWarehouses, lowStockCount };
  }, [items, warehouses, balances]);

  const stockSummary = useMemo(() => {
    const totalRows = filteredBalances.length;
    const serializedRows = filteredBalances.filter((balance: any) => Boolean(balance.serializedSummary)).length;
    const totalBatches = filteredBalances.reduce(
      (sum: number, balance: any) => sum + Number(balance.batchSummary?.totalBatches ?? 0),
      0,
    );
    const totalAvailable = filteredBalances.reduce(
      (sum: number, balance: any) => sum + (Number(balance.qtyOnHand ?? 0) - Number(balance.qtyReserved ?? 0)),
      0,
    );

    return {
      totalRows,
      serializedRows,
      totalBatches,
      totalAvailable,
    };
  }, [filteredBalances]);

  const isSerializedReceiptItem =
    selectedReceiptItem?.trackingMode === "SERIAL" ||
    selectedReceiptItem?.trackingMode === "BOTH";

  useEffect(() => {
    if (!showItemDetailModal) {
      setItemDetailTab("overview");
      setItemDetailSerialSearch("");
      return;
    }

    setItemDetailTab("overview");
    setItemDetailSerialSearch("");
  }, [showItemDetailModal]);

  useEffect(() => {
    if (!showWarehouseDetailModal) {
      setWarehouseDetailTab("overview");
      return;
    }

    setWarehouseDetailTab("overview");
  }, [showWarehouseDetailModal]);

  useEffect(() => {
    if (!showBalanceDetailModal) {
      setBalanceDetailTab("overview");
      setBalanceDetailSerialSearch("");
      return;
    }

    setBalanceDetailTab("overview");
    setBalanceDetailSerialSearch("");
  }, [showBalanceDetailModal]);

  useEffect(() => {
    if (!isSerializedReceiptItem) {
      setExpandedReceiptUnitIndexes([]);
      return;
    }

    const maxIndex = Math.max(0, receiptForm.serializedUnits.length - 1);
    setExpandedReceiptUnitIndexes((prev) => prev.filter((index) => index <= maxIndex));

    const saleQty = Number(receiptForm.saleQuantity || 0);
    const tempQty = Number(receiptForm.temporaryAssetQuantity || 0);
    const desiredUnits = Math.max(0, saleQty + tempQty);

    setReceiptForm((prev) => {
      const nextUnits = [...prev.serializedUnits];
      while (nextUnits.length < desiredUnits) {
        nextUnits.push(
          createDefaultSerializedUnit(nextUnits.length < saleQty ? "SALE_STOCK" : "TEMP_ASSET"),
        );
      }
      while (nextUnits.length > desiredUnits) {
        nextUnits.pop();
      }

      return {
        ...prev,
        serializedUnits: nextUnits.map((unit, index) => ({
          ...unit,
          bucketType: index < saleQty ? "SALE_STOCK" : "TEMP_ASSET",
        })),
      };
    });
  }, [isSerializedReceiptItem, receiptForm.saleQuantity, receiptForm.temporaryAssetQuantity]);

  if (!session || !canReadInventory) return null;

  async function copyToClipboard(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      showToast({ title: "Berhasil", message: `${label} berhasil disalin.`, variant: "success" });
    } catch {
      showToast({ title: "Gagal", message: `Tidak bisa menyalin ${label}.`, variant: "error" });
    }
  }

  async function handleCreateItem() {
    await createItemMutation.mutateAsync({
      sku: itemForm.sku,
      name: itemForm.name,
      description: itemForm.description || undefined,
      unitOfMeasure: itemForm.unitOfMeasure,
      category: itemForm.category || undefined,
      brand: itemForm.brand || undefined,
      model: itemForm.model || undefined,
      manufacturerPartNumber: itemForm.manufacturerPartNumber || undefined,
      barcode: itemForm.barcode || undefined,
      technicalSpecs: itemForm.technicalSpecs || undefined,
      trackingMode: itemForm.trackingMode as "QUANTITY" | "SERIAL" | "BOTH",
      usageType: itemForm.usageType as "SALE" | "OPERATIONAL" | "BOTH",
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

  async function handleUpdateItem() {
    if (!selectedItem?.id) return;

    await updateItemMutation.mutateAsync({
      id: selectedItem.id,
      name: itemForm.name,
      description: itemForm.description || null,
      unitOfMeasure: itemForm.unitOfMeasure,
      category: itemForm.category || null,
      brand: itemForm.brand || null,
      model: itemForm.model || null,
      manufacturerPartNumber: itemForm.manufacturerPartNumber || null,
      barcode: itemForm.barcode || null,
      technicalSpecs: itemForm.technicalSpecs || null,
      trackingMode: itemForm.trackingMode as "QUANTITY" | "SERIAL" | "BOTH",
      usageType: itemForm.usageType as "SALE" | "OPERATIONAL" | "BOTH",
      isStockTracked: itemForm.isStockTracked,
      minStock: Number(itemForm.minStock || 0),
      reorderPoint: Number(itemForm.reorderPoint || 0),
      standardCost: itemForm.standardCost ? Number(itemForm.standardCost) : null,
      inventoryCoaId: itemForm.inventoryCoaId || null,
      temporaryAssetCoaId: itemForm.temporaryAssetCoaId || null,
      cogsCoaId: itemForm.cogsCoaId || null,
      isActive: itemForm.isActive,
    });
  }

  async function handleUpdateWarehouse() {
    if (!selectedWarehouse?.id) return;

    await updateWarehouseMutation.mutateAsync({
      id: selectedWarehouse.id,
      name: warehouseForm.name,
      description: warehouseForm.description || null,
      isActive: warehouseForm.isActive,
    });
  }

  function updateSerializedBucketCount(bucketType: "SALE_STOCK" | "TEMP_ASSET", count: number) {
    setReceiptForm((prev) => {
      const safeCount = Math.max(0, count);
      const existingSaleUnits = prev.serializedUnits.filter((unit) => unit.bucketType === "SALE_STOCK");
      const existingTempUnits = prev.serializedUnits.filter((unit) => unit.bucketType === "TEMP_ASSET");
      const targetSaleCount = bucketType === "SALE_STOCK" ? safeCount : existingSaleUnits.length;
      const targetTempCount = bucketType === "TEMP_ASSET" ? safeCount : existingTempUnits.length;

      const nextSaleUnits = Array.from({ length: targetSaleCount }, (_, index) =>
        existingSaleUnits[index] ?? createDefaultSerializedUnit("SALE_STOCK"),
      );
      const nextTempUnits = Array.from({ length: targetTempCount }, (_, index) =>
        existingTempUnits[index] ?? createDefaultSerializedUnit("TEMP_ASSET"),
      );

      return {
        ...prev,
        saleQuantity: String(targetSaleCount),
        temporaryAssetQuantity: String(targetTempCount),
        serializedUnits: [...nextSaleUnits, ...nextTempUnits],
      };
    });
  }

  function toggleReceiptUnitDetail(index: number) {
    setExpandedReceiptUnitIndexes((prev) =>
      prev.includes(index) ? prev.filter((value) => value !== index) : [...prev, index],
    );
  }

  function applyBulkSerials(bucketType: "SALE_STOCK" | "TEMP_ASSET", rawText: string) {
    const lines = rawText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    setReceiptForm((prev) => {
      const existingSaleUnits = prev.serializedUnits.filter((unit) => unit.bucketType === "SALE_STOCK");
      const existingTempUnits = prev.serializedUnits.filter((unit) => unit.bucketType === "TEMP_ASSET");
      const targetSaleCount = bucketType === "SALE_STOCK" ? lines.length : existingSaleUnits.length;
      const targetTempCount = bucketType === "TEMP_ASSET" ? lines.length : existingTempUnits.length;

      const nextSaleUnits = Array.from({ length: targetSaleCount }, (_, index) => {
        const base = existingSaleUnits[index] ?? createDefaultSerializedUnit("SALE_STOCK");
        return bucketType === "SALE_STOCK"
          ? { ...base, bucketType: "SALE_STOCK" as const, serialNumber: lines[index] ?? "" }
          : { ...base, bucketType: "SALE_STOCK" as const };
      });
      const nextTempUnits = Array.from({ length: targetTempCount }, (_, index) => {
        const base = existingTempUnits[index] ?? createDefaultSerializedUnit("TEMP_ASSET");
        return bucketType === "TEMP_ASSET"
          ? { ...base, bucketType: "TEMP_ASSET" as const, serialNumber: lines[index] ?? "" }
          : { ...base, bucketType: "TEMP_ASSET" as const };
      });

      return {
        ...prev,
        saleQuantity: String(targetSaleCount),
        temporaryAssetQuantity: String(targetTempCount),
        serializedUnits: [...nextSaleUnits, ...nextTempUnits],
      };
    });
  }

  async function handleCreateReceipt() {
    await createReceiptMutation.mutateAsync({
      itemId: receiptForm.itemId,
      warehouseId: receiptForm.warehouseId,
      saleQuantity: Number(receiptForm.saleQuantity || 0),
      temporaryAssetQuantity: Number(receiptForm.temporaryAssetQuantity || 0),
      serializedUnits: isSerializedReceiptItem
        ? receiptForm.serializedUnits.map((unit) => ({
            bucketType: unit.bucketType as "SALE_STOCK" | "TEMP_ASSET",
            serialNumber: unit.serialNumber || undefined,
            assetTag: unit.assetTag || undefined,
            batchNumber: unit.batchNumber || undefined,
            condition: unit.condition as "NEW" | "GOOD" | "FAIR" | "DAMAGED" | "REPAIR" | "SCRAP",
            receivedDate: unit.receivedDate || undefined,
            purchaseDate: unit.purchaseDate || undefined,
            warrantyExpiry: unit.warrantyExpiry || undefined,
            notes: unit.notes || undefined,
          }))
        : [],
      vendorName: receiptForm.vendorName || undefined,
      vendorReference: receiptForm.vendorReference || undefined,
      batchNumber: receiptForm.batchNumber || undefined,
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

  async function handleAssignUnit() {
    if (!selectedUnit?.id || !unitAssignForm.userId) return;
    await assignUnitMutation.mutateAsync({
      unitId: selectedUnit.id,
      userId: unitAssignForm.userId,
      notes: unitAssignForm.notes || undefined,
    });
  }

  async function handleUnassignUnit(unit: any) {
    await unassignUnitMutation.mutateAsync({
      unitId: unit.id,
    });
  }

  async function handleReclassifyUnit() {
    if (!selectedUnit?.id) return;
    await reclassifySerializedUnitMutation.mutateAsync({
      unitIds: [selectedUnit.id],
      toBucketType: unitReclassForm.toBucketType as "SALE_STOCK" | "TEMP_ASSET",
      notes: unitReclassForm.notes || undefined,
    });
  }

  function openAssignUnit(unit: any) {
    setSelectedUnit(unit);
    setUnitAssignForm({
      userId: unit.assignedToUser?.id ?? "",
      notes: unit.notes ?? "",
    });
    setShowAssignUnitModal(true);
  }

  function openReclassifyUnit(unit: any) {
    setSelectedUnit(unit);
    setUnitReclassForm({
      toBucketType: unit.bucketType === "SALE_STOCK" ? "TEMP_ASSET" : "SALE_STOCK",
      notes: unit.notes ?? "",
    });
    setShowReclassUnitModal(true);
  }

  function openDetailItem(item: any) {
    setSelectedItem(item);
    setShowItemDetailModal(true);
  }

  function openDetailWarehouse(warehouse: any) {
    setSelectedWarehouse(warehouse);
    setShowWarehouseDetailModal(true);
  }

  function openDetailBalance(balance: any) {
    setSelectedBalance(balance);
    setShowBalanceDetailModal(true);
  }

  function openEditItem(item: any) {
    setShowItemDetailModal(false);
    setSelectedItem(item);
    setItemForm({
      sku: item.sku ?? "",
      name: item.name ?? "",
      description: item.description ?? "",
      unitOfMeasure: item.unitOfMeasure ?? "PCS",
      category: item.category ?? "",
      brand: item.brand ?? "",
      model: item.model ?? "",
      manufacturerPartNumber: item.manufacturerPartNumber ?? "",
      barcode: item.barcode ?? "",
      technicalSpecs: item.technicalSpecs ?? "",
      trackingMode: item.trackingMode ?? "QUANTITY",
      usageType: item.usageType ?? "BOTH",
      isStockTracked: item.isStockTracked ?? true,
      minStock: String(item.minStock ?? 0),
      reorderPoint: String(item.reorderPoint ?? 0),
      standardCost: item.standardCost !== null && item.standardCost !== undefined ? String(item.standardCost) : "",
      inventoryCoaId: item.inventoryCoaId ?? "",
      temporaryAssetCoaId: item.temporaryAssetCoaId ?? "",
      cogsCoaId: item.cogsCoaId ?? "",
      isActive: item.isActive ?? true,
    });
    setShowEditItem(true);
  }

  function openEditWarehouse(warehouse: any) {
    setShowWarehouseDetailModal(false);
    setSelectedWarehouse(warehouse);
    setWarehouseForm({
      code: warehouse.code ?? "",
      name: warehouse.name ?? "",
      description: warehouse.description ?? "",
      isActive: warehouse.isActive ?? true,
    });
    setShowEditWarehouse(true);
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
            void fulfillmentSummaryQuery.refetch();
          },
        }}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Link
          href="/inventory/fulfillment"
          className="rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm transition hover:border-blue-300 hover:bg-blue-100"
        >
          <p className="text-sm font-semibold text-blue-900">Fulfillment Requests</p>
          <p className="mt-2 text-2xl font-bold text-blue-950">
            {(fulfillmentSummary?.requests?.reserved ?? 0) + (fulfillmentSummary?.requests?.partial ?? 0)}
          </p>
          <p className="mt-2 text-sm text-blue-800">
            Reserved + partial requests yang perlu dipantau delivery-nya.
          </p>
        </Link>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <p className="text-sm font-semibold text-emerald-900">Reservasi Aktif</p>
          <p className="mt-2 text-2xl font-bold text-emerald-950">
            {(fulfillmentSummary?.reservations?.active ?? 0) + (fulfillmentSummary?.reservations?.partial ?? 0)}
          </p>
          <p className="mt-2 text-sm text-emerald-800">
            Total reservation stock aktif yang sedang menahan ketersediaan item.
          </p>
        </div>
        <Link
          href="/crm/products-services"
          className="rounded-xl border border-violet-200 bg-violet-50 p-5 shadow-sm transition hover:border-violet-300 hover:bg-violet-100"
        >
          <p className="text-sm font-semibold text-violet-900">CRM Product Mapping</p>
          <p className="mt-2 text-2xl font-bold text-violet-950">Sinkron</p>
          <p className="mt-2 text-sm text-violet-800">
            Kelola product/service CRM yang terhubung ke inventory item.
          </p>
        </Link>
      </div>

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
          <SectionBanner
            title="Master Item Inventory"
            description="Kelola SKU, tracking mode, usage type, dan relasi CRM dari satu tempat. Cocok untuk item quantity maupun serialized."
          />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <input
                value={itemSearch}
                onChange={(event) => setItemSearch(event.target.value)}
                placeholder="Cari item berdasarkan SKU, nama, atau kategori"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <select
                value={itemStatusFilter}
                onChange={(event) => setItemStatusFilter(event.target.value as "ALL" | "ACTIVE" | "INACTIVE")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">Semua Status</option>
                <option value="ACTIVE">Hanya Active</option>
                <option value="INACTIVE">Hanya Inactive</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">SKU</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Nama</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Kategori</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Tracking</th>
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
                    <td colSpan={9} className="px-4 py-6 text-center text-sm text-gray-500">
                      Memuat item inventory...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-sm text-gray-500">
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
                            <p className="text-xs text-gray-500">
                              {[item.brand, item.model].filter(Boolean).join(" · ") || "Tanpa brand/model"}
                            </p>
                            {item.description ? (
                              <p className="text-xs text-gray-500">{item.description}</p>
                            ) : null}
                            <p className="mt-1 text-xs text-gray-500">
                              {item.trackingMode} · {item.usageType} · COA Stock: {item.inventoryCoa?.code ?? "-"} · COA Asset: {item.temporaryAssetCoa?.code ?? "-"}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{item.category ?? "-"}</td>
                        <td className="px-4 py-3 text-gray-600">{item.trackingMode} / {item.usageType}</td>
                        <td className="px-4 py-3 text-gray-600">{item.unitOfMeasure}</td>
                        <td className="px-4 py-3 text-gray-600">{totalOnHand}</td>
                        <td className="px-4 py-3 text-gray-600">{linkedProducts} produk</td>
                        <td className="px-4 py-3">
                          <StatusPill label={item.isActive ? "Active" : "Inactive"} tone={item.isActive ? "green" : "gray"} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="secondary" onClick={() => openDetailItem(item)}>
                              Detail
                            </Button>
                            {canUpdateInventory ? (
                              <Button size="sm" variant="secondary" onClick={() => openEditItem(item)}>
                                Edit
                              </Button>
                            ) : null}
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

      {activeTab === "warehouses" ? (
        <section className="space-y-4">
          <SectionBanner
            title="Gudang & Lokasi Stok"
            description="Pantau lokasi penyimpanan, total balance row, dan kesiapan gudang untuk transaksi receipt, reservasi, dan issue."
          />
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
                  <div className="mt-4 flex justify-end gap-2">
                    <Button size="sm" variant="secondary" onClick={() => openDetailWarehouse(warehouse)}>
                      Detail
                    </Button>
                    {canUpdateInventory ? (
                      <Button size="sm" variant="secondary" onClick={() => openEditWarehouse(warehouse)}>
                        Edit
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      {activeTab === "stock" ? (
        <section className="space-y-4">
          <SectionBanner
            title="Stock Overview"
            description="Ringkasan stok per item, gudang, bucket, serialized unit, dan batch pembelian/vendor. Tetap 1 item master, tetapi bisa punya banyak serial dan banyak batch receipt."
          />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MiniMetric label="Balance Rows" value={stockSummary.totalRows.toString()} />
            <MiniMetric label="Serialized Rows" value={stockSummary.serializedRows.toString()} />
            <MiniMetric label="Tracked Batches" value={stockSummary.totalBatches.toString()} />
            <MiniMetric label="Available Qty" value={stockSummary.totalAvailable.toLocaleString()} />
          </div>

          <FormSection title="Filter Stock Overview" description="Gunakan filter untuk fokus ke gudang tertentu, bucket tertentu, atau hanya item low stock.">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Gudang">
                <select
                  value={stockWarehouseFilter}
                  onChange={(event) => setStockWarehouseFilter(event.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">Semua Gudang</option>
                  {warehouses.map((warehouse: any) => (
                    <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Bucket">
                <select
                  value={stockBucketFilter}
                  onChange={(event) => setStockBucketFilter(event.target.value as StockBucketFilter)}
                  className={SELECT_CLASS}
                >
                  <option value="ALL">Semua Bucket</option>
                  <option value="SALE_STOCK">Sale Stock</option>
                  <option value="TEMP_ASSET">Temporary Asset</option>
                </select>
              </Field>
              <Field label="Quick Flag">
                <label className="flex h-[54px] items-center gap-3 rounded-xl border-2 border-slate-200 bg-slate-50 px-4 text-sm text-slate-700 shadow-sm transition hover:border-slate-300">
                  <input
                    type="checkbox"
                    checked={stockLowOnly}
                    onChange={(event) => setStockLowOnly(event.target.checked)}
                  />
                  Hanya tampilkan low stock
                </label>
              </Field>
            </div>
          </FormSection>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Item</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Gudang</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Klasifikasi</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Metode Tracking</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">On Hand</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Reserved</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Available</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Serialized View</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Batch / Vendor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Threshold / COA</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {stockOverviewQuery.isLoading ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-6 text-center text-sm text-gray-500">
                      Memuat saldo stok...
                    </td>
                  </tr>
                ) : filteredBalances.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-6 text-center text-sm text-gray-500">
                      Belum ada saldo stok yang sesuai filter.
                    </td>
                  </tr>
                ) : (
                  filteredBalances.map((balance: any) => {
                    const onHand = Number(balance.qtyOnHand ?? 0);
                    const reserved = Number(balance.qtyReserved ?? 0);
                    const available = onHand - reserved;
                    const reorderPoint = Number(balance.item.reorderPoint ?? 0);
                    const isLow = onHand <= reorderPoint;
                    const serializedSummary = balance.serializedSummary;
                    const batchSummary = balance.batchSummary;
                    const canReclassify =
                      canCreateInventory &&
                      balance.bucketType === "TEMP_ASSET" &&
                      available > 0;

                    return (
                      <tr key={balance.id}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{balance.item.name}</p>
                          <p className="text-xs text-gray-500">{balance.item.sku} · {balance.item.unitOfMeasure}</p>
                          <p className="text-xs text-gray-400">{[balance.item.brand, balance.item.model].filter(Boolean).join(" · ") || "Tanpa brand/model"}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{balance.warehouse.name}</td>
                        <td className="px-4 py-3">
                          <StatusPill
                            label={balance.bucketType === "TEMP_ASSET" ? "Temporary Asset" : "Sale Stock"}
                            tone={balance.bucketType === "TEMP_ASSET" ? "gray" : "green"}
                          />
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          <div className="space-y-1">
                            <StatusPill label={balance.item.trackingMode} tone={balance.item.trackingMode === "QUANTITY" ? "gray" : "green"} />
                            <p className="text-xs text-gray-500">{balance.item.usageType}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">{onHand}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{reserved}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{available}</td>
                        <td className="px-4 py-3">
                          {serializedSummary ? (
                            <div className="space-y-2 text-xs text-gray-600">
                              <p className="font-medium text-gray-900">1 item master, banyak serial unit</p>
                              <div className="flex flex-wrap gap-2">
                                <InlineStat label="Total" value={serializedSummary.totalUnits} />
                                <InlineStat label="IN_STOCK" value={serializedSummary.inStockUnits} />
                                <InlineStat label="RESERVED" value={serializedSummary.reservedUnits} />
                                <InlineStat label="ASSIGNED" value={serializedSummary.assignedUnits} />
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">Item ini tidak memakai serial per unit</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-2 text-xs text-gray-600">
                            <p className="font-medium text-gray-900">{batchSummary?.totalBatches ?? 0} batch aktif tercatat</p>
                            <div className="flex flex-wrap gap-2">
                              <InlineStat label="Vendor terakhir" value={batchSummary?.latestVendorName ?? "-"} />
                              <InlineStat label="Cost terakhir" value={batchSummary?.latestUnitCost ? formatCurrency(Number(batchSummary.latestUnitCost)) : "-"} />
                            </div>
                          </div>
                        </td>
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
                              onClick={() => openDetailBalance(balance)}
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
              <Field label="Brand" helper="Merek barang, misalnya Dell, Mikrotik, Epson.">
                <input
                  value={itemForm.brand}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, brand: e.target.value }))}
                  placeholder="Contoh: Dell"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Model" helper="Model produk dari vendor / pabrikan.">
                <input
                  value={itemForm.model}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, model: e.target.value }))}
                  placeholder="Contoh: Latitude 5440"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Manufacturer Part Number" helper="Kode part dari pabrikan, bila ada.">
                <input
                  value={itemForm.manufacturerPartNumber}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, manufacturerPartNumber: e.target.value }))}
                  placeholder="Contoh: LAT-5440-I7"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Barcode" helper="Barcode internal atau barcode vendor.">
                <input
                  value={itemForm.barcode}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, barcode: e.target.value }))}
                  placeholder="Contoh: 8991234567890"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Metode Tracking Stok" helper="QUANTITY = stok dihitung total. SERIAL = 1 qty mewakili 1 unit fisik dengan serial berbeda. BOTH = item punya total qty dan unit serial sekaligus.">
                <select
                  value={itemForm.trackingMode}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, trackingMode: e.target.value }))}
                  className={SELECT_CLASS}
                >
                  <option value="QUANTITY">QUANTITY</option>
                  <option value="SERIAL">SERIAL</option>
                  <option value="BOTH">BOTH</option>
                </select>
              </Field>
              <Field label="Usage Type" helper="Tentukan apakah item dipakai untuk penjualan, operasional, atau keduanya.">
                <select
                  value={itemForm.usageType}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, usageType: e.target.value }))}
                  className={SELECT_CLASS}
                >
                  <option value="SALE">SALE</option>
                  <option value="OPERATIONAL">OPERATIONAL</option>
                  <option value="BOTH">BOTH</option>
                </select>
              </Field>
              <Field label="Deskripsi" className="md:col-span-2" helper="Tambahkan spesifikasi singkat atau catatan item.">
                <textarea
                  value={itemForm.description}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Contoh: Router untuk kebutuhan cabang, support dual WAN."
                  className={TEXTAREA_CLASS}
                />
              </Field>
              <Field label="Technical Specs" className="md:col-span-2" helper="Spesifikasi teknis detail yang akan berguna untuk item serialized / asset.">
                <textarea
                  value={itemForm.technicalSpecs}
                  onChange={(e) => setItemForm((prev) => ({ ...prev, technicalSpecs: e.target.value }))}
                  placeholder="Contoh: CPU i7, RAM 16GB, SSD 512GB, warna hitam."
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
              <Field label="Item Inventory" required helper="Pilih item master / SKU. Satu item master bisa memiliki banyak serial number saat tracking mode-nya SERIAL atau BOTH.">
                <select
                  value={receiptForm.itemId}
                  onChange={(e) => {
                    const nextItemId = e.target.value;
                    const nextItem = items.find((item: any) => item.id === nextItemId);
                    const isSerialized = nextItem?.trackingMode === "SERIAL" || nextItem?.trackingMode === "BOTH";
                    setReceiptForm((prev) => ({
                      ...prev,
                      itemId: nextItemId,
                      saleQuantity: isSerialized ? prev.saleQuantity || "1" : prev.saleQuantity,
                      serializedUnits: isSerialized
                        ? prev.serializedUnits.length > 0
                          ? prev.serializedUnits
                          : [createDefaultSerializedUnit("SALE_STOCK")]
                        : [],
                    }));
                  }}
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
            {selectedReceiptItem ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                Item ini memakai tracking <span className="font-semibold text-slate-900">{selectedReceiptItem.trackingMode}</span> dan usage type <span className="font-semibold text-slate-900">{selectedReceiptItem.usageType}</span>.
                {isSerializedReceiptItem ? (
                  <span className="mt-1 block text-amber-700">
                    Karena item ini serialized, 1 qty = 1 unit fisik. Jadi jika total receipt 10, kamu harus mengisi 10 unit dengan serial number atau asset tag yang berbeda.
                  </span>
                ) : null}
              </div>
            ) : null}
          </FormSection>

          <FormSection title="Alokasi Quantity" description="Pisahkan barang masuk ke stok jual dan aset sementara sesuai kebutuhan operasional. Untuk item serialized, total qty di sini harus sama dengan jumlah unit serial yang diinput di bawah.">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Qty Sale Stock" required helper={isSerializedReceiptItem ? "Untuk item SERIAL, jumlah ini mengikuti banyaknya serial Sale Stock. Bisa tetap disesuaikan manual jika ingin menyiapkan baris unit terlebih dahulu." : "Jumlah unit yang langsung masuk ke persediaan untuk dijual."}>
                <input
                  type="number"
                  min="0"
                  step={isSerializedReceiptItem ? "1" : "0.01"}
                  value={receiptForm.saleQuantity}
                  onChange={(e) => isSerializedReceiptItem ? updateSerializedBucketCount("SALE_STOCK", Number(e.target.value || 0)) : setReceiptForm((prev) => ({ ...prev, saleQuantity: e.target.value }))}
                  placeholder="5"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Qty Temporary Asset" required helper={isSerializedReceiptItem ? "Untuk item SERIAL, jumlah ini mengikuti banyaknya serial Temporary Asset. Bisa tetap disesuaikan manual jika ingin menyiapkan baris unit terlebih dahulu." : "Jumlah unit yang sementara diperlakukan sebagai aset, namun masih bisa dijual nanti."}>
                <input
                  type="number"
                  min="0"
                  step={isSerializedReceiptItem ? "1" : "0.01"}
                  value={receiptForm.temporaryAssetQuantity}
                  onChange={(e) => isSerializedReceiptItem ? updateSerializedBucketCount("TEMP_ASSET", Number(e.target.value || 0)) : setReceiptForm((prev) => ({ ...prev, temporaryAssetQuantity: e.target.value }))}
                  placeholder="5"
                  className={INPUT_CLASS}
                />
              </Field>
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              Total receipt: <span className="font-semibold text-slate-900">{(Number(receiptForm.saleQuantity || 0) + Number(receiptForm.temporaryAssetQuantity || 0)).toLocaleString()}</span>
              <span className="ml-2 text-slate-500">unit</span>
              {isSerializedReceiptItem ? (
                <p className="mt-2 text-xs text-slate-500">
                  Untuk item serialized, total unit receipt ini harus sama dengan jumlah baris Serialized Units.
                </p>
              ) : null}
            </div>
          </FormSection>

          {isSerializedReceiptItem ? (
            <FormSection title="Serialized Units" description="Masukkan unit fisik satu per satu. 1 baris = 1 unit = 1 serial/asset instance. Jadi satu item master bisa punya banyak serial number berbeda.">
              <div className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">Bulk input serial · Sale Stock</p>
                    <p className="mt-1 text-xs text-slate-500">1 baris = 1 serial. Jumlah baris otomatis menjadi Qty Sale Stock.</p>
                    <textarea
                      value={receiptForm.serializedUnits
                        .filter((unit) => unit.bucketType === "SALE_STOCK")
                        .map((unit) => unit.serialNumber)
                        .filter(Boolean)
                        .join("\n")}
                      onChange={(e) => applyBulkSerials("SALE_STOCK", e.target.value)}
                      placeholder={"SN-SALE-001\nSN-SALE-002\nSN-SALE-003"}
                      className={`${TEXTAREA_CLASS} mt-3 min-h-[160px]`}
                    />
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      <span>Qty Sale Stock otomatis mengikuti jumlah serial di atas.</span>
                      <span>
                        {receiptForm.serializedUnits.filter((unit) => unit.bucketType === "SALE_STOCK").filter((unit) => unit.serialNumber || unit.assetTag).length}/
                        {receiptForm.serializedUnits.filter((unit) => unit.bucketType === "SALE_STOCK").length} unit terisi
                      </span>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">Bulk input serial · Temporary Asset</p>
                    <p className="mt-1 text-xs text-slate-500">1 baris = 1 serial. Jumlah baris otomatis menjadi Qty Temporary Asset.</p>
                    <textarea
                      value={receiptForm.serializedUnits
                        .filter((unit) => unit.bucketType === "TEMP_ASSET")
                        .map((unit) => unit.serialNumber)
                        .filter(Boolean)
                        .join("\n")}
                      onChange={(e) => applyBulkSerials("TEMP_ASSET", e.target.value)}
                      placeholder={"SN-AST-001\nSN-AST-002"}
                      className={`${TEXTAREA_CLASS} mt-3 min-h-[160px]`}
                    />
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      <span>Qty Temporary Asset otomatis mengikuti jumlah serial di atas.</span>
                      <span>
                        {receiptForm.serializedUnits.filter((unit) => unit.bucketType === "TEMP_ASSET").filter((unit) => unit.serialNumber || unit.assetTag).length}/
                        {receiptForm.serializedUnits.filter((unit) => unit.bucketType === "TEMP_ASSET").length} unit terisi
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                  Untuk item SERIAL, quantity sekarang mengikuti jumlah serial/unit yang kamu input. Jadi kalau kamu paste 10 serial di Sale Stock, Qty Sale Stock akan otomatis menjadi 10.
                </div>

                {receiptForm.serializedUnits.map((unit, index) => {
                  const isExpanded = expandedReceiptUnitIndexes.includes(index);
                  return (
                    <div key={`serialized-unit-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Unit #{index + 1}</p>
                          <p className="text-xs text-slate-500">Setiap kartu ini mewakili 1 unit fisik. Bucket mengikuti alokasi quantity sale stock dan temporary asset.</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${unit.bucketType === "SALE_STOCK" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"}`}>
                            {unit.bucketType}
                          </span>
                          <Button size="sm" variant="secondary" onClick={() => toggleReceiptUnitDetail(index)}>
                            {isExpanded ? "Sembunyikan Detail" : "Detail Unit"}
                          </Button>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <Field label="Serial Number" required helper="Untuk item serialized, tiap unit sebaiknya punya serial unik. Minimal isi serial number atau asset tag.">
                          <input
                            value={unit.serialNumber}
                            onChange={(e) => setReceiptForm((prev) => ({
                              ...prev,
                              serializedUnits: prev.serializedUnits.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, serialNumber: e.target.value } : entry,
                              ),
                            }))}
                            placeholder="Contoh: SN-2026-0001"
                            className={INPUT_CLASS}
                          />
                        </Field>
                        <Field label="Asset Tag" helper="Opsional. Bisa dipakai untuk aset operasional internal.">
                          <input
                            value={unit.assetTag}
                            onChange={(e) => setReceiptForm((prev) => ({
                              ...prev,
                              serializedUnits: prev.serializedUnits.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, assetTag: e.target.value } : entry,
                              ),
                            }))}
                            placeholder="Contoh: AST-LTP-0001"
                            className={INPUT_CLASS}
                          />
                        </Field>
                      </div>

                      {!isExpanded ? null : (
                        <div className="mt-4 grid gap-4 md:grid-cols-2 border-t border-slate-100 pt-4">
                          <Field label="Batch Number" helper="Opsional untuk pelacakan batch / lot.">
                            <input
                              value={unit.batchNumber}
                              onChange={(e) => setReceiptForm((prev) => ({
                                ...prev,
                                serializedUnits: prev.serializedUnits.map((entry, entryIndex) =>
                                  entryIndex === index ? { ...entry, batchNumber: e.target.value } : entry,
                                ),
                              }))}
                              placeholder="Contoh: BATCH-01"
                              className={INPUT_CLASS}
                            />
                          </Field>
                          <Field label="Condition">
                            <select
                              value={unit.condition}
                              onChange={(e) => setReceiptForm((prev) => ({
                                ...prev,
                                serializedUnits: prev.serializedUnits.map((entry, entryIndex) =>
                                  entryIndex === index ? { ...entry, condition: e.target.value } : entry,
                                ),
                              }))}
                              className={SELECT_CLASS}
                            >
                              <option value="NEW">NEW</option>
                              <option value="GOOD">GOOD</option>
                              <option value="FAIR">FAIR</option>
                              <option value="DAMAGED">DAMAGED</option>
                              <option value="REPAIR">REPAIR</option>
                              <option value="SCRAP">SCRAP</option>
                            </select>
                          </Field>
                          <Field label="Received Date">
                            <input
                              type="date"
                              value={unit.receivedDate}
                              onChange={(e) => setReceiptForm((prev) => ({
                                ...prev,
                                serializedUnits: prev.serializedUnits.map((entry, entryIndex) =>
                                  entryIndex === index ? { ...entry, receivedDate: e.target.value } : entry,
                                ),
                              }))}
                              className={INPUT_CLASS}
                            />
                          </Field>
                          <Field label="Purchase Date">
                            <input
                              type="date"
                              value={unit.purchaseDate}
                              onChange={(e) => setReceiptForm((prev) => ({
                                ...prev,
                                serializedUnits: prev.serializedUnits.map((entry, entryIndex) =>
                                  entryIndex === index ? { ...entry, purchaseDate: e.target.value } : entry,
                                ),
                              }))}
                              className={INPUT_CLASS}
                            />
                          </Field>
                          <Field label="Warranty Expiry">
                            <input
                              type="date"
                              value={unit.warrantyExpiry}
                              onChange={(e) => setReceiptForm((prev) => ({
                                ...prev,
                                serializedUnits: prev.serializedUnits.map((entry, entryIndex) =>
                                  entryIndex === index ? { ...entry, warrantyExpiry: e.target.value } : entry,
                                ),
                              }))}
                              className={INPUT_CLASS}
                            />
                          </Field>
                          <Field label="Notes" className="md:col-span-2">
                            <textarea
                              value={unit.notes}
                              onChange={(e) => setReceiptForm((prev) => ({
                                ...prev,
                                serializedUnits: prev.serializedUnits.map((entry, entryIndex) =>
                                  entryIndex === index ? { ...entry, notes: e.target.value } : entry,
                                ),
                              }))}
                              placeholder="Catatan khusus unit ini"
                              className={TEXTAREA_CLASS}
                            />
                          </Field>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </FormSection>
          ) : null}

          <FormSection title="Batch Pembelian & Nilai" description="Gunakan section ini untuk membedakan stok item yang sama tetapi berasal dari vendor atau harga pembelian berbeda. Sistem akan membuat layer batch receipt terpisah.">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Vendor / Supplier" helper="Contoh: Vendor A, PT Maju Jaya, Distributor Resmi.">
                <input
                  value={receiptForm.vendorName}
                  onChange={(e) => setReceiptForm((prev) => ({ ...prev, vendorName: e.target.value }))}
                  placeholder="Contoh: Vendor A"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Vendor Reference" helper="Nomor invoice, PO vendor, atau dokumen pembelian dari supplier.">
                <input
                  value={receiptForm.vendorReference}
                  onChange={(e) => setReceiptForm((prev) => ({ ...prev, vendorReference: e.target.value }))}
                  placeholder="Contoh: INV-VEND-A-001"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Batch Number" helper="Batch/lot penerimaan stok. Jika item yang sama dibeli dari vendor atau harga berbeda, gunakan batch berbeda.">
                <input
                  value={receiptForm.batchNumber}
                  onChange={(e) => setReceiptForm((prev) => ({ ...prev, batchNumber: e.target.value }))}
                  placeholder="Contoh: BATCH-2026-03-A"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Unit Cost" helper="Opsional. Akan membantu pembentukan cost standar item dan cost layer batch.">
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
                <p className="font-semibold text-slate-900">Relasi COA otomatis + layer batch</p>
                <p className="mt-1">
                  Qty <span className="font-medium">Sale Stock</span> akan mengikuti COA persediaan item, sedangkan qty <span className="font-medium">Temporary Asset</span> akan mengikuti COA aset sementara item.
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Jika item yang sama dibeli dari vendor berbeda atau harga berbeda, buat receipt terpisah dengan vendor/batch/unit cost berbeda agar stok tersimpan sebagai batch yang berbeda.
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
              <Field label="Catatan" className="md:col-span-2" helper="Tambahkan supplier, batch, harga khusus, atau keterangan penerimaan.">
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

      <Modal isOpen={showEditItem} onClose={() => setShowEditItem(false)} title="Edit Item Inventory" size="lg">
        <div className="space-y-5">
          <FormSection title="Informasi Utama" description="Perbarui identitas, aturan stok, dan relasi COA item inventory.">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="SKU" helper="SKU tidak dapat diubah dari form edit ini.">
                <input value={itemForm.sku} disabled className={`${INPUT_CLASS} opacity-70`} />
              </Field>
              <Field label="Nama Item" required>
                <input value={itemForm.name} onChange={(e) => setItemForm((prev) => ({ ...prev, name: e.target.value }))} className={INPUT_CLASS} />
              </Field>
              <Field label="Unit" required>
                <input value={itemForm.unitOfMeasure} onChange={(e) => setItemForm((prev) => ({ ...prev, unitOfMeasure: e.target.value }))} className={INPUT_CLASS} />
              </Field>
              <Field label="Kategori">
                <input value={itemForm.category} onChange={(e) => setItemForm((prev) => ({ ...prev, category: e.target.value }))} className={INPUT_CLASS} />
              </Field>
              <Field label="Brand">
                <input value={itemForm.brand} onChange={(e) => setItemForm((prev) => ({ ...prev, brand: e.target.value }))} className={INPUT_CLASS} />
              </Field>
              <Field label="Model">
                <input value={itemForm.model} onChange={(e) => setItemForm((prev) => ({ ...prev, model: e.target.value }))} className={INPUT_CLASS} />
              </Field>
              <Field label="Manufacturer Part Number">
                <input value={itemForm.manufacturerPartNumber} onChange={(e) => setItemForm((prev) => ({ ...prev, manufacturerPartNumber: e.target.value }))} className={INPUT_CLASS} />
              </Field>
              <Field label="Barcode">
                <input value={itemForm.barcode} onChange={(e) => setItemForm((prev) => ({ ...prev, barcode: e.target.value }))} className={INPUT_CLASS} />
              </Field>
              <Field label="Metode Tracking Stok">
                <select value={itemForm.trackingMode} onChange={(e) => setItemForm((prev) => ({ ...prev, trackingMode: e.target.value }))} className={SELECT_CLASS}>
                  <option value="QUANTITY">QUANTITY</option>
                  <option value="SERIAL">SERIAL</option>
                  <option value="BOTH">BOTH</option>
                </select>
              </Field>
              <Field label="Usage Type">
                <select value={itemForm.usageType} onChange={(e) => setItemForm((prev) => ({ ...prev, usageType: e.target.value }))} className={SELECT_CLASS}>
                  <option value="SALE">SALE</option>
                  <option value="OPERATIONAL">OPERATIONAL</option>
                  <option value="BOTH">BOTH</option>
                </select>
              </Field>
              <Field label="Deskripsi" className="md:col-span-2">
                <textarea value={itemForm.description} onChange={(e) => setItemForm((prev) => ({ ...prev, description: e.target.value }))} className={TEXTAREA_CLASS} />
              </Field>
              <Field label="Technical Specs" className="md:col-span-2">
                <textarea value={itemForm.technicalSpecs} onChange={(e) => setItemForm((prev) => ({ ...prev, technicalSpecs: e.target.value }))} className={TEXTAREA_CLASS} />
              </Field>
              <Field label="Minimum Stock">
                <input type="number" min="0" value={itemForm.minStock} onChange={(e) => setItemForm((prev) => ({ ...prev, minStock: e.target.value }))} className={INPUT_CLASS} />
              </Field>
              <Field label="Reorder Point">
                <input type="number" min="0" value={itemForm.reorderPoint} onChange={(e) => setItemForm((prev) => ({ ...prev, reorderPoint: e.target.value }))} className={INPUT_CLASS} />
              </Field>
              <Field label="Standard Cost">
                <input type="number" min="0" step="0.01" value={itemForm.standardCost} onChange={(e) => setItemForm((prev) => ({ ...prev, standardCost: e.target.value }))} className={INPUT_CLASS} />
              </Field>
              <Field label="COA Persediaan Jual">
                <select value={itemForm.inventoryCoaId} onChange={(e) => setItemForm((prev) => ({ ...prev, inventoryCoaId: e.target.value }))} className={SELECT_CLASS}>
                  <option value="">Pilih COA persediaan</option>
                  {coaOptions.map((account: any) => (
                    <option key={account.id} value={account.id}>{account.code} · {account.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="COA Aset Sementara">
                <select value={itemForm.temporaryAssetCoaId} onChange={(e) => setItemForm((prev) => ({ ...prev, temporaryAssetCoaId: e.target.value }))} className={SELECT_CLASS}>
                  <option value="">Pilih COA aset sementara</option>
                  {coaOptions.map((account: any) => (
                    <option key={account.id} value={account.id}>{account.code} · {account.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="COA COGS">
                <select value={itemForm.cogsCoaId} onChange={(e) => setItemForm((prev) => ({ ...prev, cogsCoaId: e.target.value }))} className={SELECT_CLASS}>
                  <option value="">Pilih COA COGS</option>
                  {coaOptions.map((account: any) => (
                    <option key={account.id} value={account.id}>{account.code} · {account.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <CheckboxCard title="Track stock" description="Tetap catat saldo, reservasi, receipt, dan issue." checked={itemForm.isStockTracked} onChange={(checked) => setItemForm((prev) => ({ ...prev, isStockTracked: checked }))} />
              <CheckboxCard title="Item aktif" description="Nonaktifkan jika item tidak dipakai untuk transaksi baru." checked={itemForm.isActive} onChange={(checked) => setItemForm((prev) => ({ ...prev, isActive: checked }))} />
            </div>
            {!itemForm.isActive ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Item akan dinonaktifkan untuk transaksi baru. Sistem akan menolak penyimpanan jika item ini masih memiliki reservasi aktif/parsial atau masih dipakai oleh fulfillment request aktif.
              </div>
            ) : null}
          </FormSection>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4">
          <Button variant="secondary" onClick={() => setShowEditItem(false)}>Batal</Button>
          <Button onClick={() => void handleUpdateItem()} isLoading={updateItemMutation.isPending}>Simpan Perubahan</Button>
        </div>
      </Modal>

      <Modal isOpen={showEditWarehouse} onClose={() => setShowEditWarehouse(false)} title="Edit Gudang" size="lg">
        <div className="space-y-5">
          <FormSection title="Informasi Gudang" description="Perbarui nama, deskripsi, dan status gudang.">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Kode Gudang" helper="Kode gudang tidak dapat diubah dari form edit ini.">
                <input value={warehouseForm.code} disabled className={`${INPUT_CLASS} opacity-70`} />
              </Field>
              <Field label="Nama Gudang" required>
                <input value={warehouseForm.name} onChange={(e) => setWarehouseForm((prev) => ({ ...prev, name: e.target.value }))} className={INPUT_CLASS} />
              </Field>
              <Field label="Deskripsi" className="md:col-span-2">
                <textarea value={warehouseForm.description} onChange={(e) => setWarehouseForm((prev) => ({ ...prev, description: e.target.value }))} className={TEXTAREA_CLASS} />
              </Field>
            </div>
            <div className="mt-4">
              <CheckboxCard title="Gudang aktif" description="Jika nonaktif, gudang tidak dipakai untuk transaksi baru." checked={warehouseForm.isActive} onChange={(checked) => setWarehouseForm((prev) => ({ ...prev, isActive: checked }))} />
            </div>
            {!warehouseForm.isActive ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Gudang akan dinonaktifkan untuk transaksi baru. Sistem akan menolak penyimpanan jika gudang ini masih memiliki reservasi aktif/parsial atau masih dipakai oleh fulfillment request aktif.
              </div>
            ) : null}
          </FormSection>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4">
          <Button variant="secondary" onClick={() => setShowEditWarehouse(false)}>Batal</Button>
          <Button onClick={() => void handleUpdateWarehouse()} isLoading={updateWarehouseMutation.isPending}>Simpan Perubahan</Button>
        </div>
      </Modal>

      <Modal isOpen={showItemDetailModal && selectedItem !== null} onClose={() => setShowItemDetailModal(false)} title="Detail Item Inventory" size="xl">
        {selectedItem ? (
          itemDetailQuery.isLoading ? (
            <div className="py-8 text-sm text-gray-500">Memuat detail item, ledger stok, dan posting jurnal...</div>
          ) : itemDetail ? (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <MiniMetric label="SKU" value={itemDetail.sku} />
                <MiniMetric label="Unit" value={itemDetail.unitOfMeasure} />
                <MiniMetric label="CRM Linked" value={`${itemDetail.crmProducts?.length ?? 0} produk`} />
                <MiniMetric label="Serialized Unit" value={`${itemDetail.units?.length ?? 0}`} />
                <MiniMetric label="Status" value={itemDetail.isActive ? "Active" : "Inactive"} />
              </div>
              {canUpdateInventory ? (
                <div className="flex justify-end">
                  <Button variant="secondary" onClick={() => openEditItem(itemDetail)}>
                    Edit Item
                  </Button>
                </div>
              ) : null}

              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex flex-wrap gap-2">
                  {([
                    ["overview", "Overview"],
                    ["units", "Serialized Units"],
                    ["crm", "CRM Linkage"],
                    ["reservations", "Reservations"],
                    ["balances", "Saldo"],
                    ["ledger", "Ledger"],
                    ["journals", "Jurnal"],
                  ] as Array<[ItemDetailTab, string]>).map(([tabId, label]) => (
                    <button
                      key={tabId}
                      type="button"
                      onClick={() => setItemDetailTab(tabId)}
                      className={`rounded-xl px-4 py-2 text-sm font-medium transition ${itemDetailTab === tabId
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {itemDetailTab === "overview" ? (
                <FormSection title="Informasi Item" description="Ringkasan master data item inventory.">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <DetailRow label="Nama Item" value={itemDetail.name} />
                    <DetailRow label="Kategori" value={itemDetail.category ?? "-"} />
                    <DetailRow label="Brand" value={itemDetail.brand ?? "-"} />
                    <DetailRow label="Model" value={itemDetail.model ?? "-"} />
                    <DetailRow label="Manufacturer Part Number" value={itemDetail.manufacturerPartNumber ?? "-"} />
                    <DetailRow label="Barcode" value={itemDetail.barcode ?? "-"} />
                    <DetailRow label="Tracking Mode" value={itemDetail.trackingMode ?? "-"} />
                    <DetailRow label="Usage Type" value={itemDetail.usageType ?? "-"} />
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
                  <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">Technical Specs</p>
                    <p className="mt-1 whitespace-pre-wrap">{itemDetail.technicalSpecs ?? "Belum ada spesifikasi teknis."}</p>
                  </div>
                  <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">Ringkasan Batch Receipt</p>
                    {(itemDetail.receiptBatches ?? []).length === 0 ? (
                      <p className="mt-1">Belum ada batch receipt tercatat untuk item ini.</p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {itemDetail.receiptBatches.map((batch: any) => (
                          <div key={batch.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-sm font-medium text-slate-900">
                              {batch.batchNumber ?? "Tanpa batch number"} · {batch.bucketType}
                            </p>
                            <p className="text-xs text-slate-600">
                              Vendor: {batch.vendorName ?? "-"} · Ref: {batch.vendorReference ?? "-"} · Qty: {Number(batch.receivedQty ?? 0)} · Sisa: {Number(batch.remainingQty ?? 0)} · Cost: {batch.unitCost ? formatCurrency(Number(batch.unitCost)) : "-"}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">Ringkasan Serial Number</p>
                    {(itemDetail.units ?? []).length === 0 ? (
                      <p className="mt-1">Belum ada serial number / asset instance tercatat.</p>
                    ) : (
                      <>
                        <p className="mt-1 text-slate-600">
                          Item ini memiliki <span className="font-semibold text-slate-900">{itemDetail.units.length}</span> unit serial / asset instance.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {itemDetail.units.slice(0, 12).map((unit: any) => (
                            <button
                              key={unit.id}
                              type="button"
                              onClick={() => void copyToClipboard(unit.serialNumber ?? unit.assetTag ?? unit.id, "serial number")}
                              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 transition hover:bg-slate-100"
                            >
                              {unit.serialNumber ?? unit.assetTag ?? unit.id}
                            </button>
                          ))}
                          {itemDetail.units.length > 12 ? (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
                              +{itemDetail.units.length - 12} lainnya
                            </span>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>
                </FormSection>
              ) : null}

              {itemDetailTab === "units" ? (
                <FormSection title="Serialized Units" description="Fondasi serial/asset instance untuk item yang tracking mode-nya SERIAL atau BOTH.">
                  <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
                    <input
                      value={itemDetailSerialSearch}
                      onChange={(e) => setItemDetailSerialSearch(e.target.value)}
                      placeholder="Cari serial number, asset tag, status, atau user assignment"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {(itemDetail.units ?? []).length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                      Belum ada unit serial / asset instance tercatat untuk item ini.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                      <table className="min-w-full divide-y divide-slate-200 text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Serial</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Asset Tag</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Warehouse</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Bucket</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Condition</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Batch</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Assigned To</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {filteredItemDetailUnits.map((unit: any) => (
                            <tr key={unit.id}>
                              <td className="px-4 py-3 text-gray-700">
                                <div className="flex items-center gap-2">
                                  <span>{unit.serialNumber ?? "-"}</span>
                                  {unit.serialNumber ? (
                                    <Button size="sm" variant="secondary" onClick={() => void copyToClipboard(unit.serialNumber, "serial number")}>
                                      Copy
                                    </Button>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-gray-700">
                                <div className="flex items-center gap-2">
                                  <span>{unit.assetTag ?? "-"}</span>
                                  {unit.assetTag ? (
                                    <Button size="sm" variant="secondary" onClick={() => void copyToClipboard(unit.assetTag, "asset tag")}>
                                      Copy
                                    </Button>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-gray-600">{unit.warehouse ? `${unit.warehouse.code} · ${unit.warehouse.name}` : "-"}</td>
                              <td className="px-4 py-3 text-gray-600">{unit.bucketType}</td>
                              <td className="px-4 py-3 text-gray-600">{unit.status}</td>
                              <td className="px-4 py-3 text-gray-600">{unit.condition}</td>
                              <td className="px-4 py-3 text-gray-600">{unit.receiptBatch ? `${unit.receiptBatch.batchNumber ?? "-"} · ${unit.receiptBatch.vendorName ?? "-"}` : unit.batchNumber ?? "-"}</td>
                              <td className="px-4 py-3 text-gray-600">{unit.assignedToUser ? `${unit.assignedToUser.name ?? "Tanpa nama"} · ${unit.assignedToUser.email ?? "-"}` : "-"}</td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex flex-wrap justify-end gap-2">
                                  {canUpdateInventory && (unit.status === "IN_STOCK" || unit.status === "ASSIGNED") ? (
                                    <Button variant="secondary" onClick={() => openAssignUnit(unit)}>
                                      {unit.assignedToUser ? "Ubah Assign" : "Assign"}
                                    </Button>
                                  ) : null}
                                  {canUpdateInventory && unit.status === "ASSIGNED" ? (
                                    <Button variant="secondary" onClick={() => void handleUnassignUnit(unit)} isLoading={unassignUnitMutation.isPending}>
                                      Unassign
                                    </Button>
                                  ) : null}
                                  {canUpdateInventory && unit.status === "IN_STOCK" ? (
                                    <Button variant="secondary" onClick={() => openReclassifyUnit(unit)}>
                                      Reclass Bucket
                                    </Button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </FormSection>
              ) : null}

              {itemDetailTab === "crm" ? (
                <FormSection title="CRM Linkage" description="Daftar product/service CRM yang memakai item inventory ini sebagai referensi fulfillment.">
                  {(itemDetail.crmProducts ?? []).length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                      Item ini belum terhubung ke product/service CRM.
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {itemDetail.crmProducts.map((product: any) => (
                        <div key={product.id} className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-900">{product.name}</p>
                              <p className="text-sm text-slate-500">{product.code}</p>
                            </div>
                            <StatusPill label={product.isActive ? "Active" : "Inactive"} tone={product.isActive ? "green" : "gray"} />
                          </div>
                          <p className="mt-2 text-sm text-slate-600">Tipe: {product.type}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </FormSection>
              ) : null}

              {itemDetailTab === "reservations" ? (
                <FormSection title="Active Reservations" description="Reservasi aktif dari fulfillment request yang sedang menahan stok item ini.">
                  {(itemDetail.reservations ?? []).length === 0 ? (
                    <p className="text-sm text-gray-500">Tidak ada reservasi aktif untuk item ini.</p>
                  ) : (
                    <div className="space-y-3">
                      {itemDetail.reservations.map((reservation: any) => (
                        <div key={reservation.id} className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-900">
                                {reservation.leadLine?.lead?.company ?? reservation.sourceType}
                              </p>
                              <p className="text-sm text-slate-500">
                                {reservation.warehouse?.code ?? "-"} · {reservation.sourceType} · {reservation.sourceId}
                              </p>
                            </div>
                            <StatusPill
                              label={reservation.status}
                              tone={reservation.status === "ACTIVE" ? "green" : "amber"}
                            />
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-3">
                            <MiniMetric label="Reserved" value={Number(reservation.qtyReserved ?? 0).toString()} />
                            <MiniMetric label="Fulfilled" value={Number(reservation.qtyFulfilled ?? 0).toString()} />
                            <MiniMetric label="Released" value={Number(reservation.qtyReleased ?? 0).toString()} />
                          </div>
                          {reservation.leadLine?.lead?.id ? (
                            <div className="mt-3">
                              <Link
                                href={`/crm/leads/${reservation.leadLine.lead.id}`}
                                className="text-sm font-medium text-blue-600 hover:text-blue-700"
                              >
                                Buka lead terkait
                              </Link>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </FormSection>
              ) : null}

              {itemDetailTab === "balances" ? (
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
              ) : null}

              {itemDetailTab === "ledger" ? (
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
              ) : null}

              {itemDetailTab === "journals" ? (
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
              ) : null}
            </div>
          ) : null
        ) : null}
      </Modal>

      <Modal isOpen={showWarehouseDetailModal && selectedWarehouse !== null} onClose={() => setShowWarehouseDetailModal(false)} title="Detail Gudang" size="lg">
        {selectedWarehouse ? (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <MiniMetric label="Kode" value={selectedWarehouse.code} />
              <MiniMetric label="Status" value={selectedWarehouse.isActive ? "Active" : "Inactive"} />
              <MiniMetric label="Total Balance Row" value={`${selectedWarehouse.balances?.length ?? 0}`} />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {([
                  ["overview", "Overview"],
                  ["balances", `Saldo (${selectedWarehouse.balances?.length ?? 0})`],
                ] as Array<[WarehouseDetailTab, string]>).map(([tabId, label]) => (
                  <button
                    key={tabId}
                    type="button"
                    onClick={() => setWarehouseDetailTab(tabId)}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${warehouseDetailTab === tabId
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {warehouseDetailTab === "overview" ? (
              <FormSection title="Informasi Gudang" description="Ringkasan data gudang dan posisi stok di dalamnya.">
                <div className="grid gap-4 md:grid-cols-2">
                  <DetailRow label="Nama Gudang" value={selectedWarehouse.name} />
                  <DetailRow label="Deskripsi" value={selectedWarehouse.description ?? "Tanpa deskripsi"} />
                </div>
                {canUpdateInventory ? (
                  <div className="mt-4 flex justify-end">
                    <Button variant="secondary" onClick={() => openEditWarehouse(selectedWarehouse)}>
                      Edit Gudang
                    </Button>
                  </div>
                ) : null}
              </FormSection>
            ) : null}

            {warehouseDetailTab === "balances" ? (
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
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal isOpen={showBalanceDetailModal && selectedBalance !== null} onClose={() => setShowBalanceDetailModal(false)} title="Detail Saldo Stok" size="lg">
        {selectedBalance ? (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MiniMetric label="Item" value={selectedBalance.item?.sku ?? "-"} />
              <MiniMetric label="Gudang" value={selectedBalance.warehouse?.code ?? "-"} />
              <MiniMetric label="Bucket" value={selectedBalance.bucketType === "TEMP_ASSET" ? "Temporary Asset" : "Sale Stock"} />
              <MiniMetric label="Status" value={Number(selectedBalance.qtyOnHand ?? 0) <= Number(selectedBalance.item?.reorderPoint ?? 0) ? "Low Stock" : "Normal"} />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {([
                  ["overview", "Overview"],
                  ["units", `Serialized Units (${selectedBalance.serializedUnits?.length ?? 0})`],
                ] as Array<[BalanceDetailTab, string]>).map(([tabId, label]) => (
                  <button
                    key={tabId}
                    type="button"
                    onClick={() => setBalanceDetailTab(tabId)}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${balanceDetailTab === tabId
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {balanceDetailTab === "overview" ? (
              <FormSection title="Ringkasan Saldo" description="Posisi stok saat ini untuk kombinasi item, gudang, dan bucket yang dipilih.">
                <div className="grid gap-4 md:grid-cols-2">
                  <DetailRow label="Nama Item" value={selectedBalance.item?.name ?? "-"} />
                  <DetailRow label="Unit" value={selectedBalance.item?.unitOfMeasure ?? "-"} />
                  <DetailRow label="Metode Tracking Stok" value={selectedBalance.item?.trackingMode ?? "-"} />
                  <DetailRow label="Usage Type" value={selectedBalance.item?.usageType ?? "-"} />
                  <DetailRow label="Gudang" value={selectedBalance.warehouse?.name ?? "-"} />
                  <DetailRow label="Reorder Point" value={Number(selectedBalance.item?.reorderPoint ?? 0).toString()} />
                  <DetailRow label="COA" value={selectedBalance.bucketType === "TEMP_ASSET" ? (selectedBalance.item?.temporaryAssetCoa ? `${selectedBalance.item.temporaryAssetCoa.code} · ${selectedBalance.item.temporaryAssetCoa.name}` : "Belum dipilih") : (selectedBalance.item?.inventoryCoa ? `${selectedBalance.item.inventoryCoa.code} · ${selectedBalance.item.inventoryCoa.name}` : "Belum dipilih")} />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <MiniMetric label="On Hand" value={Number(selectedBalance.qtyOnHand ?? 0).toString()} />
                  <MiniMetric label="Reserved" value={Number(selectedBalance.qtyReserved ?? 0).toString()} />
                  <MiniMetric label="Available" value={(Number(selectedBalance.qtyOnHand ?? 0) - Number(selectedBalance.qtyReserved ?? 0)).toString()} />
                </div>
                {selectedBalance.serializedSummary ? (
                  <>
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <MiniMetric label="Serialized Units" value={String(selectedBalance.serializedSummary.totalUnits ?? 0)} />
                      <MiniMetric label="IN_STOCK" value={String(selectedBalance.serializedSummary.inStockUnits ?? 0)} />
                      <MiniMetric label="RESERVED" value={String(selectedBalance.serializedSummary.reservedUnits ?? 0)} />
                      <MiniMetric label="ASSIGNED" value={String(selectedBalance.serializedSummary.assignedUnits ?? 0)} />
                    </div>
                    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                      <p className="font-semibold text-slate-900">Preview Serial Number</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(selectedBalance.serializedUnits ?? []).slice(0, 12).map((unit: any) => (
                          <button
                            key={unit.id}
                            type="button"
                            onClick={() => void copyToClipboard(unit.serialNumber ?? unit.assetTag ?? unit.id, "serial number")}
                            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 transition hover:bg-slate-100"
                          >
                            {unit.serialNumber ?? unit.assetTag ?? unit.id}
                          </button>
                        ))}
                        {(selectedBalance.serializedUnits?.length ?? 0) > 12 ? (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
                            +{(selectedBalance.serializedUnits?.length ?? 0) - 12} lainnya
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                      <p className="font-semibold text-slate-900">Breakdown Batch / Vendor</p>
                      {(selectedBalance.receiptBatches ?? []).length === 0 ? (
                        <p className="mt-1">Belum ada data batch untuk saldo ini.</p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {selectedBalance.receiptBatches.map((batch: any) => (
                            <div key={batch.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                              <p className="text-sm font-medium text-slate-900">
                                {batch.batchNumber ?? "Tanpa batch"} · {batch.vendorName ?? "Tanpa vendor"}
                              </p>
                              <p className="text-xs text-slate-600">
                                Qty masuk: {Number(batch.receivedQty ?? 0)} · Qty sisa: {Number(batch.remainingQty ?? 0)} · Unit cost: {batch.unitCost ? formatCurrency(Number(batch.unitCost)) : "-"}
                              </p>
                              <p className="text-xs text-slate-500">
                                Ref: {batch.vendorReference ?? batch.referenceId ?? "-"}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : null}
              </FormSection>
            ) : null}

            {balanceDetailTab === "units" ? (
              selectedBalance.serializedSummary ? (
                <FormSection title="Serialized Unit Detail" description="Daftar unit fisik untuk item, gudang, dan bucket ini. Jadi satu item master / SKU bisa memiliki banyak serial number berbeda tanpa memecah item master menjadi banyak item.">
                  <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
                    <input
                      value={balanceDetailSerialSearch}
                      onChange={(e) => setBalanceDetailSerialSearch(e.target.value)}
                      placeholder="Cari serial number, asset tag, status, atau assigned user"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {(selectedBalance.serializedUnits ?? []).length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                      Belum ada serialized unit pada kombinasi saldo ini.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                      <table className="min-w-full divide-y divide-slate-200 text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Serial</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Asset Tag</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Condition</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Assigned To</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {filteredBalanceDetailUnits.map((unit: any) => (
                            <tr key={unit.id}>
                              <td className="px-4 py-3 text-slate-700">
                                <div className="flex items-center gap-2">
                                  <span>{unit.serialNumber ?? "-"}</span>
                                  {unit.serialNumber ? (
                                    <Button size="sm" variant="secondary" onClick={() => void copyToClipboard(unit.serialNumber, "serial number")}>
                                      Copy
                                    </Button>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-700">
                                <div className="flex items-center gap-2">
                                  <span>{unit.assetTag ?? "-"}</span>
                                  {unit.assetTag ? (
                                    <Button size="sm" variant="secondary" onClick={() => void copyToClipboard(unit.assetTag, "asset tag")}>
                                      Copy
                                    </Button>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-600">{unit.status}</td>
                              <td className="px-4 py-3 text-slate-600">{unit.condition}</td>
                              <td className="px-4 py-3 text-slate-600">{unit.assignedToUser ? `${unit.assignedToUser.name ?? "Tanpa nama"} · ${unit.assignedToUser.email ?? "-"}` : "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </FormSection>
              ) : (
                <FormSection title="Serialized Unit Detail" description="Tab ini hanya terpakai untuk balance yang memakai tracking serial.">
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                    Balance ini tidak memiliki serialized unit karena item memakai tracking quantity-only.
                  </div>
                </FormSection>
              )
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal isOpen={showAssignUnitModal} onClose={() => setShowAssignUnitModal(false)} title="Assign Serialized Unit" size="lg">
        <div className="space-y-5">
          <FormSection title="Unit" description="Assign unit operasional ke user internal.">
            <div className="grid gap-4 md:grid-cols-2">
              <DetailRow label="Serial" value={selectedUnit?.serialNumber ?? "-"} />
              <DetailRow label="Asset Tag" value={selectedUnit?.assetTag ?? "-"} />
              <DetailRow label="Bucket" value={selectedUnit?.bucketType ?? "-"} />
              <DetailRow label="Status" value={selectedUnit?.status ?? "-"} />
            </div>
          </FormSection>
          <FormSection title="Assignment" description="Pilih user penerima unit.">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="User" required>
                <select value={unitAssignForm.userId} onChange={(e) => setUnitAssignForm((prev) => ({ ...prev, userId: e.target.value }))} className={SELECT_CLASS}>
                  <option value="">Pilih user</option>
                  {assignableUsers.map((user: any) => (
                    <option key={user.id} value={user.id}>{user.name ?? user.email ?? user.employeeId ?? user.id}</option>
                  ))}
                </select>
              </Field>
              <Field label="Catatan" className="md:col-span-2">
                <textarea value={unitAssignForm.notes} onChange={(e) => setUnitAssignForm((prev) => ({ ...prev, notes: e.target.value }))} className={TEXTAREA_CLASS} />
              </Field>
            </div>
          </FormSection>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4">
          <Button variant="secondary" onClick={() => setShowAssignUnitModal(false)}>Batal</Button>
          <Button onClick={() => void handleAssignUnit()} isLoading={assignUnitMutation.isPending}>Simpan Assignment</Button>
        </div>
      </Modal>

      <Modal isOpen={showReclassUnitModal} onClose={() => setShowReclassUnitModal(false)} title="Reclass Serialized Unit Bucket" size="lg">
        <div className="space-y-5">
          <FormSection title="Unit" description="Pindahkan bucket untuk serialized unit individual.">
            <div className="grid gap-4 md:grid-cols-2">
              <DetailRow label="Serial" value={selectedUnit?.serialNumber ?? "-"} />
              <DetailRow label="Asset Tag" value={selectedUnit?.assetTag ?? "-"} />
              <DetailRow label="Bucket Saat Ini" value={selectedUnit?.bucketType ?? "-"} />
              <DetailRow label="Warehouse" value={selectedUnit?.warehouse ? `${selectedUnit.warehouse.code} · ${selectedUnit.warehouse.name}` : "-"} />
            </div>
          </FormSection>
          <FormSection title="Tujuan Bucket" description="Sistem akan update unit, balance, dan ledger transfer.">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Bucket Tujuan" required>
                <select value={unitReclassForm.toBucketType} onChange={(e) => setUnitReclassForm((prev) => ({ ...prev, toBucketType: e.target.value }))} className={SELECT_CLASS}>
                  <option value="SALE_STOCK">SALE_STOCK</option>
                  <option value="TEMP_ASSET">TEMP_ASSET</option>
                </select>
              </Field>
              <Field label="Catatan" className="md:col-span-2">
                <textarea value={unitReclassForm.notes} onChange={(e) => setUnitReclassForm((prev) => ({ ...prev, notes: e.target.value }))} className={TEXTAREA_CLASS} />
              </Field>
            </div>
          </FormSection>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4">
          <Button variant="secondary" onClick={() => setShowReclassUnitModal(false)}>Batal</Button>
          <Button onClick={() => void handleReclassifyUnit()} isLoading={reclassifySerializedUnitMutation.isPending}>Proses Reclass</Button>
        </div>
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

function SectionBanner({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-white to-slate-50 p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
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

function InlineStat({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
      <span className="font-medium">{label}:</span>
      <span className="ml-1">{value}</span>
    </span>
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
