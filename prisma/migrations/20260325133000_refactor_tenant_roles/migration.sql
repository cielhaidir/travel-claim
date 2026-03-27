ALTER TABLE "TenantCustomRole"
ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "defaultPermissions" JSONB;

ALTER TABLE "TenantCustomRole"
ALTER COLUMN "baseRole" DROP NOT NULL;

UPDATE "TenantCustomRole"
SET "defaultPermissions" = "permissions"
WHERE "defaultPermissions" IS NULL;

ALTER TABLE "TenantCustomRole"
ALTER COLUMN "defaultPermissions" SET NOT NULL;

CREATE INDEX "TenantCustomRole_tenantId_isSystem_idx"
ON "TenantCustomRole"("tenantId", "isSystem");

CREATE UNIQUE INDEX "TenantCustomRole_system_role_unique_idx"
ON "TenantCustomRole"("tenantId", "baseRole")
WHERE "isSystem" = true AND "baseRole" IS NOT NULL;
