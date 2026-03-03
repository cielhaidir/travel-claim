# Dynamic Approval Hierarchy

> **Version:** 1.0  
> **Last Updated:** 2026-03-02  
> **Scope:** TravelRequest · Bailout · Claim

---

## Table of Contents

1. [Overview](#overview)
2. [Organizational Model](#organizational-model)
3. [ApprovalLevel Enum](#approvallevel-enum)
4. [Routing Rules](#routing-rules)
   - [Sales Employee / Sales Chief](#a-requester-is-sales_employee-or-sales_chief)
   - [Employee — Sales Travel (with Project)](#b-requester-is-employee--traveltype--sales-linked-to-project)
   - [Employee — Non-Sales Travel](#c-requester-is-employee--traveltype--operational--meeting--training)
5. [Approval Chain Examples](#approval-chain-examples)
6. [Approval Model](#approval-model)
7. [Status Enums](#status-enums)
8. [Database Schema Summary](#database-schema-summary)
9. [Application Layer Responsibilities](#application-layer-responsibilities)

---

## Overview

The approval system is **fully dynamic**: the chain of approvers is resolved at runtime by the application layer using the organisational graph stored in the database. No approver IDs are hard-coded on the document records.

A single [`Approval`](../prisma/schema.prisma) row represents **one step** in the chain for a `TravelRequest`, `Bailout`, or `Claim`. Each step records:

| Field | Meaning |
|---|---|
| `sequence` | 1 = first approver, 2 = second, … |
| `level` | The role-level of this step (`ApprovalLevel` enum) |
| `approverId` | The specific `User` who must act |
| `status` | `PENDING → APPROVED / REJECTED / REVISION_REQUESTED` |

The next step is only created (and the notification sent) after the current step is `APPROVED`.

---

## Organizational Model

```
Company
└── Department  (has one chief: Department.chiefId → User)
    ├── User  (EMPLOYEE / SALES_EMPLOYEE)   supervisorId → Dept Chief
    ├── User  (EMPLOYEE / SALES_EMPLOYEE)   supervisorId → Dept Chief
    └── User  (SALES_CHIEF / chiefId)       supervisorId → Director
                                                 ↓
                                           User (DIRECTOR)
                                                 ↓
                                     User (SENIOR_DIRECTOR / EXECUTIVE)
```

Key relationships in the schema:

| Pointer | From | To | Meaning |
|---|---|---|---|
| `User.supervisorId` | any User | their direct superior | universal supervisor chain |
| `Department.chiefId` | Department | User | the one chief of that dept |
| `Project.salesId` | Project | `User.employeeId` | the sales lead of the project |

A **regular employee's** supervisor is their department chief.  
A **department chief's** supervisor is the director above them.

---

## ApprovalLevel Enum

```prisma
enum ApprovalLevel {
    SALES_LEAD       // L1 – only for employees travelling on a sales project
    DEPT_CHIEF       // L2 – department head (Department.chiefId)
    DIRECTOR         // L3 – chief's supervisor
    SENIOR_DIRECTOR  // L4
    EXECUTIVE        // L5
}
```

The numeric prefix (L1–L5) reflects the **order** levels appear in the chain, not a hard-coded count of steps. Whether a particular level is included depends on the routing rule (see below).

---

## Routing Rules

### A. Requester is `SALES_EMPLOYEE` or `SALES_CHIEF`

All documents (TravelRequest, Bailout, Claim) submitted by a sales-role user follow the same chain:

```
seq 1  DEPT_CHIEF        → requester.department.chief
seq 2  DIRECTOR          → dept_chief.supervisor
seq 3  SENIOR_DIRECTOR   → director.supervisor  (if exists)
seq 4  EXECUTIVE         → senior_director.supervisor  (if exists)
```

> **Note:** SALES_LEAD is skipped — sales staff are already in the sales department.

---

### B. Requester is `EMPLOYEE` + `travelType = SALES` (linked to Project)

The employee is travelling **in support of a sales project**, so the sales lead of that project must approve first.

```
seq 1  SALES_LEAD        → Project.salesLead  (User via Project.salesId)
seq 2  DEPT_CHIEF        → salesLead.supervisor  (chief of sales dept)
seq 3  DIRECTOR          → dept_chief.supervisor
seq 4  SENIOR_DIRECTOR   → director.supervisor  (if exists)
seq 5  EXECUTIVE         → senior_director.supervisor  (if exists)
```

> If the requester **is** the sales lead on the project, skip SALES_LEAD and start at DEPT_CHIEF.

---

### C. Requester is `EMPLOYEE` + `travelType ≠ SALES` (OPERATIONAL / MEETING / TRAINING)

No sales project is involved; the chain uses the requester's own department hierarchy.

```
seq 1  DEPT_CHIEF        → requester.department.chief
seq 2  DIRECTOR          → dept_chief.supervisor
seq 3  SENIOR_DIRECTOR   → director.supervisor  (if exists)
seq 4  EXECUTIVE         → senior_director.supervisor  (if exists)
```

---

## Approval Chain Examples

### Example 1 — Sales Employee submits a TravelRequest

```
Budi (SALES_EMPLOYEE, Sales Dept)
  → [seq 1] Andi (DEPT_CHIEF, Sales Dept)    level=DEPT_CHIEF
  → [seq 2] Rudi (DIRECTOR)                   level=DIRECTOR
  → APPROVED ✓ → TravelRequest.status = APPROVED
```

### Example 2 — Regular Employee submits a TravelRequest for a Sales Project

```
Sari (EMPLOYEE, Engineering Dept)
  TravelRequest.travelType = SALES, projectId → Project P-001
  Project P-001.salesLead = Andi (SALES_CHIEF)

  → [seq 1] Andi (SALES_LEAD)                level=SALES_LEAD
  → [seq 2] Wati (DEPT_CHIEF, Sales Dept)     level=DEPT_CHIEF
  → [seq 3] Rudi (DIRECTOR)                   level=DIRECTOR
  → APPROVED ✓ → TravelRequest.status = APPROVED
```

### Example 3 — Regular Employee submits a Bailout for an Operational Trip

```
Joko (EMPLOYEE, Finance Dept)
  TravelRequest.travelType = OPERATIONAL

  → [seq 1] Dewi (DEPT_CHIEF, Finance Dept)  level=DEPT_CHIEF
  → [seq 2] Rudi (DIRECTOR)                   level=DIRECTOR
  → APPROVED ✓ → Bailout.status = APPROVED
```

### Example 4 — Same rules apply to Claims

```
Sari (EMPLOYEE) claims expenses on a SALES TravelRequest

  → [seq 1] Andi (SALES_LEAD)                level=SALES_LEAD
  → [seq 2] Wati (DEPT_CHIEF, Sales Dept)     level=DEPT_CHIEF
  → [seq 3] Rudi (DIRECTOR)                   level=DIRECTOR
  → APPROVED ✓ → Claim.status = APPROVED → eligible for payment
```

---

## Approval Model

```prisma
model Approval {
    id             String  @id @default(cuid())
    approvalNumber String  @unique          // APR-2026-00001

    // Exactly one of these is set:
    travelRequestId String?
    bailoutId       String?
    claimId         String?

    sequence Int            @default(1)     // order in the chain
    level    ApprovalLevel                  // role-level of this step
    status   ApprovalStatus @default(PENDING)

    approverId String
    approver   User

    comments        String?
    rejectionReason String?

    approvedAt DateTime?
    rejectedAt DateTime?
    createdAt  DateTime  @default(now())
    updatedAt  DateTime  @updatedAt
}
```

**Indexes:** `[travelRequestId, sequence]`, `[bailoutId, sequence]`, `[claimId, sequence]`, `[approverId, status]`

---

## Status Enums

### `TravelStatus` / `BailoutStatus` (identical shape)

| Value | Meaning |
|---|---|
| `DRAFT` | Created, not yet submitted |
| `SUBMITTED` | Submitted, waiting for seq 1 approval |
| `APPROVED_L1` | seq 1 approved, waiting for seq 2 |
| `APPROVED_L2` | seq 2 approved, waiting for seq 3 |
| `APPROVED_L3` | seq 3 approved, waiting for seq 4 |
| `APPROVED_L4` | seq 4 approved, waiting for seq 5 |
| `APPROVED_L5` | seq 5 approved (highest level reached) |
| `APPROVED` | All required levels approved |
| `REJECTED` | Rejected at any step |
| `REVISION` | Revision requested at any step |
| `LOCKED` *(TravelRequest only)* | Locked for claims |
| `CLOSED` *(TravelRequest only)* | Fully closed |
| `DISBURSED` *(Bailout only)* | Funds disbursed |

### `ClaimStatus`

| Value | Meaning |
|---|---|
| `DRAFT` | Not yet submitted |
| `SUBMITTED` | Awaiting approval |
| `APPROVED` | All levels approved |
| `REJECTED` | Rejected |
| `REVISION` | Revision requested |
| `PAID` | Payment processed |

### `ApprovalStatus`

| Value | Meaning |
|---|---|
| `PENDING` | Awaiting approver action |
| `APPROVED` | Approver approved this step |
| `REJECTED` | Approver rejected the document |
| `REVISION_REQUESTED` | Approver asked submitter to revise |

---

## Database Schema Summary

```
User ──────────────────────────────────────────────────────────────────────────
  id, employeeId, role, departmentId, supervisorId (→ User), password, …
  ledDepartments    → Department[] (as chief)
  travelRequests    → TravelRequest[]
  bailoutsRequested → Bailout[]
  claims            → Claim[]
  approvals         → Approval[]   (as approver)
  salesProjects     → Project[]    (as sales lead)

Department ────────────────────────────────────────────────────────────────────
  id, name, code, parentId (→ Department), chiefId (→ User)
  users → User[]

Project ───────────────────────────────────────────────────────────────────────
  id, code, name, salesId (→ User.employeeId)
  travelRequests → TravelRequest[]

TravelRequest ─────────────────────────────────────────────────────────────────
  id, requesterId, travelType, projectId, status (TravelStatus)
  approvals    → Approval[]
  bailouts     → Bailout[]
  claims       → Claim[]

Bailout ───────────────────────────────────────────────────────────────────────
  id, travelRequestId, requesterId, category, amount, status (BailoutStatus)
  approvals → Approval[]           ← NEW (replaces chiefApproverId/directorApproverId)

Claim ─────────────────────────────────────────────────────────────────────────
  id, travelRequestId, submitterId, claimType, amount, status (ClaimStatus)
  approvals → Approval[]

Approval ──────────────────────────────────────────────────────────────────────
  id, approvalNumber, sequence, level (ApprovalLevel), status (ApprovalStatus)
  travelRequestId? | bailoutId? | claimId?
  approverId → User
```

---

## Application Layer Responsibilities

The database only stores the resolved chain. The **routing algorithm** lives in the application layer (e.g., `src/server/api/routers/approval.ts`) and must:

1. **Resolve the chain** when a document is submitted:
   - Inspect `requester.role`, `requester.department`, `travelRequest.travelType`, and `travelRequest.project?.salesLead`.
   - Walk `User.supervisorId` upward to discover how many levels exist.
   - Insert one `Approval` row per step (all with `status = PENDING`), setting `sequence` and `level` correctly.
   - Only the **first step** is immediately active; the rest wait.

2. **Advance the chain** on each approval:
   - When `Approval[sequence=N]` transitions to `APPROVED`, find `Approval[sequence=N+1]`.
   - If it exists → set its `status = PENDING` and send a notification to `approver`.
   - If none remain → set the parent document `status = APPROVED`.

3. **Handle rejection / revision**:
   - Mark the current `Approval` as `REJECTED` or `REVISION_REQUESTED`.
   - Set the parent document `status = REJECTED` or `REVISION` accordingly.
   - Notify the original submitter.

4. **Re-submission after revision**:
   - Reset all `Approval` rows for the document back to `PENDING` (or delete and recreate).
   - Restart from `sequence = 1`.
