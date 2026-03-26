-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ROOT', 'EMPLOYEE', 'SUPERVISOR', 'MANAGER', 'DIRECTOR', 'FINANCE', 'ADMIN', 'SALES_EMPLOYEE', 'SALES_CHIEF');

-- CreateEnum
CREATE TYPE "TravelType" AS ENUM ('SALES', 'OPERATIONAL', 'MEETING', 'TRAINING');

-- CreateEnum
CREATE TYPE "TravelStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED_L1', 'APPROVED_L2', 'APPROVED_L3', 'APPROVED_L4', 'APPROVED_L5', 'APPROVED', 'REJECTED', 'REVISION', 'LOCKED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ApprovalLevel" AS ENUM ('SALES_LEAD', 'DEPT_CHIEF', 'DIRECTOR', 'SENIOR_DIRECTOR', 'EXECUTIVE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED');

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('ENTERTAINMENT', 'NON_ENTERTAINMENT');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'REVISION', 'PAID');

-- CreateEnum
CREATE TYPE "EntertainmentType" AS ENUM ('MEAL', 'GIFT', 'EVENT', 'HOSPITALITY', 'OTHER');

-- CreateEnum
CREATE TYPE "NonEntertainmentCategory" AS ENUM ('TRANSPORT', 'PHONE_BILLING', 'TRAVEL_EXPENSES', 'OVERTIME_MEALS', 'BPJS_HEALTH', 'EQUIPMENT_STATIONERY', 'MOTORCYCLE_SERVICE', 'ACCOMMODATION', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'IN_APP', 'PUSH');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'READ');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'SUBMIT', 'LOCK', 'CLOSE', 'REOPEN');

-- CreateEnum
CREATE TYPE "COAType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "BailoutStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED_CHIEF', 'APPROVED_DIRECTOR', 'REJECTED', 'DISBURSED');

-- CreateEnum
CREATE TYPE "BailoutCategory" AS ENUM ('TRANSPORT', 'HOTEL', 'MEAL', 'OTHER');

-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('FLIGHT', 'TRAIN', 'BUS', 'FERRY', 'CAR_RENTAL', 'OTHER');

