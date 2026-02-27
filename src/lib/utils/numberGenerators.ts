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
  year = new Date().getFullYear()
): Promise<string> {
  const count = await db.travelRequest.count({
    where: { requestNumber: { startsWith: `TR-${year}` } },
  });
  return `TR-${year}-${String(count + 1).padStart(5, "0")}`;
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
  year = new Date().getFullYear()
): Promise<string> {
  const count = await db.claim.count({
    where: { claimNumber: { startsWith: `CLM-${year}` } },
  });
  return `CLM-${year}-${String(count + 1).padStart(5, "0")}`;
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
  year = new Date().getFullYear()
): Promise<string> {
  const count = await db.approval.count({
    where: { approvalNumber: { startsWith: `APR-${year}` } },
  });
  return `APR-${year}-${String(count + 1).padStart(5, "0")}`;
}
