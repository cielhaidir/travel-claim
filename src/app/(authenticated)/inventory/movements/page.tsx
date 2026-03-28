"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/features/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { CrmEmptyHint, crmInputClassName, CrmMetricCard } from "@/components/features/crm/shared";
import { userHasPermission } from "@/lib/auth/role-check";
import { formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";

type StockMovementRecord = {
  id: string;
  movementDate: string | Date;
  movementType: string;
  bucketType: string;
  referenceType?: string | null;
  referenceId?: string | null;
  quantityBefore: number | string;
  quantityChange: number | string;
  quantityAfter: number | string;
  unitCost?: number | string | null;
  totalCost?: number | string | null;
  notes?: string | null;
  item: {
    id: string;
    sku: string;
    name: string;
    unitOfMeasure: string;
    usageType: string;
    trackingMode: string;
  };
  warehouse: { id: string; code: string; name: string };
  createdBy?: { id: string; name?: string | null; email?: string | null } | null;
};

type MovementQueryData = {
  movements: StockMovementRecord[];
  summary: {
    totalIn: number;
    totalOut: number;
    saleStockRows: number;
    tempAssetRows: number;
  };
};

const toLabel = (value?: string | null) => value ? value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "-";
const toBadge = (movementType?: string | null): "default" | "success" | "warning" | "danger" | "info" => movementType === "RECEIPT" || movementType === "TRANSFER_IN" || movementType === "ADJUSTMENT_IN" ? "success" : movementType === "ISSUE" || movementType === "TRANSFER_OUT" || movementType === "ADJUSTMENT_OUT" ? "danger" : movementType === "RESERVATION" || movementType === "RELEASE" ? "warning" : "info";

function referenceLabel(row: StockMovementRecord) {
  if (!row.referenceType) return "Mutasi manual / sistem";
  if (row.referenceType === "DELIVERY_ORDER") return `Stok keluar dari Delivery Order ${row.referenceId ?? "-"}`;
  if (row.referenceType === "DELIVERY_ORDER_RETURNED") return `Stok kembali dari return Delivery Order ${row.referenceId ?? "-"}`;
  if (row.referenceType === "DELIVERY_ORDER_CANCELED") return `Stok kembali dari cancel Delivery Order ${row.referenceId ?? "-"}`;
  if (row.referenceType === "CrmFulfillmentRequest") return `Stok keluar dari Fulfillment Request ${row.referenceId ?? "-"}`;
  return `${toLabel(row.referenceType)} ${row.referenceId ?? ""}`.trim();
}

export default function InventoryMovementsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [search, setSearch] = useState("");
  const [bucketType, setBucketType] = useState("");
  const [movementType, setMovementType] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const isAllowed = session?.user ? userHasPermission(session.user, "inventory", "read") : false;

  const warehousesQuery = api.inventory.listWarehouses.useQuery(
    { search: undefined },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  ) as unknown as { data?: { warehouses?: Array<{ id: string; code: string; name: string }> } };

  const query = api.inventory.listStockMovements.useQuery(
    {
      search: search || undefined,
      warehouseId: warehouseId || undefined,
      bucketType: bucketType ? (bucketType as never) : undefined,
      movementType: movementType ? (movementType as never) : undefined,
      limit: 150,
    },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  ) as unknown as { data?: MovementQueryData; isLoading: boolean };

  const rows = useMemo(() => query.data?.movements ?? [], [query.data]);
  const summary = query.data?.summary;
  const warehouses = useMemo(() => warehousesQuery.data?.warehouses ?? [], [warehousesQuery.data]);

  if (sessionStatus === "loading") {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
        Memuat sesi dan data mutasi stok...
      </div>
    );
  }

  if (sessionStatus !== "authenticated" || !session?.user) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 shadow-sm">
        Sesi login tidak ditemukan. Silakan login ulang untuk mengakses mutasi stok.
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-900 shadow-sm">
        Anda tidak memiliki akses untuk melihat mutasi stok.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mutasi Stok"
        description="Pantau seluruh stok masuk dan keluar untuk sale stock maupun temporary asset, lengkap dengan sumber mutasinya, saldo awal, perubahan, dan saldo akhir."
        badge={<Badge variant="info">Inventory Ledger</Badge>}
        primaryAction={{ label: "Kembali ke Inventory", href: "/inventory" }}
        secondaryAction={{ label: "Fulfillment", href: "/inventory/fulfillment" }}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CrmMetricCard label="Total Mutasi Masuk" value={String(summary?.totalIn ?? 0)} helper="Akumulasi qty increase" />
        <CrmMetricCard label="Total Mutasi Keluar" value={String(summary?.totalOut ?? 0)} helper="Akumulasi qty issue" />
        <CrmMetricCard label="Baris Sale Stock" value={String(summary?.saleStockRows ?? 0)} helper="Mutasi stok penjualan" />
        <CrmMetricCard label="Baris Temporary Asset" value={String(summary?.tempAssetRows ?? 0)} helper="Mutasi stok aset" />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari item, reference, catatan, atau gudang"
            className={crmInputClassName}
          />
          <select value={bucketType} onChange={(e) => setBucketType(e.target.value)} className={crmInputClassName}>
            <option value="">Semua bucket</option>
            <option value="SALE_STOCK">Sale Stock</option>
            <option value="TEMP_ASSET">Temporary Asset</option>
          </select>
          <select value={movementType} onChange={(e) => setMovementType(e.target.value)} className={crmInputClassName}>
            <option value="">Semua movement</option>
            <option value="RECEIPT">Receipt</option>
            <option value="ISSUE">Issue</option>
            <option value="TRANSFER_IN">Transfer In</option>
            <option value="TRANSFER_OUT">Transfer Out</option>
            <option value="ADJUSTMENT_IN">Adjustment In</option>
            <option value="ADJUSTMENT_OUT">Adjustment Out</option>
            <option value="RESERVATION">Reservation</option>
            <option value="RELEASE">Release</option>
          </select>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={crmInputClassName}>
            <option value="">Semua gudang</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.code} · {warehouse.name}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Saran: gunakan halaman ini sebagai pusat audit stok. Untuk stok keluar, sumber mutasi seperti delivery order akan terlihat jelas agar operasional dan finance mudah rekonsiliasi.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Riwayat Mutasi Stok</h2>
          <p className="text-sm text-gray-500">{rows.length} baris mutasi ditampilkan</p>
        </div>

        {query.isLoading ? (
          <div className="p-5 text-sm text-gray-500">Memuat riwayat mutasi stok...</div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <CrmEmptyHint text="Belum ada mutasi stok yang sesuai filter." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Tanggal</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Item / Gudang</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Bucket / Movement</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Sumber Mutasi</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Saldo Awal</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Perubahan</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Saldo Akhir</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Operator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 text-gray-600">
                      <p>{formatDate(row.movementDate)}</p>
                      <p className="text-xs text-gray-500">{row.referenceId ?? row.id}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{row.item.sku} · {row.item.name}</p>
                      <p className="text-xs text-gray-500">{row.warehouse.code} · {row.warehouse.name} · {row.item.unitOfMeasure}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <Badge variant={row.bucketType === "SALE_STOCK" ? "info" : "warning"}>{toLabel(row.bucketType)}</Badge>
                        <Badge variant={toBadge(row.movementType)}>{toLabel(row.movementType)}</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <p>{referenceLabel(row)}</p>
                      <p className="text-xs text-gray-500">{row.notes ?? "-"}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{Number(row.quantityBefore ?? 0)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${Number(row.quantityChange ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {Number(row.quantityChange ?? 0) >= 0 ? "+" : ""}{Number(row.quantityChange ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900">{Number(row.quantityAfter ?? 0)}</td>
                    <td className="px-4 py-3 text-gray-600">{row.createdBy?.name ?? row.createdBy?.email ?? "System"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Saran Operasional</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-600">
          <li>Gunakan halaman ini sebagai sumber audit stok masuk/keluar lintas sale stock dan temporary asset.</li>
          <li>Untuk stok keluar penjualan, referensi delivery order akan membantu menelusuri asal mutasi stok.</li>
          <li>Kalau nanti dibutuhkan, halaman ini bisa ditambah export CSV/PDF dan filter berdasarkan reference type seperti DO, receipt, reclass, atau fulfillment.</li>
        </ul>
        <div className="mt-4">
          <Link href="/inventory" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
            Kembali ke workspace inventory
          </Link>
        </div>
      </div>
    </div>
  );
}
