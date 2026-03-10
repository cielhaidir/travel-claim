# Travel & Claim System — Project Progress Tracker

> **Last Updated:** 2026-03-10  
> **Stack:** Next.js 16.1.6 (App Router) · TypeScript · Prisma 6.x · tRPC · PostgreSQL · NextAuth.js v5 · Docker  
> **Repo:** https://github.com/cielhaidir/travel-claim  
> **Docs learned:** API_DESIGN · architecture · AUTH_DESIGN · CHART_OF_ACCOUNTS_DESIGN · COA_UI_IMPLEMENTATION · DATABASE_ERD · DATABASE_SCHEMA · DYNAMIC_APPROVAL_HIERARCHY · FLOW · FRONTEND_DESIGN · FRONTEND_SETUP · PROGRESS_REVIEW · REST_API_IMPLEMENTATION_GUIDE · ROLE_HARDCODED_USAGE_TRACKER · ROLE_MULTIROLE_MIGRATION_PLAN · TEST_SCENARIO · TRPC_OPENAPI_IMPLEMENTATION · WHATSAPP_AI_AGENT_DESIGN

---

## System Overview — How This Website Works

The Travel & Claim System is a **corporate travel expense management platform** built for Indonesian companies. It handles the full lifecycle:

```
Employee creates Travel Request (BussTrip)
        ↓
Optional: Add Bailout (dana talangan / cash advance)
        ↓
Submit → Dynamic Approval Chain auto-built by role + org hierarchy
        ↓
All approvers approve → TravelRequest = APPROVED
        ↓
Finance locks the request → TravelRequest = LOCKED
        ↓
Employee submits Claim(s) with receipts + COA categories
        ↓
Claims go through same approval chain
        ↓
All approvals done → Claim = APPROVED → Finance marks PAID
        ↓
Finance closes TravelRequest → CLOSED (when all claims settled)
```

WhatsApp notifications are sent at each approval step (via n8n webhook + custom WA instance).

---

## Quick Status Summary

| Module | Backend | Frontend | Notes |
|--------|---------|----------|-------|
| Authentication | ✅ Done | ✅ Done | Credentials + Microsoft Entra (Azure AD), JWT sessions |
| User Management | ✅ Done | ✅ Done | CRUD + bulk Excel/CSV import (xlsx@0.18.5) |
| Dashboard | ✅ Done | ✅ Done | Role-based stats overview |
| Business Trip (BussTrip) | ✅ Done | ✅ Done | Full flow incl. bailout & participants |
| Bailout / Dana Talangan | ✅ Done | ✅ Done | Finance backend, approval chain |
| Claim | ✅ Done | ✅ Done | COA dropdown wired, approval chain, attachments |
| Approval Workflow | ✅ Done | ✅ Done | Dynamic hierarchy, approve/reject/revision |
| Chart of Accounts (COA) | ✅ Done | ✅ Done | Full CRUD, hierarchy view, COASelector component |
| Projects | ✅ Done | ✅ Done | Used for SALES travel type routing |
| Departments | ✅ Done | ✅ Done | Hierarchy, CRUD, REST API |
| REST API (OpenAPI) | ✅ Done | — | 88 endpoints via trpc-to-openapi, Swagger UI at `/api-docs` |
| Finance Module | ✅ Done | ✅ Done | `/finance` page: disbursements, claim payments, travel lock/close, balance accounts |
| Notifications | ✅ Done | ⚠️ Partial | Router + WhatsApp; no bell/dropdown UI in nav |
| Audit Log | ✅ Done | ❌ No UI | Router exists, logs all approval actions |
| WhatsApp AI Agent | 🔵 Design | 🔵 Design | n8n + OpenAI GPT-4 Vision design complete, not deployed |
| Multi-Role (UserRole table) | 🔵 Planned | 🔵 Planned | 5-phase migration plan written; Phase 0 partially done |
| PWA / Offline Support | ⚠️ Partial | ⚠️ Partial | manifest.json added, service worker TBD |
| Journal / GL Transactions | ✅ Done | ❌ No UI | Router exists; no frontend page |
| Balance Accounts | ✅ Done | ❌ No UI | Router exists; no frontend page |
| API Docs (Swagger UI) | ✅ Done | ✅ Done | `/api-docs` page with SwaggerUI |

