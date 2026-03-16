-- Phase 2C: tighten tenant ownership and enforce NOT NULL

-- 1) Final backfill guard (in case any rows were inserted after previous migration)
WITH dt AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "UserRole" t SET "tenantId" = dt."id" FROM dt WHERE t."tenantId" IS NULL;

WITH dt AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "Department" t SET "tenantId" = dt."id" FROM dt WHERE t."tenantId" IS NULL;

WITH dt AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "ChartOfAccount" t SET "tenantId" = dt."id" FROM dt WHERE t."tenantId" IS NULL;

WITH dt AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "Project" t SET "tenantId" = dt."id" FROM dt WHERE t."tenantId" IS NULL;

WITH dt AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "TravelRequest" t SET "tenantId" = dt."id" FROM dt WHERE t."tenantId" IS NULL;

WITH dt AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "TravelParticipant" t SET "tenantId" = dt."id" FROM dt WHERE t."tenantId" IS NULL;

WITH dt AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "Bailout" t SET "tenantId" = dt."id" FROM dt WHERE t."tenantId" IS NULL;

WITH dt AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "Approval" t SET "tenantId" = dt."id" FROM dt WHERE t."tenantId" IS NULL;

WITH dt AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "Claim" t SET "tenantId" = dt."id" FROM dt WHERE t."tenantId" IS NULL;

WITH dt AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "Attachment" t SET "tenantId" = dt."id" FROM dt WHERE t."tenantId" IS NULL;

WITH dt AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "Notification" t SET "tenantId" = dt."id" FROM dt WHERE t."tenantId" IS NULL;

WITH dt AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "AuditLog" t SET "tenantId" = dt."id" FROM dt WHERE t."tenantId" IS NULL;

WITH dt AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "BalanceAccount" t SET "tenantId" = dt."id" FROM dt WHERE t."tenantId" IS NULL;

WITH dt AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "JournalTransaction" t SET "tenantId" = dt."id" FROM dt WHERE t."tenantId" IS NULL;

-- 2) Tighten nullability
ALTER TABLE "UserRole" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Department" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ChartOfAccount" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "TravelRequest" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "TravelParticipant" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Bailout" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Approval" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Claim" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Attachment" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Notification" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "AuditLog" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "BalanceAccount" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "JournalTransaction" ALTER COLUMN "tenantId" SET NOT NULL;

-- 3) Tighten FK semantics from SET NULL to RESTRICT/CASCADE-safe behavior
ALTER TABLE "UserRole" DROP CONSTRAINT IF EXISTS "UserRole_tenantId_fkey";
ALTER TABLE "Department" DROP CONSTRAINT IF EXISTS "Department_tenantId_fkey";
ALTER TABLE "ChartOfAccount" DROP CONSTRAINT IF EXISTS "ChartOfAccount_tenantId_fkey";
ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS "Project_tenantId_fkey";
ALTER TABLE "TravelRequest" DROP CONSTRAINT IF EXISTS "TravelRequest_tenantId_fkey";
ALTER TABLE "TravelParticipant" DROP CONSTRAINT IF EXISTS "TravelParticipant_tenantId_fkey";
ALTER TABLE "Bailout" DROP CONSTRAINT IF EXISTS "Bailout_tenantId_fkey";
ALTER TABLE "Approval" DROP CONSTRAINT IF EXISTS "Approval_tenantId_fkey";
ALTER TABLE "Claim" DROP CONSTRAINT IF EXISTS "Claim_tenantId_fkey";
ALTER TABLE "Attachment" DROP CONSTRAINT IF EXISTS "Attachment_tenantId_fkey";
ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_tenantId_fkey";
ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_tenantId_fkey";
ALTER TABLE "BalanceAccount" DROP CONSTRAINT IF EXISTS "BalanceAccount_tenantId_fkey";
ALTER TABLE "JournalTransaction" DROP CONSTRAINT IF EXISTS "JournalTransaction_tenantId_fkey";

ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Department" ADD CONSTRAINT "Department_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TravelRequest" ADD CONSTRAINT "TravelRequest_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TravelParticipant" ADD CONSTRAINT "TravelParticipant_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Bailout" ADD CONSTRAINT "Bailout_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BalanceAccount" ADD CONSTRAINT "BalanceAccount_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalTransaction" ADD CONSTRAINT "JournalTransaction_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
