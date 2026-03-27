-- Add CRM organization role flags for shared sales/purchases master data
ALTER TABLE "CrmCustomer"
ADD COLUMN "isVendor" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isCustomer" BOOLEAN NOT NULL DEFAULT true;

-- Backfill existing organizations so current CRM master data remains usable
UPDATE "CrmCustomer"
SET "isVendor" = true,
    "isCustomer" = true
WHERE "deletedAt" IS NULL;

CREATE INDEX "CrmCustomer_tenantId_isVendor_idx" ON "CrmCustomer"("tenantId", "isVendor");
CREATE INDEX "CrmCustomer_tenantId_isCustomer_idx" ON "CrmCustomer"("tenantId", "isCustomer");