---

## Roles & Organizational Hierarchy

### Role Taxonomy

| Role | Description |
|------|-------------|
| `EMPLOYEE` | Regular staff — can create travel requests + claims |
| `SUPERVISOR` | Dept chief for non-sales (e.g. Engineering chief) — L1 approver |
| `MANAGER` | Finance dept chief — approves finance-related items |
| `DIRECTOR` | Controls all L2/L3 approvals |
| `EXECUTIVE` / `SENIOR_DIRECTOR` | Optional higher levels in org chart |
| `FINANCE` | Processes payout, locks/closes travel requests |
| `ADMIN` | Full system access |
| `SALES_EMPLOYEE` | Sales staff — specific approval routing |
| `SALES_CHIEF` | Head of sales dept — approves sales team requests |

### Org Tree (Seed Data — Test Environment)

```
executive@company.com     (ADMIN / C-Level)     EMP001
└─ director@company.com   (DIRECTOR)             EMP002
   ├─ finance.chief        (MANAGER, Finance)     EMP003
   │  ├─ finance.staff1    (FINANCE)              EMP010
   │  └─ finance.staff2    (FINANCE)              EMP011
   ├─ sales.chief          (SALES_CHIEF, Sales)   EMP020
   │  ├─ sales.staff1      (SALES_EMPLOYEE)       EMP021
   │  └─ sales.staff2      (SALES_EMPLOYEE)       EMP022
   ├─ engineer.chief       (SUPERVISOR, Engg)     EMP030
   │  ├─ engineer.staff1   (EMPLOYEE)             EMP031
   │  └─ engineer.staff2   (EMPLOYEE)             EMP032
   └─ admin                (ADMIN, Admin dept)    EMP040
      └─ admin.staff1      (EMPLOYEE)             EMP041
```

Test password for all seed users: `password123`

---

## Dynamic Approval Hierarchy — How It Works

The approval chain is **built at runtime** from the org graph in the DB. No approver IDs are hard-coded.

### Rule A — Requester is `SALES_EMPLOYEE` or `SALES_CHIEF`
```
seq 1  DEPT_CHIEF      → requester's dept chief (sales.chief)
seq 2  DIRECTOR        → dept_chief.supervisor
seq 3  SENIOR_DIRECTOR → director.supervisor (if exists)
seq 4  EXECUTIVE       → senior_director.supervisor (if exists)
```

### Rule B — Requester is `EMPLOYEE` + `travelType = SALES` (linked to a Project)
```
seq 1  SALES_LEAD      → Project.salesLead user
seq 2  DEPT_CHIEF      → salesLead.supervisor
seq 3  DIRECTOR        → dept_chief.supervisor
seq 4  SENIOR_DIRECTOR → director.supervisor (if exists)
seq 5  EXECUTIVE       → senior_director.supervisor (if exists)
(skip SALES_LEAD if requester IS the salesLead)
```

### Rule C — Requester is `EMPLOYEE` + `travelType ≠ SALES` (OPERATIONAL / MEETING / TRAINING)
```
seq 1  DEPT_CHIEF      → requester's dept chief
seq 2  DIRECTOR        → dept_chief.supervisor
seq 3  SENIOR_DIRECTOR → director.supervisor (if exists)
seq 4  EXECUTIVE       → senior_director.supervisor (if exists)
```

**Same rules apply** to Bailout and Claim approval chains.  
On REVISION → all approvals reset to PENDING; requester edits and resubmits.

---

## Complete Business Flow Reference

### Travel Request Status Machine
```
DRAFT → SUBMITTED → APPROVED_L1 → APPROVED_L2 → … → APPROVED
                                                        ↓
                                              Finance: LOCKED
                                                        ↓
                             (Claim created & paid)  CLOSED
At any point: → REJECTED (by any approver)
              → REVISION  (by any approver, requester re-edits + resubmits)
```

### Bailout Status Machine
```
DRAFT → SUBMITTED → APPROVED_L1 → … → APPROVED → DISBURSED (Finance)
       (can be created anytime against any TravelRequest, no status restriction)
```

### Claim Status Machine
```
DRAFT → SUBMITTED → APPROVED_L1 → … → APPROVED → PAID (Finance)
       (requires TravelRequest.status = LOCKED to create)
       (requires at least 1 attachment before submit)
```

