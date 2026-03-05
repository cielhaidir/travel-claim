# Single-Role to Multi-Role Authorization Migration Plan

_Last updated: 2026-03-04 (UTC)_

## 1) Objective and Non-Goals

### Objective
Migrate authorization from single scalar `User.role` to a multi-role join-table model (`UserRole`) with controlled rollout, backward compatibility during transition, and zero downtime for core workflows.

Primary references:
- Current schema: [`prisma/schema.prisma`](../prisma/schema.prisma)
- Hardcoded usage inventory: [`docs/ROLE_HARDCODED_USAGE_TRACKER.md`](./ROLE_HARDCODED_USAGE_TRACKER.md)

### Non-Goals
- No full RBAC/ABAC redesign in this migration.
- No broad business-process redesign for approvals/travel/claim routing.
- No immediate deletion of all role constants in one release; cleanup is phased.
- No unrelated data model refactors.

---

## 2) Current-State Summary (Single `User.role` Assumptions)

Based on [`prisma/schema.prisma`](../prisma/schema.prisma), users currently have a scalar enum field:
- `User.role Role @default(EMPLOYEE)`

Current assumption pattern across code (from [`docs/ROLE_HARDCODED_USAGE_TRACKER.md`](./ROLE_HARDCODED_USAGE_TRACKER.md)):
- Session/JWT stores one role (`session.user.role`, `token.role`).
- Guard middleware and routers use inline role arrays and equality checks.
- Frontend navigation/pages gate by one role value.
- Seed logic sets one role per user.
- Taxonomy drift exists (`FINANCE` vs `FINANCE_MANAGER`) and must be aligned first.

Impact:
- A user cannot represent multiple operational responsibilities simultaneously (e.g., approver + finance fallback).
- Role checks are duplicated and inconsistent, increasing authorization regression risk.

---

## 3) Target-State Architecture (Join Table `UserRole`)

### Data Model Target
Retain role enum as taxonomy source, but assign many roles per user via join table.

Proposed Prisma shape (illustrative):

```prisma
model User {
  id        String     @id @default(cuid())
  // ...existing fields...
  role      Role?      @default(EMPLOYEE) // legacy compatibility, removed in Phase 5
  userRoles UserRole[]
}

model UserRole {
  userId    String
  role      Role
  createdAt DateTime   @default(now())
  createdBy String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([userId, role])
  @@index([role])
}
```

### Authorization Access Pattern Target
- Canonical runtime model: `session.user.roles: Role[]`.
- Transitional compatibility: optionally derive `session.user.role` from ordered precedence until Phase 5.
- Centralized checks:
  - `hasRole(user.roles, role)`
  - `hasAnyRole(user.roles, roleGroup)`
  - optional capability map for high-risk endpoints.

---

## 4) Phased Migration Plan with Gates

## Phase 0 — Prep (taxonomy alignment, feature flag)

**Goal:** remove ambiguity before schema change.

### Work
- Align canonical role taxonomy (`FINANCE` vs `FINANCE_MANAGER`) using a single source (e.g., [`src/lib/constants/roles.ts`](../src/lib/constants/roles.ts)).
- Define feature flag: `AUTH_MULTIROLE_ENABLED` (off by default).
- Decide primary-role precedence (for temporary shim only).
- Publish migration ADR/plan and communicate owner matrix.

### Gate to Phase 1
- Taxonomy approved by backend + frontend owners.
- Feature flag merged and environment strategy documented.
- No unresolved naming conflicts in role constants.

---

## Phase 1 — Schema Expand

**Goal:** additive schema changes, no behavior flip.

### Work
- Add `UserRole` table + indexes + FK.
- Keep legacy `User.role` unchanged.
- Add Prisma relation fields and generate client.
- Add migration script with idempotent constraints.

### Gate to Phase 2
- Migration applies cleanly in dev/staging.
- Read/write performance baseline captured for user auth queries.
- Rollback migration validated in staging.

---

## Phase 2 — Data Backfill

**Goal:** every active user has at least one `UserRole` row matching legacy role.

### Work
- Backfill from `User.role` into `UserRole` with upsert/ignore semantics.
- Add verification queries (counts + mismatch report).
- Freeze manual role edits during backfill window or route through dual-write admin path.

### Gate to Phase 3
- 100% eligible users have `UserRole` entries.
- Mismatch report is empty (or approved exceptions documented).
- Backfill rerun proven idempotent.

---

## Phase 3 — Dual Read/Write in App Layer

**Goal:** application writes both models; reads prefer feature-flag path.

### Work
- Auth callbacks include `roles[]` from `UserRole`; keep derived scalar role compatibility shim.
- User-management mutations dual-write:
  - write `UserRole` set (source of truth)
  - update `User.role` derived primary role (temporary)
