-- Fix BailoutStatus enum
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BailoutStatus') THEN
    ALTER TYPE "BailoutStatus" ADD VALUE IF NOT EXISTS 'APPROVED_CHIEF';
    ALTER TYPE "BailoutStatus" ADD VALUE IF NOT EXISTS 'APPROVED_DIRECTOR';

    UPDATE "Bailout"
    SET "status" = 'APPROVED_CHIEF'
    WHERE "status" = 'APPROVED_L1';

    UPDATE "Bailout"
    SET "status" = 'APPROVED_DIRECTOR'
    WHERE "status" IN ('APPROVED_L2','APPROVED_L3','APPROVED_L4','APPROVED_L5','APPROVED');
  END IF;
END $$;
