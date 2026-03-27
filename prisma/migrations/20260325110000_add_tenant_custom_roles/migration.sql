-- AlterTable
ALTER TABLE "TenantMembership"
ADD COLUMN "customRoleId" TEXT;

-- CreateTable
CREATE TABLE "TenantCustomRole" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "baseRole" "Role" NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "displayName" VARCHAR(100) NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "permissions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantCustomRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantMembership_customRoleId_idx" ON "TenantMembership"("customRoleId");

-- CreateIndex
CREATE INDEX "TenantMembership_tenantId_customRoleId_idx" ON "TenantMembership"("tenantId", "customRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantCustomRole_tenantId_slug_key" ON "TenantCustomRole"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "TenantCustomRole_tenantId_isArchived_idx" ON "TenantCustomRole"("tenantId", "isArchived");

-- CreateIndex
CREATE INDEX "TenantCustomRole_baseRole_idx" ON "TenantCustomRole"("baseRole");

-- CreateIndex
CREATE INDEX "TenantCustomRole_tenantId_idx" ON "TenantCustomRole"("tenantId");

-- AddForeignKey
ALTER TABLE "TenantMembership"
ADD CONSTRAINT "TenantMembership_customRoleId_fkey"
FOREIGN KEY ("customRoleId") REFERENCES "TenantCustomRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantCustomRole"
ADD CONSTRAINT "TenantCustomRole_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
