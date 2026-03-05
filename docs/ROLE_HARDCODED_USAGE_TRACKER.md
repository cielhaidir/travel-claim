# Hardcoded Role Usage Tracker

_Last updated: 2026-03-04 (UTC)_

## 1) Summary

Repository scan found repeated hardcoded role usage across auth/session mapping, procedure guards, router authorization branches, seed data, and frontend UI gating.

Key risk themes:
- **Single-role assumption** (`session.user.role` as scalar) blocks safe multi-role expansion.
- **Duplicated role arrays** are spread across files and drift over time.
- **Literal string checks** (`"ADMIN"`, `"FINANCE"`, etc.) are mixed with enum checks, causing inconsistency.
- **Role taxonomy mismatch** exists (`FINANCE` in many backend paths vs `FINANCE_MANAGER` in [`src/lib/constants/roles.ts`](../src/lib/constants/roles.ts)).

## 2) Method / Search Patterns Used

Scanned with repository-wide regex patterns for:
- Role string literals: `"ADMIN"|"FINANCE"|"EMPLOYEE"|"MANAGER"|...`
- Direct comparisons: `role ===`, `role !==`
- Role arrays/guard lists: `roles: [..]`, `includes(ctx.session.user.role)`
- Prisma role filters: `where: { role: ... }`, `role: { in: [...] }`
- Session/JWT role mapping assumptions: `token.role`, `session.user.role`

Primary command-style searches were run against `src/` and `prisma/` for `*.ts`, `*.tsx`, and related files.

## 3) Findings Table

