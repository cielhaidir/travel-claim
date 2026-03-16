# Travel Claim System - Implemented Architecture

**Project:** `travel-claim`  
**Repository path:** `D:\AISTECH\travel-claim`  
**Document purpose:** describe the architecture that is actually implemented in the codebase today, module by module  
**Source of truth:** code inspection of the current repository on 2026-03-12  
**Related design doc:** `docs/architecture.md`

---

## 1. Executive Summary

This project is a monolithic business application built with Next.js App Router, Prisma, NextAuth, tRPC, React Query, and Tailwind CSS. The system manages:

- business travel requests
- approval workflows
- bailout requests
- reimbursement claims
- finance processing
- chart of accounts and journal entries
- notifications and audit logging
- MCP exposure for agent or WhatsApp-style integrations

The application is organized as a single deployable web app with:

- App Router pages for UI
- tRPC routers for backend application logic
- Prisma for persistence
- NextAuth for authentication and session handling
- optional Cloudflare R2 storage support
- optional MCP and WhatsApp integration paths

This is not a microservice architecture. It is a modular monolith.

---

## 2. Current Runtime Stack

## Frontend

- Next.js 16
- React 19
- App Router
- Tailwind CSS 4
- React Query
- tRPC React client

## Backend

- Next.js route handlers
- tRPC 11
- NextAuth v5 beta
- Prisma 6
- PostgreSQL
- Zod 4

## Integrations

- Microsoft Entra ID login when configured
- Google login when configured
- credentials login
- MCP transport via `trpc-to-mcp`
- WhatsApp helper functions
- Cloudflare R2 storage client

## Important note

The original architecture file describes OpenAPI generation as part of the stack. In the current implementation, OpenAPI generation is disabled because `trpc-to-openapi` was removed for Zod v4 compatibility. The route still exists, but returns `null`.

---

## 3. Top-Level Architecture

```text
Browser / User
    |
    v
Next.js App Router
    |
    +-- Public pages
    |     - login
    |     - api docs
    |
    +-- Authenticated pages
    |     - dashboard
    |     - travel
    |     - claims
    |     - approvals
    |     - bailout
    |     - finance
    |     - projects
    |     - chart of accounts
    |     - admin users
    |
    +-- API route handlers
          - /api/auth/*
          - /api/trpc/*
          - /api/mcp/*
          - /api/openapi.json
                |
                v
          tRPC root router
                |
                +-- domain routers
                |     - travelRequest
                |     - approval
                |     - claim
                |     - bailout
                |     - finance
                |     - project
                |     - department
                |     - user
                |     - chartOfAccount
                |     - journalTransaction
                |     - balanceAccount
                |     - auditLog
                |     - notification
                |     - attachment
                |     - dashboard
                |     - post
                |
                v
             Prisma Client
                |
                v
            PostgreSQL
```

---

## 4. Layered View

## 4.1 Presentation Layer

Location:

- `src/app`
- `src/components`
- `src/styles`

Responsibilities:

- route handling
- server-side auth gatekeeping for private pages
- rendering dashboard and feature screens
- calling tRPC from client components
- shared shell and navigation

## 4.2 Application Layer

Location:

- `src/server/api`
- part of `src/server/auth`
- selected utilities under `src/lib`

Responsibilities:

- authorization
- request validation
- orchestration of workflows
- approval-chain generation
- finance processing
- audit log creation
- notification triggering

Important characteristic:

Most business logic currently lives directly inside tRPC routers. There is no active dedicated `services/` layer implementing the business workflows yet.

## 4.3 Data Layer

Location:

- `prisma/schema.prisma`
- `prisma/migrations`
- `src/server/db.ts`

Responsibilities:

- database schema
- relational modeling
- Prisma client access
- migrations and seeding

## 4.4 Integration Layer

Location:

- `src/app/api/mcp`
- `src/lib/utils/whatsapp.ts`
- `src/lib/storage/r2.ts`
- `src/server/auth/config.ts`

Responsibilities:

- MCP tool exposure
- WhatsApp payload creation and outbound requests
- external identity provider support
- object storage support

---

## 5. Module-by-Module Architecture

## 5.1 App Shell and Routing

### Root layout

Files:

- `src/app/layout.tsx`
- `src/styles/globals.css`

