-- AlterTable
ALTER TABLE "RolePermission"
ADD COLUMN "displayName" VARCHAR(100),
ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;