### Finance Actions
| Action | Who | Condition |
|--------|-----|-----------|
| Lock travel request | FINANCE / ADMIN | TravelRequest = APPROVED |
| Disburse bailout | FINANCE / ADMIN | Bailout = APPROVED |
| Mark claim paid | FINANCE / ADMIN | Claim = APPROVED |
| Close travel request | FINANCE / ADMIN | All claims PAID or REJECTED |

---

## Feature Deep-Dive

### ✅ Authentication
- **Credentials provider:** email + bcrypt password (local DB users)
- **Microsoft Entra ID (Azure AD):** OAuth 2.0 / OIDC, scopes: `openid profile email offline_access User.Read`
- **Session:** JWT strategy — stores `id`, `role`, `name`, `email`, `employeeId`, `departmentId`
- **First-time SSO login:** auto-creates user with `role = EMPLOYEE`, syncs name/email/photo/employeeId from Entra claims
- **Token refresh:** refresh_token stored in Account table; auto-refreshed on jwt callback
- **Guard:** `(authenticated)` route group wraps all protected pages; redirects to `/login` if no session
- **Files:** `src/server/auth/config.ts`, `src/server/auth/index.ts`, `src/app/(public)/login/page.tsx`

---

### ✅ User Management (`/admin/users`)
- Full CRUD: create, view, edit, soft-delete (`deletedAt` timestamp), reset password
- Role assignment from full role taxonomy
- Department & supervisor hierarchy assignment
- **Bulk import via Excel/CSV** (added 2026-03-09)
  - Reads columns: `displayName`, `userPrincipalName`, `userType`
  - Filters `userType = member` only
  - Configurable default password; shows preview + created/skipped results
- REST endpoints: 13 endpoints under `/api/users`
- **Files:** `src/app/(authenticated)/admin/users/page.tsx`, `src/server/api/routers/user.ts`
- **Dependency:** `xlsx@0.18.5`

---

### ✅ Business Trip / Travel Request (`/travel`)
- **Status flow:** DRAFT → SUBMITTED → APPROVED_Lx → APPROVED → LOCKED → CLOSED (or REJECTED / REVISION)
- Create with: purpose (min 10 chars), destination, travelType, start/end dates, optional projectId (required for SALES type), optional participants, optional bailout items
- Bailout items at creation: TRANSPORT / HOTEL / MEAL / OTHER with amount + optional `bookingRef`
- On submit: approval chain auto-built → all `PENDING`, seq=1 notified via WhatsApp
- Admin / Director / Manager can override approvals via `adminActOnApproval` or `adminActOnTravelRequestDirect`
- **Files:** `src/server/api/routers/travelRequest.ts`, `src/app/(authenticated)/travel/page.tsx`

---

### ✅ Bailout / Dana Talangan (`/bailout`)
- Stand-alone advance-payment request linked to a TravelRequest
- Can be created at any time (no TravelRequest status restriction)
- Categories: TRANSPORT, HOTEL, MEAL, OTHER
- Approval chain: same routing rules as TravelRequest (based on submitter role/type)
- Finance disburses after `APPROVED` → status becomes `DISBURSED`
- WhatsApp notification sent to Finance on approval
- **Files:** `src/server/api/routers/bailout.ts`, `src/app/(authenticated)/bailout/page.tsx`

---

### ✅ Claim (`/claims`)
- **Pre-condition:** TravelRequest must be `LOCKED`
- Claim types: `ENTERTAINMENT` | `NON_ENTERTAINMENT`
- Fields: amount, description, `chartOfAccountId` (COA mapping, optional)
- Attachments: ≥ 1 required before submit (receipt images, PDFs); stored via `attachment` router with optional OCR
- Approval chain: same routing rules as TravelRequest (based on submitter role + travel request type/project)
- **Files:** `src/server/api/routers/claim.ts`, `src/app/(authenticated)/claims/page.tsx`

---