| Area | File | Line | Snippet / Description | Usage Type | Migration Priority | Proposed multi-role-safe replacement |
|---|---|---:|---|---|---|---|
| auth | [`src/server/auth/config.ts`](../src/server/auth/config.ts#L12) | 12 | Role union is hardcoded string literal set | Hardcoded role taxonomy | High | Import canonical role type from single source-of-truth and expose `roles: Role[]` in session model |
| auth | [`src/server/auth/config.ts`](../src/server/auth/config.ts#L195) | 195 | OAuth bootstrap defaults role to `"EMPLOYEE"` | Default role literal | Medium | Map through `DEFAULT_USER_ROLES` constant (array-based) |
| auth | [`src/server/auth/config.ts`](../src/server/auth/config.ts#L228) | 228 | JWT maps `token.role = user.role` (scalar) | Session token single-role assumption | High | Store `token.roles` array and derive primary role only for display |
| auth | [`src/server/auth/config.ts`](../src/server/auth/config.ts#L292) | 292 | Session maps `session.user.role = token.role` | Session shape single-role assumption | High | Migrate to `session.user.roles` + helper `hasRole/hasAnyRole` over arrays |
| auth | [`src/lib/auth/utils.ts`](../src/lib/auth/utils.ts#L83) | 83 | `isAdmin()` uses `hasRole("ADMIN")` | Direct literal role check | Medium | Replace with `hasCapability(Capability.ADMIN_GLOBAL)` |
| auth | [`src/lib/auth/utils.ts`](../src/lib/auth/utils.ts#L90) | 90 | `hasAnyRole(["MANAGER", ...])` list inline | Inline role hierarchy list | High | Replace with central `ROLE_GROUPS.MANAGEMENT_CHAIN` |
| auth | [`src/lib/auth/utils.ts`](../src/lib/auth/utils.ts#L120) | 120 | Approval level mapping via literal arrays | Role ladder encoded in code | High | Move to config map `APPROVAL_LEVEL_CAPABILITIES` |
| auth | [`src/lib/auth/utils.ts`](../src/lib/auth/utils.ts#L148) | 148 | `session.user.role === "ADMIN"` | Direct equality check | High | Use `hasAnyRole(session.user.roles, ROLE_GROUPS.ADMIN_EQUIVALENTS)` |
| auth | [`src/lib/auth/utils.ts`](../src/lib/auth/utils.ts#L151) | 151 | `session.user.role === "FINANCE"` | Direct equality check | High | Use capability `FINANCE_APPROVAL` or canonical finance role group |
| middleware/guards | [`src/server/api/trpc.ts`](../src/server/api/trpc.ts#L215) | 215 | `supervisorProcedure` role list inline | Guard role array hardcoding | High | Use `enforceCapability("approval:level1")` |
| middleware/guards | [`src/server/api/trpc.ts`](../src/server/api/trpc.ts#L221) | 221 | `managerProcedure` role list inline | Guard role array hardcoding | High | Use centralized policy map per procedure |
| middleware/guards | [`src/server/api/trpc.ts`](../src/server/api/trpc.ts#L233) | 233 | `financeProcedure` uses `["FINANCE","ADMIN"]` | Guard role array hardcoding | High | Use `ROLE_GROUPS.FINANCE_ACCESS` constant |
| middleware/guards | [`src/server/api/trpc.ts`](../src/server/api/trpc.ts#L239) | 239 | `adminProcedure` uses `["ADMIN"]` | Guard strict role literal | Medium | Use `hasCapability("admin:all")` |
| middleware/guards | [`src/lib/api/rest-utils.ts`](../src/lib/api/rest-utils.ts#L241) | 241 | `requireRoles(context.session.user.role, allowedRoles)` | Scalar role passed into role guard | High | Change signature to `requireRoles(user.roles, allowedRoles)` |
| routers | [`src/server/api/routers/travelRequest.ts`](../src/server/api/routers/travelRequest.ts#L59) | 59 | Privileged list `MANAGER/DIRECTOR/ADMIN/FINANCE` inline | Router-level inline role array | High | Replace with shared `ROLE_GROUPS.TRAVEL_READ_ALL` |
| routers | [`src/server/api/routers/travelRequest.ts`](../src/server/api/routers/travelRequest.ts#L940) | 940 | Finance close/lock actions gated by `["FINANCE","ADMIN"]` | Action authorization literal array | High | Replace with `can(ctx.user, "travel.lock")` policy check |
| routers | [`src/server/api/routers/claim.ts`](../src/server/api/routers/claim.ts#L56) | 56 | Claim visibility role list inline | Router visibility hardcoding | High | Reuse shared capability `claim.read_all` |
| routers | [`src/server/api/routers/attachment.ts`](../src/server/api/routers/attachment.ts#L55) | 55 | Attachment visibility role list inline | Router visibility hardcoding | High | Reuse same policy as claim visibility |
| routers | [`src/server/api/routers/approval.ts`](../src/server/api/routers/approval.ts#L1383) | 1383 | Export endpoints restricted to `ADMIN/DIRECTOR/MANAGER` | Endpoint role array hardcoding | Medium | Use `approval.export` capability mapping |
| routers | [`src/server/api/routers/auditLog.ts`](../src/server/api/routers/auditLog.ts#L164) | 164 | “Managers and above” hardcoded as role array | Hierarchy duplicated in router | High | Replace with centralized `isManagementOrFinance()` policy |
| routers | [`src/server/api/routers/notification.ts`](../src/server/api/routers/notification.ts#L133) | 133 | Cross-user read allowed only for `ADMIN` equality check | Direct role equality | Medium | Use capability `notification.read_any` |
| routers | [`src/server/api/routers/user.ts`](../src/server/api/routers/user.ts#L327) | 327 | Profile access uses inline `[MANAGER,DIRECTOR,ADMIN]` | Router authorization list | Medium | Replace with `ROLE_GROUPS.USER_PROFILE_READ_OTHERS` |
| routers | [`src/server/api/routers/bailout.ts`](../src/server/api/routers/bailout.ts#L17) | 17 | `SALES_CHIEF_ROLES` / `DIRECTOR_ROLES` arrays in file | Local role-group duplication | High | Move role groups to shared constants/policy module |
| routers | [`src/server/api/routers/bailout.ts`](../src/server/api/routers/bailout.ts#L280) | 280 | Prisma filter `role: { in: [Role.SALES_CHIEF, Role.MANAGER] }` | Prisma role filter hardcoding | High | Query by permission-bearing group IDs/capabilities, not raw role literals |
| routers | [`src/server/api/routers/finance.ts`](../src/server/api/routers/finance.ts#L17) | 17 | Local `FINANCE_ROLES = [Role.FINANCE, Role.ADMIN]` | Duplicated role-group declaration | High | Import shared `ROLE_GROUPS.FINANCE_ACCESS` |
| routers | [`src/server/api/routers/balanceAccount.ts`](../src/server/api/routers/balanceAccount.ts#L436) | 436 | `ctx.session.user.role !== Role.ADMIN` | Direct enum inequality | Medium | Use `can(ctx.user, "balance.delete_any")` |
| seed | [`prisma/seed.ts`](../prisma/seed.ts#L64) | 64 | Seed user role literals (e.g., `ADMIN`) | Seed role literals | Medium | Use shared role constants/enums for seed payloads |
| seed | [`prisma/seed.ts`](../prisma/seed.ts#L105) | 105 | Seed user role literal `MANAGER` | Seed role literals | Medium | Use helper `seedUser({ roles: [...] })` |
| seed | [`prisma/seed.ts`](../prisma/seed.ts#L131) | 131 | Seed user role literal `FINANCE` | Seed role literals / taxonomy drift risk | High | Align to canonical taxonomy (`FINANCE` vs `FINANCE_MANAGER`) before multi-role migration |
| seed | [`prisma/seed.ts`](../prisma/seed.ts#L247) | 247 | Seed user role literal `EMPLOYEE` | Seed default literal | Low | Use `DEFAULT_USER_ROLES` constant |
| frontend | [`src/components/navigation/SidebarNav.tsx`](../src/components/navigation/SidebarNav.tsx#L28) | 28 | Menu items define inline `roles: [...]` arrays | UI role gating hardcoding | High | Gate by capability metadata per nav item |
| frontend | [`src/components/navigation/SidebarNav.tsx`](../src/components/navigation/SidebarNav.tsx#L77) | 77 | Fallback `session.user.role ?? "EMPLOYEE"` | Scalar role fallback assumption | High | Use `session.user.roles ?? [DEFAULT_ROLE]` and capability check |
| frontend | [`src/app/(authenticated)/approvals/page.tsx`](../src/app/(authenticated)/approvals/page.tsx#L14) | 14 | `APPROVER_ROLES` hardcoded with `FINANCE_MANAGER` | Frontend hardcoded list + taxonomy mismatch | High | Import shared backend-safe approver policy surface |
| frontend | [`src/app/(authenticated)/admin/users/page.tsx`](../src/app/(authenticated)/admin/users/page.tsx#L89) | 89 | Redirect when `userRole !== "ADMIN"` | Direct equality guard in page | Medium | Use reusable hook `useCan("user.admin")` |
| frontend | [`src/app/(authenticated)/admin/users/page.tsx`](../src/app/(authenticated)/admin/users/page.tsx#L271) | 271 | Role filter `<option value="...">` list literal | UI role options hardcoding | Medium | Build options from canonical role registry |
| frontend | [`src/app/(authenticated)/dashboard/page.tsx`](../src/app/(authenticated)/dashboard/page.tsx#L103) | 103 | UI branch on `role !== "EMPLOYEE"` | Direct literal comparison | Medium | Use explicit capability gate (`dashboard.approver_widgets`) |
| frontend | [`src/app/(authenticated)/bailout/page.tsx`](../src/app/(authenticated)/bailout/page.tsx#L69) | 69 | `chiefRoles/directorRoles/financeRoles` arrays inline | Page-level role arrays | High | Replace with shared role-group constants or capability predicates |
| frontend | [`src/components/features/travel/BailoutPanel.tsx`](../src/components/features/travel/BailoutPanel.tsx#L232) | 232 | Same role arrays duplicated in component | Duplicated frontend gating | High | Consume shared `canApproveBailoutAtLevel(user, level)` helper |
| frontend | [`src/components/features/coa/COATable.tsx`](../src/components/features/coa/COATable.tsx#L48) | 48 | `isAdmin = userRole === "ADMIN"` | Direct equality in UI component | Medium | Use `hasCapability("coa.manage")` |
| frontend | [`src/components/features/coa/COAHierarchyView.tsx`](../src/components/features/coa/COAHierarchyView.tsx#L154) | 154 | `isAdmin` via role literal | Direct equality in UI component | Medium | Use shared permission hook/helper |

## 4) Grouped Sections by Area

### Auth

Main concentration points:
- Hardcoded role taxonomy and defaults in [`src/server/auth/config.ts`](../src/server/auth/config.ts).
- Single-role session/jwt mapping (`role` scalar) in auth callbacks.
- Inline role ladders and direct equality checks in [`src/lib/auth/utils.ts`](../src/lib/auth/utils.ts).

### Middleware / Guards

Main concentration points:
- Procedure guards define many role arrays inline in [`src/server/api/trpc.ts`](../src/server/api/trpc.ts).
- REST guard utility still expects scalar role input in [`src/lib/api/rest-utils.ts`](../src/lib/api/rest-utils.ts).

### Routers

Main concentration points:
- Repeated inline role lists in travel/claim/attachment/approval/audit routers.
- Mixed styles: string literals, enum checks, local role constants, and Prisma role filters.
- Local re-definition of finance/chief/director role groups across routers.

### Seed

Main concentration points:
- Seed data writes role literals directly in many user upserts in [`prisma/seed.ts`](../prisma/seed.ts).
- Taxonomy consistency risk with finance naming across frontend/backend role systems.

### Frontend

Main concentration points:
- Navigation and page/component gating relies on inline role arrays/equality.
- Duplicated bailout approval role arrays across page and component.
- Role selection/filter options manually enumerated in admin users page.

## 5) Action Checklist (Migration Order)

- [ ] **Unify canonical role taxonomy** (resolve `FINANCE` vs `FINANCE_MANAGER`) in one shared source.
- [ ] **Introduce multi-role session model** (`user.roles: Role[]`) while retaining temporary compatibility shim for `user.role`.
- [ ] **Add capability/policy layer** (`can(user, capability)`) and migrate auth utility helpers first.
- [ ] **Refactor middleware/guards** (`enforceRole` → capability/group-driven checks).
- [ ] **Consolidate router authorization** by replacing inline arrays with shared policy helpers.
- [ ] **Replace Prisma role filters** with centralized group/capability-resolved role sets.
- [ ] **Migrate frontend gating** (nav/pages/components) to shared permission hooks.
- [ ] **Normalize seed definitions** to use canonical role constants/helpers.
- [ ] **Remove scalar-role compatibility paths** after all call sites are migrated.

---

This tracker intentionally captures hardcoded-role hotspots only. No application logic or schema changes were performed.
