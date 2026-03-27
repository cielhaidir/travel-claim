CREATE TYPE "CrmGender" AS ENUM (
  'MALE',
  'FEMALE',
  'OTHER'
);

CREATE TYPE "CrmIndustry" AS ENUM (
  'TECHNOLOGY',
  'FINANCE',
  'HEALTHCARE',
  'EDUCATION',
  'MANUFACTURING',
  'RETAIL',
  'LOGISTICS',
  'HOSPITALITY',
  'GOVERNMENT',
  'OTHER'
);

CREATE TYPE "CrmEmployeeRange" AS ENUM (
  'ONE_TO_TEN',
  'ELEVEN_TO_FIFTY',
  'FIFTY_ONE_TO_TWO_HUNDRED',
  'TWO_HUNDRED_ONE_TO_FIVE_HUNDRED',
  'FIVE_HUNDRED_ONE_TO_ONE_THOUSAND',
  'OVER_ONE_THOUSAND'
);

CREATE TYPE "CrmLeadStatus" AS ENUM (
  'NEW',
  'CONTACTED',
  'NURTURE',
  'QUALIFIED',
  'CONVERTED',
  'UNQUALIFIED',
  'JUNK'
);

CREATE TYPE "CrmDealStatus" AS ENUM (
  'QUALIFICATION',
  'DEMO_MAKING',
  'PROPOSAL_QUOTATION',
  'NEGOTIATION',
  'READY_TO_CLOSE',
  'WON',
  'LOST'
);

CREATE TYPE "CrmTaskStatus" AS ENUM (
  'OPEN',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED'
);

CREATE TYPE "CrmTaskPriority" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH'
);

ALTER TYPE "CrmActivityType" ADD VALUE IF NOT EXISTS 'TASK';
ALTER TYPE "CrmActivityType" ADD VALUE IF NOT EXISTS 'ATTACHMENT';
ALTER TYPE "CrmActivityType" ADD VALUE IF NOT EXISTS 'SYSTEM';

ALTER TABLE "CrmCustomer"
  ALTER COLUMN "name" DROP NOT NULL,
  ALTER COLUMN "email" DROP NOT NULL,
  ALTER COLUMN "ownerName" DROP NOT NULL,
  ALTER COLUMN "segment" SET DEFAULT 'SMB',
  ADD COLUMN "website" VARCHAR(255),
  ADD COLUMN "annualRevenue" DECIMAL(15,2),
  ADD COLUMN "employeeCount" "CrmEmployeeRange",
  ADD COLUMN "industry" "CrmIndustry";

ALTER TABLE "CrmContact"
  ADD COLUMN "firstName" VARCHAR(100),
  ADD COLUMN "lastName" VARCHAR(100),
  ADD COLUMN "gender" "CrmGender",
  ADD COLUMN "designation" VARCHAR(150),
  ADD COLUMN "address" TEXT;

ALTER TABLE "CrmLead"
  ADD COLUMN "firstName" VARCHAR(100),
  ADD COLUMN "lastName" VARCHAR(100),
  ADD COLUMN "mobileNo" VARCHAR(30),
  ADD COLUMN "gender" "CrmGender",
  ADD COLUMN "status" "CrmLeadStatus" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "website" VARCHAR(255),
  ADD COLUMN "employeeCount" "CrmEmployeeRange",
  ADD COLUMN "annualRevenue" DECIMAL(15,2),
  ADD COLUMN "industry" "CrmIndustry",
  ADD COLUMN "ownerId" TEXT;

ALTER TABLE "CrmDeal"
  ADD COLUMN "contactId" TEXT,
  ADD COLUMN "ownerId" TEXT,
  ADD COLUMN "status" "CrmDealStatus" NOT NULL DEFAULT 'QUALIFICATION',
  ADD COLUMN "website" VARCHAR(255),
  ADD COLUMN "employeeCount" "CrmEmployeeRange",
  ADD COLUMN "annualRevenue" DECIMAL(15,2),
  ADD COLUMN "industry" "CrmIndustry",
  ADD COLUMN "firstName" VARCHAR(100),
  ADD COLUMN "lastName" VARCHAR(100),
  ADD COLUMN "primaryEmail" VARCHAR(200),
  ADD COLUMN "primaryMobileNo" VARCHAR(30),
  ADD COLUMN "gender" "CrmGender";

