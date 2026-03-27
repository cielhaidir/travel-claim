BEGIN;

-- 1. Create InventoryReceiptBatch table if not exists
CREATE TABLE IF NOT EXISTS "InventoryReceiptBatch" (
  "id" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "bucketType" "InventoryBucketType" NOT NULL DEFAULT 'SALE_STOCK',
  "vendorName" VARCHAR(150),
  "vendorReference" VARCHAR(100),
  "batchNumber" VARCHAR(100),
  "unitCost" DECIMAL(15,2),
  "receivedQty" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "remainingQty" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "receivedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "referenceType" VARCHAR(50),
  "referenceId" VARCHAR(100),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InventoryReceiptBatch_pkey" PRIMARY KEY ("id")
);

-- 2. Add receiptBatchId to InventoryItemUnit if not exists
ALTER TABLE "InventoryItemUnit"
ADD COLUMN IF NOT EXISTS "receiptBatchId" TEXT;

-- 3. Indexes for InventoryReceiptBatch
CREATE INDEX IF NOT EXISTS "InventoryReceiptBatch_inventoryItemId_idx"
  ON "InventoryReceiptBatch" ("inventoryItemId");

CREATE INDEX IF NOT EXISTS "InventoryReceiptBatch_warehouseId_idx"
  ON "InventoryReceiptBatch" ("warehouseId");

CREATE INDEX IF NOT EXISTS "InventoryReceiptBatch_bucketType_idx"
  ON "InventoryReceiptBatch" ("bucketType");

CREATE INDEX IF NOT EXISTS "InventoryReceiptBatch_batchNumber_idx"
  ON "InventoryReceiptBatch" ("batchNumber");

CREATE INDEX IF NOT EXISTS "InventoryReceiptBatch_vendorName_idx"
  ON "InventoryReceiptBatch" ("vendorName");

CREATE INDEX IF NOT EXISTS "InventoryReceiptBatch_receivedDate_idx"
  ON "InventoryReceiptBatch" ("receivedDate");

-- 4. Index for InventoryItemUnit.receiptBatchId
CREATE INDEX IF NOT EXISTS "InventoryItemUnit_receiptBatchId_idx"
  ON "InventoryItemUnit" ("receiptBatchId");

-- 5. Foreign keys (only create if not already there)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'InventoryReceiptBatch_inventoryItemId_fkey'
  ) THEN
    ALTER TABLE "InventoryReceiptBatch"
    ADD CONSTRAINT "InventoryReceiptBatch_inventoryItemId_fkey"
    FOREIGN KEY ("inventoryItemId")
    REFERENCES "InventoryItem"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'InventoryReceiptBatch_warehouseId_fkey'
  ) THEN
    ALTER TABLE "InventoryReceiptBatch"
    ADD CONSTRAINT "InventoryReceiptBatch_warehouseId_fkey"
    FOREIGN KEY ("warehouseId")
    REFERENCES "Warehouse"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'InventoryItemUnit_receiptBatchId_fkey'
  ) THEN
    ALTER TABLE "InventoryItemUnit"
    ADD CONSTRAINT "InventoryItemUnit_receiptBatchId_fkey"
    FOREIGN KEY ("receiptBatchId")
    REFERENCES "InventoryReceiptBatch"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