-- CreateEnum
CREATE TYPE "JournalEntryType" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "JournalSourceType" AS ENUM ('CLAIM', 'BAILOUT', 'ADJUSTMENT', 'FUNDING', 'MANUAL', 'SETTLEMENT');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'POSTED', 'VOID');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "isRoot" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantMembership" (
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

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "refresh_token_expires_in" INTEGER,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "employeeId" VARCHAR(50),
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "departmentId" TEXT,
    "supervisorId" TEXT,
    "phoneNumber" VARCHAR(20),
    "password" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "tenantId" TEXT,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","role")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "chiefId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChartOfAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "accountType" "COAType" NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "subcategory" VARCHAR(50),
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChartOfAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "clientName" VARCHAR(200),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "salesId" VARCHAR(50),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "requestNumber" VARCHAR(50) NOT NULL,
    "requesterId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "destination" VARCHAR(255) NOT NULL,
    "travelType" "TravelType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT,
    "status" "TravelStatus" NOT NULL DEFAULT 'DRAFT',
    "totalReimbursed" DECIMAL(15,2),
    "submittedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelParticipant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "travelRequestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" VARCHAR(100),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TravelParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bailout" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "bailoutNumber" VARCHAR(50) NOT NULL,
    "travelRequestId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "category" "BailoutCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "transportMode" "TransportMode",
    "carrier" VARCHAR(100),
    "departureFrom" VARCHAR(100),
    "arrivalTo" VARCHAR(100),
    "departureAt" TIMESTAMP(3),
    "arrivalAt" TIMESTAMP(3),
    "flightNumber" VARCHAR(20),
    "seatClass" VARCHAR(50),
    "bookingRef" VARCHAR(100),
    "hotelName" VARCHAR(255),
    "hotelAddress" TEXT,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "roomType" VARCHAR(100),
    "mealDate" TIMESTAMP(3),
    "mealLocation" VARCHAR(255),
    "status" "BailoutStatus" NOT NULL DEFAULT 'DRAFT',
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "disbursedAt" TIMESTAMP(3),
    "disbursementRef" VARCHAR(100),
    "submittedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "storageUrl" TEXT,
    "financeId" TEXT,

    CONSTRAINT "Bailout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "approvalNumber" VARCHAR(50) NOT NULL,
    "travelRequestId" TEXT,
    "bailoutId" TEXT,
    "claimId" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "level" "ApprovalLevel" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approverId" TEXT NOT NULL,
    "comments" TEXT,
    "rejectionReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "claimNumber" VARCHAR(50) NOT NULL,
    "travelRequestId" TEXT NOT NULL,
    "submitterId" TEXT NOT NULL,
    "claimType" "ClaimType" NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "entertainmentType" "EntertainmentType",
    "entertainmentDate" TIMESTAMP(3),
    "entertainmentLocation" VARCHAR(255),
    "entertainmentAddress" TEXT,
    "guestName" VARCHAR(255),
    "guestCompany" VARCHAR(255),
    "guestPosition" VARCHAR(100),
    "isGovernmentOfficial" BOOLEAN DEFAULT false,
    "expenseCategory" "NonEntertainmentCategory",
    "expenseDate" TIMESTAMP(3),
    "expenseDestination" VARCHAR(255),
    "customerName" VARCHAR(255),
    "amount" DECIMAL(15,2) NOT NULL,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "coaId" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "paidBy" VARCHAR(100),
    "paymentReference" VARCHAR(100),
    "submittedVia" VARCHAR(50),
    "financeId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "claimId" TEXT NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "storageProvider" VARCHAR(50) NOT NULL,
    "ocrExtractedData" JSONB,
    "ocrConfidence" DECIMAL(5,2),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "entityType" VARCHAR(50),
    "entityId" TEXT,
    "actionUrl" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "priority" VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    "templateId" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" VARCHAR(50) NOT NULL,
    "entityId" TEXT NOT NULL,
    "chartOfAccountId" TEXT,
    "changes" JSONB,
    "metadata" JSONB,
    "ipAddress" VARCHAR(45),
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "balance" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "defaultChartOfAccountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BalanceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "transactionNumber" VARCHAR(50) NOT NULL,
    "transactionDate" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "entryType" "JournalEntryType" NOT NULL,
    "bailoutId" TEXT,
    "claimId" TEXT,
    "chartOfAccountId" TEXT NOT NULL,
    "balanceAccountId" TEXT NOT NULL,
    "referenceNumber" VARCHAR(100),
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "journalNumber" VARCHAR(50) NOT NULL,
    "transactionDate" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "sourceType" "JournalSourceType",
    "sourceId" TEXT,
    "status" "JournalStatus" NOT NULL DEFAULT 'DRAFT',
    "bailoutId" TEXT,
    "claimId" TEXT,
    "referenceNumber" VARCHAR(100),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "postedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntryLine" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "chartOfAccountId" TEXT NOT NULL,
    "balanceAccountId" TEXT,
    "description" TEXT,
    "debitAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "creditAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "lineNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntryLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_isRoot_idx" ON "Tenant"("isRoot");

-- CreateIndex
CREATE INDEX "TenantMembership_tenantId_role_idx" ON "TenantMembership"("tenantId", "role");

-- CreateIndex
CREATE INDEX "TenantMembership_userId_isDefault_idx" ON "TenantMembership"("userId", "isDefault");

-- CreateIndex
CREATE INDEX "TenantMembership_status_idx" ON "TenantMembership"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TenantMembership_userId_tenantId_key" ON "TenantMembership"("userId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE INDEX "User_employeeId_idx" ON "User"("employeeId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");

