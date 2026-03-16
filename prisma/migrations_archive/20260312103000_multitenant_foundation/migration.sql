-- Multi-tenant foundation: root role, tenants, memberships, and tenant scoping columns

-- 1) Extend Role enum with ROOT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'Role' AND e.enumlabel = 'ROOT'
  ) THEN
    ALTER TYPE "Role" ADD VALUE 'ROOT';
  END IF;
END $$;

-- 2) Create MembershipStatus enum if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MembershipStatus') THEN
    CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED');
  END IF;
END $$;

-- 3) Create Tenant table
CREATE TABLE IF NOT EXISTS "Tenant" (
  "id" TEXT NOT NULL,
  "slug" VARCHAR(100) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "isRoot" BOOLEAN NOT NULL DEFAULT false,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_slug_key" ON "Tenant"("slug");
CREATE INDEX IF NOT EXISTS "Tenant_isRoot_idx" ON "Tenant"("isRoot");

-- 4) Create TenantMembership table
CREATE TABLE IF NOT EXISTS "TenantMembership" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
  "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "invitedAt" TIMESTAMP(3),
  "activatedAt" TIMESTAMP(3),
  "suspendedAt" TIMESTAMP(3),
  "suspendedReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TenantMembership_userId_tenantId_key" ON "TenantMembership"("userId", "tenantId");
CREATE INDEX IF NOT EXISTS "TenantMembership_tenantId_role_idx" ON "TenantMembership"("tenantId", "role");
CREATE INDEX IF NOT EXISTS "TenantMembership_userId_isDefault_idx" ON "TenantMembership"("userId", "isDefault");
CREATE INDEX IF NOT EXISTS "TenantMembership_status_idx" ON "TenantMembership"("status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TenantMembership_userId_fkey'
  ) THEN
    ALTER TABLE "TenantMembership"
      ADD CONSTRAINT "TenantMembership_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TenantMembership_tenantId_fkey'
  ) THEN
    ALTER TABLE "TenantMembership"
      ADD CONSTRAINT "TenantMembership_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 5) Ensure UserRole exists for databases created from older migrations
CREATE TABLE IF NOT EXISTS "UserRole" (
  "userId" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  "tenantId" TEXT,
  CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId", "role")
);

CREATE INDEX IF NOT EXISTS "UserRole_role_idx" ON "UserRole"("role");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserRole_userId_fkey'
  ) THEN
    ALTER TABLE "UserRole"
      ADD CONSTRAINT "UserRole_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 6) Add tenantId columns (nullable during expansion phase)
ALTER TABLE "UserRole" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "TravelRequest" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "TravelParticipant" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Bailout" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Approval" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Claim" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ChartOfAccount" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "BalanceAccount" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "JournalTransaction" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- 6) Add tenant indexes
CREATE INDEX IF NOT EXISTS "UserRole_tenantId_idx" ON "UserRole"("tenantId");
CREATE INDEX IF NOT EXISTS "Department_tenantId_idx" ON "Department"("tenantId");
CREATE INDEX IF NOT EXISTS "Project_tenantId_idx" ON "Project"("tenantId");
CREATE INDEX IF NOT EXISTS "TravelRequest_tenantId_idx" ON "TravelRequest"("tenantId");
CREATE INDEX IF NOT EXISTS "TravelParticipant_tenantId_idx" ON "TravelParticipant"("tenantId");
CREATE INDEX IF NOT EXISTS "Bailout_tenantId_idx" ON "Bailout"("tenantId");
CREATE INDEX IF NOT EXISTS "Approval_tenantId_idx" ON "Approval"("tenantId");
CREATE INDEX IF NOT EXISTS "Claim_tenantId_idx" ON "Claim"("tenantId");
CREATE INDEX IF NOT EXISTS "Attachment_tenantId_idx" ON "Attachment"("tenantId");
CREATE INDEX IF NOT EXISTS "Notification_tenantId_idx" ON "Notification"("tenantId");
CREATE INDEX IF NOT EXISTS "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");
CREATE INDEX IF NOT EXISTS "ChartOfAccount_tenantId_idx" ON "ChartOfAccount"("tenantId");
CREATE INDEX IF NOT EXISTS "BalanceAccount_tenantId_idx" ON "BalanceAccount"("tenantId");
CREATE INDEX IF NOT EXISTS "JournalTransaction_tenantId_idx" ON "JournalTransaction"("tenantId");

