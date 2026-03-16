-- CreateEnum
CREATE TYPE "COAType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "chartOfAccountId" TEXT;

-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "coaId" TEXT;

-- CreateTable
CREATE TABLE "ChartOfAccount" (
    "id" TEXT NOT NULL,
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

-- CreateIndex
CREATE UNIQUE INDEX "ChartOfAccount_code_key" ON "ChartOfAccount"("code");

-- CreateIndex
CREATE INDEX "ChartOfAccount_code_idx" ON "ChartOfAccount"("code");

-- CreateIndex
CREATE INDEX "ChartOfAccount_accountType_idx" ON "ChartOfAccount"("accountType");

-- CreateIndex
CREATE INDEX "ChartOfAccount_parentId_idx" ON "ChartOfAccount"("parentId");

-- CreateIndex
CREATE INDEX "ChartOfAccount_isActive_idx" ON "ChartOfAccount"("isActive");

-- CreateIndex
CREATE INDEX "AuditLog_chartOfAccountId_idx" ON "AuditLog"("chartOfAccountId");

-- CreateIndex
CREATE INDEX "Claim_coaId_idx" ON "Claim"("coaId");

-- AddForeignKey
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_coaId_fkey" FOREIGN KEY ("coaId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_chartOfAccountId_fkey" FOREIGN KEY ("chartOfAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