### ✅ Approvals (`/approvals`)
- Inbox for approvers: Supervisor, Manager, Director, Finance, Admin
- Shows both Travel Requests and Claims pending action in one queue
- Approve / Reject / Request Revision — rejection requires a written reason
- On full approval: requester notified via WhatsApp
- On revision: all prior approvals reset; requester re-edits and resubmits
- Admin helpers: `adminActOnApproval`, `adminActOnTravelRequestDirect` (creates DIRECTOR-level approval on the fly)
- **Files:** `src/server/api/routers/approval.ts`, `src/app/(authenticated)/approvals/page.tsx`

---

### ✅ Chart of Accounts (`/chart-of-accounts`)
- Hierarchical COA: `ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE`
- Tree view + table view; filter by type / active status / search
- Full CRUD (Admin only for create/edit/delete)
- Soft-delete / toggle active status
- COA used in Claim line items via `COASelector` dropdown component
- Components: `COATable`, `COAForm`, `COAFilters`, `COAHierarchyView`, `COASelector`
- **Files:** `src/server/api/routers/chartOfAccount.ts`, `src/app/(authenticated)/chart-of-accounts/page.tsx`

---

### ✅ Projects (`/projects`)
- CRUD for sales projects; `Project.salesId` → `User.employeeId` of the sales lead
- Required when `TravelRequest.travelType = SALES` — determines approval routing (Rule B)
- **Files:** `src/server/api/routers/project.ts`, `src/app/(authenticated)/projects/page.tsx`

---

### ✅ Departments
- Hierarchical departments: `parentId` self-reference, `chiefId` → User
- Used in org-graph traversal for building approval chains
- REST API: 8 endpoints under `/api/departments`
- **Files:** `src/server/api/routers/department.ts`

---

### ✅ REST API / OpenAPI (Swagger)
- **88 tRPC procedures** exposed as REST endpoints via `trpc-to-openapi`
- OpenAPI spec generated at `/api/openapi.json`
- Interactive Swagger UI at `/api-docs` (`src/app/(public)/api-docs/page.tsx`)
- REST base URL: `http://localhost:3000/api`
- Auth: Bearer token via `Authorization` header
- **Files:** `src/server/openapi.ts`, `src/app/api/[...openapi]/route.ts`

---

### ✅ Finance Module
- **Backend:** `src/server/api/routers/finance.ts` — processes bailout disbursements, queries balance accounts
- **Balance accounts:** `src/server/api/routers/balanceAccount.ts` — full CRUD, Finance/Admin only
- **Frontend:** `src/app/(authenticated)/finance/page.tsx` — dedicated Finance Dashboard
  - **Summary cards:** pending disbursements count, approved claims count, travel requests to lock, total pending payment amount
  - **Bailout Disbursements tab:** APPROVED_L2 bailouts → Disburse action with optional reference
  - **Claim Payments tab:** APPROVED claims → Mark Paid action with required payment reference
  - **Travel Requests tab:** APPROVED (Lock) + LOCKED (Close) travel requests with confirm modals
  - **Balance Accounts tab:** all accounts with live balances, total sum
- **Role guard:** FINANCE and ADMIN only; non-finance users redirected to `/dashboard`
- **Sidebar:** Finance nav item added to `SidebarNav.tsx` (visible to FINANCE and ADMIN)

---

### ⚠️ Notifications
- **Backend:** `src/server/api/routers/notification.ts` — full CRUD router
- **WhatsApp notifications:** sent via webhook on: travel request submitted (to seq=1 approver), each approval step advance, full approval (to requester), rejection/revision (to requester), bailout approval (to Finance)
- **Channels:** `WHATSAPP | IN_APP | EMAIL` (email not yet wired)
- **Frontend:** No bell icon or dropdown in the navigation layout
- **TODO:** Add notification bell in `TopHeader` + unread badge + dropdown list

---

### ❌ Audit Log
- **Backend:** `src/server/api/routers/auditLog.ts` — logs all approval actions, user changes, COA changes with `entityType`, `entityId`, `changes` (JSON diff), `ipAddress`
- **Managers and above** can query audit logs
- **Frontend:** No admin view page exists
- **TODO:** Add `/admin/audit-log` page with filters (date range, entity type, user, action)

---

### ❌ Journal / GL Transactions
- **Backend:** `src/server/api/routers/journalTransaction.ts` — router exists, records financial entries
- **Frontend:** No page
- **Decision needed:** Expose via UI (read-only GL viewer) or keep as backend-only accounting export

