# CRM Implementation Plan

## Goal

Introduce a sales-focused CRM module into `travel-claim` without breaking the existing travel, approval, claim, bailout, finance, and multi-tenant architecture.

The CRM in this project should manage:

- customers
- customer contacts
- sales opportunities
- sales activities and visit history
- conversion from opportunity to project
- linkage between CRM activity and business travel

## Recommended Direction

Implement a lightweight CRM that fits the current system instead of adding a separate full enterprise CRM.

This is the best fit for the current codebase because:

- `Project` already contains `clientName`
- sales travel already depends on `Project`
- claims already contain customer-like fields such as `customerName`, `guestName`, and `guestCompany`
- the application is already a modular monolith with tenant-aware master data and workflow modules

So the correct design is:

1. add CRM as a new master-data and sales workflow layer
2. integrate it with `Project`, `TravelRequest`, and `Claim`
3. preserve current behavior during migration

## Current Codebase Signals

The current repository already shows where CRM should connect:

- `Project.clientName` in `prisma/schema.prisma`
- `Project.salesLead` in `prisma/schema.prisma`
- sales travel currently requires `projectId`
- claims still collect customer-related text manually
- sidebar navigation is currently flat, not grouped

This means CRM should unify customer data that is currently scattered across:

- project records
- travel sales context
- claim forms

## Scope for V1

Include in V1:

- customer master data
- customer contacts
- opportunity pipeline
- activity log for calls, meetings, and visits
- optional travel linkage for customer visits
- project conversion from won opportunities
- tenant-aware permissions and audit logging

Do not include in V1:

- marketing campaigns
- email automation
- customer support ticketing
- invoicing
- quotation builder
- complex forecasting
- drag-and-drop pipeline builder

## Phase 0 - Decisions to Lock First

Before coding, confirm these rules:

1. CRM in this project means sales CRM, not support/helpdesk CRM.
2. `Project` remains an execution entity, not the first CRM entity.
3. `Opportunity` comes before `Project`.
4. `CustomerContact` should be managed inside customer detail in V1, not as a separate top-level menu.
5. All CRM records must be tenant-scoped like the rest of the business data.
6. Existing text fields such as `Project.clientName` and `Claim.customerName` should stay during transition, then be deprecated later.

## Target CRM Data Model

### 1. `Customer`

Purpose:

- source of truth for company or account data

Recommended fields:

- `id`
- `tenantId`
- `code`
- `name`
- `legalName`
- `industry`
- `website`
- `email`
- `phone`
- `address`
- `city`
- `country`
- `notes`
- `ownerId`
- `status`
- `deletedAt`
- `createdAt`
- `updatedAt`

Recommended relations:

- many `CustomerContact`
- many `Opportunity`
- many `Project`
- many `CustomerActivity`

### 2. `CustomerContact`

Purpose:

- store contact persons inside a customer account

Recommended fields:

- `id`
- `tenantId`
- `customerId`
- `name`
- `jobTitle`
- `email`
- `phone`
- `isPrimary`
- `notes`
- `isActive`
- `createdAt`
- `updatedAt`

### 3. `Opportunity`

Purpose:

- represent a potential deal or sales pipeline record before it becomes a project

Recommended fields:

- `id`
- `tenantId`
- `opportunityNumber`
- `customerId`
- `ownerId`
- `title`
- `description`
- `stage`
- `estimatedValue`
- `probability`
- `expectedCloseDate`
- `nextAction`
- `lostReason`
- `wonAt`
- `lostAt`
- `projectId`
- `deletedAt`
- `createdAt`
- `updatedAt`

Recommended relation behavior:

- one `Opportunity` belongs to one `Customer`
- one `Opportunity` may convert to one `Project`

### 4. `CustomerActivity`

Purpose:

- track every call, meeting, visit, follow-up, and customer-facing event

Recommended fields:

- `id`
- `tenantId`
- `customerId`
- `contactId`
- `opportunityId`
- `projectId`
- `travelRequestId`
- `createdById`
- `assignedToId`
- `type`
- `subject`
- `notes`
- `activityDate`
- `nextFollowUpAt`
- `status`
- `outcome`
- `createdAt`
- `updatedAt`

### 5. Extend Existing Models

Recommended additions to current models:

- `Project.customerId`
- `Project.opportunityId` optional
- `TravelRequest.customerId` optional
- `TravelRequest.opportunityId` optional
- `Claim.customerId` optional later, not required in first migration

Important recommendation:

Do not remove `Project.clientName` or `Claim.customerName` in V1. Keep them as transitional fields until CRM relations are stable.

## Recommended Enums

Add enums such as:

- `CustomerStatus`
  - `PROSPECT`
  - `ACTIVE`
  - `INACTIVE`
  - `ARCHIVED`
- `OpportunityStage`
  - `LEAD`
  - `QUALIFIED`
  - `PROPOSAL`
  - `NEGOTIATION`
  - `WON`
  - `LOST`
  - `ON_HOLD`
- `CustomerActivityType`
  - `CALL`
  - `MEETING`
  - `VISIT`
  - `EMAIL`
  - `WHATSAPP`
  - `FOLLOW_UP`
  - `OTHER`
- `CustomerActivityStatus`
  - `PLANNED`
  - `COMPLETED`
  - `CANCELED`

## Phase 1 - Prisma Schema Foundation

1. Add the new CRM enums to `prisma/schema.prisma`.
2. Add new models:
   - `Customer`
   - `CustomerContact`
   - `Opportunity`
   - `CustomerActivity`
3. Add optional CRM foreign keys to:
   - `Project`
   - `TravelRequest`
4. Add tenant-aware unique constraints:
   - `Customer.code`
   - `Opportunity.opportunityNumber`
5. Add indexes for:
   - `tenantId`
   - `status`
   - `ownerId`
   - `customerId`
   - `stage`
   - `activityDate`
6. Add `deletedAt` to CRM entities to match the current soft-delete style.

## Phase 2 - Migration and Backfill Strategy

1. Create the CRM tables and optional foreign keys first.
2. Keep all new CRM relations nullable in the first migration.
3. Backfill `Customer` records from distinct `Project.clientName` values.
4. Link existing `Project` rows to the matching `Customer` where the client name is clear.
5. Do not auto-backfill from `Claim.customerName` in the first pass unless the data quality is reviewed.
6. Keep legacy text fields active while the UI transitions to relational CRM data.
7. After the first release is stable, plan a second pass to reduce manual text entry.

## Phase 3 - API Layer

Add new routers under `src/server/api/routers`:

- `customer.ts`
- `opportunity.ts`
- `customerActivity.ts`

Recommended router responsibilities:

### `customer.ts`

- `getAll`
- `getById`
- `create`
- `update`
- `delete`
- `getContacts`
- `createContact`
- `updateContact`
- `deleteContact`

### `opportunity.ts`

- `getAll`
- `getById`
- `create`
- `update`
- `changeStage`
- `convertToProject`
- `delete`

### `customerActivity.ts`

- `getAll`
- `getById`
- `create`
- `update`
- `complete`
- `cancel`
- `delete`

Required implementation rules:

- apply tenant scoping exactly like other business routers
- write `AuditLog` on create, update, delete, stage changes, and conversions
- check cross-entity tenant ownership before linking any relation

## Phase 4 - Permissions and Access Control

Add CRM permissions in `src/lib/auth/permissions.ts`.

Recommended permission keys:

- `crm.read`
- `customer.read`
- `customer.manage`
- `opportunity.read`
- `opportunity.manage`
- `opportunity.convert`
- `activity.read`
- `activity.manage`

Recommended role access for V1:

- `SALES_EMPLOYEE`
  - read CRM records they own or are assigned
  - manage their own opportunities and activities
- `SALES_CHIEF`
  - broader sales team access
- `MANAGER`
  - broader read and supervision access
- `DIRECTOR`
  - broader read access
- `ADMIN`
  - full management access

Important note:

Do not give `FINANCE` CRM management permissions by default unless there is a real operational need.

## Phase 5 - Navigation and Menu Design

Because the current sidebar is flat, the cleanest V1 menu is also flat.

Recommended new menus:

- `CRM Dashboard`
- `Customers`
- `Opportunities`
- `Activities`

Keep existing:

- `Projects`
- `Travel`
- `Claims`
- `Approvals`

Important recommendation:

Do not build grouped or collapsible CRM navigation in V1 unless the sidebar is already being refactored. The current navigation component is simpler with flat items.

## Phase 6 - UI Pages and Components

Recommended pages:

- `src/app/(authenticated)/crm/page.tsx`
- `src/app/(authenticated)/customers/page.tsx`
- `src/app/(authenticated)/opportunities/page.tsx`
- `src/app/(authenticated)/activities/page.tsx`

Recommended component groups:

- `src/components/features/crm/customers/*`
- `src/components/features/crm/opportunities/*`
- `src/components/features/crm/activities/*`

Recommended V1 page behavior:

### Customers

- customer list with search and status filter
- create and edit modal
- detail panel or detail page
- embedded contacts section inside customer detail

### Opportunities

- pipeline table or simple stage board
- stage filter
- owner filter
- expected close date
- convert-to-project action

