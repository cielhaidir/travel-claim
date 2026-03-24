# RBAC and Workflow Implementation Plan

## Recommended Direction

Implement a hybrid model:

- tenant-scoped RBAC for access control
- tenant-scoped workflow configuration for approval routing

This is the best fit for this project because the current system already has:

- tenant context in session and tRPC middleware
- shared business jobs across tenants
- tenant-specific approval flow requirements

Pure role-only RBAC is not enough here. A role can answer "what can this user do", but it cannot fully answer "who should approve this document next" because the current flow also depends on:

- request type
- travel type
- project sales lead
- department chief
- supervisor chain
- finance stage rules

So the design should explicitly separate:

1. `tenant context`
2. `authorization`
3. `workflow routing`

## Why This Direction Fits the Current Codebase

The current code already has a valid starting point for multi-tenancy:

- `TenantMembership`
- `activeTenantId` in session
- tenant-aware tRPC context

But authorization and workflow are still mixed:

- roles are split across `User.role`, `UserRole`, and `TenantMembership.role`
- approval routing is still hard-coded in router logic for the Makassar flow

That is the main thing to fix.

## Architecture Decision

### 1. Tenant First

Every protected request must resolve the active tenant first.

Rules:

- user signs in as a global identity
- user acts inside one active tenant
- all authorization is resolved inside that tenant
- all workflow selection is resolved inside that tenant

### 2. Permissions for Access Control

Access checks should use permissions, not direct role checks.

Examples:

- `travel.create`
- `travel.submit`
- `travel.read_all`
- `approval.act`
- `claim.finance_approve`
- `user.manage`
- `tenant.manage`

Roles become bundles of permissions.

This gives us:

- cleaner tRPC guards
- clearer auditability
- easier tenant variation later
- less hard-coded `if role === X` branching

### 3. Workflow Engine for Approval Routing

Approval routing should not be encoded as RBAC.

Instead, workflow rules should be stored separately per tenant and per document type.

Examples:

- MVT Makassar:
  - Employee -> Department Chief -> Director -> Finance
- MVT Jakarta:
  - Employee -> Project Manager -> Regional Manager -> Finance

The user may still have the same job role in both tenants, but the approval chain can differ.

### 4. Keep System Roles Small and Stable

For v1, keep a small global set of system roles for job or responsibility identity, such as:

- `EMPLOYEE`
- `SALES_EMPLOYEE`
- `SALES_CHIEF`
- `SUPERVISOR`
- `MANAGER`
- `DIRECTOR`
- `FINANCE`
- `ADMIN`
- `ROOT`

Do not start with fully free-form tenant-defined role names in the database.

Reason:

- current code already depends heavily on these role concepts
- a fully dynamic role designer would expand scope too much
- we need a safe migration path from the Makassar implementation first

Tenant-specific behavior should come from:

- permission bundles
- workflow definitions

not from exploding the role model.

## Target Authorization Model

### Identity Layer

Keep:

- `User` as global identity
- `TenantMembership` for membership lifecycle, status, and default tenant

`TenantMembership` should answer:

- is this user active in this tenant
- which tenant is default
- can this user enter this tenant at all

### Authorization Layer

Introduce a tenant-scoped role assignment model.

Recommended target:

- `TenantRoleAssignment`
  - `userId`
  - `tenantId`
  - `role`
  - timestamps

Important note:

The current `UserRole` shape is not a good final source of truth for multi-tenant authorization because its key structure does not model repeated roles across multiple tenants safely.

Recommended rule:

- `User.role` becomes legacy or display-only during transition
- authorization source of truth becomes tenant-scoped role assignments
- session resolves active tenant roles and effective permissions

### Permission Resolution Layer

Define permission keys in code first.

Recommended implementation:

- `src/lib/auth/permissions.ts`
- `src/lib/auth/permission-map.ts`

This should contain:

- all permission keys
- mapping from role -> permission set
- helper functions for `hasPermission` and `hasAnyPermission`

Why code-defined first:

- type-safe
- easy to review
- easy to refactor guards
- lower complexity than a fully DB-managed permission editor

If needed later, tenant permission overrides can be added after the baseline is stable.

## Target Workflow Model

Create a workflow configuration layer for approval routing.

Recommended models:

- `WorkflowDefinition`
  - `tenantId`
  - `code`
  - `entityType`
  - `isActive`
  - `version`

- `WorkflowStep`
  - `workflowDefinitionId`
  - `sequence`
  - `stepKey`
  - `approverType`
  - optional conditions

Optional condition examples:

- travel type
- claim amount range
- project required
- finance required

