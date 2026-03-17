# Multi-Tenancy Implementation Plan

## Goal

Introduce secure tenant isolation across authentication, API, and data access layers while preserving existing functionality, supporting multi-tenant users, and migrating current single-tenant data safely.

## Scope

- Prisma schema + migration updates
- Multi-tenant membership model (user can belong to many tenants)
- Root tenant + root role behavior
- Auth/session active tenant context
- tRPC/API tenant enforcement
- Tenant-aware number generators and unique constraints
- Seed/reset/bootstrap updates
- Cross-tenant security tests
- Optional UI tenant switcher visibility

## Phase 0 — Decisions (Locked)

1. Tenant model:
   - Use many-to-many membership via `TenantMembership`
   - A user can belong to multiple tenants
   - Session carries an `activeTenantId`
2. Root model:
   - Add a dedicated global `ROOT` role (cross-tenant access)
   - Keep a `root` tenant for platform/bootstrap ownership and root user assignment
3. Uniqueness scope:
   - Per-tenant for business identifiers and tenant-owned entities
   - User identity remains global (email unique globally unless explicitly changed later)
4. Number format:
   - Keep existing format and enforce uniqueness per tenant
5. Migration bootstrap:
   - Create `root` + `default` tenant
   - Move all existing business rows into default tenant
   - Create memberships for existing users in default tenant

## Phase 1 — Schema Foundation

1. Add `Tenant` model in `prisma/schema.prisma`:
   - Fields: `id`, `slug`, `name`, `isRoot`, lifecycle timestamps
2. Add `TenantMembership` model:
   - `userId`, `tenantId`, `role`, `status`, `isDefault`, timestamps
   - Composite unique on `[userId, tenantId]`
   - Indexes for `[tenantId, role]`, `[userId, isDefault]`
3. Keep `User` as global identity:
   - Remove plan assumption of `User.tenantId`
   - Add relation to memberships (`memberships TenantMembership[]`)
4. Add `tenantId` to tenant-owned business models:
   - `Department`, `Project`, `TravelRequest`, `TravelParticipant`, `Bailout`, `Approval`, `Claim`, `Attachment`, `Notification`, `AuditLog`, `ChartOfAccount`, `BalanceAccount`, `JournalTransaction`, `UserRole`
   - (Do not add `tenantId` to `Account`, `Session`, `VerificationToken`)
5. Update uniques/indexes to tenant-scoped forms where needed:
   - Examples: `@@unique([tenantId, code])`, `@@unique([tenantId, requestNumber])`, `@@unique([tenantId, claimNumber])`
6. Add relational integrity constraints for `tenantId` FKs.

## Phase 2 — Migration Strategy

1. Migration A (expand):
   - Create `Tenant`, `TenantMembership`
   - Add nullable `tenantId` to tenant-owned tables
2. Data backfill script:
   - Create `root` tenant (`isRoot = true`) and `default` tenant
   - Set all existing tenant-owned rows to default tenant ID
   - Create membership rows for all existing users in default tenant
   - Mark one default membership per user
3. Migration B (indexes/constraints):
   - Add composite tenant unique indexes
   - Add performance indexes (`tenantId + status`, `tenantId + createdAt`, etc.)
4. Migration C (tighten):
   - Set business table `tenantId` as NOT NULL
   - Finalize FK constraints

## Phase 3 — Auth, Session, and Tenant Context

1. Extend JWT/session fields in `src/server/auth/config.ts`:
   - Add `memberships`, `activeTenantId`, `isRoot`
2. Login/session behavior:
   - Load memberships at sign-in
   - Resolve active tenant by priority: explicit selection > token value > default membership
   - Reject protected access if no active tenant and user is not root
3. Update tRPC context in `src/server/api/trpc.ts`:
   - Add middleware to require tenant context for non-root procedures
   - Add root-aware middleware/procedure variants for platform ops
4. Update MCP synthetic session in `src/app/api/mcp/[transport]/route.ts`:
   - Include memberships + active tenant + root flags
5. Ensure REST wrapper compatibility in `src/lib/api/rest-utils.ts`.

## Phase 4 — Router Scoping (Security Critical)

Apply tenant scoping across all routers in `src/server/api/routers/*`:

- Read: always filter by `tenantId` from session active tenant (unless root procedure)
- Create: always inject `tenantId` from active tenant
- Update/Delete: enforce record `tenantId` matches active tenant
- Cross-entity checks: prevent linking records from different tenants

Priority order:

1. `approval.ts`
2. `finance.ts`
3. `user.ts`
4. `travelRequest.ts`, `claim.ts`, `bailout.ts`
5. remaining routers (`dashboard`, `notification`, `audit`, etc.)

## Phase 5 — Number Generators & Business IDs

1. Update `src/lib/utils/numberGenerators.ts`:
   - Generate next number within active tenant scope
2. Update callers that generate:
   - `requestNumber`, `claimNumber`, `approvalNumber`, `bailoutNumber`, `transactionNumber`
3. Add retry/transaction safety where collisions can occur under concurrency.

## Phase 6 — Seed, Reset, and Bootstrap Data

1. Update `prisma/seed.ts`:
   - Create root tenant + default tenant first
   - Seed data in default tenant
   - Create memberships for users
   - Create root admin user with ROOT role and root tenant membership
2. Update `prisma/reset-db.ts`:
   - Preserve or recreate required tenant records
   - Rebuild admin/root membership safely
3. Replace global upserts where tenant-owned data is involved with tenant-aware keys.

## Phase 7 — UI & Admin Behavior

1. Ensure all tenant-scoped endpoints are consumed by UI pages.
2. Add tenant switcher UX (at least for multi-tenant users and root).
3. Show active tenant in header/navigation for clarity.
4. Verify admin/finance pages do not expose unintended cross-tenant data.

## Phase 8 — Testing & Validation

1. Add integration tests:
   - Tenant A cannot read/write Tenant B records
   - Multi-tenant user can switch active tenant and sees scoped data only
   - Root role can perform allowed cross-tenant operations
2. Add regression tests:
   - approvals, finance workflows, dashboards, search filters
3. Add migration validation:
   - Existing production-like data backfills correctly
   - Membership defaults are valid
4. Performance checks:
   - Confirm index usage on tenant-heavy queries.

## Risk Areas

- approval router complexity and branching
- global identifier assumptions in auth/MCP
- hierarchy links crossing tenant boundaries (supervisor/chief/project sales lead)
- root bypass misuse or overreach
- number generation collisions during concurrent writes

## Acceptance Criteria

- No cross-tenant data visibility or mutation for non-root users
- A user can belong to multiple tenants and switch active tenant
- Session always carries tenant context (`activeTenantId`) or valid root context
- All business data read/write paths are tenant-scoped
- Unique constraints enforced per tenant where applicable
- Existing data migrated successfully to default tenant
- Root tenant and root role bootstrap works end-to-end
