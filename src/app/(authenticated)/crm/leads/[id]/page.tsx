"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/features/EmptyState";
import { PageHeader } from "@/components/features/PageHeader";
import {
  CrmActivitySection,
  CrmAttachmentsSection,
  CrmNotesSection,
  CrmTasksSection,
} from "@/components/features/crm/detail-managers";
import {
  CrmInfoRow,
  CrmMetricCard,
  CrmPanel,
  CrmTabs,
} from "@/components/features/crm/shared";
import { hasPermissionMap } from "@/lib/auth/permissions";
import { userHasPermission } from "@/lib/auth/role-check";
import { getCrmBadgeVariant, getCrmLabel } from "@/lib/constants/crm";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";

type LeadTab = "activity" | "data" | "tasks" | "notes" | "attachments";

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
  const isAllowed = session?.user ? userHasPermission(session.user, "crm", "read") : false;
  const canCreateInventory = session?.user
    ? (session.user.isRoot === true || hasPermissionMap(session.user.permissions, "inventory", "create"))
    : false;
  const [activeTab, setActiveTab] = useState<LeadTab>("activity");
  const [showLineModal, setShowLineModal] = useState(false);
  const [showFulfillmentModal, setShowFulfillmentModal] = useState(false);
  const [lineForm, setLineForm] = useState(DEFAULT_LINE_FORM);

  const utils = api.useUtils();
  const { data, isLoading, refetch } = api.crm.getLeadById.useQuery(
    { id: id ?? "" },
    { enabled: !!id && isAllowed, refetchOnWindowFocus: false },
  );
  const lead = data as any;
  const { data: options } = api.crm.formOptions.useQuery(undefined, {
    enabled: isAllowed,
    refetchOnWindowFocus: false,
  });
  const productsQuery = api.crm.listProducts.useQuery(
    { isActive: true },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );
  const inventoryItemsQuery = api.inventory.listItems.useQuery(
    { isActive: true, limit: 200 },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );
  const warehousesQuery = api.inventory.listWarehouses.useQuery(
    { isActive: true },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  );
  const convertMutation = api.crm.createDealFromLead.useMutation({
    onSuccess: async () => {
      await utils.crm.getLeadById.invalidate({ id: id ?? "" });
      await utils.crm.listLeads.invalidate();
      await utils.crm.listDeals.invalidate();
      await utils.crm.dashboard.invalidate();
    },
  });
  const addLeadLineMutation = api.crm.createLeadLine.useMutation({
    onSuccess: async () => {
      setShowLineModal(false);
      setLineForm(DEFAULT_LINE_FORM);
      showToast({ title: "Lead line created", message: "Line item berhasil ditambahkan ke lead.", variant: "success" });
      await utils.crm.getLeadById.invalidate({ id: id ?? "" });
      await utils.crm.listLeads.invalidate();
    },
    onError: (error) => {
      showToast({ title: "Failed to add line", message: error.message, variant: "error" });
    },
  });
  const createFulfillmentMutation = api.inventory.createFulfillmentRequest.useMutation({
    onSuccess: async () => {
      setShowFulfillmentModal(false);
      showToast({ title: "Fulfillment created", message: "Fulfillment request berhasil dibuat.", variant: "success" });
      await utils.crm.getLeadById.invalidate({ id: id ?? "" });
    },
    onError: (error) => {
      showToast({ title: "Failed to create fulfillment", message: error.message, variant: "error" });
    },
  });

  const crmProducts = useMemo<Array<any>>(
    () => (productsQuery.data?.products as Array<any> | undefined) ?? [],
    [productsQuery.data],
  );
  const inventoryItems = useMemo<Array<any>>(
    () => (inventoryItemsQuery.data?.items as Array<any> | undefined) ?? [],
    [inventoryItemsQuery.data],
  );
  const warehouses = useMemo<Array<any>>(
    () => (warehousesQuery.data?.warehouses as Array<any> | undefined) ?? [],
    [warehousesQuery.data],
  );
  const activeFulfillmentStatuses = ["DRAFT", "RESERVED", "PARTIAL", "READY"];
  const activeFulfillmentRequests = useMemo(
    () => (lead?.fulfillmentRequests ?? []).filter((request: any) => activeFulfillmentStatuses.includes(request.status)),
    [lead?.fulfillmentRequests],
  );
  const activeFulfillmentLineIds = useMemo(
    () => new Set(activeFulfillmentRequests.flatMap((request: any) => (request.lines ?? []).map((line: any) => line.leadLineId).filter(Boolean))),
    [activeFulfillmentRequests],
  );
  const eligibleFulfillmentLines = useMemo(
    () => (lead?.leadLines ?? []).filter((line: any) => line.requiresInventory && line.inventoryItem && !activeFulfillmentLineIds.has(line.id)),
    [lead?.leadLines, activeFulfillmentLineIds],
  );

  async function handleConvert() {
    if (!id) return;

    try {
      await convertMutation.mutateAsync({ id });
      showToast({ title: "Deal created from lead", message: "The lead has been converted into a deal.", variant: "success" });
    } catch (error) {
      showToast({
        title: "Failed to convert lead",
        message: error instanceof Error ? error.message : "Unexpected error",
        variant: "error",
      });
    }
  }

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
    if (!lead?.id) return;

    const lines = eligibleFulfillmentLines
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
      notes: `Generated from CRM lead ${lead.company}`,
      lines,
    });
  }

  if (!session || !isAllowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={lead ? `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() || lead.company : "Lead Detail"}
        description="Lead detail page with activity log, data, tasks, notes, and attachments."
        primaryAction={{ label: "Refresh", onClick: () => void refetch() }}
        secondaryAction={{ label: "Back to Leads", href: "/crm/leads" }}
      />

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Loading lead detail...
        </div>
      ) : !data ? (
        <div className="rounded-lg border bg-white">
          <EmptyState
            title="Lead not found"
            description="This CRM lead is unavailable in the active tenant."
            action={{ label: "Back to Leads", href: "/crm/leads" }}
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <CrmMetricCard label="Status" value={getCrmLabel(lead.status)} />
            <CrmMetricCard label="Organization" value={lead.company} />
            <CrmMetricCard
              label="Annual Revenue"
              value={lead.annualRevenue ? formatCurrency(Number(lead.annualRevenue)) : "-"}
            />
            <CrmMetricCard label="Deals" value={String(lead.deals?.length ?? 0)} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <CrmTabs
              value={activeTab}
              onChange={setActiveTab}
              items={[
                { id: "activity", label: "Activity Log", count: lead.activities?.length ?? 0 },
                { id: "data", label: "Data" },
                { id: "tasks", label: "Tasks", count: lead.tasks?.length ?? 0 },
                { id: "notes", label: "Notes", count: lead.notesList?.length ?? 0 },
                { id: "attachments", label: "Attachments", count: lead.attachments?.length ?? 0 },
              ]}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setShowLineModal(true)}>
                Add Line Item
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowFulfillmentModal(true)}
                disabled={!canCreateInventory || activeFulfillmentRequests.length > 0}
              >
                Create Fulfillment
              </Button>
              {lead.status !== "CONVERTED" ? (
                <Button onClick={() => void handleConvert()} isLoading={convertMutation.isPending}>
                  Create Deal
                </Button>
              ) : null}
            </div>
          </div>

          {activeTab === "data" ? (
            <div className="grid gap-6 xl:grid-cols-3">
              <CrmPanel title="Lead Data">
                <CrmInfoRow label="First Name" value={lead.firstName ?? "-"} />
                <CrmInfoRow label="Last Name" value={lead.lastName ?? "-"} />
                <CrmInfoRow label="Email" value={lead.email} />
                <CrmInfoRow label="Mobile No." value={lead.mobileNo ?? "-"} />
                <CrmInfoRow label="Gender" value={getCrmLabel(lead.gender)} />
                <CrmInfoRow
                  label="Status"
                  value={<Badge variant={getCrmBadgeVariant(lead.status)}>{getCrmLabel(lead.status)}</Badge>}
                />
                <CrmInfoRow label="Lead Owner" value={lead.ownerName} />
              </CrmPanel>

              <CrmPanel title="Organization Snapshot">
                <CrmInfoRow label="Organization" value={lead.company} />
                <CrmInfoRow label="Website" value={lead.website ?? "-"} />
                <CrmInfoRow label="Employees" value={getCrmLabel(lead.employeeCount)} />
                <CrmInfoRow
                  label="Annual Revenue"
                  value={lead.annualRevenue ? formatCurrency(Number(lead.annualRevenue)) : "-"}
                />
                <CrmInfoRow label="Industry" value={getCrmLabel(lead.industry)} />
                {lead.customer ? (
                  <Link href={`/crm/organizations/${lead.customer.id}`} className="inline-block text-sm font-medium text-blue-600 hover:text-blue-700">
                    View linked organization
                  </Link>
                ) : null}
              </CrmPanel>

              <CrmPanel title="Meta">
                <CrmInfoRow label="Expected Close Date" value={lead.expectedCloseDate ? formatDate(lead.expectedCloseDate) : "-"} />
                <CrmInfoRow label="Last Modified" value={formatDate(lead.updatedAt)} />
                <CrmInfoRow label="Converted To Deal" value={lead.convertedToDealAt ? formatDate(lead.convertedToDealAt) : "-"} />
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                  {lead.notes ?? "No lead notes in the data section."}
                </div>
              </CrmPanel>

              <CrmPanel title="Lead Line Items" description="Item, product/service, dan kebutuhan inventory untuk lead ini." className="xl:col-span-3">
                {lead.leadLines?.length ? (
                  <div className="space-y-3">
                    {lead.leadLines.map((line: any) => (
                      <div key={line.id} className="rounded-lg border border-gray-200 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-gray-900">{line.description ?? line.crmProduct?.name ?? line.inventoryItem?.name ?? "Lead item"}</p>
                            <p className="mt-1 text-sm text-gray-500">
                              {line.crmProduct ? `${line.crmProduct.code} · ${line.crmProduct.name}` : "No CRM product"}
                              {line.inventoryItem ? ` · ${line.inventoryItem.sku} · ${line.inventoryItem.name}` : ""}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="info">Qty {Number(line.qty ?? 0)}</Badge>
                            <Badge variant="default">{formatCurrency(Number(line.totalPrice ?? 0))}</Badge>
                            <Badge variant={line.requiresInventory ? "warning" : "success"}>
                              {line.requiresInventory ? "Needs inventory" : "No inventory"}
                            </Badge>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                          <CrmInfoRow label="Warehouse preference" value={line.warehousePreference ? `${line.warehousePreference.code} · ${line.warehousePreference.name}` : "-"} />
                          <CrmInfoRow label="Unit price" value={formatCurrency(Number(line.unitPrice ?? 0))} />
                          <CrmInfoRow label="Available stock" value={line.inventoryItem ? String((line.inventoryItem.balances ?? []).reduce((sum: number, balance: any) => sum + (Number(balance.qtyOnHand ?? 0) - Number(balance.qtyReserved ?? 0)), 0)) : "-"} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Belum ada line item pada lead ini.</p>
                )}
              </CrmPanel>

              <CrmPanel title="Fulfillment Requests" description="Request fulfillment yang dibuat dari lead ini." className="xl:col-span-3">
                {lead.fulfillmentRequests?.length ? (
                  <div className="space-y-3">
                    {lead.fulfillmentRequests.map((request: any) => (
                      <div key={request.id} className="rounded-lg border border-gray-200 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-gray-900">{request.requestNumber}</p>
                            <p className="mt-1 text-sm text-gray-500">
                              Requested {formatDate(request.requestedDate)}
                              {request.deliveredAt ? ` · Delivered ${formatDate(request.deliveredAt)}` : ""}
                            </p>
                          </div>
                          <Badge variant={request.status === "DELIVERED" ? "success" : request.status === "CANCELED" ? "danger" : "warning"}>
                            {request.status}
                          </Badge>
                        </div>
                        {request.notes ? <p className="mt-3 text-sm text-gray-600">{request.notes}</p> : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link href="/inventory/fulfillment" className="text-sm font-medium text-blue-600 hover:text-blue-700">
                            Open fulfillment dashboard
                          </Link>
                          {request.cogsJournal ? (
                            <span className="text-sm text-emerald-700">COGS journal: {request.cogsJournal.journalNumber}</span>
                          ) : null}
                        </div>
                        {(request.lines ?? []).length > 0 ? (
                          <div className="mt-4 space-y-3">
                            {request.lines.map((line: any) => (
                              <div key={line.id} className="rounded-lg bg-gray-50 p-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-gray-900">{line.inventoryItem?.sku} · {line.inventoryItem?.name}</p>
                                    <p className="mt-1 text-xs text-gray-500">
                                      Warehouse: {line.warehouse ? `${line.warehouse.code} · ${line.warehouse.name}` : "-"} · Tracking: {line.inventoryItem?.trackingMode ?? "QUANTITY"}
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap gap-2 text-xs">
                                    <Badge variant="default">Req {Number(line.qtyRequested ?? 0)}</Badge>
                                    <Badge variant="warning">Res {Number(line.qtyReserved ?? 0)}</Badge>
                                    <Badge variant="success">Del {Number(line.qtyDelivered ?? 0)}</Badge>
                                  </div>
                                </div>
                                {(line.reservedUnits ?? []).length > 0 ? (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {line.reservedUnits.map((entry: any) => (
                                      <span key={entry.id} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
                                        {entry.inventoryItemUnit.serialNumber ?? entry.inventoryItemUnit.assetTag ?? entry.inventoryItemUnit.id}
                                        <span className="ml-1 text-slate-500">{entry.inventoryItemUnit.status}</span>
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Belum ada fulfillment request untuk lead ini.</p>
                )}
              </CrmPanel>

              <CrmPanel title="Related Deals" description="Deals created from this lead." className="xl:col-span-3">
                {lead.deals?.length ? (
                  <div className="grid gap-3 xl:grid-cols-2">
                    {lead.deals.map((deal: any) => (
                      <div key={deal.id} className="rounded-lg border border-gray-200 p-4">
                        <p className="font-semibold text-gray-900">{deal.title}</p>
                        <p className="mt-1 text-sm text-gray-500">{getCrmLabel(deal.status)}</p>
                        <Link href={`/crm/deals/${deal.id}`} className="mt-3 inline-block text-sm font-medium text-blue-600 hover:text-blue-700">
                          View deal
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No deals created from this lead yet.</p>
                )}
              </CrmPanel>
            </div>
          ) : null}

          {activeTab === "activity" ? <CrmActivitySection items={lead.activities ?? []} /> : null}
          {activeTab === "tasks" ? (
            <CrmTasksSection subjectId={lead.id} subjectType="lead" items={lead.tasks ?? []} users={options?.users ?? []} />
          ) : null}
          {activeTab === "notes" ? (
            <CrmNotesSection subjectId={lead.id} subjectType="lead" items={lead.notesList ?? []} users={options?.users ?? []} />
          ) : null}
          {activeTab === "attachments" ? (
            <CrmAttachmentsSection subjectId={lead.id} subjectType="lead" items={lead.attachments ?? []} />
          ) : null}
        </>
      )}

      <Modal isOpen={showLineModal} onClose={() => setShowLineModal(false)} title="Tambah Lead Line Item" size="lg">
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

      <Modal isOpen={showFulfillmentModal} onClose={() => setShowFulfillmentModal(false)} title="Create Fulfillment Request" size="lg">
        <div className="space-y-4">
          {activeFulfillmentRequests.length > 0 ? (
            <p className="rounded-lg border border-amber-100 bg-amber-50 p-4 text-sm text-amber-900">
              Lead ini sudah memiliki fulfillment request aktif: {activeFulfillmentRequests.map((request: any) => `${request.requestNumber} (${request.status})`).join(", ")}. Selesaikan atau cancel request aktif sebelum membuat request baru.
            </p>
          ) : (
            <p className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
              Sistem akan membuat fulfillment request dari lead line yang membutuhkan inventory, terhubung ke inventory item, dan belum masuk request aktif lain.
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm font-semibold text-gray-900">Lead</p>
              <p className="mt-1 text-sm text-gray-600">{lead?.company ?? "-"}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm font-semibold text-gray-900">Eligible lines</p>
              <p className="mt-1 text-sm text-gray-600">
                {String(eligibleFulfillmentLines.length)} line(s)
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-900">Line items that will be included</p>
            <div className="mt-3 space-y-2">
              {eligibleFulfillmentLines.map((line: any) => (
                <div key={line.id} className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  {line.inventoryItem.sku} · {line.inventoryItem.name} · Qty {Number(line.qty ?? 0)}
                </div>
              ))}
              {eligibleFulfillmentLines.length === 0 ? (
                <p className="text-sm text-gray-500">Belum ada line yang siap dibuat fulfillment.</p>
              ) : null}
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setShowFulfillmentModal(false)}>Batal</Button>
          <Button
            onClick={() => void handleCreateFulfillment()}
            isLoading={createFulfillmentMutation.isPending}
            disabled={eligibleFulfillmentLines.length === 0 || activeFulfillmentRequests.length > 0}
          >
            Buat Fulfillment
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
