"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { BusinessFlowBadge } from "@/components/features/business/BusinessFlowBadge";
import { PageHeader } from "@/components/features/PageHeader";
import { CrmEmptyHint, crmInputClassName, CrmMetricCard } from "@/components/features/crm/shared";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { userHasPermission } from "@/lib/auth/role-check";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { api } from "@/trpc/react";

type SalesQuotationRecord = {
  id: string;
  quotationNumber: string;
  issueDate: string | Date;
  validUntil: string | Date | null;
  salesOwnerName: string | null;
  notes?: string | null;
  totalAmount: number | string;
  fulfillmentMode?: string | null;
  status: string;
  customer: { id: string; company: string };
  lines: Array<{
    description?: string | null;
    qtyQuoted?: number | string;
    unitPrice?: number | string;
    warehouse?: { id: string; code: string; name: string } | null;
    inventoryItem?: { id: string; sku: string; name: string; itemType?: string | null; unitOfMeasure?: string | null } | null;
  }>;
  salesOrders?: Array<{ id: string; salesOrderNumber: string; status: string }>;
};

type QuotationFormOptions = {
  customers: Array<{ id: string; company: string }>;
  items: Array<{
    id: string;
    sku: string;
    name: string;
    itemType: string;
    isStockTracked: boolean;
    standardCost: number | string | null;
    unitOfMeasure: string;
    balances: Array<{
      warehouseId: string;
      qtyOnHand: number | string;
      qtyReserved: number | string;
      warehouse: { id: string; code: string; name: string };
    }>;
  }>;
};

const DEFAULT_FORM = {
  customerId: "",
  inventoryItemId: "",
  warehouseId: "",
  qtyQuoted: "1",
  unitPrice: "0",
  validUntil: "",
  description: "",
  paymentTerms: "Pembayaran maksimal 14 hari setelah invoice diterbitkan.",
  notes: "",
};

const toLabel = (value?: string | null) =>
  value ? value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()) : "-";

const toBadge = (status?: string | null): "default" | "success" | "warning" | "danger" | "info" =>
  status === "APPROVED"
    ? "success"
    : status === "NEGOTIATION"
      ? "warning"
      : status === "SENT"
        ? "info"
        : status === "EXPIRED" || status === "REJECTED" || status === "CANCELED"
          ? "danger"
          : "default";

const summarizeItems = (lines: SalesQuotationRecord["lines"]) => {
  const labels = lines
    .map((line) => line.inventoryItem?.name ?? line.description ?? null)
    .filter((value): value is string => Boolean(value));

  if (labels.length === 0) return "-";
  if (labels.length === 1) return labels[0];
  return `${labels[0]} +${labels.length - 1} item`;
};

function parseQuotationNotes(raw?: string | null) {
  const value = raw?.trim() ?? "";
  if (!value.startsWith("Payment Terms:")) {
    return {
      paymentTerms: DEFAULT_FORM.paymentTerms,
      notes: value,
    };
  }

  const [paymentLine = "", ...rest] = value.split("\n");
  return {
    paymentTerms: paymentLine.replace("Payment Terms:", "").trim() || DEFAULT_FORM.paymentTerms,
    notes: rest.join("\n").trim(),
  };
}

