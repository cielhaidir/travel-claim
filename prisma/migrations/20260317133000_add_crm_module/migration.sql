-- Create CRM enums
CREATE TYPE "CrmLeadStage" AS ENUM ('NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST');
CREATE TYPE "CrmLeadPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "CrmLeadSource" AS ENUM ('REFERRAL', 'WEBSITE', 'EVENT', 'OUTBOUND', 'PARTNER');
CREATE TYPE "CrmCustomerSegment" AS ENUM ('ENTERPRISE', 'SMB', 'GOVERNMENT', 'EDUCATION');
CREATE TYPE "CrmCustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'VIP');
CREATE TYPE "CrmActivityType" AS ENUM ('CALL', 'MEETING', 'EMAIL', 'FOLLOW_UP');

-- Create CRM customer table
CREATE TABLE "CrmCustomer" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "name" VARCHAR(150) NOT NULL,
  "company" VARCHAR(200) NOT NULL,
  "email" VARCHAR(200) NOT NULL,
  "phone" VARCHAR(30),
  "segment" "CrmCustomerSegment" NOT NULL,
  "city" VARCHAR(100),
  "ownerName" VARCHAR(150) NOT NULL,
  "status" "CrmCustomerStatus" NOT NULL DEFAULT 'ACTIVE',
  "totalValue" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "lastContactAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmCustomer_pkey" PRIMARY KEY ("id")
);

-- Create CRM lead table
CREATE TABLE "CrmLead" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "customerId" TEXT,
  "name" VARCHAR(150) NOT NULL,
  "company" VARCHAR(200) NOT NULL,
  "email" VARCHAR(200) NOT NULL,
  "phone" VARCHAR(30),
  "stage" "CrmLeadStage" NOT NULL DEFAULT 'NEW',
  "value" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "probability" INTEGER NOT NULL DEFAULT 0,
  "source" "CrmLeadSource" NOT NULL DEFAULT 'REFERRAL',
  "priority" "CrmLeadPriority" NOT NULL DEFAULT 'MEDIUM',
  "ownerName" VARCHAR(150) NOT NULL,
  "expectedCloseDate" TIMESTAMP(3),
  "lastActivityAt" TIMESTAMP(3),
  "notes" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmLead_pkey" PRIMARY KEY ("id")
);

-- Create CRM activity table
CREATE TABLE "CrmActivity" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "customerId" TEXT,
  "leadId" TEXT,
  "title" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "type" "CrmActivityType" NOT NULL DEFAULT 'FOLLOW_UP',
  "ownerName" VARCHAR(150) NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmActivity_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "CrmCustomer_tenantId_idx" ON "CrmCustomer"("tenantId");
CREATE INDEX "CrmCustomer_tenantId_company_idx" ON "CrmCustomer"("tenantId", "company");
CREATE INDEX "CrmCustomer_tenantId_status_idx" ON "CrmCustomer"("tenantId", "status");
CREATE INDEX "CrmCustomer_tenantId_ownerName_idx" ON "CrmCustomer"("tenantId", "ownerName");
CREATE INDEX "CrmCustomer_deletedAt_idx" ON "CrmCustomer"("deletedAt");

CREATE INDEX "CrmLead_tenantId_idx" ON "CrmLead"("tenantId");
CREATE INDEX "CrmLead_tenantId_stage_idx" ON "CrmLead"("tenantId", "stage");
CREATE INDEX "CrmLead_tenantId_ownerName_idx" ON "CrmLead"("tenantId", "ownerName");
CREATE INDEX "CrmLead_customerId_idx" ON "CrmLead"("customerId");
CREATE INDEX "CrmLead_deletedAt_idx" ON "CrmLead"("deletedAt");

CREATE INDEX "CrmActivity_tenantId_idx" ON "CrmActivity"("tenantId");
CREATE INDEX "CrmActivity_tenantId_scheduledAt_idx" ON "CrmActivity"("tenantId", "scheduledAt");
CREATE INDEX "CrmActivity_customerId_idx" ON "CrmActivity"("customerId");
CREATE INDEX "CrmActivity_leadId_idx" ON "CrmActivity"("leadId");
CREATE INDEX "CrmActivity_deletedAt_idx" ON "CrmActivity"("deletedAt");

-- Foreign keys
ALTER TABLE "CrmCustomer"
ADD CONSTRAINT "CrmCustomer_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmLead"
ADD CONSTRAINT "CrmLead_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmLead"
ADD CONSTRAINT "CrmLead_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "CrmCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmActivity"
ADD CONSTRAINT "CrmActivity_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmActivity"
ADD CONSTRAINT "CrmActivity_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "CrmCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmActivity"
ADD CONSTRAINT "CrmActivity_leadId_fkey"
FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