Responsibilities:

- global metadata
- font setup
- wrap the app with `TRPCReactProvider`
- wrap the app with `SessionProvider`

### Authenticated route group

Files:

- `src/app/(authenticated)/layout.tsx`
- `src/components/layouts/AppShell.tsx`
- `src/components/navigation/*`

Responsibilities:

- server-side session check using `auth()`
- redirect unauthenticated users to `/login`
- render the persistent app shell
- host sidebar and top navigation

### Public route group

Files:

- `src/app/(public)/login/page.tsx`
- `src/app/(public)/api-docs/page.tsx`

Responsibilities:

- login UI
- API documentation page shell

### Feature pages currently implemented

- `dashboard`
- `travel`
- `claims`
- `approvals`
- `bailout`
- `finance`
- `projects`
- `chart-of-accounts`
- `admin/users`

Observation:

The pages are present, but not every page appears equally mature. The dashboard page in particular still uses placeholder-style content rather than a fully live data composition.

---

## 5.2 Authentication and Authorization Module

Files:

- `src/server/auth/config.ts`
- `src/server/auth/index.ts`
- `src/lib/auth/utils.ts`
- `src/lib/auth/role-check.ts`
- `src/lib/constants/roles.ts`

Responsibilities:

- configure NextAuth
- support credentials login
- support Microsoft Entra login when env vars exist
- support Google login when env vars exist
- map users to primary and secondary roles
- expose cached `auth()`, `signIn()`, and `signOut()`
- provide reusable role-check helpers

Key implementation details:

- sessions use JWT strategy
- user records are stored in Prisma
- roles are stored both as `User.role` and in `UserRole`
- route and procedure authorization is role-driven
- authentication events write audit logs

Architectural implication:

Auth is not limited to Microsoft Entra. The implementation is already multi-provider, with credentials fallback.

---

## 5.3 tRPC Platform Module

Files:

- `src/server/api/trpc.ts`
- `src/server/api/root.ts`
- `src/app/api/trpc/[trpc]/route.ts`
- `src/trpc/react.tsx`
- `src/trpc/query-client.ts`
- `src/trpc/server.ts`

Responsibilities:

- create shared tRPC context with `db` and `session`
- define protected and role-gated procedures
- register domain routers
- expose the HTTP handler under `/api/trpc`
- configure the React Query + tRPC client

Procedure types:

- `publicProcedure`
- `protectedProcedure`
- `supervisorProcedure`
- `managerProcedure`
- `directorProcedure`
- `financeProcedure`
- `adminProcedure`

Architectural implication:

This is the primary application interface inside the monolith. Most business workflows start or end here.

---

## 5.4 Domain Module: Travel Requests

Files:

- `src/server/api/routers/travelRequest.ts`
- `src/components/features/travel/TravelRequestForm.tsx`
- `src/components/features/travel/BailoutPanel.tsx`

Responsibilities:

- create and update travel requests
- list and filter requests
- get requests by ID or participant employee ID
- submit a request into the approval flow
- build dynamic approval chains
- lock and close travel requests
- manage initial nested bailout creation
- write audit logs
- trigger first-approver WhatsApp notifications

Core business concepts:

- requester
- participants
- travel type
- project link for sales travel
- approval chain
- lifecycle status from draft to closed

Important implementation detail:

Approval routing logic is embedded directly in the travel router, not isolated into a dedicated workflow engine module.

---

## 5.5 Domain Module: Approvals

Files:

- `src/server/api/routers/approval.ts`

Responsibilities:

- fetch approval details
- list approvals assigned to the current approver
- return pending counts
- approve
- reject
- request revision
- support incoming phone-based validation for non-browser flows
- send next-step notifications and messages

Important implementation detail:

This router acts as a unified approval command module. It supports both web usage and MCP or WhatsApp-style flows through one entry point.

Architectural implication:

The approval module is the center of the workflow engine, but it is implemented procedurally inside one router file.

---

## 5.6 Domain Module: Claims

Files:

- `src/server/api/routers/claim.ts`
- `src/components/features/claims/ClaimForm.tsx`
- `src/components/features/BailoutFileUpload.tsx`

Responsibilities:

