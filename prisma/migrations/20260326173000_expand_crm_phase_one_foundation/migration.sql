-- Extend CRM enums
CREATE TYPE "CrmDealStage" AS ENUM (
  'DISCOVERY',
  'PROPOSAL',
  'NEGOTIATION',
  'VERBAL_WON',
  'WON',
  'LOST',
  'ON_HOLD'
);

CREATE TYPE "CrmConversationStatus" AS ENUM (
  'OPEN',
  'WAITING_REPLY',
  'CLOSED'
);

CREATE TYPE "CrmMessageStatus" AS ENUM (
  'DRAFT',
  'SENT',
  'RECEIVED',
  'NOTE'
);

ALTER TYPE "CrmActivityType" ADD VALUE IF NOT EXISTS 'CHAT';
ALTER TYPE "CrmActivityType" ADD VALUE IF NOT EXISTS 'STAGE_CHANGE';
ALTER TYPE "CrmActivityType" ADD VALUE IF NOT EXISTS 'NOTE';

-- Extend existing CRM tables
ALTER TABLE "CrmLead"
ADD COLUMN "convertedToDealAt" TIMESTAMP(3);

ALTER TABLE "CrmActivity"
ADD COLUMN "dealId" TEXT,
ADD COLUMN "conversationId" TEXT,
ADD COLUMN "messageId" TEXT;

-- Create CRM contact table
CREATE TABLE "CrmContact" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "customerId" TEXT NOT NULL,
  "name" VARCHAR(150) NOT NULL,
  "title" VARCHAR(150),
  "email" VARCHAR(200),
  "phone" VARCHAR(30),
  "department" VARCHAR(100),
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmContact_pkey" PRIMARY KEY ("id")
);

-- Create CRM deal table
CREATE TABLE "CrmDeal" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "customerId" TEXT,
  "leadId" TEXT,
  "title" VARCHAR(200) NOT NULL,
  "company" VARCHAR(200) NOT NULL,
  "ownerName" VARCHAR(150) NOT NULL,
  "stage" "CrmDealStage" NOT NULL DEFAULT 'DISCOVERY',
  "value" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "probability" INTEGER NOT NULL DEFAULT 0,
  "source" "CrmLeadSource" NOT NULL DEFAULT 'REFERRAL',
  "expectedCloseDate" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "lostReason" TEXT,
  "notes" TEXT,
  "lastActivityAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmDeal_pkey" PRIMARY KEY ("id")
);

-- Create CRM conversation table
CREATE TABLE "CrmConversation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "customerId" TEXT,
  "leadId" TEXT,
  "dealId" TEXT,
  "subject" VARCHAR(200),
  "ownerName" VARCHAR(150) NOT NULL,
  "status" "CrmConversationStatus" NOT NULL DEFAULT 'OPEN',
  "lastMessageAt" TIMESTAMP(3),
  "lastMessagePreview" VARCHAR(255),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmConversation_pkey" PRIMARY KEY ("id")
);

-- Create CRM message table
CREATE TABLE "CrmMessage" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "conversationId" TEXT NOT NULL,
  "status" "CrmMessageStatus" NOT NULL DEFAULT 'SENT',
  "senderName" VARCHAR(150) NOT NULL,
  "body" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmMessage_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "CrmContact_tenantId_idx" ON "CrmContact"("tenantId");
CREATE INDEX "CrmContact_customerId_idx" ON "CrmContact"("customerId");
CREATE INDEX "CrmContact_tenantId_isPrimary_idx" ON "CrmContact"("tenantId", "isPrimary");
CREATE INDEX "CrmContact_deletedAt_idx" ON "CrmContact"("deletedAt");

CREATE UNIQUE INDEX "CrmDeal_leadId_key" ON "CrmDeal"("leadId");
CREATE INDEX "CrmDeal_tenantId_idx" ON "CrmDeal"("tenantId");
CREATE INDEX "CrmDeal_tenantId_stage_idx" ON "CrmDeal"("tenantId", "stage");
CREATE INDEX "CrmDeal_tenantId_ownerName_idx" ON "CrmDeal"("tenantId", "ownerName");
CREATE INDEX "CrmDeal_customerId_idx" ON "CrmDeal"("customerId");
CREATE INDEX "CrmDeal_deletedAt_idx" ON "CrmDeal"("deletedAt");

CREATE INDEX "CrmConversation_tenantId_idx" ON "CrmConversation"("tenantId");
CREATE INDEX "CrmConversation_customerId_idx" ON "CrmConversation"("customerId");
CREATE INDEX "CrmConversation_leadId_idx" ON "CrmConversation"("leadId");
CREATE INDEX "CrmConversation_dealId_idx" ON "CrmConversation"("dealId");
CREATE INDEX "CrmConversation_tenantId_status_idx" ON "CrmConversation"("tenantId", "status");
CREATE INDEX "CrmConversation_deletedAt_idx" ON "CrmConversation"("deletedAt");

CREATE INDEX "CrmMessage_tenantId_idx" ON "CrmMessage"("tenantId");
CREATE INDEX "CrmMessage_conversationId_idx" ON "CrmMessage"("conversationId");
CREATE INDEX "CrmMessage_tenantId_status_idx" ON "CrmMessage"("tenantId", "status");
CREATE INDEX "CrmMessage_deletedAt_idx" ON "CrmMessage"("deletedAt");

CREATE INDEX "CrmActivity_dealId_idx" ON "CrmActivity"("dealId");
CREATE INDEX "CrmActivity_conversationId_idx" ON "CrmActivity"("conversationId");
CREATE INDEX "CrmActivity_messageId_idx" ON "CrmActivity"("messageId");

-- Foreign keys
ALTER TABLE "CrmContact"
ADD CONSTRAINT "CrmContact_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmContact"
ADD CONSTRAINT "CrmContact_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "CrmCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CrmDeal"
ADD CONSTRAINT "CrmDeal_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmDeal"
ADD CONSTRAINT "CrmDeal_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "CrmCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmDeal"
ADD CONSTRAINT "CrmDeal_leadId_fkey"
FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmConversation"
ADD CONSTRAINT "CrmConversation_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmConversation"
ADD CONSTRAINT "CrmConversation_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "CrmCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmConversation"
ADD CONSTRAINT "CrmConversation_leadId_fkey"
FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmConversation"
ADD CONSTRAINT "CrmConversation_dealId_fkey"
FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmMessage"
ADD CONSTRAINT "CrmMessage_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmMessage"
ADD CONSTRAINT "CrmMessage_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "CrmConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CrmActivity"
ADD CONSTRAINT "CrmActivity_dealId_fkey"
FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmActivity"
ADD CONSTRAINT "CrmActivity_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "CrmConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmActivity"
ADD CONSTRAINT "CrmActivity_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "CrmMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
