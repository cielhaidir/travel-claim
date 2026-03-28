"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/features/PageHeader";
import { CrmEmptyHint } from "@/components/features/crm/shared";
import { Button } from "@/components/ui/Button";
import { hasPermissionMap } from "@/lib/auth/permissions";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";
import { useToast } from "@/components/ui/Toast";

type FulfillmentStatus = "DRAFT" | "RESERVED" | "PARTIAL" | "READY" | "DELIVERED" | "CANCELED" | "";

type FulfillmentRequestRecord = {
  id: string;
  requestNumber: string;
  status: string;
  requestedDate: string | Date;
  deliveredAt?: string | Date | null;
  notes?: string | null;
  lead?: { id: string; company: string } | null;
  customer?: { company: string } | null;
  cogsJournal?: {
    journalNumber: string;
    description?: string | null;
    transactionDate: string | Date;
    lines?: Array<{
      id: string;
      lineNumber: number;
      description?: string | null;
      debitAmount?: number | string | null;
      creditAmount?: number | string | null;
      chartOfAccount?: { code: string; name: string } | null;
    }>;
  } | null;
  lines: Array<{
    id: string;
    qtyRequested?: number | string;
    qtyReserved?: number | string;
    qtyDelivered?: number | string;
    warehouse?: { name: string } | null;
    inventoryItem: { sku: string; name: string; trackingMode?: string | null };
  }>;
};

type WorkspaceData = {
  salesOrders: Array<{
    id: string;
    salesOrderNumber: string;
    status: string;
    orderDate: string | Date;
    plannedShipDate?: string | Date | null;
    customer: { company: string };
    deliveryOrders: Array<{ id: string; deliveryOrderNumber: string; status: string; shipDate: string | Date }>;
    lines: Array<{ qtyOrdered?: number | string; qtyDelivered?: number | string; inventoryItem?: { sku: string; name: string; unitOfMeasure?: string | null } | null }>;
  }>;
  deliveryOrders: Array<{
    id: string;
    deliveryOrderNumber: string;
    status: string;
    shipDate: string | Date;
    customer: { company: string };
    salesOrder: { salesOrderNumber: string; status: string; fulfillmentMode?: string | null } | null;
    warehouse?: { name: string } | null;
    lines: Array<{ qtyDelivered?: number | string; inventoryItem?: { sku: string; name: string } | null }>;
  }>;
  purchaseOrders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    orderDate: string | Date;
    expectedDate?: string | Date | null;
    vendor: { company: string };
    goodsReceipts: Array<{ id: string; receiptNumber: string; status: string; receiptDate: string | Date }>;
    lines: Array<{ qtyOrdered?: number | string; qtyReceived?: number | string; inventoryItem?: { sku: string; name: string; unitOfMeasure?: string | null } | null }>;
  }>;
  goodsReceipts: Array<{
    id: string;
    receiptNumber: string;
    status: string;
    receiptDate: string | Date;
    vendor: { company: string };
    purchaseOrder: { orderNumber: string; status: string; procurementMode?: string | null } | null;
    warehouse?: { name: string } | null;
    lines: Array<{ qtyReceived?: number | string; inventoryItem?: { sku: string; name: string } | null }>;
  }>;
};