UPDATE "CrmLead"
SET
  "firstName" = COALESCE("firstName", SPLIT_PART("name", ' ', 1)),
  "lastName" = COALESCE(NULLIF(REPLACE("name", SPLIT_PART("name", ' ', 1), ''), ''), "lastName"),
  "mobileNo" = COALESCE("mobileNo", "phone"),
  "status" = CASE
    WHEN "convertedToDealAt" IS NOT NULL THEN 'CONVERTED'::"CrmLeadStatus"
    WHEN "stage" = 'QUALIFIED' THEN 'QUALIFIED'::"CrmLeadStatus"
    ELSE 'NEW'::"CrmLeadStatus"
  END;

UPDATE "CrmDeal"
SET "status" = CASE
  WHEN "stage" = 'PROPOSAL' THEN 'PROPOSAL_QUOTATION'::"CrmDealStatus"
  WHEN "stage" = 'NEGOTIATION' THEN 'NEGOTIATION'::"CrmDealStatus"
  WHEN "stage" = 'VERBAL_WON' THEN 'READY_TO_CLOSE'::"CrmDealStatus"
  WHEN "stage" = 'WON' THEN 'WON'::"CrmDealStatus"
  WHEN "stage" = 'LOST' THEN 'LOST'::"CrmDealStatus"
  ELSE 'QUALIFICATION'::"CrmDealStatus"
END;

CREATE TABLE "CrmTask" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "leadId" TEXT,
  "dealId" TEXT,
  "title" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "status" "CrmTaskStatus" NOT NULL DEFAULT 'OPEN',
  "assigneeId" TEXT,
  "assigneeName" VARCHAR(150),
  "dueDate" TIMESTAMP(3),
  "priority" "CrmTaskPriority" NOT NULL DEFAULT 'MEDIUM',
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmNote" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "leadId" TEXT,
  "dealId" TEXT,
  "title" VARCHAR(200) NOT NULL,
  "content" TEXT NOT NULL,
  "writerId" TEXT,
  "writerName" VARCHAR(150),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmRecordAttachment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "leadId" TEXT,
  "dealId" TEXT,
  "filename" VARCHAR(255) NOT NULL,
  "originalName" VARCHAR(255) NOT NULL,
  "mimeType" VARCHAR(100) NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "storageUrl" TEXT NOT NULL,
  "storageProvider" VARCHAR(50) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmRecordAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CrmLead_tenantId_status_idx" ON "CrmLead"("tenantId", "status");
CREATE INDEX "CrmDeal_tenantId_status_idx" ON "CrmDeal"("tenantId", "status");
CREATE INDEX "CrmDeal_contactId_idx" ON "CrmDeal"("contactId");

CREATE INDEX "CrmTask_tenantId_idx" ON "CrmTask"("tenantId");
CREATE INDEX "CrmTask_leadId_idx" ON "CrmTask"("leadId");
CREATE INDEX "CrmTask_dealId_idx" ON "CrmTask"("dealId");
CREATE INDEX "CrmTask_status_idx" ON "CrmTask"("status");
CREATE INDEX "CrmTask_dueDate_idx" ON "CrmTask"("dueDate");
CREATE INDEX "CrmTask_deletedAt_idx" ON "CrmTask"("deletedAt");

CREATE INDEX "CrmNote_tenantId_idx" ON "CrmNote"("tenantId");
CREATE INDEX "CrmNote_leadId_idx" ON "CrmNote"("leadId");
CREATE INDEX "CrmNote_dealId_idx" ON "CrmNote"("dealId");
CREATE INDEX "CrmNote_deletedAt_idx" ON "CrmNote"("deletedAt");

CREATE INDEX "CrmRecordAttachment_tenantId_idx" ON "CrmRecordAttachment"("tenantId");
CREATE INDEX "CrmRecordAttachment_leadId_idx" ON "CrmRecordAttachment"("leadId");
CREATE INDEX "CrmRecordAttachment_dealId_idx" ON "CrmRecordAttachment"("dealId");
CREATE INDEX "CrmRecordAttachment_deletedAt_idx" ON "CrmRecordAttachment"("deletedAt");

ALTER TABLE "CrmDeal"
  ADD CONSTRAINT "CrmDeal_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmTask"
  ADD CONSTRAINT "CrmTask_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmTask"
  ADD CONSTRAINT "CrmTask_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmTask"
  ADD CONSTRAINT "CrmTask_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmNote"
  ADD CONSTRAINT "CrmNote_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmNote"
  ADD CONSTRAINT "CrmNote_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmNote"
  ADD CONSTRAINT "CrmNote_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmRecordAttachment"
  ADD CONSTRAINT "CrmRecordAttachment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmRecordAttachment"
  ADD CONSTRAINT "CrmRecordAttachment_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmRecordAttachment"
  ADD CONSTRAINT "CrmRecordAttachment_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