- Convert guard utility signatures to support arrays first, scalar fallback second.
- Add structured logs for read-source (`legacy|multirole`).

### Gate to Phase 4
- Flag-off path stable (legacy behavior unchanged).
- Flag-on path stable for internal users.
- No critical authorization diffs in regression matrix.

---

## Phase 4 — Consumer Migration (auth, guards, routers, frontend, seed)

**Goal:** migrate all role consumers to multi-role-safe checks.

### Work
- Auth/session model migration in [`src/server/auth/config.ts`](../src/server/auth/config.ts).
- Guard/middleware migration in [`src/server/api/trpc.ts`](../src/server/api/trpc.ts) and [`src/lib/api/rest-utils.ts`](../src/lib/api/rest-utils.ts).
- Router-by-router replacement of inline role arrays using tracker hotspots in [`docs/ROLE_HARDCODED_USAGE_TRACKER.md`](./ROLE_HARDCODED_USAGE_TRACKER.md).
- Frontend gating migration (navigation/pages/components) to array-aware helpers.
- Seed migration in [`prisma/seed.ts`](../prisma/seed.ts) to populate `UserRole` and stop single-role assumptions.

### Gate to Phase 5
- All P0/P1 tracker items migrated or waived with signed risk acceptance.
- Frontend and backend authorization parity tests pass.
- Production canary shows no auth error spike.

---

## Phase 5 — Contract Cleanup (drop legacy `User.role`)

**Goal:** remove compatibility layer and legacy column.

### Work
- Remove `session.user.role` shim and scalar guard fallbacks.
- Delete dead constants/helpers that assume single-role.
- Drop `User.role` column in a dedicated migration.
- Update docs/runbooks.

### Gate to Done
- No read/write path depends on `User.role`.
- DB migration applied in production with rollback plan expired/closed.
- Post-cutover monitoring window passes without critical auth incidents.

---

## 5) Per-Phase Checklist (Owner, Risk, Rollback, Validation)

| Phase | Checklist Item | Owner Hint | Risk | Rollback | Validation Criteria |
|---|---|---|---|---|---|
| 0 | Canonical taxonomy approved | Backend lead + FE lead | Medium | Revert constants PR | Single canonical role map merged; no taxonomy conflicts |
| 0 | Feature flag added + default OFF | Platform/backend | Low | Disable flag globally | Config present in env and code paths |
| 1 | `UserRole` model + migration added | Backend/DB | Medium | Down migration / restore snapshot | Migration succeeds in staging |
| 1 | Index + FK perf reviewed | Backend/DB | Medium | Drop new indexes if needed | Explain plans acceptable for auth queries |
| 2 | Backfill script implemented idempotently | Backend/DB | High | Rerun-safe; restore backup if needed | Repeated run yields same counts |
| 2 | Backfill verification report generated | Backend/QA | Medium | Re-run after fixes | 0 mismatches or approved exceptions |
| 3 | Dual-write enabled in role mutations | Backend | High | Flag off + stop dual-write | Writes reflected in both legacy and new store |
| 3 | Dual-read enabled behind flag | Backend | High | Flip flag OFF | Auth decisions match baseline matrix |
| 4 | Guard/router migrations complete | Backend | High | Per-router revert PRs | Tracker P0/P1 completed |
| 4 | Frontend gating migrated | Frontend | Medium | Feature-flag fallback | UI access parity for role combinations |
| 4 | Seed path updated | Backend | Medium | Revert seed changes | Fresh env bootstraps correctly with `UserRole` |
| 5 | Remove legacy scalar contract | Backend | High | Emergency hotfix branch + restore column backup | No compile/runtime refs to `user.role` |
| 5 | Drop `User.role` column | Backend/DB | High | DB backup restore / recreate column with derived values | Migration complete + smoke tests pass |

---

## 6) Idempotent Backfill Strategy Examples (SQL + Prisma)

### SQL Example (PostgreSQL)

```sql
-- 1) Insert missing role rows from legacy scalar field
INSERT INTO "UserRole" ("userId", "role", "createdAt")
SELECT u."id", u."role"::text::"Role", NOW()
FROM "User" u
WHERE u."deletedAt" IS NULL
ON CONFLICT ("userId", "role") DO NOTHING;

-- 2) Optional: ensure each active user has at least one role
-- (report only)
SELECT u."id"
FROM "User" u
LEFT JOIN "UserRole" ur ON ur."userId" = u."id"
WHERE u."deletedAt" IS NULL
GROUP BY u."id"
HAVING COUNT(ur."role") = 0;

-- 3) Mismatch report: legacy role missing in join table
SELECT u."id", u."role"
FROM "User" u
LEFT JOIN "UserRole" ur
  ON ur."userId" = u."id" AND ur."role" = u."role"::text::"Role"
WHERE u."deletedAt" IS NULL
  AND ur."userId" IS NULL;
```