Recommended approver resolver types:

- `REQUESTER_SUPERVISOR`
- `REQUESTER_DEPARTMENT_CHIEF`
- `PROJECT_SALES_LEAD`
- `TENANT_ROLE_FINANCE`
- `TENANT_ROLE_DIRECTOR`
- `SPECIFIC_USER`

This lets us preserve the current Makassar logic while making it configurable per tenant.

## Implementation Strategy

### Phase 0: Lock Decisions

Confirm these decisions before coding:

1. Tenant is resolved before authorization.
2. Permissions are the main access-check unit.
3. Workflow is separate from RBAC.
4. Makassar becomes the first workflow definition to preserve current behavior.

### Phase 1: Normalize the Authorization Source of Truth

Goal:

- stop depending on mixed role sources

Tasks:

- add tenant-scoped role assignment model
- mark `User.role` as transitional
- reduce direct reliance on `UserRole`
- ensure active tenant roles can be resolved in one place

Result:

- one clear role source per active tenant

### Phase 2: Add Permission Layer

Goal:

- move access checks from role-based guards to permission-based guards

Tasks:

- define permission catalog in code
- map roles to permission bundles
- add `hasPermission` helpers
- add permission-aware tRPC procedures

Result:

- routes and procedures become easier to reason about and test

### Phase 3: Refactor Session and Context

Goal:

- expose effective authorization for the active tenant

Tasks:

- include active tenant roles in session
- include effective permissions in session or request context
- ensure root behavior remains explicit and narrow

Result:

- every protected procedure can check permissions consistently

### Phase 4: Extract Workflow Resolution from Routers

Goal:

- remove hard-coded approval chain building from router files

Tasks:

- create `workflow-service`
- move current travel and claim chain logic into that service
- preserve current Makassar behavior exactly for the first pass

Result:

- business workflow becomes reusable and testable

### Phase 5: Seed MVT Makassar as Workflow V1

Goal:

- keep current production behavior while moving to the new design

Tasks:

- create Makassar workflow definition
- map existing routing rules into workflow steps and resolvers
- validate generated chains against current travel and claim behavior

Result:

- no behavior regression for the current tenant

### Phase 6: Add Tenant Workflow Selection

Goal:

- allow other tenants to use different routing definitions

Tasks:

- attach workflow definition lookup to `activeTenantId`
- support separate definitions for:
  - travel requests
  - claims
  - bailouts if needed

Result:

- Jakarta and other tenants can diverge safely without forking router logic

### Phase 7: Add Tests Before Admin UI

Goal:

- validate the model before exposing it to manual configuration

Tasks:

- permission tests
- tenant isolation tests
- workflow resolution tests
- regression tests for Makassar chain generation

Result:

- confidence before building management screens

### Phase 8: Optional Admin UI

After the backend is stable:

- tenant role assignment management
- tenant workflow management
- workflow preview or simulation screen

This should not be Phase 1. It is safer to stabilize the backend contract first.

## Scope Recommendation for V1

Include in V1:

- tenant-scoped role assignments
- permission catalog in code
- permission-based guards
- extracted workflow service
- Makassar workflow seed

Do not include in V1:

- fully custom tenant-defined role names
- drag-and-drop workflow builder
- tenant-specific permission editor UI
- full no-code rule engine

These can come later if needed.

## Migration Notes

To keep risk controlled:

- preserve the current Makassar flow first
- add the new authorization layer behind existing behavior
- migrate router guards incrementally
- only switch to workflow definitions after parity tests pass

## Risks

Main risks:

- current role truth is duplicated
- some logic still depends on direct role enums
- approval routing currently lives inside routers
- cross-tenant supervisor and department relationships must stay isolated

## Acceptance Criteria

The implementation is successful when:

- tenant is always resolved before authorization
- access checks are permission-based
- active tenant roles are the authorization source of truth
- Makassar behavior is preserved after refactor
- a second tenant can use a different workflow without duplicating router code
- no cross-tenant approval or data leakage is possible

## Proposed Starting Path

Recommended build order:

1. normalize role source of truth
2. add permission catalog and helpers
3. refactor tRPC guards
4. extract workflow service
5. encode Makassar workflow as configuration
6. add regression tests
7. add second-tenant support

## Confirmation Needed

Please confirm these decisions before implementation:

1. We will use `tenant-scoped permissions` for access checks.
2. We will use `tenant-scoped workflow definitions` for approval routing.
3. We will treat `MVT Makassar` as the first workflow definition to preserve current behavior.
4. We will not build fully dynamic custom roles in v1.