-- CreateIndex
CREATE INDEX "User_supervisorId_idx" ON "User"("supervisorId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "UserRole_role_idx" ON "UserRole"("role");

-- CreateIndex
CREATE INDEX "UserRole_tenantId_idx" ON "UserRole"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Department_code_idx" ON "Department"("code");

-- CreateIndex
CREATE INDEX "Department_tenantId_idx" ON "Department"("tenantId");

-- CreateIndex
CREATE INDEX "Department_tenantId_deletedAt_idx" ON "Department"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "Department_parentId_idx" ON "Department"("parentId");

-- CreateIndex
CREATE INDEX "Department_chiefId_idx" ON "Department"("chiefId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_tenantId_code_key" ON "Department"("tenantId", "code");

-- CreateIndex
CREATE INDEX "ChartOfAccount_code_idx" ON "ChartOfAccount"("code");

-- CreateIndex
CREATE INDEX "ChartOfAccount_tenantId_idx" ON "ChartOfAccount"("tenantId");

-- CreateIndex
CREATE INDEX "ChartOfAccount_tenantId_isActive_idx" ON "ChartOfAccount"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "ChartOfAccount_accountType_idx" ON "ChartOfAccount"("accountType");

-- CreateIndex
CREATE INDEX "ChartOfAccount_parentId_idx" ON "ChartOfAccount"("parentId");

-- CreateIndex
CREATE INDEX "ChartOfAccount_isActive_idx" ON "ChartOfAccount"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ChartOfAccount_tenantId_code_key" ON "ChartOfAccount"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Project_code_idx" ON "Project"("code");

-- CreateIndex
CREATE INDEX "Project_tenantId_idx" ON "Project"("tenantId");

-- CreateIndex
CREATE INDEX "Project_tenantId_isActive_idx" ON "Project"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "Project_isActive_idx" ON "Project"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Project_tenantId_code_key" ON "Project"("tenantId", "code");

-- CreateIndex
CREATE INDEX "TravelRequest_requesterId_status_idx" ON "TravelRequest"("requesterId", "status");

-- CreateIndex
CREATE INDEX "TravelRequest_tenantId_idx" ON "TravelRequest"("tenantId");

-- CreateIndex
CREATE INDEX "TravelRequest_tenantId_status_idx" ON "TravelRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TravelRequest_tenantId_createdAt_idx" ON "TravelRequest"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "TravelRequest_status_createdAt_idx" ON "TravelRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TravelRequest_requestNumber_idx" ON "TravelRequest"("requestNumber");

-- CreateIndex
CREATE INDEX "TravelRequest_travelType_idx" ON "TravelRequest"("travelType");

-- CreateIndex
CREATE INDEX "TravelRequest_startDate_endDate_idx" ON "TravelRequest"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "TravelRequest_projectId_idx" ON "TravelRequest"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "TravelRequest_tenantId_requestNumber_key" ON "TravelRequest"("tenantId", "requestNumber");

-- CreateIndex
CREATE INDEX "TravelParticipant_tenantId_idx" ON "TravelParticipant"("tenantId");

-- CreateIndex
CREATE INDEX "TravelParticipant_userId_idx" ON "TravelParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TravelParticipant_travelRequestId_userId_key" ON "TravelParticipant"("travelRequestId", "userId");

-- CreateIndex
CREATE INDEX "Bailout_travelRequestId_idx" ON "Bailout"("travelRequestId");

-- CreateIndex
CREATE INDEX "Bailout_tenantId_idx" ON "Bailout"("tenantId");

-- CreateIndex
CREATE INDEX "Bailout_tenantId_status_idx" ON "Bailout"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Bailout_tenantId_createdAt_idx" ON "Bailout"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Bailout_requesterId_status_idx" ON "Bailout"("requesterId", "status");

-- CreateIndex
CREATE INDEX "Bailout_status_createdAt_idx" ON "Bailout"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Bailout_bailoutNumber_idx" ON "Bailout"("bailoutNumber");

-- CreateIndex
CREATE INDEX "Bailout_financeId_idx" ON "Bailout"("financeId");

-- CreateIndex
CREATE UNIQUE INDEX "Bailout_tenantId_bailoutNumber_key" ON "Bailout"("tenantId", "bailoutNumber");

-- CreateIndex
CREATE INDEX "Approval_approvalNumber_idx" ON "Approval"("approvalNumber");

-- CreateIndex
CREATE INDEX "Approval_tenantId_idx" ON "Approval"("tenantId");

-- CreateIndex
CREATE INDEX "Approval_tenantId_status_idx" ON "Approval"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Approval_tenantId_createdAt_idx" ON "Approval"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Approval_travelRequestId_sequence_idx" ON "Approval"("travelRequestId", "sequence");

-- CreateIndex
CREATE INDEX "Approval_bailoutId_sequence_idx" ON "Approval"("bailoutId", "sequence");

-- CreateIndex
CREATE INDEX "Approval_claimId_sequence_idx" ON "Approval"("claimId", "sequence");

-- CreateIndex
CREATE INDEX "Approval_approverId_status_idx" ON "Approval"("approverId", "status");

-- CreateIndex
CREATE INDEX "Approval_status_createdAt_idx" ON "Approval"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_tenantId_approvalNumber_key" ON "Approval"("tenantId", "approvalNumber");

-- CreateIndex
CREATE INDEX "Claim_travelRequestId_idx" ON "Claim"("travelRequestId");

-- CreateIndex
CREATE INDEX "Claim_tenantId_idx" ON "Claim"("tenantId");

-- CreateIndex
CREATE INDEX "Claim_tenantId_status_idx" ON "Claim"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Claim_tenantId_createdAt_idx" ON "Claim"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Claim_submitterId_status_idx" ON "Claim"("submitterId", "status");

-- CreateIndex
CREATE INDEX "Claim_status_createdAt_idx" ON "Claim"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Claim_claimNumber_idx" ON "Claim"("claimNumber");

-- CreateIndex
CREATE INDEX "Claim_claimType_idx" ON "Claim"("claimType");

-- CreateIndex
CREATE INDEX "Claim_coaId_idx" ON "Claim"("coaId");

-- CreateIndex
CREATE INDEX "Claim_financeId_idx" ON "Claim"("financeId");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_tenantId_claimNumber_key" ON "Claim"("tenantId", "claimNumber");

-- CreateIndex
CREATE INDEX "Attachment_tenantId_idx" ON "Attachment"("tenantId");

-- CreateIndex
CREATE INDEX "Attachment_claimId_idx" ON "Attachment"("claimId");

-- CreateIndex
CREATE INDEX "Notification_tenantId_idx" ON "Notification"("tenantId");

-- CreateIndex
CREATE INDEX "Notification_userId_status_idx" ON "Notification"("userId", "status");

-- CreateIndex
CREATE INDEX "Notification_status_createdAt_idx" ON "Notification"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_channel_idx" ON "Notification"("channel");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_chartOfAccountId_idx" ON "AuditLog"("chartOfAccountId");

-- CreateIndex
CREATE INDEX "BalanceAccount_code_idx" ON "BalanceAccount"("code");

-- CreateIndex
CREATE INDEX "BalanceAccount_tenantId_idx" ON "BalanceAccount"("tenantId");

-- CreateIndex
CREATE INDEX "BalanceAccount_tenantId_isActive_idx" ON "BalanceAccount"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "BalanceAccount_isActive_idx" ON "BalanceAccount"("isActive");

-- CreateIndex
CREATE INDEX "BalanceAccount_defaultChartOfAccountId_idx" ON "BalanceAccount"("defaultChartOfAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "BalanceAccount_tenantId_code_key" ON "BalanceAccount"("tenantId", "code");

-- CreateIndex
CREATE INDEX "JournalTransaction_transactionNumber_idx" ON "JournalTransaction"("transactionNumber");

-- CreateIndex
CREATE INDEX "JournalTransaction_tenantId_idx" ON "JournalTransaction"("tenantId");

-- CreateIndex
CREATE INDEX "JournalTransaction_tenantId_transactionDate_idx" ON "JournalTransaction"("tenantId", "transactionDate");

-- CreateIndex
CREATE INDEX "JournalTransaction_transactionDate_idx" ON "JournalTransaction"("transactionDate");

-- CreateIndex
CREATE INDEX "JournalTransaction_chartOfAccountId_idx" ON "JournalTransaction"("chartOfAccountId");

-- CreateIndex
CREATE INDEX "JournalTransaction_balanceAccountId_idx" ON "JournalTransaction"("balanceAccountId");

-- CreateIndex
CREATE INDEX "JournalTransaction_bailoutId_idx" ON "JournalTransaction"("bailoutId");

-- CreateIndex
CREATE INDEX "JournalTransaction_claimId_idx" ON "JournalTransaction"("claimId");

-- CreateIndex
CREATE INDEX "JournalTransaction_entryType_transactionDate_idx" ON "JournalTransaction"("entryType", "transactionDate");

-- CreateIndex
CREATE UNIQUE INDEX "JournalTransaction_tenantId_transactionNumber_key" ON "JournalTransaction"("tenantId", "transactionNumber");

-- CreateIndex
CREATE INDEX "JournalEntry_journalNumber_idx" ON "JournalEntry"("journalNumber");

-- CreateIndex
CREATE INDEX "JournalEntry_tenantId_idx" ON "JournalEntry"("tenantId");

-- CreateIndex
CREATE INDEX "JournalEntry_tenantId_transactionDate_idx" ON "JournalEntry"("tenantId", "transactionDate");

-- CreateIndex
CREATE INDEX "JournalEntry_transactionDate_idx" ON "JournalEntry"("transactionDate");

-- CreateIndex
CREATE INDEX "JournalEntry_sourceType_sourceId_idx" ON "JournalEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "JournalEntry_status_transactionDate_idx" ON "JournalEntry"("status", "transactionDate");

-- CreateIndex
CREATE INDEX "JournalEntry_bailoutId_idx" ON "JournalEntry"("bailoutId");

-- CreateIndex
CREATE INDEX "JournalEntry_claimId_idx" ON "JournalEntry"("claimId");

-- CreateIndex
CREATE INDEX "JournalEntry_createdById_idx" ON "JournalEntry"("createdById");

-- CreateIndex
CREATE INDEX "JournalEntry_postedById_idx" ON "JournalEntry"("postedById");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_tenantId_journalNumber_key" ON "JournalEntry"("tenantId", "journalNumber");

-- CreateIndex
CREATE INDEX "JournalEntryLine_journalEntryId_idx" ON "JournalEntryLine"("journalEntryId");

-- CreateIndex
CREATE INDEX "JournalEntryLine_chartOfAccountId_idx" ON "JournalEntryLine"("chartOfAccountId");

-- CreateIndex
CREATE INDEX "JournalEntryLine_balanceAccountId_idx" ON "JournalEntryLine"("balanceAccountId");

-- CreateIndex
CREATE INDEX "JournalEntryLine_lineNumber_idx" ON "JournalEntryLine"("lineNumber");

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_chiefId_fkey" FOREIGN KEY ("chiefId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_salesId_fkey" FOREIGN KEY ("salesId") REFERENCES "User"("employeeId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelRequest" ADD CONSTRAINT "TravelRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelRequest" ADD CONSTRAINT "TravelRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelRequest" ADD CONSTRAINT "TravelRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelParticipant" ADD CONSTRAINT "TravelParticipant_travelRequestId_fkey" FOREIGN KEY ("travelRequestId") REFERENCES "TravelRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelParticipant" ADD CONSTRAINT "TravelParticipant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelParticipant" ADD CONSTRAINT "TravelParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bailout" ADD CONSTRAINT "Bailout_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bailout" ADD CONSTRAINT "Bailout_travelRequestId_fkey" FOREIGN KEY ("travelRequestId") REFERENCES "TravelRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bailout" ADD CONSTRAINT "Bailout_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bailout" ADD CONSTRAINT "Bailout_financeId_fkey" FOREIGN KEY ("financeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_travelRequestId_fkey" FOREIGN KEY ("travelRequestId") REFERENCES "TravelRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_bailoutId_fkey" FOREIGN KEY ("bailoutId") REFERENCES "Bailout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_travelRequestId_fkey" FOREIGN KEY ("travelRequestId") REFERENCES "TravelRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_coaId_fkey" FOREIGN KEY ("coaId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_financeId_fkey" FOREIGN KEY ("financeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_chartOfAccountId_fkey" FOREIGN KEY ("chartOfAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceAccount" ADD CONSTRAINT "BalanceAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceAccount" ADD CONSTRAINT "BalanceAccount_defaultChartOfAccountId_fkey" FOREIGN KEY ("defaultChartOfAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalTransaction" ADD CONSTRAINT "JournalTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalTransaction" ADD CONSTRAINT "JournalTransaction_bailoutId_fkey" FOREIGN KEY ("bailoutId") REFERENCES "Bailout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalTransaction" ADD CONSTRAINT "JournalTransaction_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalTransaction" ADD CONSTRAINT "JournalTransaction_chartOfAccountId_fkey" FOREIGN KEY ("chartOfAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalTransaction" ADD CONSTRAINT "JournalTransaction_balanceAccountId_fkey" FOREIGN KEY ("balanceAccountId") REFERENCES "BalanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_bailoutId_fkey" FOREIGN KEY ("bailoutId") REFERENCES "Bailout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_chartOfAccountId_fkey" FOREIGN KEY ("chartOfAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_balanceAccountId_fkey" FOREIGN KEY ("balanceAccountId") REFERENCES "BalanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

