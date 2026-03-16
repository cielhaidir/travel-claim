-- Migration: Add financeId and storageUrl to Bailout table
-- This allows Finance to track who processed each disbursement
-- and attach proof of transfer documents.

-- Step 1: Add storageUrl column (proof of transfer / receipt)
ALTER TABLE "Bailout"
  ADD COLUMN "storageUrl" TEXT;

-- Step 2: Add financeId column (which Finance user processed the disbursement)
ALTER TABLE "Bailout"
  ADD COLUMN "financeId" VARCHAR(100);

-- Step 3: Add foreign key constraint from Bailout.financeId → User.id
ALTER TABLE "Bailout"
  ADD CONSTRAINT "Bailout_financeId_fkey"
  FOREIGN KEY ("financeId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 4: Add index for financeId lookups
CREATE INDEX "Bailout_financeId_idx" ON "Bailout"("financeId");
