# RBAC Progress

Last updated: 2026-03-20

## Current Status

- Done: tenant-scoped RBAC storage, permission resolution, and session scoping are wired.
- Done: role-permission management is separated from tenant master into its own page and sidebar menu.
- Done: sidebar visibility is now permission-driven instead of mixing direct role checks.
- Done: the first broad sweep of remaining sidebar-linked pages and their visible actions is now permission-based instead of direct role-name checks.
- In progress: deeper backend workflow enforcement still contains older role-based checks in some finance and approval procedures.

## Findings From Verification

- The stronger RBAC reference in `D:\AISTECH\asset-inv`, especially `src/components/role-permission-builder-unkhair.tsx`, confirmed the direction to keep menu and feature permissions explicit instead of relying on role-name branching.
- In this repo, `tenants` and `roles` were previously coupled in one page, which made tenant administration and permission administration harder to reason about.
- The current repo still contains older role-based checks in some workflow and finance areas, so the new menu split is only the first stage of the broader RBAC cleanup.

## Changes In This Pass

- Create a dedicated `Manajemen Peran` page under `/admin/roles` for tenant-scoped role permission editing.
- Convert the existing `/admin/tenants` page into tenant-only management and remove the embedded RBAC matrix from that screen.
- Add a new `Manajemen Peran` sidebar item and rename the tenant menu to `Master Tenant`.
- Make sidebar navigation permission-driven for all visible menu entries.
- Allow non-root users with `roles:read` or `roles:update` to manage role permissions for their currently active tenant.
- Allow non-root users with `tenants:read` or `tenants:update` to view or manage memberships for their currently active tenant.
- Expand permission definitions so `travel` and `claims` now include `delete`, which aligns the permission map with existing UI actions.
- Update module labels so the RBAC screen uses the intended menu names, especially `Master Tenant` and `Manajemen Peran`.
- Add page-level permission guards to the dashboard plus an initial set of sidebar-linked pages: projects, travel, claims, approvals, and accounting.
- Extend permission definitions for bailout workflow actions with `submit` and `reject`, and align finance presets for travel lock/close coverage.
- Replace remaining page-level role gates on `chart-of-accounts`, `journal`, `accounting/[id]`, and the finance report pages with explicit permission checks.
- Make the accounting hub cards and account-saldo actions permission-aware so unsupported links and buttons no longer appear.
- Restrict finance dashboard tabs and operational buttons to the permissions that actually back those actions, including support checks for COA and balance-account dependencies.
- Convert dashboard quick links and finance widgets to explicit permission checks so the dashboard no longer relies on finance role names for visible actions.
- Gate bailout actions in both the main bailout page and the travel bailout panel with explicit permissions, while still respecting current role-specific approval stages.
- Limit user-management header actions, row actions, reset-password, and import flow to the matching `users:*` permissions.
- Finish the missed travel-page bailout-button guard so the button only appears when bailout access is granted.

## Remaining Work

- Apply the new Prisma migration to the target database.
- Re-run seed data if we want the root user default tenant change to take effect in the current environment.
- Replace older router role checks in travel, claim, approval, and finance flows with explicit permission checks where appropriate.
- Replace older backend role checks in bailout, finance, claim, and approval procedures so frontend permission visibility and API enforcement use the same source of truth.
- Consider adding implicit dependency handling similar to the `asset-inv` builder for features that require supporting read permissions from other modules.
- Revisit report/data dependencies so custom roles can receive `reports:read` without also needing manual companion grants where backend routers still depend on journal access.

## Verification Notes

- `npm run typecheck` passed on 2026-03-20 after the expanded page/button sweep.
- `npm run lint` did not run successfully because the existing script resolves `next lint` as if `lint` were a project directory (`Invalid project directory provided, no such directory: D:\AISTECH\travel-claim\lint`).
- Full write-path verification for stored role overrides still depends on applying the latest Prisma migration first.
