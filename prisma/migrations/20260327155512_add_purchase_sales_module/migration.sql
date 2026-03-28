-- CreateEnum
CREATE TYPE "PurchaseRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CONVERTED', 'CLOSED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIAL_RECEIPT', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "GoodsReceiptStatus" AS ENUM ('DRAFT', 'PARTIAL', 'RECEIVED', 'QC_HOLD', 'CANCELED');

-- CreateEnum
CREATE TYPE "VendorInvoiceStatus" AS ENUM ('DRAFT', 'WAITING_MATCH', 'MATCHED', 'DISPUTE', 'READY_TO_PAY', 'PAID', 'CANCELED');

-- CreateEnum
CREATE TYPE "VendorInvoiceMatchType" AS ENUM ('TWO_WAY', 'THREE_WAY');

-- CreateEnum
CREATE TYPE "SalesQuotationStatus" AS ENUM ('DRAFT', 'SENT', 'NEGOTIATION', 'APPROVED', 'EXPIRED', 'REJECTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'READY_TO_SHIP', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CLOSED', 'CANCELED');

-- CreateEnum
CREATE TYPE "DeliveryOrderStatus" AS ENUM ('DRAFT', 'READY', 'IN_TRANSIT', 'DELIVERED', 'RETURNED', 'CANCELED');

-- CreateEnum
CREATE TYPE "SalesInvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELED');