function composeQuotationNotes(paymentTerms: string, notes: string) {
  const normalizedPaymentTerms = paymentTerms.trim() || DEFAULT_FORM.paymentTerms;
  const normalizedNotes = notes.trim();
  return normalizedNotes ? `Payment Terms: ${normalizedPaymentTerms}\n\n${normalizedNotes}` : `Payment Terms: ${normalizedPaymentTerms}`;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

export default function QuotationPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { showToast } = useToast();
  const utils = api.useUtils();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);

  const isAllowed = session?.user ? userHasPermission(session.user, "sales", "read") : false;
  const canWrite = session?.user ? userHasPermission(session.user, "sales", "create") : false;

  const query = api.business.listSalesQuotations.useQuery(
    { search: search || undefined, status: status ? (status as never) : undefined, limit: 100 },
    { enabled: isAllowed, refetchOnWindowFocus: false },
  ) as unknown as { data?: SalesQuotationRecord[]; isLoading: boolean };

  const formOptionsQuery = api.business.salesQuotationFormOptions.useQuery(undefined, {
    enabled: isAllowed && canWrite,
    refetchOnWindowFocus: false,
  }) as unknown as { data?: QuotationFormOptions; isLoading: boolean };

  const refreshQuotationData = async () => {
    await Promise.all([
      utils.business.listSalesQuotations.invalidate(),
      utils.business.salesSummary.invalidate(),
      utils.business.listSalesFlows.invalidate(),
    ]);
  };

  const createMutation = api.business.createSalesQuotation.useMutation({
    onSuccess: async () => {
      await refreshQuotationData();
      setIsFormOpen(false);
      setEditingRowId(null);
      setForm(DEFAULT_FORM);
      showToast({ title: "Quotation berhasil dibuat", message: "Dokumen quotation baru berhasil disimpan.", variant: "success" });
    },
    onError: (error) => {
      showToast({ title: "Gagal membuat quotation", message: error.message, variant: "error" });
    },
  });

  const updateMutation = api.business.updateSalesQuotation.useMutation({
    onSuccess: async () => {
      await refreshQuotationData();
      setIsFormOpen(false);
      setEditingRowId(null);
      setForm(DEFAULT_FORM);
      showToast({ title: "Quotation berhasil diubah", message: "Dokumen quotation berhasil diperbarui.", variant: "success" });
    },
    onError: (error) => {
      showToast({ title: "Gagal mengubah quotation", message: error.message, variant: "error" });
    },
  });

  const deleteMutation = api.business.deleteSalesQuotation.useMutation({
    onSuccess: async () => {
      await refreshQuotationData();
      showToast({ title: "Quotation berhasil dihapus", message: "Dokumen quotation sudah dihapus dari daftar aktif.", variant: "success" });
    },
    onError: (error) => {
      showToast({ title: "Gagal menghapus quotation", message: error.message, variant: "error" });
    },
  });

  const convertMutation = api.business.convertSalesQuotationToOrder.useMutation({
    onSuccess: async (data) => {
      await Promise.all([
        utils.business.listSalesQuotations.invalidate(),
        utils.business.listSalesOrders.invalidate(),
        utils.business.salesSummary.invalidate(),
      ]);
      showToast({
        variant: "success",
        title: "Sales order berhasil dibuat",
        message: `Quotation berhasil dikonversi menjadi ${String((data as { salesOrderNumber?: string }).salesOrderNumber ?? "sales order")}.`,
      });
    },
    onError: (error) => {
      showToast({ variant: "error", title: "Konversi gagal", message: error.message });
    },
  });

  const rows = useMemo(() => query.data ?? [], [query.data]);
  const formOptions = formOptionsQuery.data;
  const selectedItem = useMemo(
    () => formOptions?.items.find((item) => item.id === form.inventoryItemId) ?? null,
    [form.inventoryItemId, formOptions?.items],
  );
  const stockBalances = useMemo(
    () =>
      (selectedItem?.balances ?? []).map((balance) => ({
        ...balance,
        availableQty: Number(balance.qtyOnHand ?? 0) - Number(balance.qtyReserved ?? 0),
      })),
    [selectedItem],
  );
  const recommendedWarehouse = useMemo(
    () => stockBalances.slice().sort((left, right) => right.availableQty - left.availableQty)[0] ?? null,
    [stockBalances],
  );
  const selectedWarehouseStock = useMemo(
    () => stockBalances.find((balance) => balance.warehouseId === form.warehouseId) ?? null,
    [form.warehouseId, stockBalances],
  );
  const maxQty = selectedItem?.isStockTracked ? Number(selectedWarehouseStock?.availableQty ?? 0) : null;
  const qtyNumber = Number(form.qtyQuoted || 0);
  const unitPriceNumber = Number(form.unitPrice || 0);
  const estimatedTotal = qtyNumber * unitPriceNumber;
  const stockError =
    selectedItem?.isStockTracked && form.warehouseId && qtyNumber > Number(selectedWarehouseStock?.availableQty ?? 0)
      ? `Qty melebihi stok tersedia (${Number(selectedWarehouseStock?.availableQty ?? 0)}) di gudang sale stock terpilih.`
      : selectedItem?.isStockTracked && !form.warehouseId
        ? "Pilih gudang sale stock untuk item yang memakai stok inventory."
        : null;

  useEffect(() => {
    if (!selectedItem) return;

    setForm((prev) => {
      const nextWarehouseId = selectedItem.isStockTracked
        ? (prev.warehouseId !== "" ? prev.warehouseId : (recommendedWarehouse?.warehouseId ?? ""))
        : "";
      const nextDescription = prev.description || selectedItem.name;
      const nextPrice = prev.unitPrice !== "0" || editingRowId ? Number(prev.unitPrice) : Number(selectedItem.standardCost ?? 0);

      if (
        prev.warehouseId === nextWarehouseId &&
        prev.description === nextDescription &&
        Number(prev.unitPrice) === nextPrice
      ) {
        return prev;
      }

      return {
        ...prev,
        warehouseId: nextWarehouseId,
        description: nextDescription,
        unitPrice: String(nextPrice),
      };
    });
  }, [editingRowId, recommendedWarehouse?.warehouseId, selectedItem]);

  const totalValue = rows.reduce((sum, row) => sum + Number(row.totalAmount ?? 0), 0);
  const sentCount = rows.filter((row) => row.status === "SENT").length;
  const negotiationCount = rows.filter((row) => row.status === "NEGOTIATION").length;
  const approvedCount = rows.filter((row) => row.status === "APPROVED").length;

  function resetFormState() {
    setEditingRowId(null);
    setForm(DEFAULT_FORM);
    setIsFormOpen(false);
  }

  function openCreateForm() {
    setEditingRowId(null);
    setForm(DEFAULT_FORM);
    setIsFormOpen(true);
  }

  function openEditForm(row: SalesQuotationRecord) {
    const firstLine = row.lines[0];
    const parsedNotes = parseQuotationNotes(row.notes);

    setEditingRowId(row.id);
    setForm({
      customerId: row.customer.id,
      inventoryItemId: firstLine?.inventoryItem?.id ?? "",
      warehouseId: firstLine?.warehouse?.id ?? "",
      qtyQuoted: String(firstLine?.qtyQuoted ?? 1),
      unitPrice: String(firstLine?.unitPrice ?? 0),
      validUntil: row.validUntil ? new Date(row.validUntil).toISOString().slice(0, 10) : "",
      description: firstLine?.description ?? "",
      paymentTerms: parsedNotes.paymentTerms,
      notes: parsedNotes.notes,
    });
    setIsFormOpen(true);
  }

  async function handleSubmitQuotation() {
    if (stockError) {
      showToast({ title: "Validasi stok", message: stockError, variant: "error" });
      return;
    }

    const payload = {
      customerId: form.customerId,
      inventoryItemId: form.inventoryItemId,
      warehouseId: form.warehouseId || undefined,
      qtyQuoted: qtyNumber,
      unitPrice: unitPriceNumber,
      validUntil: form.validUntil || undefined,
      description: form.description || undefined,
      notes: composeQuotationNotes(form.paymentTerms, form.notes),
    };

    if (editingRowId) {
      await updateMutation.mutateAsync({ salesQuotationId: editingRowId, ...payload });
      return;
    }

    await createMutation.mutateAsync(payload);
  }

  async function handleDelete(row: SalesQuotationRecord) {
    const confirmed = window.confirm(`Hapus quotation ${row.quotationNumber}?`);
    if (!confirmed) return;

    await deleteMutation.mutateAsync({ salesQuotationId: row.id });
  }

  function handlePrint(row: SalesQuotationRecord) {
    const printWindow = window.open("", "_blank", "width=1100,height=820");
    if (!printWindow) {
      showToast({ title: "Print gagal", message: "Popup browser diblokir. Izinkan popup untuk mencetak quotation.", variant: "error" });
      return;
    }

    const companyProfile = {
      name: "PT Travel Claim Teknologi",
      tagline: "IT Solution, Infrastructure & Professional Services",
      address: "Jl. Contoh Bisnis No. 88, Jakarta",
      phone: "+62 21 5555 8888",
      email: "sales@travelclaim.local",
    };

    const linesHtml = row.lines.length > 0
      ? row.lines.map((line, index) => {
          const itemLabel = line.inventoryItem
            ? `${line.inventoryItem.sku} · ${line.inventoryItem.name}`
            : (line.description ?? "-");
          const warehouseLabel = line.warehouse
            ? `${line.warehouse.code} · ${line.warehouse.name}`
            : "-";
          const qty = Number(line.qtyQuoted ?? 0);
          const unit = line.inventoryItem?.unitOfMeasure ?? "unit";
          const unitPrice = Number(line.unitPrice ?? 0);
          const lineTotal = qty * unitPrice;

          return `
            <tr>
              <td>${index + 1}</td>
              <td>
                <div class="item-name">${itemLabel}</div>
                <div class="item-note">${line.description ?? "-"}</div>
              </td>
              <td>${warehouseLabel}</td>
              <td class="text-right">${qty.toLocaleString("id-ID")} ${unit}</td>
              <td class="text-right">${formatCurrency(unitPrice)}</td>
              <td class="text-right">${formatCurrency(lineTotal)}</td>
            </tr>
          `;
        }).join("")
      : `
        <tr>
          <td>1</td>
          <td>-</td>
          <td>-</td>
          <td class="text-right">0</td>
          <td class="text-right">${formatCurrency(0)}</td>
          <td class="text-right">${formatCurrency(0)}</td>
        </tr>
      `;

    const subtotalLabel = formatCurrency(Number(row.totalAmount ?? 0));
    const issueDateLabel = formatDate(row.issueDate);
    const validUntilLabel = row.validUntil ? formatDate(row.validUntil) : "-";
    const parsedNotes = parseQuotationNotes(row.notes);
    const notesLabel = parsedNotes.notes || "Harga dan ketersediaan mengikuti stok sale stock yang aktif pada saat proses order dilakukan.";
    const paymentTermsLabel = parsedNotes.paymentTerms;

    printWindow.document.write(`
      <html>
        <head>
          <title>${row.quotationNumber}</title>
          <style>
            @page { size: A4; margin: 16mm; }
            * { box-sizing: border-box; }
            body {
              font-family: Arial, Helvetica, sans-serif;
              color: #0f172a;
              margin: 0;
              background: #fff;
              font-size: 12px;
              line-height: 1.45;
            }
            .page {
              width: 100%;
              margin: 0 auto;
            }
            .header {
              display: flex;
              justify-content: space-between;
              gap: 24px;
              padding-bottom: 18px;
              border-bottom: 3px solid #1d4ed8;
            }
            .brand-title {
              margin: 0;
              font-size: 24px;
              font-weight: 700;
              color: #0f172a;
            }
            .brand-tagline {
              margin-top: 4px;
              color: #475569;
              font-size: 12px;
            }
            .brand-meta {
              margin-top: 10px;
              color: #334155;
            }
            .doc-box {
              min-width: 250px;
              border: 1px solid #cbd5e1;
              border-radius: 12px;
              padding: 14px 16px;
              background: #f8fafc;
            }
            .doc-label {
              color: #64748b;
              text-transform: uppercase;
              font-size: 11px;
              letter-spacing: 0.08em;
              margin-bottom: 6px;
            }
            .doc-title {
              margin: 0;
              font-size: 22px;
              font-weight: 700;
              color: #1e3a8a;
            }
            .doc-number {
              margin-top: 4px;
              font-size: 13px;
              font-weight: 600;
            }
            .section {
              margin-top: 18px;
            }
            .grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 16px;
            }
            .card {
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 14px 16px;
            }
            .card-title {
              margin: 0 0 10px;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              color: #64748b;
            }
            .meta-row {
              display: flex;
              margin-bottom: 6px;
              gap: 10px;
            }
            .meta-key {
              width: 110px;
              color: #64748b;
              flex-shrink: 0;
            }
            .meta-value {
              color: #0f172a;
              font-weight: 500;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 10px;
            }
            th {
              background: #eff6ff;
              color: #1e3a8a;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              border: 1px solid #bfdbfe;
              padding: 10px;
              text-align: left;
            }
            td {
              border: 1px solid #cbd5e1;
              padding: 10px;
              vertical-align: top;
            }
            .text-right { text-align: right; }
            .item-name { font-weight: 600; color: #0f172a; }
            .item-note { margin-top: 4px; color: #64748b; font-size: 11px; }
            .summary-wrap {
              display: flex;
              justify-content: flex-end;
              margin-top: 14px;
            }
            .summary-box {
              width: 320px;
              border: 1px solid #cbd5e1;
              border-radius: 12px;
              overflow: hidden;
            }
            .summary-row {
              display: flex;
              justify-content: space-between;
              padding: 10px 14px;
              border-bottom: 1px solid #e2e8f0;
            }
            .summary-row:last-child { border-bottom: none; }
            .summary-row.total {
              background: #eff6ff;
              font-weight: 700;
              color: #1e3a8a;
            }
            .notes-box {
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 14px 16px;
              min-height: 88px;
              white-space: pre-wrap;
            }
            .terms {
              margin: 0;
              padding-left: 18px;
              color: #334155;
            }
            .terms li { margin-bottom: 6px; }
            .signatures {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 24px;
              margin-top: 26px;
            }
            .sign-box {
              border-top: 1px solid #94a3b8;
              padding-top: 8px;
              min-height: 80px;
            }
            .footer {
              margin-top: 28px;
              padding-top: 12px;
              border-top: 1px dashed #cbd5e1;
              color: #64748b;
              font-size: 11px;
              text-align: center;
            }
            @media print {
              .page { width: auto; }
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="header">
              <div>
                <h1 class="brand-title">${companyProfile.name}</h1>
                <div class="brand-tagline">${companyProfile.tagline}</div>
                <div class="brand-meta">
                  <div>${companyProfile.address}</div>
                  <div>${companyProfile.phone} · ${companyProfile.email}</div>
                </div>
              </div>
              <div class="doc-box">
                <div class="doc-label">Document</div>
                <h2 class="doc-title">Sales Quotation</h2>
                <div class="doc-number">${row.quotationNumber}</div>
              </div>
            </div>

            <div class="section grid">
              <div class="card">
                <h3 class="card-title">Customer</h3>
                <div class="meta-row"><div class="meta-key">Perusahaan</div><div class="meta-value">${row.customer.company}</div></div>
                <div class="meta-row"><div class="meta-key">Status</div><div class="meta-value">${toLabel(row.status)}</div></div>
                <div class="meta-row"><div class="meta-key">Flow</div><div class="meta-value">${toLabel(row.fulfillmentMode)}</div></div>
              </div>
              <div class="card">
                <h3 class="card-title">Quotation Info</h3>
                <div class="meta-row"><div class="meta-key">Issue Date</div><div class="meta-value">${issueDateLabel}</div></div>
                <div class="meta-row"><div class="meta-key">Valid Until</div><div class="meta-value">${validUntilLabel}</div></div>
                <div class="meta-row"><div class="meta-key">Sales Owner</div><div class="meta-value">${row.salesOwnerName ?? "-"}</div></div>
              </div>
            </div>

            <div class="section">
              <div class="card-title">Quotation Lines</div>
              <table>
                <thead>
                  <tr>
                    <th style="width: 44px;">No</th>
                    <th>Item / Description</th>
                    <th style="width: 160px;">Gudang Sale Stock</th>
                    <th style="width: 120px;" class="text-right">Qty</th>
                    <th style="width: 140px;" class="text-right">Unit Price</th>
                    <th style="width: 140px;" class="text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${linesHtml}
                </tbody>
              </table>

              <div class="summary-wrap">
                <div class="summary-box">
                  <div class="summary-row"><span>Subtotal</span><strong>${subtotalLabel}</strong></div>
                  <div class="summary-row"><span>Tax</span><strong>${formatCurrency(0)}</strong></div>
                  <div class="summary-row total"><span>Grand Total</span><strong>${subtotalLabel}</strong></div>
                </div>
              </div>
            </div>

            <div class="section grid">
              <div>
                <div class="card-title">Notes</div>
                <div class="notes-box">${notesLabel}</div>
              </div>
              <div>
                <div class="card-title">Terms & Conditions</div>
                <div class="notes-box">
                  <ol class="terms">
                    <li>Penawaran ini berlaku sampai tanggal <strong>${validUntilLabel}</strong>.</li>
                    <li><strong>Payment Terms:</strong> ${paymentTermsLabel}</li>
                    <li>Ketersediaan barang mengikuti stok <strong>sale stock</strong> pada saat proses sales order.</li>
                    <li>Harga belum termasuk biaya tambahan di luar lingkup quotation, jika ada.</li>
                    <li>Mohon konfirmasi tertulis untuk melanjutkan quotation menjadi sales order.</li>
                  </ol>
                </div>
              </div>
            </div>

            <div class="signatures">
              <div>
                <div class="card-title">Prepared By</div>
                <div class="sign-box">
                  <div><strong>${row.salesOwnerName ?? "Sales Team"}</strong></div>
                  <div style="color:#64748b; margin-top:4px;">Sales Representative</div>
                </div>
              </div>
              <div>
                <div class="card-title">Approved / Accepted By</div>
                <div class="sign-box">
                  <div><strong>${row.customer.company}</strong></div>
                  <div style="color:#64748b; margin-top:4px;">Customer</div>
                </div>
              </div>
            </div>

            <div class="footer">
              ${companyProfile.name} · ${companyProfile.phone} · ${companyProfile.email}
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  async function handleConvert(row: SalesQuotationRecord) {
    const confirmed = window.confirm(`Konversi ${row.quotationNumber} menjadi sales order?`);
    if (!confirmed) return;

    await convertMutation.mutateAsync({
      salesQuotationId: row.id,
      notes: `Auto converted from ${row.quotationNumber}`,
    });
  }

  if (sessionStatus === "loading") {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
        Memuat sesi dan data quotation...
      </div>
    );
  }

  if (sessionStatus !== "authenticated" || !session?.user) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 shadow-sm">
        Sesi login tidak ditemukan. Silakan login ulang untuk mengakses modul quotation.
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-900 shadow-sm">
        Anda tidak memiliki akses untuk melihat quotation penjualan.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quotation"
        description="Quotation penjualan sekarang mengikuti item inventory perusahaan IT dan hanya memakai stok klasifikasi sale stock, bukan temporary stock."
        badge={<Badge variant="success">Live Data</Badge>}
        primaryAction={canWrite ? { label: "Buat Quotation", onClick: openCreateForm } : undefined}
        secondaryAction={{ label: "Kembali ke Penjualan", href: "/penjualan" }}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CrmMetricCard label="Quotation" value={String(rows.length)} helper="Dokumen quotation" />
        <CrmMetricCard label="Sent" value={String(sentCount)} helper="Sudah dikirim" />
        <CrmMetricCard label="Negotiation" value={String(negotiationCount)} helper="Masih dinegosiasikan" />
        <CrmMetricCard label="Approved" value={String(approvedCount)} helper={`${formatCurrency(totalValue)} total`} />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari quotation, customer, atau sales owner"
            className={crmInputClassName}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={crmInputClassName}>
            <option value="">Semua status</option>
            <option value="DRAFT">Draft</option>
            <option value="SENT">Sent</option>
            <option value="NEGOTIATION">Negotiation</option>
            <option value="APPROVED">Approved</option>
            <option value="EXPIRED">Expired</option>
            <option value="REJECTED">Rejected</option>
            <option value="CANCELED">Canceled</option>
          </select>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Monitoring Quotation</h2>
            <p className="text-sm text-gray-500">Aksi quotation sekarang sudah dilengkapi edit, hapus, cetak, dan convert ke sales order.</p>
          </div>

          {query.isLoading ? (
            <div className="p-5 text-sm text-gray-500">Memuat quotation...</div>
          ) : rows.length === 0 ? (
            <div className="p-5">
              <CrmEmptyHint text="Belum ada quotation di database." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Quotation</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Item / Service</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Nilai</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {rows.map((row) => {
                    const hasSalesOrder = Boolean(row.salesOrders?.length);
                    const canConvertRow = canWrite && ["APPROVED", "NEGOTIATION", "SENT", "DRAFT"].includes(row.status) && !hasSalesOrder;
                    const canEditRow = canWrite && !hasSalesOrder;
                    const canDeleteRow = canWrite && !hasSalesOrder;

                    return (
                      <tr key={row.id}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-900">{row.quotationNumber}</p>
                          <p className="text-xs text-gray-500">
                            {formatDate(row.issueDate)} • Valid {row.validUntil ? formatDate(row.validUntil) : "-"}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-gray-900">{summarizeItems(row.lines)}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <p className="text-xs text-gray-500">{row.lines.length} line • {row.salesOwnerName ?? "-"}</p>
                            <BusinessFlowBadge value={row.fulfillmentMode} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{row.customer.company}</td>
                        <td className="px-4 py-3 text-gray-600">{formatCurrency(Number(row.totalAmount ?? 0))}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <Badge variant={toBadge(row.status)}>{toLabel(row.status)}</Badge>
                            {row.salesOrders?.[0] ? <span className="text-xs text-gray-500">SO: {row.salesOrders[0].salesOrderNumber}</span> : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button size="sm" variant="secondary" onClick={() => handlePrint(row)}>
                              Print
                            </Button>
                            <Button size="sm" variant="ghost" disabled={!canEditRow} onClick={() => openEditForm(row)}>
                              Edit
                            </Button>
                            <Button size="sm" variant="destructive" disabled={!canDeleteRow} isLoading={deleteMutation.isPending} onClick={() => void handleDelete(row)}>
                              Hapus
                            </Button>
                            <Button size="sm" disabled={!canConvertRow} isLoading={convertMutation.isPending} onClick={() => void handleConvert(row)}>
                              Convert to SO
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Relasi Dokumen</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-600">
              <li>Quotation terhubung ke customer CRM.</li>
              <li>Item yang tampil di form hanya item yang relevan untuk sale stock atau item non-stock seperti jasa.</li>
              <li>Temporary stock tidak dipakai pada quotation penjualan.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <Link href="/penjualan/sales-order" className="block rounded-lg border border-gray-200 px-4 py-3 transition hover:border-blue-200 hover:bg-blue-50/50">
              <p className="text-sm font-semibold text-gray-900">Sales Order</p>
              <p className="mt-1 text-sm text-gray-600">Lanjutkan quotation barang / jasa menjadi sales order.</p>
            </Link>
          </div>
        </div>
      </div>

      <Modal isOpen={isFormOpen} onClose={resetFormState} title={editingRowId ? "Edit Quotation" : "Buat Quotation Baru"}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Customer">
            <select value={form.customerId} onChange={(e) => setForm((prev) => ({ ...prev, customerId: e.target.value }))} className={crmInputClassName}>
              <option value="">Pilih customer</option>
              {formOptions?.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.company}</option>
              ))}
            </select>
          </Field>

          <Field label="Item Inventory (Sale Stock)">
            <select value={form.inventoryItemId} onChange={(e) => setForm((prev) => ({ ...prev, inventoryItemId: e.target.value }))} className={crmInputClassName}>
              <option value="">Pilih item</option>
              {formOptions?.items.map((item) => (
                <option key={item.id} value={item.id}>{item.sku} · {item.name} · {item.itemType}</option>
              ))}
            </select>
          </Field>

          <Field label="Gudang Sale Stock">
            <select
              value={form.warehouseId}
              onChange={(e) => setForm((prev) => ({ ...prev, warehouseId: e.target.value }))}
              className={crmInputClassName}
              disabled={!selectedItem?.isStockTracked}
            >
              <option value="">{selectedItem?.isStockTracked ? "Pilih gudang sale stock" : "Tidak wajib untuk item jasa"}</option>
              {stockBalances.map((balance) => (
                <option key={balance.warehouseId} value={balance.warehouseId}>
                  {balance.warehouse.code} · {balance.warehouse.name} · stok {balance.availableQty}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Valid Until">
            <input type="date" value={form.validUntil} onChange={(e) => setForm((prev) => ({ ...prev, validUntil: e.target.value }))} className={crmInputClassName} />
          </Field>

          <Field label={`Qty${selectedItem ? ` (${selectedItem.unitOfMeasure})` : ""}`}>
            <input type="number" min="1" max={maxQty ?? undefined} step="1" value={form.qtyQuoted} onChange={(e) => setForm((prev) => ({ ...prev, qtyQuoted: e.target.value }))} className={crmInputClassName} />
          </Field>

          <Field label="Unit Price">
            <input type="number" min="0" step="1000" value={form.unitPrice} onChange={(e) => setForm((prev) => ({ ...prev, unitPrice: e.target.value }))} className={crmInputClassName} />
          </Field>

          <Field label="Deskripsi" className="md:col-span-2">
            <textarea value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} className={`${crmInputClassName} min-h-[88px]`} />
          </Field>

          <Field label="Payment Terms" className="md:col-span-2">
            <textarea value={form.paymentTerms} onChange={(e) => setForm((prev) => ({ ...prev, paymentTerms: e.target.value }))} className={`${crmInputClassName} min-h-[88px]`} />
          </Field>

          <Field label="Catatan" className="md:col-span-2">
            <textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} className={`${crmInputClassName} min-h-[88px]`} />
          </Field>
        </div>

        {selectedItem ? (
          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
            <div className="grid gap-2 md:grid-cols-2">
              <p><span className="font-semibold">Item:</span> {selectedItem.sku} · {selectedItem.name}</p>
              <p><span className="font-semibold">Mode:</span> {toLabel(selectedItem.itemType)}</p>
              <p><span className="font-semibold">Harga default:</span> {formatCurrency(Number(selectedItem.standardCost ?? 0))}</p>
              <p><span className="font-semibold">Stock tracked:</span> {selectedItem.isStockTracked ? "Ya" : "Tidak"}</p>
              <p className="md:col-span-2"><span className="font-semibold">Payment terms:</span> {form.paymentTerms || "-"}</p>
              {selectedItem.isStockTracked ? (
                <p className="md:col-span-2">
                  <span className="font-semibold">Stok sale stock tersedia:</span>{" "}
                  {selectedWarehouseStock
                    ? `${selectedWarehouseStock.availableQty} ${selectedItem.unitOfMeasure} di ${selectedWarehouseStock.warehouse.name}`
                    : "Pilih gudang untuk melihat stok sale stock tersedia."}
                </p>
              ) : (
                <p className="md:col-span-2">Item ini tidak memakai validasi stok fisik, jadi quotation bisa dibuat tanpa gudang.</p>
              )}
            </div>
            <p className="mt-2 text-xs text-blue-700">Gudang, harga, dan deskripsi akan terisi otomatis dari item. Data stok yang dipakai hanya bucket sale stock.</p>
          </div>
        ) : null}

        {stockError ? <p className="mt-3 text-sm font-medium text-red-600">{stockError}</p> : null}

        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
          <div>
            <p className="font-medium text-gray-900">Estimasi total quotation</p>
            <p className="text-gray-500">{qtyNumber || 0} × {formatCurrency(unitPriceNumber || 0)}</p>
          </div>
          <p className="text-base font-semibold text-gray-900">{formatCurrency(estimatedTotal || 0)}</p>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={resetFormState}>Batal</Button>
          <Button
            isLoading={createMutation.isPending || updateMutation.isPending}
            disabled={!form.customerId || !form.inventoryItemId || qtyNumber <= 0 || unitPriceNumber < 0 || Boolean(stockError)}
            onClick={() => void handleSubmitQuotation()}
          >
            {editingRowId ? "Simpan Perubahan" : "Simpan Quotation"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
