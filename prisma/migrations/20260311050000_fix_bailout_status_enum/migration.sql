-- Fix BailoutStatus enum
-- Fresh databases created from current migration history already have
-- APPROVED_CHIEF and APPROVED_DIRECTOR in the enum from an earlier migration.
-- Keep this migration idempotent and safe.
ALTER TYPE "BailoutStatus" ADD VALUE IF NOT EXISTS 'APPROVED_CHIEF';
ALTER TYPE "BailoutStatus" ADD VALUE IF NOT EXISTS 'APPROVED_DIRECTOR';
