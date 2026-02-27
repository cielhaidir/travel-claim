-- AlterTable: add business approval number to Approval
-- Existing rows get a temporary placeholder; the application must back-fill
-- real values before removing the default or enforcing NOT NULL at the DB layer.
-- Because the Prisma schema marks the field @unique and required (non-optional),
-- the migration uses a two-step approach:
--   1. Add the column as nullable.
--   2. Back-fill existing rows with a deterministic temporary value.
--   3. Set the column NOT NULL.

-- Step 1: add nullable column
ALTER TABLE "Approval" ADD COLUMN "approvalNumber" VARCHAR(50);

-- Step 2: back-fill existing rows with a unique placeholder
--   Pattern: APR-0000-<row_number_padded_to_5_digits>
--   This guarantees uniqueness across pre-existing rows.
UPDATE "Approval"
SET "approvalNumber" = CONCAT(
    'APR-0000-',
    LPAD(CAST(ROW_NUMBER() OVER (ORDER BY "createdAt") AS TEXT), 5, '0')
)
WHERE "approvalNumber" IS NULL;

-- Step 3: enforce NOT NULL constraint
ALTER TABLE "Approval" ALTER COLUMN "approvalNumber" SET NOT NULL;

-- CreateIndex: unique constraint
CREATE UNIQUE INDEX "Approval_approvalNumber_key" ON "Approval"("approvalNumber");

-- CreateIndex: lookup index
CREATE INDEX "Approval_approvalNumber_idx" ON "Approval"("approvalNumber");
