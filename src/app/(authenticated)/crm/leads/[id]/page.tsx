"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/features/PageHeader";
import { EmptyState } from "@/components/features/EmptyState";
import { CRM_ROLES, hasAnyRole, normalizeRoles } from "@/lib/constants/roles";
import { formatCurrency, formatDate, formatRelativeTime } from "@/lib/utils/format";
import { api } from "@/trpc/react";
import { useToast } from "@/components/ui/Toast";

const STAGE_VARIANT: Record<string, "default" | "info" | "warning" | "success" | "danger"> = {
  NEW: "default",
  QUALIFIED: "info",
  PROPOSAL: "warning",
  NEGOTIATION: "warning",
  WON: "success",
  LOST: "danger",
};

const PRIORITY_VARIANT: Record<string, "default" | "warning" | "danger"> = {
  LOW: "default",
  MEDIUM: "warning",
  HIGH: "danger",
};

const SOURCE_LABELS: Record<string, string> = {
  REFERRAL: "Referral",
  WEBSITE: "Website",
  EVENT: "Event",
  OUTBOUND: "Outbound",
  PARTNER: "Partner",
};

const DEFAULT_LINE_FORM = {
  crmProductId: "",
  inventoryItemId: "",
  warehousePreferenceId: "",
  description: "",
  qty: "1",
  unitPrice: "0",
  requiresInventory: true,
};

