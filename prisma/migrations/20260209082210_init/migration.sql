-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'SUPERVISOR', 'MANAGER', 'DIRECTOR', 'FINANCE', 'ADMIN');

-- CreateEnum
CREATE TYPE "TravelType" AS ENUM ('SALES', 'OPERATIONAL', 'MEETING', 'TRAINING');

-- CreateEnum
CREATE TYPE "TravelStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED_L1', 'APPROVED_L2', 'APPROVED_L3', 'APPROVED_L4', 'APPROVED_L5', 'APPROVED', 'REJECTED', 'REVISION', 'LOCKED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ApprovalLevel" AS ENUM ('L1_SUPERVISOR', 'L2_MANAGER', 'L3_DIRECTOR', 'L4_SENIOR_DIRECTOR', 'L5_EXECUTIVE');

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
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "password" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
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
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "managerId" TEXT,
    "directorId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelRequest" (
    "id" TEXT NOT NULL,
    "requestNumber" VARCHAR(50) NOT NULL,
    "requesterId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "destination" VARCHAR(255) NOT NULL,
    "travelType" "TravelType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "estimatedBudget" DECIMAL(15,2),
    "projectName" VARCHAR(255),
    "customerName" VARCHAR(255),
    "salesPerson" VARCHAR(100),
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
    "travelRequestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" VARCHAR(100),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TravelParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "travelRequestId" TEXT,
    "claimId" TEXT,
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
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "paidBy" VARCHAR(100),
    "paymentReference" VARCHAR(100),
    "submittedVia" VARCHAR(50),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
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
    "userId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" VARCHAR(50) NOT NULL,
    "entityId" TEXT NOT NULL,
    "changes" JSONB,
    "metadata" JSONB,
    "ipAddress" VARCHAR(45),
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

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
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE INDEX "Department_code_idx" ON "Department"("code");

-- CreateIndex
CREATE INDEX "Department_parentId_idx" ON "Department"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "TravelRequest_requestNumber_key" ON "TravelRequest"("requestNumber");

-- CreateIndex
CREATE INDEX "TravelRequest_requesterId_status_idx" ON "TravelRequest"("requesterId", "status");

-- CreateIndex
CREATE INDEX "TravelRequest_status_createdAt_idx" ON "TravelRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TravelRequest_requestNumber_idx" ON "TravelRequest"("requestNumber");

-- CreateIndex
CREATE INDEX "TravelRequest_travelType_idx" ON "TravelRequest"("travelType");

-- CreateIndex
CREATE INDEX "TravelRequest_startDate_endDate_idx" ON "TravelRequest"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "TravelParticipant_userId_idx" ON "TravelParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TravelParticipant_travelRequestId_userId_key" ON "TravelParticipant"("travelRequestId", "userId");

-- CreateIndex
CREATE INDEX "Approval_travelRequestId_level_idx" ON "Approval"("travelRequestId", "level");

-- CreateIndex
CREATE INDEX "Approval_claimId_level_idx" ON "Approval"("claimId", "level");

-- CreateIndex
CREATE INDEX "Approval_approverId_status_idx" ON "Approval"("approverId", "status");

-- CreateIndex
CREATE INDEX "Approval_status_createdAt_idx" ON "Approval"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_claimNumber_key" ON "Claim"("claimNumber");

-- CreateIndex
CREATE INDEX "Claim_travelRequestId_idx" ON "Claim"("travelRequestId");

-- CreateIndex
CREATE INDEX "Claim_submitterId_status_idx" ON "Claim"("submitterId", "status");

-- CreateIndex
CREATE INDEX "Claim_status_createdAt_idx" ON "Claim"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Claim_claimNumber_idx" ON "Claim"("claimNumber");

-- CreateIndex
CREATE INDEX "Claim_claimType_idx" ON "Claim"("claimType");

-- CreateIndex
CREATE INDEX "Attachment_claimId_idx" ON "Attachment"("claimId");

-- CreateIndex
CREATE INDEX "Notification_userId_status_idx" ON "Notification"("userId", "status");

-- CreateIndex
CREATE INDEX "Notification_status_createdAt_idx" ON "Notification"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_channel_idx" ON "Notification"("channel");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelRequest" ADD CONSTRAINT "TravelRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelParticipant" ADD CONSTRAINT "TravelParticipant_travelRequestId_fkey" FOREIGN KEY ("travelRequestId") REFERENCES "TravelRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelParticipant" ADD CONSTRAINT "TravelParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_travelRequestId_fkey" FOREIGN KEY ("travelRequestId") REFERENCES "TravelRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_travelRequestId_fkey" FOREIGN KEY ("travelRequestId") REFERENCES "TravelRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