---

### ❌ Balance Accounts
- **Backend:** `src/server/api/routers/balanceAccount.ts` — full CRUD
- **Frontend:** No page
- **TODO:** Include in Finance Dashboard

---

### 🔵 Multi-Role Authorization Migration (5-Phase Plan)

**Current state:** Single scalar `User.role` — one role per user.  
**Target state:** `UserRole` join table — users can have multiple roles simultaneously.  
**Plan doc:** `docs/ROLE_MULTIROLE_MIGRATION_PLAN.md`  
**Hardcoded usage inventory:** `docs/ROLE_HARDCODED_USAGE_TRACKER.md` — 35+ role check locations identified

| Phase | Goal | Status |
|-------|------|--------|
| 0 | Taxonomy alignment + feature flag | ⚠️ Partially done — `src/lib/constants/roles.ts` exists but `FINANCE` vs `FINANCE_MANAGER` mismatch remains |
| 1 | Add `UserRole` table schema (additive only) | ❌ Not started |
| 2 | Backfill existing users into `UserRole` | ❌ Not started |
| 3 | Dual read/write — app writes both models, reads prefer multi-role path | ❌ Not started |
| 4 | Migrate all consumers (auth, guards, routers, frontend, seed) | ❌ Not started |
| 5 | Remove legacy scalar `User.role` | ❌ Not started |

**Key hotspots to fix when ready:**
- `src/server/auth/config.ts` — JWT/session still maps single `token.role`
- `src/server/api/trpc.ts` — procedure guards use inline role arrays
- `src/components/navigation/SidebarNav.tsx` — nav uses `session.user.role` scalar fallback
- `src/app/(authenticated)/approvals/page.tsx` — `FINANCE_MANAGER` vs `FINANCE` mismatch

---

### 🔵 WhatsApp AI Agent (Design Complete — Not Deployed)

**Design doc:** `docs/WHATSAPP_AI_AGENT_DESIGN.md`

**Architecture:**
```
WhatsApp User → Custom WA Instance → n8n webhook → OpenAI GPT-4 Vision
                                          ↓
                              Next.js tRPC API (claim creation)
                                          ↓
                                    PostgreSQL DB
```

**Features designed:**
- Receipt image OCR via GPT-4 Vision — auto-extracts amount, merchant, date
- Bilingual conversation (Indonesian + English)
- Travel request lookup via tRPC
- Interactive confirmation before submitting
- Session state management in n8n

**What's left:**
1. Deploy n8n alongside Docker stack
2. Configure WA webhook → n8n inbound pipeline
3. Implement `/api/whatsapp/webhook` in Next.js
4. Build n8n workflow for AI conversation + claim submission
5. Connect to existing `claim.create` + `attachment.getUploadUrl` tRPC endpoints

---

### ⚠️ PWA Support
- `public/manifest.json` added
- **TODO:** Add service worker for offline caching
- **TODO:** Verify `<link rel="manifest">` in `app/layout.tsx`
- **TODO:** Test install prompt on Chrome desktop + Safari iOS

---

## Commit History (Chronological)

| Date | Hash | What was done |
|------|------|---------------|
| 2026-02-18 | `fc0de34` | Chart of Accounts + MCP tools added |
| 2026-02-18 | `3995e44` | Docker support: Dockerfile, docker-compose, CI workflow |
| 2026-02-20 | `fa780ae` | Upgraded next-auth to beta.30, added package overrides |
| 2026-02-23 | `6246568` | Upgraded Next.js to 16.1.6, improved Docker build process |
| 2026-02-23 | `2a8d0ae` | ESLint + TypeScript strict checks pass |
| 2026-02-26 | `1684133` | Checkpoint: Business Trip flow implemented |
| 2026-02-27 | `81ccf84` | Approval number generation + updated approval workflows |
| 2026-02-27 | `b49b761` | Fix: renamed `approvals` → `approvalEntries` for clarity |
| 2026-03-02 | `c665a2a` | Checkpoint: BussTrip + Claim flow complete |
| 2026-03-02 | `c9a02dc` | WhatsApp webhook checkpoint + dynamic hierarchy refactor |
| 2026-03-03 | `968c72c` | Updated approval workflow and audit logging |
| 2026-03-03 | `be035ef` | Finance backend for bailout added |
| 2026-03-03 | `de853a5` | Enhanced WhatsApp messaging for bailouts + finance approvals |
| 2026-03-05 | `580ce08` | Multi-role authorization migration plan + schema prep |
| 2026-03-05 | `5a5dfad` | Database migration applied |
| 2026-03-09 | `84c7063` | **Bulk user import from Excel/CSV** |
| 2026-03-10 | `4652949` | Merge: pulled bulk import to local main |

