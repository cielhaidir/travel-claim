-- CreateEnum
CREATE TYPE "InventoryItemType" AS ENUM ('HARDWARE', 'SOFTWARE_LICENSE', 'SERVICE', 'MANAGED_SERVICE');

-- CreateEnum
CREATE TYPE "BusinessFlowType" AS ENUM ('GOODS', 'SERVICE', 'MIXED');

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "itemType" "InventoryItemType" NOT NULL DEFAULT 'HARDWARE';

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "procurementMode" "BusinessFlowType" NOT NULL DEFAULT 'GOODS',
ADD COLUMN     "requiresReceipt" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "PurchaseRequest" ADD COLUMN     "procurementMode" "BusinessFlowType" NOT NULL DEFAULT 'GOODS';

-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN     "fulfillmentMode" "BusinessFlowType" NOT NULL DEFAULT 'GOODS',
ADD COLUMN     "requiresDelivery" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "SalesQuotation" ADD COLUMN     "fulfillmentMode" "BusinessFlowType" NOT NULL DEFAULT 'GOODS';

-- CreateIndex
CREATE INDEX "PurchaseOrder_procurementMode_idx" ON "PurchaseOrder"("procurementMode");

-- CreateIndex
CREATE INDEX "PurchaseOrder_requiresReceipt_idx" ON "PurchaseOrder"("requiresReceipt");

-- CreateIndex
CREATE INDEX "PurchaseRequest_procurementMode_idx" ON "PurchaseRequest"("procurementMode");

-- CreateIndex
CREATE INDEX "SalesOrder_fulfillmentMode_idx" ON "SalesOrder"("fulfillmentMode");

-- CreateIndex
CREATE INDEX "SalesOrder_requiresDelivery_idx" ON "SalesOrder"("requiresDelivery");

-- CreateIndex
CREATE INDEX "SalesQuotation_fulfillmentMode_idx" ON "SalesQuotation"("fulfillmentMode");
