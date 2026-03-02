# End-to-End Flow: Travel Request → Approval → Claim → Approval

> **Version:** 1.0  
> **Last Updated:** 2026-03-02  
> **Related docs:** [`DYNAMIC_APPROVAL_HIERARCHY.md`](./DYNAMIC_APPROVAL_HIERARCHY.md), [`DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md)

---

## Table of Contents

1. [Overview](#overview)
2. [Travel Request Flow](#1-travel-request-flow)
   - [Create (DRAFT)](#11-create-draft)
   - [Submit](#12-submit)
   - [Approval Chain](#13-approval-chain)
   - [Outcomes: Approve / Reject / Revision](#14-outcomes)
   - [Lock & Close (Finance)](#15-lock--close-finance)
3. [Bailout Flow (Optional)](#2-bailout-flow-optional)
4. [Claim Flow](#3-claim-flow)
   - [Create (DRAFT)](#31-create-draft)
   - [Submit](#32-submit)
   - [Approval Chain](#33-approval-chain)
   - [Payment (Finance)](#34-payment-finance)
5. [Approval Chain Resolution](#4-approval-chain-resolution)
   - [Routing Rules](#routing-rules)
   - [Status Progression](#status-progression)
   - [WhatsApp Notifications](#whatsapp-notifications)
6. [Key Constraints](#5-key-constraints)
7. [State Machine Diagrams](#6-state-machine-diagrams)

---

## Overview

```
User creates TravelRequest (DRAFT)
        │
        ▼
   User submits → SUBMITTED
        │
        ▼
  Approval chain created (seq 1…N)
        │
   seq=1 approver notified via WhatsApp poll
        │
        ▼
  Approver acts on seq=1
  ├─ APPROVED → seq=2 notified → … → all approved → APPROVED
  ├─ REJECTED → TravelRequest = REJECTED
  └─ REVISION → TravelRequest = REVISION → user resubmits
        │
        ▼ (status = APPROVED)
  Finance locks → LOCKED
        │
        ▼
  User creates Claim(s) against LOCKED TravelRequest
        │
        ▼
  User submits Claim → SUBMITTED
        │
        ▼
  Claim approval chain created (same routing rules)
        │
        ▼
  All Claim approvals done → Claim = APPROVED
        │
        ▼
  Finance marks Claim → PAID
        │
        ▼
  Finance closes TravelRequest → CLOSED (when all claims settled)
```

---

## 1. Travel Request Flow

### 1.1 Create (DRAFT)

**Router:** [`travelRequest.create`](../src/server/api/routers/travelRequest.ts)  
**Who:** Any authenticated user

| Field | Required | Notes |
|---|---|---|
| `purpose` | ✅ | Min 10 chars |
| `destination` | ✅ | |
| `travelType` | ✅ | `SALES` \| `OPERATIONAL` \| `MEETING` \| `TRAINING` |
| `startDate` / `endDate` | ✅ | end must be after start |
| `projectId` | Only for `SALES` | Links to a `Project`; enables SALES_LEAD routing |
| `participantIds` | Optional | Other users on the trip |

Result: `TravelRequest` with `status = DRAFT`.

---

### 1.2 Submit

**Router:** [`travelRequest.submit`](../src/server/api/routers/travelRequest.ts)  
**Who:** The requester (while status is `DRAFT` or `REVISION`)

On submit the router:

1. Fetches the request with full requester hierarchy: `department.chief.supervisor.supervisor.supervisor` (up to 4 levels deep).
2. Fetches the linked `Project.salesLead` chain if applicable.
3. **Builds the approval chain** per [routing rules](#routing-rules).
4. Creates one `Approval` row per step, each with a unique `approvalNumber`, the correct `sequence` (1-based), `level`, and `approverId`. All start as `PENDING`.
5. Sets `TravelRequest.status = SUBMITTED`.
6. Sends a WhatsApp poll notification to the **sequence=1** approver only.

---

### 1.3 Approval Chain

**Router:** [`approval.approveTravelRequest`](../src/server/api/routers/approval.ts)  
**Who:** The `approverId` of the current pending `Approval` step

1. Approver acts (via UI or WhatsApp poll reply).
2. The `Approval` row is set to `APPROVED`.
3. If more pending approvals remain → `TravelRequest.status` advances to `APPROVED_L{sequence}` and the **next** approver (sequence+1) is notified via WhatsApp.
4. If no more approvals remain → `TravelRequest.status = APPROVED` and the **requester** is notified.

---

### 1.4 Outcomes

| Action | Router | Who | Result |
|---|---|---|---|
| Approve | `approveTravelRequest` | Designated approver | Chain advances; requester notified on full approval |
| Reject | `rejectTravelRequest` | Designated approver | `TravelRequest.status = REJECTED`; requester notified |
| Request Revision | `requestRevision` | Designated approver | `TravelRequest.status = REVISION`; all approvals reset to PENDING; requester notified |
| Admin Override | `adminActOnApproval` | ADMIN/DIRECTOR/MANAGER | Same outcomes, bypasses approverId check |
| Admin Direct Act | `adminActOnTravelRequestDirect` | ADMIN/DIRECTOR/MANAGER | Creates a DIRECTOR-level approval on the fly and resolves it |

After a **REVISION**, the requester edits the request and resubmits. `travelRequest.submit` deletes old approvals and rebuilds the chain fresh.

---

### 1.5 Lock & Close (Finance)

| Step | Router | Status Change | Condition |
|---|---|---|---|
| Lock | `travelRequest.lock` | `APPROVED → LOCKED` | Finance/Admin only; enables Claim creation |
| Close | `travelRequest.close` | `LOCKED → CLOSED` | Finance/Admin only; all Claims must be PAID or REJECTED |

---

## 2. Bailout Flow (Optional)

A **Bailout** (dana talangan) is an advance-payment request attached to a `TravelRequest`. It follows the same approval routing rules (see §4).

**Router:** [`bailout.*`](../src/server/api/routers/bailout.ts)

| Status | Meaning |
|---|---|
| `DRAFT` | Created, not submitted |
| `SUBMITTED` | Submitted; seq=1 approver notified |
| `APPROVED_L1`…`APPROVED_L5` | Partial approvals |
| `APPROVED` | All levels approved |
| `REJECTED` | Rejected |
| `REVISION` | Revision requested |
| `DISBURSED` | Funds disbursed by Finance |

Bailouts can be created at any time against an existing TravelRequest (no status restriction). Finance disburses after `APPROVED`.

---

## 3. Claim Flow

### 3.1 Create (DRAFT)

**Router:** [`claim.create`](../src/server/api/routers/claim.ts)  
**Who:** Any authenticated user  
**Pre-condition:** The associated `TravelRequest` must be in `LOCKED` status.

| Field | Required | Notes |
|---|---|---|
| `travelRequestId` | ✅ | Must be LOCKED |
| `claimType` | ✅ | `ENTERTAINMENT` \| `NON_ENTERTAINMENT` |
| `amount` | ✅ | Decimal |
| `description` | ✅ | |
| `chartOfAccountId` | Optional | COA mapping |
| Attachments | ✅ before submit | At least one required to submit |

---

### 3.2 Submit

**Router:** [`claim.submit`](../src/server/api/routers/claim.ts)  
**Who:** The submitter (while status is `DRAFT` or `REVISION`)

On submit the router:

1. Fetches the claim with full submitter hierarchy and the linked `TravelRequest → Project → salesLead` chain.
2. **Builds the approval chain** using the same routing rules as TravelRequest (based on submitter's role + travel request's type/project).
3. Creates one `Approval` row per step with correct `sequence`, `level`, `approverId`, and a unique `approvalNumber`.
4. Sets `Claim.status = SUBMITTED`.
5. Sends a WhatsApp poll notification to the **sequence=1** approver only.

---

### 3.3 Approval Chain

**Router:** [`approval.approveClaim`](../src/server/api/routers/approval.ts)  
**Who:** The `approverId` of the current pending `Approval` step

1. Approver acts (UI or WhatsApp poll).
2. If more pending approvals → next approver (seq+1) notified via WhatsApp.
3. If no more approvals → `Claim.status = APPROVED`; submitter notified.

| Action | Router | Result |
|---|---|---|
| Approve | `approveClaim` | Chain advances / Claim APPROVED |
| Reject | `rejectClaim` | `Claim.status = REJECTED`; submitter notified |
| Revision | `requestClaimRevision` | `Claim.status = REVISION`; all approvals reset |

---

### 3.4 Payment (Finance)

**Router:** [`claim.markAsPaid`](../src/server/api/routers/claim.ts)  
**Who:** Finance role only  
**Pre-condition:** `Claim.status = APPROVED`

Sets `Claim.status = PAID`, records `paymentReference`, `paidBy`, `paidAt`. Also updates `TravelRequest.totalReimbursed`.

---

## 4. Approval Chain Resolution

### Routing Rules

The chain is resolved **at submit time** by inspecting the submitter's role, department, and the travel request's type and project. See [`DYNAMIC_APPROVAL_HIERARCHY.md`](./DYNAMIC_APPROVAL_HIERARCHY.md) for full spec.

#### Rule A — `SALES_EMPLOYEE` or `SALES_CHIEF`

```
seq 1  DEPT_CHIEF       → requester.department.chief
seq 2  DIRECTOR         → dept_chief.supervisorId → User
seq 3  SENIOR_DIRECTOR  → director.supervisorId   → User  (if exists)
seq 4  EXECUTIVE        → senior_dir.supervisorId → User  (if exists)
```

#### Rule B — `EMPLOYEE` + `travelType = SALES` + linked Project

```
seq 1  SALES_LEAD       → Project.salesLead
seq 2  DEPT_CHIEF       → salesLead.supervisorId → User
seq 3  DIRECTOR         → dept_chief.supervisorId → User
seq 4  SENIOR_DIRECTOR  → director.supervisorId   → User  (if exists)
seq 5  EXECUTIVE        → senior_dir.supervisorId → User  (if exists)
```

> If the submitter **is** the sales lead, skip SALES_LEAD and start at DEPT_CHIEF using the submitter's own department chief.

#### Rule C — `EMPLOYEE` + `travelType ≠ SALES`

```
seq 1  DEPT_CHIEF       → requester.department.chief
seq 2  DIRECTOR         → dept_chief.supervisorId → User
seq 3  SENIOR_DIRECTOR  → director.supervisorId   → User  (if exists)
seq 4  EXECUTIVE        → senior_dir.supervisorId → User  (if exists)
```

> **Deduplication:** If the same user would appear twice in the chain (e.g., the submitter is also the chief), that entry is skipped and remaining steps are resequenced.

---

### Status Progression

The `TravelRequest` / `BailoutStatus` advances as each sequence step is approved:

| Seq approved | New status |
|---|---|
| 1 | `APPROVED_L1` |
| 2 | `APPROVED_L2` |
| 3 | `APPROVED_L3` |
| 4 | `APPROVED_L4` |
| 5 | `APPROVED_L5` |
| Last | `APPROVED` |

`ClaimStatus` has no intermediate levels — it goes directly `SUBMITTED → APPROVED` when the last approval resolves.

---

### WhatsApp Notifications

Implemented in [`src/lib/utils/whatsapp.ts`](../src/lib/utils/whatsapp.ts). All calls are non-blocking (`void (async () => {...})()`).

| Event | Recipient | Message |
|---|---|---|
| TravelRequest submitted | seq=1 approver | Approval poll with approve/reject/revision options |
| Travel approval approved (not last) | seq=N+1 approver | Approval poll |
| Travel approval fully approved | Requester | "✅ Travel Request Disetujui Penuh" |
| Travel approval rejected | Requester | "❌ Travel Request Ditolak" + reason |
| Travel revision requested | Requester | "🔄 Revisi Travel Request Diminta" + notes |
| Claim submitted | seq=1 approver | Claim approval poll |
| Claim approval approved (not last) | seq=N+1 approver | Claim approval poll |
| Claim approval fully approved | Submitter | "✅ Claim Disetujui Penuh" |
| Claim rejected | Submitter | "❌ Claim Ditolak" + reason |
| Claim revision requested | Submitter | "🔄 Revisi Claim Diminta" |
| Bailout submitted | Chief/Manager users (up to 5) | Bailout poll |
| Bailout approved by chief | Director users (up to 5) | Bailout poll |
| Bailout fully approved | Requester | "✅ Bailout Disetujui" |
| Bailout rejected | Requester | "❌ Bailout Ditolak" |
| Bailout revision | Requester | "🔄 Revisi Bailout Diminta" |

---

## 5. Key Constraints

| Constraint | Where enforced |
|---|---|
| Only requester can submit TravelRequest | `travelRequest.submit` |
| Only DRAFT or REVISION can be submitted | `travelRequest.submit`, `claim.submit` |
| Claim requires at least 1 attachment | `claim.submit` |
| Claim can only be created on LOCKED TravelRequest | `claim.create` |
| Only Finance/Admin can lock TravelRequest | `travelRequest.lock` |
| Only Finance/Admin can close TravelRequest | `travelRequest.close` |
| TravelRequest must be APPROVED before locking | `travelRequest.lock` |
| All claims must be PAID/REJECTED before closing | `travelRequest.close` |
| Approver must match session user (or admin bypass) | `approval.*` |
| Approval must be PENDING to act on it | `approval.*` |
| Previous sequence approvals must be done before current | `approval.approveTravelRequest` |

---

## 6. State Machine Diagrams

### TravelRequest

```
DRAFT ──submit──► SUBMITTED
                      │
              seq=1 approved
                      │
              ┌───────▼────────┐
              │  APPROVED_L1   │ ──seq=2 approved──► APPROVED_L2 ──…──► APPROVED
              └────────────────┘
                      │
                 rejected / revision
                      │
              REJECTED / REVISION ──resubmit──► SUBMITTED (chain rebuilt)

APPROVED ──lock──► LOCKED ──close──► CLOSED
```

### Claim

```
DRAFT ──submit──► SUBMITTED
                      │
              all approvals done
                      │
                  APPROVED ──markAsPaid──► PAID
                      │
               rejected / revision
                      │
              REJECTED / REVISION ──resubmit──► SUBMITTED (chain rebuilt)
```

### Bailout

```
DRAFT ──submit──► SUBMITTED
                      │
              all approvals done
                      │
                  APPROVED ──disburse──► DISBURSED
                      │
               rejected / revision
                      │
              REJECTED / REVISION ──resubmit──► SUBMITTED
```