---

## Known Issues / Tech Debt

| # | Issue | Severity | File(s) |
|---|-------|----------|---------|
| 1 | `FINANCE` vs `FINANCE_MANAGER` role name mismatch across frontend/backend | High | `src/lib/constants/roles.ts`, `src/server/auth/config.ts`, approvals page |
| 2 | 35+ hardcoded role checks across routers, components, guards | High | See `ROLE_HARDCODED_USAGE_TRACKER.md` |
| 3 | Session still single-role (`session.user.role` scalar) — blocking multi-role | High | `src/server/auth/config.ts` |
| 4 | No notification bell in navigation | Medium | `src/components/navigation/` |
| 5 | Finance dashboard page missing | Medium | — |
| 6 | Audit Log admin UI missing | Medium | — |
| 7 | `next-auth` on beta channel — watch for breaking changes | Low | `package.json` |
| 8 | `post.ts` router is unused (T3 scaffold leftover) | Cleanup | `src/server/api/routers/post.ts` |
| 9 | No email notification channel wired (only WhatsApp + in-app) | Low | `src/server/api/routers/notification.ts` |
| 10 | `swagger-ui-react` CSS import has no type declarations (suppressed with `@ts-expect-error`) | Low | `src/app/(public)/api-docs/page.tsx` |

---

## What to Build Next (Recommended Priority)

### High Priority
- [ ] **Finance Dashboard** (`/finance`) — pending disbursements queue, processed payments, balance account summary, GL reconciliation
- [ ] **Notification Center** — bell icon + unread badge in `TopHeader`, dropdown list wired to `notification.getMyNotifications`
- [ ] **Audit Log Admin View** (`/admin/audit-log`) — filterable by date, user, entity type, action

### Medium Priority
- [ ] **Multi-Role Migration Phase 1–2** — add `UserRole` table + backfill existing users
- [ ] **Fix FINANCE/FINANCE_MANAGER taxonomy** — unify before multi-role migration
- [ ] **Travel Request Detail page** (`/travel/[id]`) — full detail view with approval timeline, participants, claims list
- [ ] **Claim Detail page** (`/claims/[id]`) — detail view with receipt viewer, approval history, payment status
- [ ] **Admin > Reports / Export** — export claims / travel summaries to Excel

### Low Priority / Future
- [ ] **WhatsApp AI Agent** — deploy n8n, configure webhook pipeline, build GPT-4 Vision claim flow
- [ ] **Journal / GL export** — accounting system integration
- [ ] **Email notifications** — Resend or SendGrid as fallback channel
- [ ] **Redis caching** — session store + rate limiting for production scale
- [ ] **PWA service worker** — offline support

---

## Infrastructure & Deployment

| Component | Status | Notes |
|-----------|--------|-------|
| Docker (Dockerfile) | ✅ Ready | Multi-stage build |
| docker-compose | ✅ Ready | App + PostgreSQL |
| CI (GitHub Actions) | ✅ Ready | Build only (lint/type-check removed from CI) |
| PostgreSQL | ✅ Ready | ACID-compliant, required for financial data |
| VPS deployment | ⚠️ Not documented | Manual `docker compose up` assumed |
| n8n (WhatsApp automation) | ❌ Not deployed | Required for WhatsApp AI Agent feature |
| Cloudflare R2 / S3 | ❌ Optional | Receipt image storage (local disk fallback active) |
| Redis | ❌ Optional | Session store + rate limiting for production |
| Email service (Resend/SendGrid) | ❌ Not configured | Fallback notification channel |

---

## File Map (Key Files)

