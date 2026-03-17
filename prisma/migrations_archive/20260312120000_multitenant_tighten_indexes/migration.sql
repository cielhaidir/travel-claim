-- Phase 2B: tenant-scoped uniques and performance indexes

-- Drop legacy global unique indexes for tenant-owned identifiers
DROP INDEX IF EXISTS "Department_code_key";
DROP INDEX IF EXISTS "ChartOfAccount_code_key";
DROP INDEX IF EXISTS "Project_code_key";
DROP INDEX IF EXISTS "TravelRequest_requestNumber_key";
DROP INDEX IF EXISTS "Bailout_bailoutNumber_key";
DROP INDEX IF EXISTS "Approval_approvalNumber_key";
DROP INDEX IF EXISTS "Claim_claimNumber_key";
DROP INDEX IF EXISTS "BalanceAccount_code_key";
DROP INDEX IF EXISTS "JournalTransaction_transactionNumber_key";

-- Tenant-scoped unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS "Department_tenantId_code_key"
  ON "Department"("tenantId", "code");

CREATE UNIQUE INDEX IF NOT EXISTS "ChartOfAccount_tenantId_code_key"
  ON "ChartOfAccount"("tenantId", "code");

CREATE UNIQUE INDEX IF NOT EXISTS "Project_tenantId_code_key"
  ON "Project"("tenantId", "code");

CREATE UNIQUE INDEX IF NOT EXISTS "TravelRequest_tenantId_requestNumber_key"
  ON "TravelRequest"("tenantId", "requestNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "Bailout_tenantId_bailoutNumber_key"
  ON "Bailout"("tenantId", "bailoutNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "Approval_tenantId_approvalNumber_key"
  ON "Approval"("tenantId", "approvalNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "Claim_tenantId_claimNumber_key"
  ON "Claim"("tenantId", "claimNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "BalanceAccount_tenantId_code_key"
  ON "BalanceAccount"("tenantId", "code");

CREATE UNIQUE INDEX IF NOT EXISTS "JournalTransaction_tenantId_transactionNumber_key"
  ON "JournalTransaction"("tenantId", "transactionNumber");

-- Additional tenant-focused performance indexes
CREATE INDEX IF NOT EXISTS "Department_tenantId_deletedAt_idx"
  ON "Department"("tenantId", "deletedAt");

CREATE INDEX IF NOT EXISTS "Project_tenantId_isActive_idx"
  ON "Project"("tenantId", "isActive");

CREATE INDEX IF NOT EXISTS "TravelRequest_tenantId_status_idx"
  ON "TravelRequest"("tenantId", "status");

CREATE INDEX IF NOT EXISTS "TravelRequest_tenantId_createdAt_idx"
  ON "TravelRequest"("tenantId", "createdAt");

CREATE INDEX IF NOT EXISTS "Bailout_tenantId_status_idx"
  ON "Bailout"("tenantId", "status");

CREATE INDEX IF NOT EXISTS "Bailout_tenantId_createdAt_idx"
  ON "Bailout"("tenantId", "createdAt");

CREATE INDEX IF NOT EXISTS "Approval_tenantId_status_idx"
  ON "Approval"("tenantId", "status");

CREATE INDEX IF NOT EXISTS "Approval_tenantId_createdAt_idx"
  ON "Approval"("tenantId", "createdAt");

CREATE INDEX IF NOT EXISTS "Claim_tenantId_status_idx"
  ON "Claim"("tenantId", "status");

CREATE INDEX IF NOT EXISTS "Claim_tenantId_createdAt_idx"
  ON "Claim"("tenantId", "createdAt");

CREATE INDEX IF NOT EXISTS "ChartOfAccount_tenantId_isActive_idx"
  ON "ChartOfAccount"("tenantId", "isActive");

CREATE INDEX IF NOT EXISTS "BalanceAccount_tenantId_isActive_idx"
  ON "BalanceAccount"("tenantId", "isActive");

CREATE INDEX IF NOT EXISTS "JournalTransaction_tenantId_transactionDate_idx"
  ON "JournalTransaction"("tenantId", "transactionDate");