### Activities

- list of planned and completed activities
- due-today and overdue indicators
- quick add for visit, call, meeting, follow-up
- link to customer, opportunity, and optional travel request

### CRM Dashboard

- total customers
- active opportunities
- won and lost summary
- overdue activities
- upcoming customer visits

## Phase 7 - Workflow Integration With Existing Modules

This is the most important project-specific step.

### 1. Customer to Opportunity

Recommended flow:

1. sales creates `Customer`
2. sales adds contact person
3. sales creates `Opportunity`
4. sales logs calls, meetings, and visits in `CustomerActivity`

### 2. Opportunity to Travel Request

Current problem:

- sales travel currently requires `projectId`

That is too restrictive for CRM because many sales visits happen before a project exists.

Recommended rule change:

- for `TravelRequest.travelType = SALES`, require:
  - `projectId`, or
  - `opportunityId`

Optional enhancement:

- auto-fill `customerId` from the chosen project or opportunity

This allows pre-sales travel without forcing users to create a fake project first.

### 3. Opportunity to Project

Recommended conversion flow:

1. opportunity stage moves to `WON`
2. user clicks `Convert to Project`
3. system creates `Project`
4. system links:
   - `Project.customerId`
   - `Project.opportunityId`
5. system keeps the opportunity as historical CRM context

### 4. Travel Request to Activity History

Recommended behavior:

- when a customer-facing travel request is submitted, the system may create or suggest a `CustomerActivity`
- when the trip completes, sales updates the activity outcome and next follow-up

This makes travel history visible in CRM instead of staying isolated inside travel records only.

### 5. Claim Integration

Recommended V1 behavior:

- keep existing `Claim.customerName` input for compatibility
- when a claim is linked to a travel request with `customerId`, show the linked customer in the UI
- later, replace manual customer text entry with CRM-derived data where possible

## Phase 8 - Project Module Refactor

The current `Project` module should become CRM-aware, not replaced.

Recommended changes:

1. add `customerId` to `Project`
2. keep `clientName` temporarily for migration compatibility
3. update project forms to select a customer instead of free-typing client name
4. display both customer and originating opportunity where available
5. block duplicate or unclear project creation from the same opportunity

## Phase 9 - Reporting and Dashboard Extensions

Add CRM reporting after the base module is stable.

Recommended reports:

- opportunities by stage
- opportunities by owner
- won and lost trend
- customer visit count
- overdue follow-ups
- conversion from opportunity to project

Recommended rule:

Do not mix CRM dashboard metrics into finance dashboards immediately. Keep them separate first.

## Phase 10 - Testing and Validation

Add tests for:

- tenant isolation for all CRM records
- permission checks by role
- customer and contact CRUD
- opportunity stage transitions
- project conversion from opportunity
- sales travel with `opportunityId` and no `projectId`
- no regression to existing travel submission flow
- audit log creation for CRM mutations

Critical regression scenarios:

1. existing project-based sales travel still works
2. non-sales travel is unchanged
3. claims remain valid for existing travel requests
4. tenant filtering prevents cross-tenant CRM visibility

## Recommended Build Order

Implement in this order:

1. lock CRM scope and V1 rules
2. add Prisma models and enums
3. add migration and backfill scripts
4. build customer router and pages
5. build contacts inside customer detail
6. build opportunity router and pages
7. build activity router and pages
8. integrate CRM permissions
9. update project module to use `customerId`
10. change sales travel rule from `project required` to `project or opportunity required`
11. add conversion from opportunity to project
12. add tests and regression validation

## Acceptance Criteria

The CRM implementation is successful when:

- sales users can create customers, contacts, opportunities, and activities
- customer data is no longer only free-text inside project and claim records
- sales travel can be linked to an opportunity before a project exists
- a won opportunity can be converted into a project
- CRM data is tenant-scoped and permission-protected
- audit logging exists for all major CRM actions
- existing travel, approval, claim, and finance flows still work

## Recommended V1 User Flow

Use this as the baseline business flow:

1. Create customer
2. Add contact person
3. Create opportunity
4. Log first meeting or visit activity
5. Create travel request linked to opportunity if a visit is needed
6. Complete travel, approvals, bailout, and claims as usual
7. Record visit result in customer activity
8. Update opportunity stage
9. If won, convert opportunity into project

## Final Recommendation

Do not implement CRM as a giant standalone subsystem first.

For this repository, the cleanest path is:

- customer master data
- opportunity pipeline
- activity tracking
- travel integration
- project conversion

That keeps the design aligned with how this system already works and avoids forcing the team to maintain two disconnected business processes.
