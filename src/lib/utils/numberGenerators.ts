/**
 * Business-number generation utilities for the Travel & Claim System.
 *
 * Convention (mirrors TravelRequest and Claim routers):
 *   PREFIX-YYYY-NNNNN
 *   e.g.  TR-2026-00001  |  CLM-2026-00001  |  APR-2026-00001
 *
 * Each generator counts existing records whose number starts with
 * `PREFIX-YYYY` and increments by 1, zero-padded to 5 digits.
 * The callers are responsible for passing the Prisma client so that
 * generation stays inside the same transaction context when needed.
 */

import type { PrismaClient } from "../../../generated/prisma";

function parseSuffix(value: string): number {
  const parts = value.split("-");
  const last = parts[parts.length - 1] ?? "0";
  const parsed = Number.parseInt(last, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function buildPrefix(prefix: string, year: number): string {
  return `${prefix}-${year}`;
}

function toBusinessNumber(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(5, "0")}`;
}

// ---------------------------------------------------------------------------
// Travel Request number  –  TR-YYYY-NNNNN
// ---------------------------------------------------------------------------

/**
 * Generate the next travel-request number for the current calendar year.
 *
 * @param db   - Prisma client instance
 * @param year - Calendar year (defaults to current year)
 * @returns    Promise<string>  e.g. "TR-2026-00042"
 */
export async function generateRequestNumber(
  db: PrismaClient,
  tenantId: string | null,
  year = new Date().getFullYear(),
): Promise<string> {
  const prefix = `${buildPrefix("TR", year)}-`;
  const last = await db.travelRequest.findFirst({
    where: {
      ...(tenantId ? { tenantId } : {}),
      requestNumber: { startsWith: prefix },
    },
    orderBy: { requestNumber: "desc" },
    select: { requestNumber: true },
  });
  return toBusinessNumber(
    "TR",
    year,
    parseSuffix(last?.requestNumber ?? "") + 1,
  );
}

// ---------------------------------------------------------------------------
// Claim number  –  CLM-YYYY-NNNNN
// ---------------------------------------------------------------------------

/**
 * Generate the next claim number for the current calendar year.
 *
 * @param db   - Prisma client instance
 * @param year - Calendar year (defaults to current year)
 * @returns    Promise<string>  e.g. "CLM-2026-00007"
 */
export async function generateClaimNumber(
  db: PrismaClient,
  tenantId: string | null,
  year = new Date().getFullYear(),
): Promise<string> {
  const prefix = `${buildPrefix("CLM", year)}-`;
  const last = await db.claim.findFirst({
    where: {
      ...(tenantId ? { tenantId } : {}),
      claimNumber: { startsWith: prefix },
    },
    orderBy: { claimNumber: "desc" },
    select: { claimNumber: true },
  });
  return toBusinessNumber(
    "CLM",
    year,
    parseSuffix(last?.claimNumber ?? "") + 1,
  );
}

// ---------------------------------------------------------------------------
// Approval number  –  APR-YYYY-NNNNN
// ---------------------------------------------------------------------------

/**
 * Generate the next approval number for the current calendar year.
 *
 * Follows the same convention as {@link generateRequestNumber} and
 * {@link generateClaimNumber}: count existing `Approval` rows whose
 * `approvalNumber` starts with `APR-YYYY`, then increment.
 *
 * @param db   - Prisma client instance
 * @param year - Calendar year (defaults to current year)
 * @returns    Promise<string>  e.g. "APR-2026-00001"
 *
 * @example
 * ```ts
 * const approvalNumber = await generateApprovalNumber(ctx.db);
 * await ctx.db.approval.create({ data: { approvalNumber, ... } });
 * ```
 */
export async function generateApprovalNumber(
  db: PrismaClient,
  tenantId: string | null,
  year = new Date().getFullYear(),
): Promise<string> {
  const prefix = `${buildPrefix("APR", year)}-`;
  const last = await db.approval.findFirst({
    where: {
      ...(tenantId ? { tenantId } : {}),
      approvalNumber: { startsWith: prefix },
    },
    orderBy: { approvalNumber: "desc" },
    select: { approvalNumber: true },
  });

  return toBusinessNumber(
    "APR",
    year,
    parseSuffix(last?.approvalNumber ?? "") + 1,
  );
}

export async function generateBailoutNumber(
  db: PrismaClient,
  tenantId: string | null,
  year = new Date().getFullYear(),
): Promise<string> {
  const prefix = `${buildPrefix("BLT", year)}-`;
  const last = await db.bailout.findFirst({
    where: {
      ...(tenantId ? { tenantId } : {}),
      bailoutNumber: { startsWith: prefix },
    },
    orderBy: { bailoutNumber: "desc" },
    select: { bailoutNumber: true },
  });

  return toBusinessNumber(
    "BLT",
    year,
    parseSuffix(last?.bailoutNumber ?? "") + 1,
  );
}

export async function generateJournalTransactionNumber(
  db: PrismaClient,
  tenantId: string | null,
  year = new Date().getFullYear(),
): Promise<string> {
  const prefix = `${buildPrefix("JRN", year)}-`;
  const last = await db.journalTransaction.findFirst({
    where: {
      ...(tenantId ? { tenantId } : {}),
      transactionNumber: { startsWith: prefix },
    },
    orderBy: { transactionNumber: "desc" },
    select: { transactionNumber: true },
  });

  return toBusinessNumber(
    "JRN",
    year,
    parseSuffix(last?.transactionNumber ?? "") + 1,
  );
}

export async function generateJournalEntryNumber(
  db: PrismaClient,
  tenantId: string | null,
  year = new Date().getFullYear(),
): Promise<string> {
  const prefix = `${buildPrefix("JE", year)}-`;
  const last = await db.journalEntry.findFirst({
    where: {
      ...(tenantId ? { tenantId } : {}),
      journalNumber: { startsWith: prefix },
    },
    orderBy: { journalNumber: "desc" },
    select: { journalNumber: true },
  });

  return toBusinessNumber(
    "JE",
    year,
    parseSuffix(last?.journalNumber ?? "") + 1,
  );
}