export default function CrmLeadDetailPage() {
  const params = useParams();
  const { data: session } = useSession();
  const { showToast } = useToast();
  const rawId = params?.id;
  const id = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : undefined;
  const [showLineModal, setShowLineModal] = useState(false);
  const [lineForm, setLineForm] = useState(DEFAULT_LINE_FORM);

  const userRoles = normalizeRoles({
    roles: session?.user?.roles,
    role: session?.user?.role,
  });
  const isAllowed = session?.user?.isRoot === true || hasAnyRole(userRoles, CRM_ROLES);

  const { data, isLoading, refetch } = api.crm.getLeadById.useQuery(
    { id: id ?? "" },
    {
      enabled: !!id && isAllowed,
      refetchOnWindowFocus: false,
    },
  );

  const crmProductsQuery = api.crm.listProducts.useQuery(
    {},
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );
  const inventoryItemsQuery = api.inventory.listItems.useQuery(
    { limit: 100 },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );
  const warehousesQuery = api.inventory.listWarehouses.useQuery(
    {},
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );

  const addLeadLineMutation = api.crm.createLeadLine.useMutation({
    onSuccess: async () => {
      setShowLineModal(false);
      setLineForm(DEFAULT_LINE_FORM);
      showToast({ title: "Berhasil", message: "Line item lead berhasil ditambahkan.", variant: "success" });
      await refetch();
    },
    onError: (error) => {
      showToast({ title: "Gagal", message: error.message, variant: "error" });
    },
  });

  const createFulfillmentMutation = api.inventory.createFulfillmentRequest.useMutation({
    onSuccess: async () => {
      showToast({ title: "Berhasil", message: "Fulfillment request berhasil dibuat dari lead ini.", variant: "success" });
      await refetch();
    },
    onError: (error) => {
      showToast({ title: "Gagal", message: error.message, variant: "error" });
    },
  });

  const deliverFulfillmentMutation = api.inventory.deliverFulfillmentRequest.useMutation({
    onSuccess: async (result) => {
      showToast({
        title: "Berhasil",
        message: result?.cogsJournal?.journalNumber
          ? `Stock issue / delivery berhasil diproses. Jurnal COGS: ${result.cogsJournal.journalNumber}`
          : "Stock issue / delivery berhasil diproses.",
        variant: "success",
      });
      await refetch();
    },
    onError: (error) => {
      showToast({ title: "Gagal", message: error.message, variant: "error" });
    },
  });

  const cancelFulfillmentMutation = api.inventory.cancelFulfillmentRequest.useMutation({
    onSuccess: async () => {
      showToast({ title: "Berhasil", message: "Reservation berhasil dilepas dan fulfillment dibatalkan.", variant: "success" });
      await refetch();
    },
    onError: (error) => {
      showToast({ title: "Gagal", message: error.message, variant: "error" });
    },
  });

  const lead = data as any;
  const crmProducts = useMemo<Array<any>>(
    () => (crmProductsQuery.data?.products as Array<any> | undefined) ?? [],
    [crmProductsQuery.data],
  );
  const inventoryItems = useMemo<Array<any>>(
    () => (inventoryItemsQuery.data?.items as Array<any> | undefined) ?? [],
    [inventoryItemsQuery.data],
  );
  const warehouses = useMemo<Array<any>>(
    () => (warehousesQuery.data?.warehouses as Array<any> | undefined) ?? [],
    [warehousesQuery.data],
  );

  const lineSummary = useMemo(() => {
    const lines = lead?.lines ?? [];
    const inventoryLines = lines.filter((line: any) => line.requiresInventory);
    return {
      totalLines: lines.length,
      inventoryLines: inventoryLines.length,
      totalQuoted: lines.reduce((sum: number, line: any) => sum + Number(line.totalPrice ?? 0), 0),
    };
  }, [lead]);

  if (!session || !isAllowed) return null;

  async function handleAddLine() {
    if (!id) return;

    const selectedProduct = crmProducts.find((product: any) => product.id === lineForm.crmProductId);
    const selectedInventoryItem = inventoryItems.find((item: any) => item.id === lineForm.inventoryItemId);
    const qty = Number(lineForm.qty || 0);
    const unitPrice = Number(lineForm.unitPrice || 0);
    const description =
      lineForm.description ||
      selectedProduct?.name ||
      selectedInventoryItem?.name ||
      "CRM lead item";

    await addLeadLineMutation.mutateAsync({
      leadId: id,
      crmProductId: lineForm.crmProductId || undefined,
      inventoryItemId: lineForm.inventoryItemId || undefined,
      warehousePreferenceId: lineForm.warehousePreferenceId || undefined,
      description,
      qty,
      unitPrice,
      totalPrice: qty * unitPrice,
      requiresInventory: lineForm.requiresInventory,
    });
  }

  async function handleCreateFulfillment() {
    if (!lead) return;

    const lines = (lead.lines ?? [])
      .filter((line: any) => line.requiresInventory && line.inventoryItem)
      .map((line: any) => ({
        leadLineId: line.id,
        inventoryItemId: line.inventoryItem.id,
        warehouseId: line.warehousePreference?.id,
        qtyRequested: Number(line.qty ?? 0),
      }));

    if (lines.length === 0) {
      showToast({
        title: "Tidak ada line inventory",
        message: "Tambahkan line item yang terhubung ke inventory terlebih dahulu.",
        variant: "error",
      });
      return;
    }

    await createFulfillmentMutation.mutateAsync({
      leadId: lead.id,
      customerId: lead.customer?.id,
      requestNumber: `FUL-${Date.now()}`,
      notes: `Generated from CRM lead ${lead.company}`,
      lines,
    });
  }

  async function handleDeliverFulfillment(requestId: string) {
    await deliverFulfillmentMutation.mutateAsync({
      fulfillmentRequestId: requestId,
      notes: `Delivered from CRM lead ${lead?.company ?? "-"}`,
    });
  }

  async function handleCancelFulfillment(requestId: string) {
    await cancelFulfillmentMutation.mutateAsync({
      fulfillmentRequestId: requestId,
      notes: `Canceled from CRM lead ${lead?.company ?? "-"}`,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={lead ? lead.company : "Detail Lead CRM"}
        description="Lihat profil lead, item yang ditawarkan, stock availability, dan fulfillment inventory."
        primaryAction={{ label: "Tambah Line Item", onClick: () => setShowLineModal(true) }}
        secondaryAction={{ label: "Kembali ke CRM", href: "/crm" }}
      />

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Memuat detail lead...
        </div>
      ) : !lead ? (
        <div className="rounded-lg border bg-white">
          <EmptyState
            icon="🎯"
            title="Lead tidak ditemukan"
            description="Lead CRM ini tidak tersedia pada tenant aktif atau sudah dihapus."
            action={{ label: "Kembali ke CRM", href: "/crm" }}
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Stage" value={lead.stage} helper="Posisi lead saat ini" />
            <SummaryCard label="Value" value={formatCurrency(Number(lead.value ?? 0))} helper="Nilai opportunity" />
            <SummaryCard label="Line Items" value={String(lineSummary.totalLines)} helper={`${lineSummary.inventoryLines} line butuh inventory`} />
            <SummaryCard label="Fulfillment" value={String((lead.fulfillmentRequests ?? []).length)} helper={lead.fulfillmentStatus ?? "Belum ada fulfillment"} />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Panel title="Informasi Lead" description="Profil dan owner lead CRM">
              <InfoRow label="Company" value={lead.company} />
              <InfoRow label="PIC" value={lead.name} />
              <InfoRow label="Email" value={lead.email} />
              <InfoRow label="Telepon" value={lead.phone ?? "-"} />
              <InfoRow label="Owner" value={lead.ownerName} />
              <InfoRow label="Source" value={SOURCE_LABELS[lead.source] ?? lead.source} />
              <InfoRow label="Target Close" value={lead.expectedCloseDate ? formatDate(lead.expectedCloseDate) : "-"} />
              <InfoRow label="Aktivitas Terakhir" value={lead.lastActivityAt ? formatRelativeTime(lead.lastActivityAt) : "-"} />
            </Panel>

            <Panel title="Status Opportunity" description="Stage, prioritas, dan readiness inventory">
              <div className="flex flex-wrap gap-2">
                <Badge variant={STAGE_VARIANT[lead.stage] ?? "default"}>{lead.stage}</Badge>
                <Badge variant={PRIORITY_VARIANT[lead.priority] ?? "default"}>{lead.priority}</Badge>
                {lead.requiresInventory ? <Badge variant="info">Inventory Needed</Badge> : null}
                {lead.fulfillmentStatus ? <Badge variant="success">{lead.fulfillmentStatus}</Badge> : null}
              </div>
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                {lead.notes ?? "Belum ada catatan untuk lead ini."}
              </div>
              <Button
                onClick={() => void handleCreateFulfillment()}
                disabled={lead.stage !== "WON"}
                isLoading={createFulfillmentMutation.isPending}
              >
                Create Fulfillment Request
              </Button>
              {lead.stage !== "WON" ? (
                <p className="text-xs text-gray-500">Fulfillment request hanya bisa dibuat setelah lead menjadi WON.</p>
              ) : null}
            </Panel>

            <Panel title="Customer Terkait" description="Lead dapat dikaitkan ke customer eksisting">
              {lead.customer ? (
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="font-semibold text-gray-900">{lead.customer.company}</p>
                  <Link href={`/crm/customers/${lead.customer.id}`} className="mt-2 inline-block text-sm font-medium text-blue-600 hover:text-blue-700">
                    Lihat detail customer
                  </Link>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                  Lead ini belum terhubung ke customer.
                </div>
              )}
            </Panel>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Lead Items & Stock Availability</h2>
                <p className="text-sm text-gray-500">Produk/jasa yang ditawarkan pada lead ini dan keterkaitannya ke inventory</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{formatCurrency(lineSummary.totalQuoted)}</p>
                <p className="text-xs text-gray-500">Total quoted value</p>
              </div>
            </div>
            {lead.lines.length === 0 ? (
              <EmptyState icon="📦" title="Belum ada line item" description="Tambahkan produk atau jasa ke lead ini untuk mulai menghubungkan CRM ke inventory." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Produk / Jasa</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Inventory Link</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Qty</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Harga</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Stock</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Gudang Preferensi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {lead.lines.map((line: any) => {
                      const totalOnHand = (line.inventoryItem?.balances ?? []).reduce(
                        (sum: number, balance: any) => sum + Number(balance.qtyOnHand ?? 0),
                        0,
                      );
                      const totalReserved = (line.inventoryItem?.balances ?? []).reduce(
                        (sum: number, balance: any) => sum + Number(balance.qtyReserved ?? 0),
                        0,
                      );
                      const available = totalOnHand - totalReserved;
                      const enough = available >= Number(line.qty ?? 0);

                      return (
                        <tr key={line.id}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">{line.crmProduct?.name ?? line.description ?? "Line Item"}</p>
                            <p className="text-xs text-gray-500">{line.crmProduct?.code ?? "Manual line"}</p>
                            {line.requiresInventory ? <Badge variant="info" className="mt-2">Inventory Required</Badge> : <Badge className="mt-2">Service / Non-stock</Badge>}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {line.inventoryItem ? `${line.inventoryItem.sku} · ${line.inventoryItem.name}` : "Tidak terhubung"}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700">{Number(line.qty ?? 0)}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(Number(line.totalPrice ?? 0))}</td>
                          <td className="px-4 py-3 text-right">
                            {line.inventoryItem ? (
                              <div>
                                <p className={`font-semibold ${enough ? "text-green-700" : "text-amber-700"}`}>{available}</p>
                                <p className="text-xs text-gray-500">On hand {totalOnHand} · reserved {totalReserved}</p>
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{line.warehousePreference?.name ?? "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Fulfillment Requests</h2>
              <p className="text-sm text-gray-500">Permintaan fulfillment yang dibuat dari lead ini</p>
            </div>
            {(lead.fulfillmentRequests ?? []).length === 0 ? (
              <EmptyState icon="🚚" title="Belum ada fulfillment request" description="Buat fulfillment request setelah lead berhasil WON." />
            ) : (
              <div className="space-y-4 p-5">
                {lead.fulfillmentRequests.map((request: any) => {
                  const canDeliver = request.status === "RESERVED" || request.status === "PARTIAL";
                  const canCancel = request.status !== "DELIVERED" && request.status !== "CANCELED";
                  return (
                    <div key={request.id} className="rounded-xl border border-gray-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-gray-900">{request.requestNumber}</p>
                          <p className="text-sm text-gray-500">Requested {formatDate(request.requestedDate)}</p>
                          {request.deliveredAt ? (
                            <p className="text-xs text-gray-400">Delivered {formatDate(request.deliveredAt)}</p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <Badge variant={request.status === "DELIVERED" ? "success" : request.status === "CANCELED" ? "danger" : request.status === "PARTIAL" ? "warning" : "info"}>{request.status}</Badge>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void handleCancelFulfillment(request.id)}
                            disabled={!canCancel}
                            isLoading={cancelFulfillmentMutation.isPending}
                          >
                            Cancel / Release
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => void handleDeliverFulfillment(request.id)}
                            disabled={!canDeliver}
                            isLoading={deliverFulfillmentMutation.isPending}
                          >
                            Deliver / Issue Stock
                          </Button>
                        </div>
                      </div>
                      {request.cogsJournal ? (
                        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
                          <p className="font-semibold text-emerald-900">Jurnal COGS Otomatis</p>
                          <p className="mt-1 text-emerald-800">
                            {request.cogsJournal.journalNumber} · {request.cogsJournal.description}
                          </p>
                          <p className="mt-1 text-xs text-emerald-700">
                            Diposting pada {formatDate(request.cogsJournal.transactionDate)}
                          </p>

                          <div className="mt-3 overflow-x-auto rounded-lg border border-emerald-200 bg-white">
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
                      <div className="mt-4 space-y-2">
                        {request.lines.map((line: any) => (
                          <div key={line.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                            {line.inventoryItem.sku} · {line.inventoryItem.name} — req {Number(line.qtyRequested)} / reserved {Number(line.qtyReserved)} / delivered {Number(line.qtyDelivered)}
                            {line.warehouse ? ` · wh ${line.warehouse.code}` : ""}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Aktivitas Lead</h2>
              <p className="text-sm text-gray-500">Riwayat follow-up dan engagement yang terkait</p>
            </div>
            {lead.activities.length === 0 ? (
              <EmptyState icon="🗓️" title="Belum ada aktivitas" description="Belum ada aktivitas yang tercatat untuk lead ini." />
            ) : (
              <div className="space-y-3 p-5">
                {lead.activities.map((activity: any) => (
                  <div key={activity.id} className="rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900">{activity.title}</p>
                        <p className="mt-1 text-sm text-gray-500">{activity.description ?? "-"}</p>
                      </div>
                      <Badge variant={activity.completedAt ? "success" : "info"}>
                        {activity.completedAt ? "Completed" : "Open"}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-3 text-sm text-gray-600 sm:grid-cols-2 xl:grid-cols-4">
                      <InfoChip label="Type" value={activity.type} />
                      <InfoChip label="Owner" value={activity.ownerName} />
                      <InfoChip label="Scheduled" value={formatDate(activity.scheduledAt)} />
                      <InfoChip label="Customer" value={activity.customer?.company ?? "-"} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <Modal isOpen={showLineModal} onClose={() => setShowLineModal(false)} title="Tambah Lead Line Item">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="CRM Product / Service">
            <select value={lineForm.crmProductId} onChange={(e) => setLineForm((prev) => ({ ...prev, crmProductId: e.target.value }))} className="input">
              <option value="">Pilih produk/jasa CRM</option>
              {crmProducts.map((product: any) => (
                <option key={product.id} value={product.id}>{product.code} · {product.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Inventory Item">
            <select value={lineForm.inventoryItemId} onChange={(e) => setLineForm((prev) => ({ ...prev, inventoryItemId: e.target.value }))} className="input">
              <option value="">Tidak terhubung</option>
              {inventoryItems.map((item: any) => (
                <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Gudang Preferensi">
            <select value={lineForm.warehousePreferenceId} onChange={(e) => setLineForm((prev) => ({ ...prev, warehousePreferenceId: e.target.value }))} className="input">
              <option value="">Pilih gudang</option>
              {warehouses.map((warehouse: any) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Qty">
            <input type="number" value={lineForm.qty} onChange={(e) => setLineForm((prev) => ({ ...prev, qty: e.target.value }))} className="input" />
          </Field>
          <Field label="Unit Price">
            <input type="number" value={lineForm.unitPrice} onChange={(e) => setLineForm((prev) => ({ ...prev, unitPrice: e.target.value }))} className="input" />
          </Field>
          <Field label="Deskripsi" className="md:col-span-2">
            <textarea value={lineForm.description} onChange={(e) => setLineForm((prev) => ({ ...prev, description: e.target.value }))} className="input min-h-[88px]" />
          </Field>
          <label className="flex items-center gap-3 text-sm text-gray-700 md:col-span-2">
            <input type="checkbox" checked={lineForm.requiresInventory} onChange={(e) => setLineForm((prev) => ({ ...prev, requiresInventory: e.target.checked }))} />
            Line ini membutuhkan inventory / fulfillment
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setShowLineModal(false)}>Batal</Button>
          <Button onClick={() => void handleAddLine()} isLoading={addLeadLineMutation.isPending}>Simpan Line</Button>
        </div>
      </Modal>
    </div>
  );
}

function SummaryCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-2 text-xs text-gray-500">{helper}</p>
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-sm text-gray-700">{value}</p>
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-700">{value}</p>
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