```
src/
├── app/
│   ├── (authenticated)/
│   │   ├── admin/users/page.tsx           — User Management + Bulk Import
│   │   ├── approvals/page.tsx             — Approval Inbox
│   │   ├── bailout/page.tsx               — Bailout / Dana Talangan
│   │   ├── chart-of-accounts/page.tsx     — COA CRUD + Hierarchy
│   │   ├── claims/page.tsx                — Claim Submission
│   │   ├── dashboard/page.tsx             — Role-based Dashboard
│   │   ├── projects/page.tsx              — Project Management
│   │   └── travel/page.tsx                — Business Trip / Travel Request
│   ├── (public)/
│   │   ├── login/page.tsx                 — Login (Credentials + Azure AD)
│   │   └── api-docs/page.tsx              — Swagger UI for REST API
│   └── api/
│       ├── auth/[...nextauth]/route.ts    — NextAuth handler
│       ├── openapi.json/route.ts          — Generated OpenAPI spec
│       └── [...openapi]/route.ts          — REST API handler (trpc-to-openapi)
├── server/
│   ├── api/routers/
│   │   ├── approval.ts                    — Approval actions (approve/reject/revision)
│   │   ├── attachment.ts                  — File upload + OCR
│   │   ├── auditLog.ts                    — Audit trail
│   │   ├── bailout.ts                     — Dana Talangan
│   │   ├── balanceAccount.ts              — Finance balance accounts
│   │   ├── chartOfAccount.ts              — COA CRUD
│   │   ├── claim.ts                       — Claim submission + approval chain
│   │   ├── dashboard.ts                   — Stats aggregation
│   │   ├── department.ts                  — Org structure
│   │   ├── finance.ts                     — Finance payout processing
│   │   ├── journalTransaction.ts          — GL journal entries
│   │   ├── notification.ts                — Notification management
│   │   ├── project.ts                     — Sales projects
│   │   ├── travelRequest.ts               — Travel Request + approval chain builder
│   │   └── user.ts                        — User CRUD + bulk import
│   ├── auth/config.ts                     — NextAuth config (providers, JWT callbacks)
│   └── openapi.ts                         — OpenAPI document generator
├── components/
│   ├── features/
│   │   ├── coa/                           — COATable, COAForm, COAFilters, COAHierarchyView, COASelector
│   │   ├── travel/BailoutPanel.tsx        — Reusable bailout add/edit panel
│   │   ├── PageHeader.tsx
│   │   └── EmptyState.tsx
│   ├── layouts/AppShell.tsx               — Main layout with sidebar
│   ├── navigation/
│   │   ├── SidebarNav.tsx                 — Role-aware sidebar menu
│   │   └── TopHeader.tsx                  — Top bar (search, user menu)
│   └── ui/
│       ├── Button.tsx
│       └── Modal.tsx
├── lib/
│   ├── constants/
│   │   ├── roles.ts                       — Role definitions + helper functions
│   │   └── status.ts                      — Status labels + colors
│   ├── auth/utils.ts                      — isAdmin(), hasAnyRole(), approval level mapping
│   ├── api/rest-utils.ts                  — withAuth(), withRoles(), REST helpers
│   └── utils/format.ts                    — Currency, date, relative time formatters
└── styles/globals.css                     — Design tokens (colors, typography, spacing)
```

---

## Database Key Entities

| Entity | Purpose |
|--------|---------|
| `User` | Staff with role, dept, supervisorId chain |
| `Department` | Org units with parentId hierarchy + chiefId |
| `TravelRequest` | Business trip with status machine, participants, bailouts, claims |
| `TravelParticipant` | M:N users ↔ travel requests |
| `Bailout` | Cash advance per travel request, own approval chain |
| `Claim` | Expense reimbursement against a LOCKED travel request |
| `Approval` | One row per approval step (sequence, level, approverId, status) |
| `Attachment` | Receipt files for claims, with `ocrExtractedData` JSON |
| `COA` | Chart of accounts, hierarchical via parentId |
| `Project` | Sales projects with salesLead (via salesId → employeeId) |
| `Notification` | Multi-channel notification (WHATSAPP / IN_APP / EMAIL) |
| `AuditLog` | Immutable action log (action, entityType, entityId, changes JSON) |
| `JournalTransaction` | GL double-entry records |
| `BalanceAccount` | Finance balance account ledger |

---

_Last updated by GitHub Copilot on 2026-03-10 after reading all 18 docs in `/docs`._