-- CreateTable
CREATE TABLE "PurchaseRequest" (
    "id" TEXT NOT NULL,
    "requestNumber" VARCHAR(50) NOT NULL,
    "vendorId" TEXT,
    "requesterId" TEXT,
    "requesterName" VARCHAR(150),
    "departmentId" TEXT,
    "departmentName" VARCHAR(150),
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "neededDate" TIMESTAMP(3),
    "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" VARCHAR(30),
    "budgetType" VARCHAR(30),
    "subtotalAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequestLine" (
    "id" TEXT NOT NULL,
    "purchaseRequestId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "warehouseId" TEXT,
    "lineNumber" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "qtyRequested" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "qtyOrdered" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "unitPriceEstimate" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "lineTotalEstimate" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "neededDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseRequestLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" VARCHAR(50) NOT NULL,
    "purchaseRequestId" TEXT,
    "vendorId" TEXT NOT NULL,
    "buyerId" TEXT,
    "buyerName" VARCHAR(150),
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDate" TIMESTAMP(3),
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotalAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "issuedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "purchaseRequestLineId" TEXT,
    "inventoryItemId" TEXT,
    "warehouseId" TEXT,
    "lineNumber" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "qtyOrdered" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "qtyReceived" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "qtyInvoiced" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceipt" (
    "id" TEXT NOT NULL,
    "receiptNumber" VARCHAR(50) NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "receiptDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "GoodsReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "receivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceiptLine" (
    "id" TEXT NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT,
    "inventoryItemId" TEXT,
    "warehouseId" TEXT,
    "receiptBatchId" TEXT,
    "lineNumber" INTEGER NOT NULL DEFAULT 1,
    "qtyOrdered" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "qtyReceived" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "qtyAccepted" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "qtyRejected" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoodsReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorInvoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" VARCHAR(50) NOT NULL,
    "vendorId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "goodsReceiptId" TEXT,
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "status" "VendorInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "matchType" "VendorInvoiceMatchType" NOT NULL DEFAULT 'THREE_WAY',
    "subtotalAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "matchedAt" TIMESTAMP(3),
    "readyToPayAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorInvoiceLine" (
    "id" TEXT NOT NULL,
    "vendorInvoiceId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT,
    "goodsReceiptLineId" TEXT,
    "inventoryItemId" TEXT,
    "lineNumber" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "qtyBilled" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesQuotation" (
    "id" TEXT NOT NULL,
    "quotationNumber" VARCHAR(50) NOT NULL,
    "customerId" TEXT NOT NULL,
    "salesOwnerId" TEXT,
    "salesOwnerName" VARCHAR(150),
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "status" "SalesQuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotalAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "approvedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesQuotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesQuotationLine" (
    "id" TEXT NOT NULL,
    "salesQuotationId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "warehouseId" TEXT,
    "lineNumber" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "qtyQuoted" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesQuotationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" TEXT NOT NULL,
    "salesOrderNumber" VARCHAR(50) NOT NULL,
    "quotationId" TEXT,
    "customerId" TEXT NOT NULL,
    "salesOwnerId" TEXT,
    "salesOwnerName" VARCHAR(150),
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plannedShipDate" TIMESTAMP(3),
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotalAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderLine" (
    "id" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "salesQuotationLineId" TEXT,
    "inventoryItemId" TEXT,
    "warehouseId" TEXT,
    "lineNumber" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "qtyOrdered" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "qtyDelivered" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "qtyInvoiced" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryOrder" (
    "id" TEXT NOT NULL,
    "deliveryOrderNumber" VARCHAR(50) NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "shipDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "status" "DeliveryOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "carrierName" VARCHAR(150),
    "trackingNumber" VARCHAR(100),
    "destinationAddress" TEXT,
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryOrderLine" (
    "id" TEXT NOT NULL,
    "deliveryOrderId" TEXT NOT NULL,
    "salesOrderLineId" TEXT,
    "inventoryItemId" TEXT,
    "warehouseId" TEXT,
    "lineNumber" INTEGER NOT NULL DEFAULT 1,
    "qtyOrdered" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "qtyShipped" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "qtyDelivered" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInvoice" (
    "id" TEXT NOT NULL,
    "salesInvoiceNumber" VARCHAR(50) NOT NULL,
    "customerId" TEXT NOT NULL,
    "salesOrderId" TEXT,
    "deliveryOrderId" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "status" "SalesInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotalAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInvoiceLine" (
    "id" TEXT NOT NULL,
    "salesInvoiceId" TEXT NOT NULL,
    "salesOrderLineId" TEXT,
    "deliveryOrderLineId" TEXT,
    "inventoryItemId" TEXT,
    "lineNumber" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "qtyInvoiced" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequest_requestNumber_key" ON "PurchaseRequest"("requestNumber");

-- CreateIndex
CREATE INDEX "PurchaseRequest_requestNumber_idx" ON "PurchaseRequest"("requestNumber");

-- CreateIndex
CREATE INDEX "PurchaseRequest_vendorId_idx" ON "PurchaseRequest"("vendorId");

-- CreateIndex
CREATE INDEX "PurchaseRequest_departmentId_idx" ON "PurchaseRequest"("departmentId");

-- CreateIndex
CREATE INDEX "PurchaseRequest_status_idx" ON "PurchaseRequest"("status");

-- CreateIndex
CREATE INDEX "PurchaseRequest_neededDate_idx" ON "PurchaseRequest"("neededDate");

-- CreateIndex
CREATE INDEX "PurchaseRequest_deletedAt_idx" ON "PurchaseRequest"("deletedAt");

-- CreateIndex
CREATE INDEX "PurchaseRequestLine_purchaseRequestId_idx" ON "PurchaseRequestLine"("purchaseRequestId");

-- CreateIndex
CREATE INDEX "PurchaseRequestLine_inventoryItemId_idx" ON "PurchaseRequestLine"("inventoryItemId");

-- CreateIndex
CREATE INDEX "PurchaseRequestLine_warehouseId_idx" ON "PurchaseRequestLine"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_orderNumber_key" ON "PurchaseOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrder_orderNumber_idx" ON "PurchaseOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrder_purchaseRequestId_idx" ON "PurchaseOrder"("purchaseRequestId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_vendorId_idx" ON "PurchaseOrder"("vendorId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_orderDate_idx" ON "PurchaseOrder"("orderDate");

-- CreateIndex
CREATE INDEX "PurchaseOrder_deletedAt_idx" ON "PurchaseOrder"("deletedAt");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_purchaseOrderId_idx" ON "PurchaseOrderLine"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_purchaseRequestLineId_idx" ON "PurchaseOrderLine"("purchaseRequestLineId");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_inventoryItemId_idx" ON "PurchaseOrderLine"("inventoryItemId");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_warehouseId_idx" ON "PurchaseOrderLine"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceipt_receiptNumber_key" ON "GoodsReceipt"("receiptNumber");

-- CreateIndex
CREATE INDEX "GoodsReceipt_receiptNumber_idx" ON "GoodsReceipt"("receiptNumber");

-- CreateIndex
CREATE INDEX "GoodsReceipt_purchaseOrderId_idx" ON "GoodsReceipt"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "GoodsReceipt_vendorId_idx" ON "GoodsReceipt"("vendorId");

-- CreateIndex
CREATE INDEX "GoodsReceipt_warehouseId_idx" ON "GoodsReceipt"("warehouseId");

-- CreateIndex
CREATE INDEX "GoodsReceipt_status_idx" ON "GoodsReceipt"("status");

-- CreateIndex
CREATE INDEX "GoodsReceipt_receiptDate_idx" ON "GoodsReceipt"("receiptDate");

-- CreateIndex
CREATE INDEX "GoodsReceipt_deletedAt_idx" ON "GoodsReceipt"("deletedAt");

-- CreateIndex
CREATE INDEX "GoodsReceiptLine_goodsReceiptId_idx" ON "GoodsReceiptLine"("goodsReceiptId");

-- CreateIndex
CREATE INDEX "GoodsReceiptLine_purchaseOrderLineId_idx" ON "GoodsReceiptLine"("purchaseOrderLineId");

-- CreateIndex
CREATE INDEX "GoodsReceiptLine_inventoryItemId_idx" ON "GoodsReceiptLine"("inventoryItemId");

-- CreateIndex
CREATE INDEX "GoodsReceiptLine_warehouseId_idx" ON "GoodsReceiptLine"("warehouseId");

-- CreateIndex
CREATE INDEX "GoodsReceiptLine_receiptBatchId_idx" ON "GoodsReceiptLine"("receiptBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorInvoice_invoiceNumber_key" ON "VendorInvoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "VendorInvoice_invoiceNumber_idx" ON "VendorInvoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "VendorInvoice_vendorId_idx" ON "VendorInvoice"("vendorId");

-- CreateIndex
CREATE INDEX "VendorInvoice_purchaseOrderId_idx" ON "VendorInvoice"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "VendorInvoice_goodsReceiptId_idx" ON "VendorInvoice"("goodsReceiptId");

-- CreateIndex
CREATE INDEX "VendorInvoice_status_idx" ON "VendorInvoice"("status");

-- CreateIndex
CREATE INDEX "VendorInvoice_invoiceDate_idx" ON "VendorInvoice"("invoiceDate");

-- CreateIndex
CREATE INDEX "VendorInvoice_dueDate_idx" ON "VendorInvoice"("dueDate");

-- CreateIndex
CREATE INDEX "VendorInvoice_deletedAt_idx" ON "VendorInvoice"("deletedAt");

-- CreateIndex
CREATE INDEX "VendorInvoiceLine_vendorInvoiceId_idx" ON "VendorInvoiceLine"("vendorInvoiceId");

-- CreateIndex
CREATE INDEX "VendorInvoiceLine_purchaseOrderLineId_idx" ON "VendorInvoiceLine"("purchaseOrderLineId");

-- CreateIndex
CREATE INDEX "VendorInvoiceLine_goodsReceiptLineId_idx" ON "VendorInvoiceLine"("goodsReceiptLineId");

-- CreateIndex
CREATE INDEX "VendorInvoiceLine_inventoryItemId_idx" ON "VendorInvoiceLine"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesQuotation_quotationNumber_key" ON "SalesQuotation"("quotationNumber");

-- CreateIndex
CREATE INDEX "SalesQuotation_quotationNumber_idx" ON "SalesQuotation"("quotationNumber");

-- CreateIndex
CREATE INDEX "SalesQuotation_customerId_idx" ON "SalesQuotation"("customerId");

-- CreateIndex
CREATE INDEX "SalesQuotation_status_idx" ON "SalesQuotation"("status");

-- CreateIndex
CREATE INDEX "SalesQuotation_issueDate_idx" ON "SalesQuotation"("issueDate");

-- CreateIndex
CREATE INDEX "SalesQuotation_validUntil_idx" ON "SalesQuotation"("validUntil");

-- CreateIndex
CREATE INDEX "SalesQuotation_deletedAt_idx" ON "SalesQuotation"("deletedAt");

-- CreateIndex
CREATE INDEX "SalesQuotationLine_salesQuotationId_idx" ON "SalesQuotationLine"("salesQuotationId");

-- CreateIndex
CREATE INDEX "SalesQuotationLine_inventoryItemId_idx" ON "SalesQuotationLine"("inventoryItemId");

-- CreateIndex
CREATE INDEX "SalesQuotationLine_warehouseId_idx" ON "SalesQuotationLine"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_salesOrderNumber_key" ON "SalesOrder"("salesOrderNumber");

-- CreateIndex
CREATE INDEX "SalesOrder_salesOrderNumber_idx" ON "SalesOrder"("salesOrderNumber");

-- CreateIndex
CREATE INDEX "SalesOrder_quotationId_idx" ON "SalesOrder"("quotationId");

-- CreateIndex
CREATE INDEX "SalesOrder_customerId_idx" ON "SalesOrder"("customerId");

-- CreateIndex
CREATE INDEX "SalesOrder_status_idx" ON "SalesOrder"("status");

-- CreateIndex
CREATE INDEX "SalesOrder_orderDate_idx" ON "SalesOrder"("orderDate");

-- CreateIndex
CREATE INDEX "SalesOrder_plannedShipDate_idx" ON "SalesOrder"("plannedShipDate");

-- CreateIndex
CREATE INDEX "SalesOrder_deletedAt_idx" ON "SalesOrder"("deletedAt");

-- CreateIndex
CREATE INDEX "SalesOrderLine_salesOrderId_idx" ON "SalesOrderLine"("salesOrderId");

-- CreateIndex
CREATE INDEX "SalesOrderLine_salesQuotationLineId_idx" ON "SalesOrderLine"("salesQuotationLineId");

-- CreateIndex
CREATE INDEX "SalesOrderLine_inventoryItemId_idx" ON "SalesOrderLine"("inventoryItemId");

-- CreateIndex
CREATE INDEX "SalesOrderLine_warehouseId_idx" ON "SalesOrderLine"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrder_deliveryOrderNumber_key" ON "DeliveryOrder"("deliveryOrderNumber");

-- CreateIndex
CREATE INDEX "DeliveryOrder_deliveryOrderNumber_idx" ON "DeliveryOrder"("deliveryOrderNumber");

-- CreateIndex
CREATE INDEX "DeliveryOrder_salesOrderId_idx" ON "DeliveryOrder"("salesOrderId");

-- CreateIndex
CREATE INDEX "DeliveryOrder_customerId_idx" ON "DeliveryOrder"("customerId");

-- CreateIndex
CREATE INDEX "DeliveryOrder_warehouseId_idx" ON "DeliveryOrder"("warehouseId");

-- CreateIndex
CREATE INDEX "DeliveryOrder_status_idx" ON "DeliveryOrder"("status");

-- CreateIndex
CREATE INDEX "DeliveryOrder_shipDate_idx" ON "DeliveryOrder"("shipDate");

-- CreateIndex
CREATE INDEX "DeliveryOrder_deletedAt_idx" ON "DeliveryOrder"("deletedAt");

-- CreateIndex
CREATE INDEX "DeliveryOrderLine_deliveryOrderId_idx" ON "DeliveryOrderLine"("deliveryOrderId");

-- CreateIndex
CREATE INDEX "DeliveryOrderLine_salesOrderLineId_idx" ON "DeliveryOrderLine"("salesOrderLineId");

-- CreateIndex
CREATE INDEX "DeliveryOrderLine_inventoryItemId_idx" ON "DeliveryOrderLine"("inventoryItemId");

-- CreateIndex
CREATE INDEX "DeliveryOrderLine_warehouseId_idx" ON "DeliveryOrderLine"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoice_salesInvoiceNumber_key" ON "SalesInvoice"("salesInvoiceNumber");

-- CreateIndex
CREATE INDEX "SalesInvoice_salesInvoiceNumber_idx" ON "SalesInvoice"("salesInvoiceNumber");

-- CreateIndex
CREATE INDEX "SalesInvoice_customerId_idx" ON "SalesInvoice"("customerId");

-- CreateIndex
CREATE INDEX "SalesInvoice_salesOrderId_idx" ON "SalesInvoice"("salesOrderId");

-- CreateIndex
CREATE INDEX "SalesInvoice_deliveryOrderId_idx" ON "SalesInvoice"("deliveryOrderId");

-- CreateIndex
CREATE INDEX "SalesInvoice_status_idx" ON "SalesInvoice"("status");

-- CreateIndex
CREATE INDEX "SalesInvoice_issueDate_idx" ON "SalesInvoice"("issueDate");

-- CreateIndex
CREATE INDEX "SalesInvoice_dueDate_idx" ON "SalesInvoice"("dueDate");

-- CreateIndex
CREATE INDEX "SalesInvoice_deletedAt_idx" ON "SalesInvoice"("deletedAt");

-- CreateIndex
CREATE INDEX "SalesInvoiceLine_salesInvoiceId_idx" ON "SalesInvoiceLine"("salesInvoiceId");

-- CreateIndex
CREATE INDEX "SalesInvoiceLine_salesOrderLineId_idx" ON "SalesInvoiceLine"("salesOrderLineId");

-- CreateIndex
CREATE INDEX "SalesInvoiceLine_deliveryOrderLineId_idx" ON "SalesInvoiceLine"("deliveryOrderLineId");

-- CreateIndex
CREATE INDEX "SalesInvoiceLine_inventoryItemId_idx" ON "SalesInvoiceLine"("inventoryItemId");

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "CrmCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequestLine" ADD CONSTRAINT "PurchaseRequestLine_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequestLine" ADD CONSTRAINT "PurchaseRequestLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequestLine" ADD CONSTRAINT "PurchaseRequestLine_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "CrmCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseRequestLineId_fkey" FOREIGN KEY ("purchaseRequestLineId") REFERENCES "PurchaseRequestLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "CrmCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_receiptBatchId_fkey" FOREIGN KEY ("receiptBatchId") REFERENCES "InventoryReceiptBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorInvoice" ADD CONSTRAINT "VendorInvoice_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "CrmCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorInvoice" ADD CONSTRAINT "VendorInvoice_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorInvoice" ADD CONSTRAINT "VendorInvoice_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorInvoiceLine" ADD CONSTRAINT "VendorInvoiceLine_vendorInvoiceId_fkey" FOREIGN KEY ("vendorInvoiceId") REFERENCES "VendorInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorInvoiceLine" ADD CONSTRAINT "VendorInvoiceLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorInvoiceLine" ADD CONSTRAINT "VendorInvoiceLine_goodsReceiptLineId_fkey" FOREIGN KEY ("goodsReceiptLineId") REFERENCES "GoodsReceiptLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorInvoiceLine" ADD CONSTRAINT "VendorInvoiceLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesQuotation" ADD CONSTRAINT "SalesQuotation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CrmCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesQuotationLine" ADD CONSTRAINT "SalesQuotationLine_salesQuotationId_fkey" FOREIGN KEY ("salesQuotationId") REFERENCES "SalesQuotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesQuotationLine" ADD CONSTRAINT "SalesQuotationLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesQuotationLine" ADD CONSTRAINT "SalesQuotationLine_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "SalesQuotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CrmCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_salesQuotationLineId_fkey" FOREIGN KEY ("salesQuotationLineId") REFERENCES "SalesQuotationLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CrmCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrderLine" ADD CONSTRAINT "DeliveryOrderLine_deliveryOrderId_fkey" FOREIGN KEY ("deliveryOrderId") REFERENCES "DeliveryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrderLine" ADD CONSTRAINT "DeliveryOrderLine_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "SalesOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrderLine" ADD CONSTRAINT "DeliveryOrderLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrderLine" ADD CONSTRAINT "DeliveryOrderLine_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CrmCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_deliveryOrderId_fkey" FOREIGN KEY ("deliveryOrderId") REFERENCES "DeliveryOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "SalesOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_deliveryOrderLineId_fkey" FOREIGN KEY ("deliveryOrderLineId") REFERENCES "DeliveryOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