- create claims
- validate that claims relate to travel requests
- list and filter claims
- fetch claim detail
- connect claims with attachments
- create approval records for claims
- trigger approval notifications
- finance-side payment status handling

Core business concepts:

- entertainment vs non-entertainment claims
- linkage to travel request
- attachments and receipts
- approval lifecycle
- payment lifecycle

---

## 5.7 Domain Module: Bailouts

Files:

- `src/server/api/routers/bailout.ts`
- `src/components/features/travel/BailoutPanel.tsx`
- `src/components/features/BailoutFileUpload.tsx`

Responsibilities:

- create bailout requests
- list and filter bailouts
- fetch bailout detail
- submit for approval
- support category-specific data for transport, hotel, and meal
- track finance assignment and disbursement
- send WhatsApp notifications

Core business concepts:

- bailout category
- travel-request linkage
- requester ownership
- finance processing
- disbursement evidence

---

## 5.8 Domain Module: Finance Operations

Files:

- `src/server/api/routers/finance.ts`
- `src/server/api/routers/journalTransaction.ts`
- `src/server/api/routers/balanceAccount.ts`

Responsibilities:

- finance-facing bailout retrieval
- finance-facing claim processing
- attachment of payout evidence
- disbursement tracking
- journal creation
- balance account usage
- accounting visibility

Architectural implication:

Finance is treated as a dedicated business capability on top of travel, bailout, and claim data. It is not a separate subsystem; it extends the same monolith and same database.

---

## 5.9 Domain Module: Chart of Accounts

Files:

- `src/server/api/routers/chartOfAccount.ts`
- `src/components/features/coa/COATable.tsx`
- `src/components/features/coa/COASelector.tsx`
- `src/components/features/coa/COAHierarchyView.tsx`
- `src/components/features/coa/COAForm.tsx`
- `src/components/features/coa/COAFilters.tsx`

Responsibilities:

- manage the chart of accounts hierarchy
- support account selection in claims and journal flows
- maintain account metadata and status
- support UI browsing and filtering of accounts

Architectural implication:

Accounting support is more mature than a simple reimbursement app. The model already includes ledger-oriented concepts.

---

## 5.10 Domain Module: Master Data

Files:

- `src/server/api/routers/user.ts`
- `src/server/api/routers/department.ts`
- `src/server/api/routers/project.ts`

Responsibilities:

- user management
- role assignment
- department hierarchy management
- project setup for sales-linked travel

Core business concepts:

- direct supervisor chain
- department chief
- project sales lead

These master data modules are critical because approval routing depends on them.

---

## 5.11 Domain Module: Dashboard and Reporting

Files:

- `src/server/api/routers/dashboard.ts`
- `src/app/(authenticated)/dashboard/page.tsx`
- `src/components/features/StatCard.tsx`

Responsibilities:

- aggregate top-level operational data
- surface summary metrics to the UI

Current state:

The dashboard page exists, but parts of the screen still appear static or placeholder-oriented compared with the more workflow-heavy backend modules.

---

## 5.12 Domain Module: Notifications and Audit

Files:

- `src/server/api/routers/notification.ts`
- `src/server/api/routers/auditLog.ts`
- `src/lib/utils/whatsapp.ts`
- `src/lib/utils/logger.ts`

Responsibilities:

- in-app notification persistence
- outbound WhatsApp messaging and polls
- audit log creation for major business events
- structured logging helpers

Architectural implication:

Audit logging is already embedded in multiple workflows and should be treated as a cross-cutting concern, not a standalone feature.

---

## 5.13 Domain Module: Attachments and Storage

Files:

- `src/server/api/routers/attachment.ts`
- `src/lib/storage/r2.ts`

Responsibilities:

- manage claim attachment metadata
- support storage URLs and provider metadata
- provide Cloudflare R2 helpers
- generate presigned upload and download URLs

Current state:

Storage support is implemented at the helper level. The document metadata model is present in Prisma. The storage architecture supports R2, but usage maturity depends on how fully the UI and router paths are wired.

---

## 5.14 MCP and External Agent Module

Files:

- `src/app/api/mcp/[transport]/route.ts`
- `trpc-mcp.md`
- `MCP_SETUP_GUIDE.md`
- `MCP_QUICK_ACCESS.md`

Responsibilities:

- expose selected tRPC procedures as MCP tools
- support both cookie-based auth and bearer-token auth
- allow external agent clients to act on approvals and query records

Architectural implication:

This is a meaningful extension of the system. The codebase is not only a web app; it is also an agent-consumable backend for operational workflows.

---

## 5.15 OpenAPI Module

Files:

- `src/server/openapi.ts`
- `src/app/api/openapi.json/route.ts`
- `src/app/(public)/api-docs/page.tsx`

Current state:

- the OpenAPI route exists
- the generator is disabled
- the document currently resolves to `null`

Architectural implication:

The codebase still carries OpenAPI-shaped metadata on many procedures, but OpenAPI is not currently a working interface contract.

---

## 6. Data Architecture

## 6.1 Core Entity Groups

### Identity and access

- `User`
- `UserRole`
- `Account`
- `Session`
- `VerificationToken`

### Organization structure

- `Department`
- self-referential `User.supervisor`

### Travel workflow

- `TravelRequest`
- `TravelParticipant`
- `Approval`

### Money movement and reimbursement

- `Bailout`
- `Claim`
- `Attachment`

### Accounting

- `ChartOfAccount`
- `BalanceAccount`
- `JournalTransaction`

### Operational support

- `Notification`
- `AuditLog`
- `Project`

## 6.2 Data Model Characteristics

- soft deletes are used on many business records
- approval records can point to travel requests, bailouts, or claims
- project data drives sales-related routing
- department and supervisor hierarchies drive non-sales routing
- finance processing is represented in the primary domain schema, not an external ledger

---

## 7. Main Request Flows

## 7.1 Travel request flow

1. User opens authenticated page.
2. UI submits data to `travelRequestRouter`.
3. Router validates input and creates the request.
4. On submit, router calculates approval chain from role, department, project, and supervisor relationships.
5. Approval rows are created.
6. Audit log is written.
7. First approver may receive WhatsApp notification.

## 7.2 Claim flow

1. User selects or references a travel request.
2. UI submits claim data and attachment metadata.
3. `claimRouter` validates ownership and business rules.
4. Approval rows are created.
5. Finance later processes paid state and accounting relationships.

## 7.3 Bailout flow

1. User creates bailout linked to a travel request.
2. `bailoutRouter` validates the relationship and requester permission.
3. Approval workflow proceeds through approvers.
4. Finance later attaches proof and handles disbursement.
5. Journal entries may be created downstream.

## 7.4 MCP approval flow

1. External agent calls `/api/mcp/*`.
2. Session or bearer token is resolved.
3. MCP handler maps tool calls to tRPC procedures.
4. Approval router processes list, get, approve, reject, or revision actions.
5. Phone validation can be used for incoming messaging-style workflows.

---

## 8. Implemented Architecture vs Original Architecture Doc

## Implemented well

- Next.js App Router structure
- Prisma-backed relational model
- tRPC as primary backend interface
- NextAuth integration
- role-based access control
- travel, claim, bailout, and approval workflows
- Docker-oriented project layout
- optional R2 integration
- WhatsApp helper integration

## Different from the original design

- implementation is on Next.js 16 and React 19, not the older baseline implied by the doc
- auth is multi-provider, not only Microsoft Entra
- business logic lives inside routers more than in a separate business-service layer
- MCP integration is much more concrete than the original document suggests

## Not fully implemented or currently disabled

- OpenAPI generation
- a distinct application services layer
- clearly completed live dashboard composition
- evidence of a real queue or Redis-backed async workflow engine
- explicit test suite wiring in the current visible repo structure

---

## 9. Architectural Risks and Observations

## Risk 1: Business logic concentration in router files

Impact:

- large router files become hard to test
- approval and finance flows are harder to reuse
- coupling between transport layer and business logic is high

## Risk 2: Mixed maturity across modules

Impact:

- core workflow modules are advanced
- some UI pages still look like shells or placeholders
- backend capability may be ahead of user-facing composition

## Risk 3: OpenAPI drift

Impact:

- procedure metadata still implies REST documentation support
- consumers may assume OpenAPI works when it currently does not

## Risk 4: Number generation and workflow consistency

Impact:

- sequential IDs and approval numbers are generated in application logic
- these paths need careful concurrency review