### Prisma Script Example (idempotent)

```ts
import { PrismaClient, Role } from "../generated/prisma";

const prisma = new PrismaClient();

async function backfillUserRoles() {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, role: true },
  });

  for (const user of users) {
    await prisma.userRole.upsert({
      where: { userId_role: { userId: user.id, role: user.role as Role } },
      update: {},
      create: { userId: user.id, role: user.role as Role },
    });
  }
}

backfillUserRoles()
  .finally(async () => {
    await prisma.$disconnect();
  });
```

Operational rule: backfill scripts must be safe to rerun and produce deterministic outcomes.

---

## 7) Test Plan (Unit / Integration / E2E + Authorization Regression Matrix)

### Unit
- Role helper tests:
  - `hasRole`, `hasAnyRole`, role precedence shim, taxonomy mapping.
- Policy/guard tests for each procedure wrapper.
- Serialization tests for session payload (`role` compatibility + `roles[]`).

### Integration
- Auth callback integration:
  - JWT/session contents under flag OFF vs ON.
- Router authorization integration for high-risk endpoints listed in tracker.
- Seed integration ensures baseline users get expected `UserRole` rows.

### E2E
- Critical journeys per role-combination persona:
  - employee-only
  - manager-only
  - finance-only
  - admin-only
  - manager+finance
  - director+admin
- Validate navigation visibility + API enforcement alignment.

### Authorization Regression Matrix (minimum)

| Persona | Roles | Expected Access Examples |
|---|---|---|
| P1 | `EMPLOYEE` | Own requests/claims only |
| P2 | `MANAGER` | Team approvals + manager dashboards |
| P3 | `FINANCE` | Finance processing/lock/close actions |
| P4 | `ADMIN` | Global admin/user management |
| P5 | `MANAGER`,`FINANCE` | Union of manager + finance privileges |
| P6 | `DIRECTOR`,`ADMIN` | Director chain + admin global |

Pass criterion: no persona loses previously intended access unless explicitly approved.

---

## 8) Deployment and Monitoring Plan (Metrics / Logs / Alerts)

### Deployment Strategy
1. Deploy Phase 1 schema expand (no behavior change).
2. Run Phase 2 backfill + verify.
3. Deploy dual-read/write code with flag OFF.
4. Enable flag for internal/canary cohort.
5. Progressive rollout to 100%.
6. Execute Phase 5 cleanup after stability window.

### Metrics
- Authorization deny rate per endpoint.
- 401/403 rates split by `read_source=legacy|multirole`.
- Login/session creation failure rate.
- Role mutation success/failure counts.

### Logs
- Structured auth decision log fields:
  - `userId`, `roles`, `requiredPolicy`, `decision`, `readSource`, `flagState`.
- Backfill logs:
  - inserted count, skipped count, mismatch count.

### Alerts
- Spike in 401/403 above baseline threshold.
- Session callback errors above threshold.
- Backfill mismatch count > 0 after completion gate.

---

## 9) Timeline Proposal + Dependency Order + Final Cutover DoD

### Concise Timeline (3 Weeks)
- **Week 1:** Phase 0 + Phase 1 (taxonomy alignment, feature flag, schema expand).
- **Week 2:** Phase 2 + Phase 3 (backfill, dual read/write, internal canary).
- **Week 3:** Phase 4 + Phase 5 (consumer migration completion, cleanup, legacy drop).

### Dependency Order
1. Taxonomy alignment →
2. Feature flag introduction →
3. Schema expand (`UserRole`) →
4. Backfill + verification →
5. Dual-write then dual-read rollout →
6. Consumer migrations (auth/guards/routers/frontend/seed) →
7. Legacy contract removal (`User.role`).

### Final Cutover Checklist
- [ ] Feature flag ON for 100% traffic with stable error budget.
- [ ] `session.user.roles` used by all guards and UI gating.
- [ ] Tracker hotspots from [`docs/ROLE_HARDCODED_USAGE_TRACKER.md`](./ROLE_HARDCODED_USAGE_TRACKER.md) closed or formally waived.
- [ ] Seed path writes `UserRole` and passes fresh environment bootstrap.
- [ ] Backfill mismatch report remains zero for consecutive checks.
- [ ] Runbook + rollback docs updated.
- [ ] Legacy `User.role` dropped via production migration.

### Definition of Done
Migration is complete when authorization decisions are sourced exclusively from multi-role data (`UserRole`), all critical consumers are migrated and tested, production monitoring is stable through post-cutover window, and legacy scalar role contract is removed.