export default function InventoryFulfillmentPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { showToast } = useToast();
  const [status, setStatus] = useState<FulfillmentStatus>("");
  const [search, setSearch] = useState("");

  const isRoot = session?.user?.isRoot ?? false;
  const permissions = session?.user?.permissions;
  const canReadInventory = isRoot || hasPermissionMap(permissions, "inventory", "read");
  const canUpdateInventory = isRoot || hasPermissionMap(permissions, "inventory", "update");

  useEffect(() => {
    if (session && !canReadInventory) {
      void router.replace("/dashboard");
    }
  }, [session, canReadInventory, router]);

  const workspaceQuery = api.inventory.fulfillmentWorkspace.useQuery(
    { limit: 8 },
    { enabled: canReadInventory, refetchOnWindowFocus: false },
  ) as unknown as { data?: WorkspaceData; isLoading: boolean; refetch: () => Promise<unknown> };

  const requestsQuery = api.inventory.listFulfillmentRequests.useQuery(
    {
      status: status || undefined,
      search: search || undefined,
      limit: 100,
    },
    { enabled: canReadInventory, refetchOnWindowFocus: false },
  ) as unknown as { data?: { requests: FulfillmentRequestRecord[] }; isLoading: boolean; refetch: () => Promise<unknown> };

  const deliverMutation = api.inventory.deliverFulfillmentRequest.useMutation({
    onSuccess: async (result) => {
      const payload = result as { cogsJournal?: { journalNumber?: string } | null } | undefined;
      showToast({
        title: "Berhasil",
        message: payload?.cogsJournal?.journalNumber
          ? `Delivery confirmation berhasil diproses. Jurnal COGS: ${payload.cogsJournal.journalNumber}`
          : "Delivery confirmation berhasil diproses.",
        variant: "success",
      });
      await Promise.all([requestsQuery.refetch(), workspaceQuery.refetch()]);
    },
    onError: (error) => {
      showToast({ title: "Gagal", message: error.message, variant: "error" });
    },
  });

  const cancelMutation = api.inventory.cancelFulfillmentRequest.useMutation({
    onSuccess: async () => {
      showToast({ title: "Berhasil", message: "Reservation berhasil dilepas dan fulfillment dibatalkan.", variant: "success" });
      await Promise.all([requestsQuery.refetch(), workspaceQuery.refetch()]);
    },
    onError: (error) => {
      showToast({ title: "Gagal", message: error.message, variant: "error" });
    },
  });

  const requests = useMemo<FulfillmentRequestRecord[]>(
    () => requestsQuery.data?.requests ?? [],
    [requestsQuery.data],
  );

  const workspace = workspaceQuery.data;
  const outboundReady = workspace?.salesOrders.filter((row) => ["CONFIRMED", "READY_TO_SHIP", "PARTIALLY_DELIVERED"].includes(row.status)) ?? [];
  const inboundReady = workspace?.purchaseOrders.filter((row) => ["ISSUED", "PARTIAL_RECEIPT"].includes(row.status)) ?? [];

  if (!session || !canReadInventory) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Fulfillment Workspace"
        description="Halaman fulfillment inventory sekarang disesuaikan dengan alur penjualan dan pembelian: outbound dari Sales Order / Delivery Order, serta inbound dari Purchase Order / Goods Receipt."
        primaryAction={{ label: "Inventory Dashboard", href: "/inventory" }}
        secondaryAction={{ label: "Muat Ulang", onClick: () => { void requestsQuery.refetch(); void workspaceQuery.refetch(); } }}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <WorkspaceCard label="Outbound SO Ready" value={String(outboundReady.length)} helper="Order penjualan yang perlu fulfillment" tone="blue" />
        <WorkspaceCard label="Recent Delivery" value={String(workspace?.deliveryOrders.length ?? 0)} helper="DO terbaru untuk monitor stok keluar" tone="emerald" />
        <WorkspaceCard label="Inbound PO Ready" value={String(inboundReady.length)} helper="PO yang perlu goods receipt" tone="amber" />
        <WorkspaceCard label="Recent Goods Receipt" value={String(workspace?.goodsReceipts.length ?? 0)} helper="Penerimaan barang terbaru" tone="violet" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Outbound Fulfillment dari Sales</h2>
                <p className="text-sm text-gray-500">Pantau Sales Order yang butuh delivery dan Delivery Order yang sudah menggerakkan stok keluar.</p>
              </div>
              <Link href="/penjualan/sales-order" className="text-sm font-semibold text-blue-600 hover:text-blue-700">Buka Sales Order</Link>
            </div>
          </div>
          <div className="space-y-4 p-5">
            {workspaceQuery.isLoading ? <div className="text-sm text-gray-500">Memuat data outbound...</div> : outboundReady.length === 0 ? <CrmEmptyHint text="Belum ada Sales Order yang perlu fulfillment saat ini." /> : outboundReady.map((row) => {
              const totalOrdered = row.lines.reduce((sum, line) => sum + Number(line.qtyOrdered ?? 0), 0);
              const totalDelivered = row.lines.reduce((sum, line) => sum + Number(line.qtyDelivered ?? 0), 0);
              return <div key={row.id} className="rounded-xl border border-gray-200 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><p className="font-semibold text-gray-900">{row.salesOrderNumber}</p><p className="text-sm text-gray-500">{row.customer.company} · {formatDate(row.orderDate)} · Planned {row.plannedShipDate ? formatDate(row.plannedShipDate) : "-"}</p><p className="mt-1 text-xs text-gray-500">Status {row.status} · {row.deliveryOrders[0] ? `DO ${row.deliveryOrders[0].deliveryOrderNumber}` : "Belum ada DO"}</p></div><Link href="/penjualan/sales-order" className="text-sm font-semibold text-blue-600 hover:text-blue-700">Lihat modul sales</Link></div><div className="mt-3 grid gap-3 md:grid-cols-3"><MiniMetric label="Qty Ordered" value={String(totalOrdered)} /><MiniMetric label="Qty Delivered" value={String(totalDelivered)} /><MiniMetric label="Line Item" value={String(row.lines.length)} /></div></div>;
            })}

            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-sm font-semibold text-blue-900">Recent Delivery Orders</p>
              <div className="mt-3 space-y-3">
                {(workspace?.deliveryOrders ?? []).slice(0, 4).map((row) => (
                  <div key={row.id} className="rounded-lg border border-blue-100 bg-white p-3">
                    <p className="font-medium text-gray-900">{row.deliveryOrderNumber}</p>
                    <p className="text-xs text-gray-500">{row.customer.company} · {row.salesOrder?.salesOrderNumber ?? "-"} · {row.warehouse?.name ?? "-"}</p>
                    <p className="mt-1 text-xs text-blue-700">{row.status} · Ship {formatDate(row.shipDate)} · {row.lines.reduce((sum, line) => sum + Number(line.qtyDelivered ?? 0), 0)} unit delivered</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Inbound Fulfillment dari Pembelian</h2>
                <p className="text-sm text-gray-500">Pantau Purchase Order yang perlu goods receipt dan Goods Receipt yang sudah menambah stok masuk.</p>
              </div>
              <Link href="/pembelian/purchase-order" className="text-sm font-semibold text-blue-600 hover:text-blue-700">Buka Purchase Order</Link>
            </div>
          </div>
          <div className="space-y-4 p-5">
            {workspaceQuery.isLoading ? <div className="text-sm text-gray-500">Memuat data inbound...</div> : inboundReady.length === 0 ? <CrmEmptyHint text="Belum ada Purchase Order yang perlu goods receipt saat ini." /> : inboundReady.map((row) => {
              const totalOrdered = row.lines.reduce((sum, line) => sum + Number(line.qtyOrdered ?? 0), 0);
              const totalReceived = row.lines.reduce((sum, line) => sum + Number(line.qtyReceived ?? 0), 0);
              return <div key={row.id} className="rounded-xl border border-gray-200 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><p className="font-semibold text-gray-900">{row.orderNumber}</p><p className="text-sm text-gray-500">{row.vendor.company} · {formatDate(row.orderDate)} · Expected {row.expectedDate ? formatDate(row.expectedDate) : "-"}</p><p className="mt-1 text-xs text-gray-500">Status {row.status} · {row.goodsReceipts[0] ? `GR ${row.goodsReceipts[0].receiptNumber}` : "Belum ada GR"}</p></div><Link href="/pembelian/purchase-order" className="text-sm font-semibold text-blue-600 hover:text-blue-700">Lihat modul pembelian</Link></div><div className="mt-3 grid gap-3 md:grid-cols-3"><MiniMetric label="Qty Ordered" value={String(totalOrdered)} /><MiniMetric label="Qty Received" value={String(totalReceived)} /><MiniMetric label="Line Item" value={String(row.lines.length)} /></div></div>;
            })}

            <div className="rounded-xl border border-violet-100 bg-violet-50 p-4">
              <p className="text-sm font-semibold text-violet-900">Recent Goods Receipts</p>
              <div className="mt-3 space-y-3">
                {(workspace?.goodsReceipts ?? []).slice(0, 4).map((row) => (
                  <div key={row.id} className="rounded-lg border border-violet-100 bg-white p-3">
                    <p className="font-medium text-gray-900">{row.receiptNumber}</p>
                    <p className="text-xs text-gray-500">{row.vendor.company} · {row.purchaseOrder?.orderNumber ?? "-"} · {row.warehouse?.name ?? "-"}</p>
                    <p className="mt-1 text-xs text-violet-700">{row.status} · Receipt {formatDate(row.receiptDate)} · {row.lines.reduce((sum, line) => sum + Number(line.qtyReceived ?? 0), 0)} unit received</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">CRM Fulfillment Requests</h2>
            <p className="text-sm text-gray-500">Tetap tersedia untuk kebutuhan reservasi stok berbasis lead / customer di CRM.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari request number, lead, atau customer"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as FulfillmentStatus)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Semua Status</option>
              <option value="DRAFT">DRAFT</option>
              <option value="RESERVED">RESERVED</option>
              <option value="PARTIAL">PARTIAL</option>
              <option value="READY">READY</option>
              <option value="DELIVERED">DELIVERED</option>
              <option value="CANCELED">CANCELED</option>
            </select>
          </div>
        </div>

        <div className="space-y-4">
          {requestsQuery.isLoading ? (
            <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500 shadow-sm">Memuat fulfillment requests...</div>
          ) : requests.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500 shadow-sm">Belum ada fulfillment request yang sesuai filter.</div>
          ) : (
            requests.map((request) => {
              const canDeliver = request.status === "RESERVED" || request.status === "PARTIAL";
              const canCancel = request.status !== "DELIVERED" && request.status !== "CANCELED";
              const totalRequested = request.lines.reduce((sum, line) => sum + Number(line.qtyRequested ?? 0), 0);
              const totalReserved = request.lines.reduce((sum, line) => sum + Number(line.qtyReserved ?? 0), 0);
              const totalDelivered = request.lines.reduce((sum, line) => sum + Number(line.qtyDelivered ?? 0), 0);

              return (
                <div key={request.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-lg font-semibold text-gray-900">{request.requestNumber}</h2>
                        <StatusPill status={request.status} />
                      </div>
                      <p className="mt-1 text-sm text-gray-500">Lead: {request.lead?.company ?? "-"} · Customer: {request.customer?.company ?? "-"}</p>
                      <p className="mt-1 text-xs text-gray-400">Requested {formatDate(request.requestedDate)}{request.deliveredAt ? ` · Delivered ${formatDate(request.deliveredAt)}` : ""}</p>
                      {request.notes ? <p className="mt-2 text-sm text-gray-600">{request.notes}</p> : null}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button variant="secondary" onClick={() => router.push(`/crm/leads/${request.lead?.id ?? ""}`)}>Buka Lead</Button>
                      <Button variant="secondary" onClick={() => void cancelMutation.mutateAsync({ fulfillmentRequestId: request.id })} disabled={!canCancel || !canUpdateInventory} isLoading={cancelMutation.isPending}>Cancel / Release</Button>
                      <Button onClick={() => void deliverMutation.mutateAsync({ fulfillmentRequestId: request.id })} disabled={!canDeliver || !canUpdateInventory} isLoading={deliverMutation.isPending}>Deliver / Issue Stock</Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <MiniMetric label="Requested" value={String(totalRequested)} />
                    <MiniMetric label="Reserved" value={String(totalReserved)} />
                    <MiniMetric label="Delivered" value={String(totalDelivered)} />
                  </div>

                  {request.cogsJournal ? (
                    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-emerald-900">Jurnal COGS Otomatis</p>
                          <p className="mt-1 text-sm text-emerald-800">{request.cogsJournal.journalNumber} · {request.cogsJournal.description}</p>
                          <p className="mt-1 text-xs text-emerald-700">Diposting pada {formatDate(request.cogsJournal.transactionDate)}</p>
                        </div>
                        <Button variant="secondary" size="sm" onClick={() => router.push(`/journal`)}>Lihat Jurnal</Button>
                      </div>

                      <div className="mt-4 overflow-x-auto rounded-lg border border-emerald-200 bg-white">
                        <table className="min-w-full divide-y divide-emerald-100 text-sm">
                          <thead className="bg-emerald-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-emerald-700">Line</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-emerald-700">COA</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-emerald-700">Deskripsi</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-emerald-700">Debit</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-emerald-700">Credit</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-emerald-100 bg-white">
                            {(request.cogsJournal.lines ?? []).map((line) => (
                              <tr key={line.id}>
                                <td className="px-4 py-3 text-gray-700">#{line.lineNumber}</td>
                                <td className="px-4 py-3 text-gray-700">{line.chartOfAccount?.code} · {line.chartOfAccount?.name}</td>
                                <td className="px-4 py-3 text-gray-600">{line.description ?? "-"}</td>
                                <td className="px-4 py-3 text-right font-medium text-emerald-700">{formatCurrency(Number(line.debitAmount ?? 0))}</td>
                                <td className="px-4 py-3 text-right font-medium text-red-600">{formatCurrency(Number(line.creditAmount ?? 0))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Item</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Warehouse</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Requested</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Reserved</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Delivered</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {request.lines.map((line) => (
                          <tr key={line.id}>
                            <td className="px-4 py-3 text-gray-700">
                              <div>
                                <p>{line.inventoryItem.sku} · {line.inventoryItem.name}</p>
                                <p className="text-xs text-gray-500">Tracking: {line.inventoryItem.trackingMode ?? "QUANTITY"}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-600">{line.warehouse?.name ?? "-"}</td>
                            <td className="px-4 py-3 text-right text-gray-700">{Number(line.qtyRequested ?? 0)}</td>
                            <td className="px-4 py-3 text-right text-gray-700">{Number(line.qtyReserved ?? 0)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-gray-900">{Number(line.qtyDelivered ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

function WorkspaceCard({ label, value, helper, tone }: { label: string; value: string; helper: string; tone: "blue" | "emerald" | "amber" | "violet" }) {
  const styles = {
    blue: "border-blue-200 bg-blue-50 text-blue-950",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    violet: "border-violet-200 bg-violet-50 text-violet-950",
  } as const;

  return (
    <div className={`rounded-xl border p-5 shadow-sm ${styles[tone]}`}>
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      <p className="mt-2 text-sm opacity-80">{helper}</p>
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

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700",
    RESERVED: "bg-blue-100 text-blue-700",
    PARTIAL: "bg-amber-100 text-amber-700",
    READY: "bg-indigo-100 text-indigo-700",
    DELIVERED: "bg-green-100 text-green-700",
    CANCELED: "bg-red-100 text-red-700",
  };

  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${styles[status] ?? styles.DRAFT}`}>{status}</span>;
}