## Risk 5: Integration sprawl inside the monolith

Impact:

- MCP, WhatsApp, finance logic, and approvals all coexist in the same codebase
- without stronger module boundaries, change risk increases over time

---

## 10. Recommended Next Architecture Steps

## Step 1: Extract service-layer modules

Create explicit internal services such as:

- `approval-service`
- `travel-request-service`
- `claim-service`
- `bailout-service`
- `finance-service`
- `notification-service`

Goal:

Move orchestration and workflow rules out of tRPC router files.

## Step 2: Define module boundaries formally

Create a lightweight module map:

- auth
- travel
- approval
- claim
- bailout
- finance
- accounting
- master-data
- integration

Goal:

Reduce cross-module leakage and make ownership clearer.

## Step 3: Restore or remove OpenAPI intentionally

Choose one:

- restore OpenAPI with a compatible toolchain
- or remove the dead route and metadata expectations

Goal:

Avoid architecture drift.

## Step 4: Add workflow tests

Prioritize:

- travel submit approval-chain generation
- approval approve or reject transitions
- bailout disbursement path
- claim payment path
- permissions and self-approval restrictions

## Step 5: Upgrade dashboard from placeholder to composed view

Goal:

Have the dashboard reflect live business aggregates from backend routers.

## Step 6: Add explicit architecture decision records

Examples:

- why tRPC remains the primary API
- whether MCP is first-class
- how approval routing is derived
- how accounting entries are generated

---

## 11. Progress Control

Use this section as the living implementation roadmap.

### Status legend

- `[x]` implemented
- `[-]` partially implemented
- `[ ]` not implemented yet

### Core platform

- [x] Next.js App Router shell
- [x] Prisma and PostgreSQL integration
- [x] NextAuth session handling
- [x] tRPC API layer
- [x] role-based procedure guards
- [-] OpenAPI route shell
- [ ] working OpenAPI generation

### Business workflows

- [x] travel request CRUD and submission
- [x] approval chain creation
- [x] claim CRUD and approval flow
- [x] bailout CRUD and approval flow
- [x] finance-facing processing routes
- [x] audit logging in critical flows
- [-] dashboard fully driven by live aggregated data

### Accounting

- [x] chart of accounts schema and router presence
- [x] journal transaction schema and router presence
- [x] balance account schema and router presence
- [-] end-to-end accounting flow documentation in code

### Integrations

- [x] Microsoft Entra auth option
- [x] credentials auth option
- [x] Google auth option
- [x] MCP route and tool exposure
- [x] WhatsApp utility integration
- [-] R2 storage support
- [ ] queue-backed async processing

### Code organization

- [x] modular router split by domain
- [-] business logic isolated from transport layer
- [ ] dedicated service layer per domain
- [ ] architecture decision records
- [ ] fuller automated test coverage for workflows

---

## 12. Suggested File Ownership Map

### UI and navigation

- `src/app`
- `src/components`

### Auth and permissions

- `src/server/auth`
- `src/lib/auth`
- `src/lib/constants/roles.ts`

### Application API

- `src/server/api`
- `src/trpc`

### Persistence

- `prisma`
- `src/server/db.ts`

### Integrations

- `src/app/api/mcp`
- `src/lib/storage`
- `src/lib/utils/whatsapp.ts`

---

## 13. Recommended Follow-Up Documents

To make the architecture easier to maintain, the next documents worth adding are:

1. `docs/workflows/travel-request-flow.md`
2. `docs/workflows/approval-engine.md`
3. `docs/workflows/claim-and-finance-flow.md`
4. `docs/modules/master-data-dependencies.md`
5. `docs/adr/0001-trpc-as-primary-api.md`

Current state:

- created: `docs/workflows/travel-request-flow.md`
- created: `docs/workflows/approval-engine.md`
- skipped for now: `docs/workflows/claim-and-finance-flow.md`

---

## 14. Conclusion

The implemented system is already a substantial modular monolith with strong workflow depth in travel, approvals, claims, bailouts, and finance. The main architectural gap is not missing modules. The main gap is boundary quality: business logic is present, but it is still concentrated inside router files instead of being expressed as reusable service modules with stronger tests and clearer contracts.

That means the next step is not rebuilding the architecture. The next step is hardening the existing architecture.
