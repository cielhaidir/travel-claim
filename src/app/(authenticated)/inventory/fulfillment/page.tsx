"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/features/PageHeader";
import { Button } from "@/components/ui/Button";
import { hasPermissionMap } from "@/lib/auth/permissions";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";
import { useToast } from "@/components/ui/Toast";

type FulfillmentStatus = "DRAFT" | "RESERVED" | "PARTIAL" | "READY" | "DELIVERED" | "CANCELED" | "";

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

  const requestsQuery = api.inventory.listFulfillmentRequests.useQuery(
    {
      status: status || undefined,
      search: search || undefined,
      limit: 100,
    },
    { enabled: canReadInventory, refetchOnWindowFocus: false },
  );

  const deliverMutation = api.inventory.deliverFulfillmentRequest.useMutation({
    onSuccess: async (result) => {
      showToast({
        title: "Berhasil",
        message: result?.cogsJournal?.journalNumber
          ? `Delivery confirmation berhasil diproses. Jurnal COGS: ${result.cogsJournal.journalNumber}`
          : "Delivery confirmation berhasil diproses.",
        variant: "success",
      });
      await requestsQuery.refetch();
    },
    onError: (error) => {
      showToast({ title: "Gagal", message: error.message, variant: "error" });
    },
  });

  const cancelMutation = api.inventory.cancelFulfillmentRequest.useMutation({
    onSuccess: async () => {
      showToast({ title: "Berhasil", message: "Reservation berhasil dilepas dan fulfillment dibatalkan.", variant: "success" });
      await requestsQuery.refetch();
    },
    onError: (error) => {
      showToast({ title: "Gagal", message: error.message, variant: "error" });
    },
  });

  const requests = useMemo<Array<any>>(
    () => (requestsQuery.data?.requests as Array<any> | undefined) ?? [],
    [requestsQuery.data],
  );

  if (!session || !canReadInventory) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fulfillment Requests"
        description="Daftar fulfillment request dari CRM lead, status reservasi, dan delivery confirmation stok."
        primaryAction={{ label: "Inventory Dashboard", href: "/inventory" }}
        secondaryAction={{ label: "Muat Ulang", onClick: () => void requestsQuery.refetch() }}
      />

      <div className="grid gap-4 md:grid-cols-2">
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

      <div className="space-y-4">
        {requestsQuery.isLoading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500 shadow-sm">
            Memuat fulfillment requests...
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500 shadow-sm">
            Belum ada fulfillment request yang sesuai filter.
          </div>
        ) : (
          requests.map((request: any) => {
            const canDeliver = request.status === "RESERVED" || request.status === "PARTIAL";
            const canCancel = request.status !== "DELIVERED" && request.status !== "CANCELED";
            const totalRequested = request.lines.reduce((sum: number, line: any) => sum + Number(line.qtyRequested ?? 0), 0);
            const totalReserved = request.lines.reduce((sum: number, line: any) => sum + Number(line.qtyReserved ?? 0), 0);
            const totalDelivered = request.lines.reduce((sum: number, line: any) => sum + Number(line.qtyDelivered ?? 0), 0);

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
                    <Button variant="secondary" onClick={() => router.push(`/crm/leads/${request.lead?.id ?? ""}`)}>
                      Buka Lead
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => void cancelMutation.mutateAsync({ fulfillmentRequestId: request.id })}
                      disabled={!canCancel || !canUpdateInventory}
                      isLoading={cancelMutation.isPending}
                    >
                      Cancel / Release
                    </Button>
                    <Button
                      onClick={() => void deliverMutation.mutateAsync({ fulfillmentRequestId: request.id })}
                      disabled={!canDeliver || !canUpdateInventory}
                      isLoading={deliverMutation.isPending}
                    >
                      Deliver / Issue Stock
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <MetricCard label="Requested" value={String(totalRequested)} />
                  <MetricCard label="Reserved" value={String(totalReserved)} />
                  <MetricCard label="Delivered" value={String(totalDelivered)} />
                </div>

                {request.cogsJournal ? (
                  <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-emerald-900">Jurnal COGS Otomatis</p>
                        <p className="mt-1 text-sm text-emerald-800">
                          {request.cogsJournal.journalNumber} · {request.cogsJournal.description}
                        </p>
                        <p className="mt-1 text-xs text-emerald-700">
                          Diposting pada {formatDate(request.cogsJournal.transactionDate)}
                        </p>
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => router.push(`/journal`)}>
                        Lihat Jurnal
                      </Button>
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
                          {(request.cogsJournal.lines ?? []).map((line: any) => (
                            <tr key={line.id}>
                              <td className="px-4 py-3 text-gray-700">#{line.lineNumber}</td>
                              <td className="px-4 py-3 text-gray-700">
                                {line.chartOfAccount?.code} · {line.chartOfAccount?.name}
                              </td>
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
                      {request.lines.map((line: any) => (
                        <tr key={line.id}>
                          <td className="px-4 py-3 text-gray-700">
                            <div>
                              <p>{line.inventoryItem.sku} · {line.inventoryItem.name}</p>
                              <p className="text-xs text-gray-500">Tracking: {line.inventoryItem.trackingMode ?? "QUANTITY"}</p>
                              {(line.reservedUnits ?? []).length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {line.reservedUnits.map((entry: any) => (
                                    <span key={entry.id} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                                      {entry.inventoryItemUnit.serialNumber ?? entry.inventoryItemUnit.assetTag ?? entry.inventoryItemUnit.id}
                                      <span className="ml-1 text-slate-500">({entry.inventoryItemUnit.status})</span>
                                    </span>
                                  ))}
                                </div>
                              ) : null}
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
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
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

  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${styles[status] ?? styles.DRAFT}`}>
      {status}
    </span>
  );
}