-- 7) Add tenant FKs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserRole_tenantId_fkey') THEN
    ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Department_tenantId_fkey') THEN
    ALTER TABLE "Department" ADD CONSTRAINT "Department_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_tenantId_fkey') THEN
    ALTER TABLE "Project" ADD CONSTRAINT "Project_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TravelRequest_tenantId_fkey') THEN
    ALTER TABLE "TravelRequest" ADD CONSTRAINT "TravelRequest_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TravelParticipant_tenantId_fkey') THEN
    ALTER TABLE "TravelParticipant" ADD CONSTRAINT "TravelParticipant_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Bailout_tenantId_fkey') THEN
    ALTER TABLE "Bailout" ADD CONSTRAINT "Bailout_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Approval_tenantId_fkey') THEN
    ALTER TABLE "Approval" ADD CONSTRAINT "Approval_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Claim_tenantId_fkey') THEN
    ALTER TABLE "Claim" ADD CONSTRAINT "Claim_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Attachment_tenantId_fkey') THEN
    ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_tenantId_fkey') THEN
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_tenantId_fkey') THEN
    ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChartOfAccount_tenantId_fkey') THEN
    ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BalanceAccount_tenantId_fkey') THEN
    ALTER TABLE "BalanceAccount" ADD CONSTRAINT "BalanceAccount_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JournalTransaction_tenantId_fkey') THEN
    ALTER TABLE "JournalTransaction" ADD CONSTRAINT "JournalTransaction_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 8) Bootstrap root/default tenants and backfill tenantId values
INSERT INTO "Tenant" ("id", "slug", "name", "isRoot", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'root', 'Root Tenant', true, NOW(), NOW())
ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name", "isRoot" = true, "updatedAt" = NOW();

INSERT INTO "Tenant" ("id", "slug", "name", "isRoot", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'default', 'Default Tenant', false, NOW(), NOW())
ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name", "updatedAt" = NOW();

WITH default_tenant AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "Department" d
SET "tenantId" = dt."id"
FROM default_tenant dt
WHERE d."tenantId" IS NULL;

WITH default_tenant AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "Project" p
SET "tenantId" = dt."id"
FROM default_tenant dt
WHERE p."tenantId" IS NULL;

WITH default_tenant AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "TravelRequest" tr
SET "tenantId" = dt."id"
FROM default_tenant dt
WHERE tr."tenantId" IS NULL;

WITH default_tenant AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "TravelParticipant" tp
SET "tenantId" = dt."id"
FROM default_tenant dt
WHERE tp."tenantId" IS NULL;

WITH default_tenant AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "Bailout" b
SET "tenantId" = dt."id"
FROM default_tenant dt
WHERE b."tenantId" IS NULL;

WITH default_tenant AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "Approval" a
SET "tenantId" = dt."id"
FROM default_tenant dt
WHERE a."tenantId" IS NULL;

WITH default_tenant AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "Claim" c
SET "tenantId" = dt."id"
FROM default_tenant dt
WHERE c."tenantId" IS NULL;

WITH default_tenant AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "Attachment" a
SET "tenantId" = dt."id"
FROM default_tenant dt
WHERE a."tenantId" IS NULL;

WITH default_tenant AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "Notification" n
SET "tenantId" = dt."id"
FROM default_tenant dt
WHERE n."tenantId" IS NULL;

WITH default_tenant AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "AuditLog" al
SET "tenantId" = dt."id"
FROM default_tenant dt
WHERE al."tenantId" IS NULL;

WITH default_tenant AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "ChartOfAccount" coa
SET "tenantId" = dt."id"
FROM default_tenant dt
WHERE coa."tenantId" IS NULL;

WITH default_tenant AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "BalanceAccount" ba
SET "tenantId" = dt."id"
FROM default_tenant dt
WHERE ba."tenantId" IS NULL;

WITH default_tenant AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "JournalTransaction" jt
SET "tenantId" = dt."id"
FROM default_tenant dt
WHERE jt."tenantId" IS NULL;

WITH default_tenant AS (
  SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1
)
UPDATE "UserRole" ur
SET "tenantId" = dt."id"
FROM default_tenant dt
WHERE ur."tenantId" IS NULL;

-- 9) Create membership rows for existing users in default tenant
INSERT INTO "TenantMembership" (
  "id", "userId", "tenantId", "role", "status", "isDefault", "createdAt", "updatedAt", "activatedAt"
)
SELECT
  gen_random_uuid()::text,
  u."id",
  dt."id",
  COALESCE(u."role", 'EMPLOYEE'::"Role"),
  'ACTIVE'::"MembershipStatus",
  true,
  NOW(),
  NOW(),
  NOW()
FROM "User" u
CROSS JOIN (SELECT "id" FROM "Tenant" WHERE "slug" = 'default' LIMIT 1) dt
ON CONFLICT ("userId", "tenantId") DO UPDATE
SET "status" = 'ACTIVE', "isDefault" = true, "updatedAt" = NOW();

-- 10) Ensure root-role users also have root tenant membership
INSERT INTO "TenantMembership" (
  "id", "userId", "tenantId", "role", "status", "isDefault", "createdAt", "updatedAt", "activatedAt"
)
SELECT
  gen_random_uuid()::text,
  u."id",
  rt."id",
  'ROOT'::"Role",
  'ACTIVE'::"MembershipStatus",
  false,
  NOW(),
  NOW(),
  NOW()
FROM "User" u
CROSS JOIN (SELECT "id" FROM "Tenant" WHERE "slug" = 'root' LIMIT 1) rt
WHERE u."role" = 'ROOT'::"Role"
ON CONFLICT ("userId", "tenantId") DO UPDATE
SET "role" = 'ROOT', "status" = 'ACTIVE', "updatedAt" = NOW();
