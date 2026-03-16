# Travel Request Workflow

**Project:** `travel-claim`  
**Workflow scope:** implemented travel request lifecycle  
**Source of truth:** `src/server/api/routers/travelRequest.ts`, `prisma/schema.prisma`

---

## 1. Purpose

This document describes how travel requests work in the current implementation, from creation through submission, approval progression, locking, and closing.

---

## 2. Main Entities

- `TravelRequest`
- `TravelParticipant`
- `Approval`
- `Project`
- `Bailout`
- `Claim`
- `AuditLog`

Important relationships:

- one travel request has one requester
- one travel request can have many participants
- one travel request can have many approvals
- one travel request can have many claims
- one travel request can have many bailouts
- a sales travel request may point to one project

---

## 3. Lifecycle States

The current travel request statuses are:

- `DRAFT`
- `SUBMITTED`
- `APPROVED_L1`
- `APPROVED_L2`
- `APPROVED_L3`
- `APPROVED_L4`
- `APPROVED_L5`
- `APPROVED`
- `REJECTED`
- `REVISION`
- `LOCKED`
- `CLOSED`

State meaning in practice:

- `DRAFT`: editable by requester
- `SUBMITTED`: approval chain exists and is waiting for action
- `APPROVED_L*`: intermediate approval milestone
- `APPROVED`: all required approval steps completed
- `REJECTED`: workflow stopped by rejection
- `REVISION`: requester must revise and resubmit
- `LOCKED`: finance has locked the request after approval
- `CLOSED`: finance has closed the request after claim settlement

---

## 4. Entry Points

Primary backend procedures:

- `travelRequest.getAll`
- `travelRequest.getByParticipantEmployeeId`
- `travelRequest.getById`
- `travelRequest.getPendingApprovals`
- `travelRequest.create`
- `travelRequest.update`
- `travelRequest.submit`
- `travelRequest.lock`
- `travelRequest.close`
- `travelRequest.delete`
- `travelRequest.getStatistics`
- `travelRequest.getApproved`

Primary UI entry points:

- `src/app/(authenticated)/travel/page.tsx`
- `src/components/features/travel/TravelRequestForm.tsx`
- `src/components/features/travel/BailoutPanel.tsx`

---

## 5. Create Flow

## Input

Creation accepts:

- purpose
- destination
- travel type
- start date
- end date
- optional project ID
- optional participant IDs
- optional nested bailout rows

## Business rules

- end date must be after start date
- `SALES` travel requires a `projectId`
- request number is generated in `TR-YYYY-NNNNN` format
- if nested bailouts are included, each bailout gets a `BLT-YYYY-NNNNN` number

## Output

The system creates:

- the `TravelRequest`
- optional `TravelParticipant` rows
- optional nested `Bailout` rows
- one audit log entry with action `CREATE`

## Notes

- the requester is always `ctx.session.user.id`
- the created request stays in `DRAFT`
- no approval records are created during initial creation

---

## 6. Read and List Flow

## Visibility rules

Non-manager users can only see:

- their own requests
- requests where they are listed as participants

Privileged roles with broader visibility:

- `MANAGER`
- `DIRECTOR`
- `ADMIN`
- `FINANCE`

## Included read model

The list and detail queries typically include:

- requester profile
- participant list
- approval history
- claim count or claim list
- linked bailouts
- linked project

This means the travel request module already acts as a composed workflow view, not only a CRUD table.

---

## 7. Update Flow

Updates are allowed only when the request is still mutable.

Expected mutable statuses:

- `DRAFT`
- `REVISION`

Update behavior:

- requester updates core travel fields
- participants can be changed
- bailout rows can be recreated or adjusted as part of the request payload
- an `UPDATE` audit log is written

Architectural note:

The update workflow remains document-centric. The travel request is the aggregate root for participants and initial bailout intent.

---

## 8. Submit Flow

Submission is the most important step in the module.

## Preconditions

- request must exist
- current user must be the requester
- status must be `DRAFT` or `REVISION`

## Submission steps

1. Load the travel request with requester hierarchy and, when needed, project sales-lead hierarchy.
2. Determine whether the requester is in a sales role.
3. Determine whether the request is a sales trip.
4. Build approval entries in order.
5. Deduplicate repeated approvers.
6. Resequence approvals after deduplication.
7. If resubmitting from `REVISION`, delete stale approval rows first.
8. Allocate new `APR-YYYY-NNNNN` approval numbers.
9. Update travel request status to `SUBMITTED`.
10. Create approval rows.
11. Write a `SUBMIT` audit log.
12. Notify only the first approver through WhatsApp poll when a phone number exists.

---

## 9. Approval Chain Construction Rules

The implemented routing logic is dynamic and depends on:

- requester role
- travel type
- linked project
- department chief
- supervisor chain

## Case A: requester is `SALES_EMPLOYEE` or `SALES_CHIEF`

Chain starts at:

- `DEPT_CHIEF`

Then continues upward through:

- `DIRECTOR`
- `SENIOR_DIRECTOR`
- `EXECUTIVE`

## Case B: requester is not in a sales role, but trip type is `SALES` and project has a sales lead

Chain starts at:

- `SALES_LEAD`

Then continues through the sales lead's supervisor chain:

- `DEPT_CHIEF`
- `DIRECTOR`
- `SENIOR_DIRECTOR`
- `EXECUTIVE`

If the requester is already the project sales lead:

- skip `SALES_LEAD`
- start from the requester's department chief

## Case C: requester is not in a sales role and trip type is not `SALES`

Chain starts at:

- requester's department chief as `DEPT_CHIEF`

Then continues up the supervisor chain:

- `DIRECTOR`
- `SENIOR_DIRECTOR`
- `EXECUTIVE`

## Deduplication rule

If the same person appears more than once in the raw chain:

- keep the first occurrence
- remove later duplicates
- resequence the remaining steps

---

## 10. Approval Progression Effects

The approval module updates travel request status as each step is approved.

Expected progression:

- first approval can move to `APPROVED_L1`
- second approval can move to `APPROVED_L2`
- third approval can move to `APPROVED_L3`
- fourth approval can move to `APPROVED_L4`
- fifth approval can move to `APPROVED_L5`
- final approval moves to `APPROVED`

If an approver rejects:

- request status becomes `REJECTED`

If an approver requests revision:

- request status becomes `REVISION`
- approval states are reset for resubmission logic

---

## 11. WhatsApp Notification Behavior

During submission:

- only the first approver is notified immediately
- a poll message is built with request number, destination, purpose, requester, and date range
- later approver notifications are handled by the approval module after earlier steps complete

If WhatsApp is not configured:

- the send is skipped
- request submission still succeeds

---

## 12. Lock Flow

Locking is finance-controlled.

## Preconditions

- current user must have `FINANCE` or `ADMIN`
- request must be in `APPROVED`

## Effects

- status becomes `LOCKED`
- `lockedAt` is written
- an audit log with action `LOCK` is written

Interpretation:

The request is no longer just an approval document. It becomes a finance-controlled operational record.

---

## 13. Close Flow

Closing is the final travel request lifecycle step.

## Preconditions

- current user must have `FINANCE` or `ADMIN`
- request must be `LOCKED`
- no linked claims may remain in a non-terminal state

The code checks for claims not in:

- `PAID`
- `REJECTED`

## Effects

- status becomes `CLOSED`
- `closedAt` is written
- an audit log with action `CLOSE` is written

---

## 14. Delete Flow

Deletion is a soft delete.

## Preconditions

- requester or admin only
- request must be in `DRAFT`

## Effects

- `deletedAt` is set
- an audit log with action `DELETE` is written

Important note:

Submitted or approved travel requests are intentionally not deletable through this path.

---

## 15. Workflow Diagram

```text
Create Draft
    |
    v
DRAFT
    |
    +-- update --> DRAFT
    |
    +-- submit --> SUBMITTED
                     |
                     +-- approval 1 --> APPROVED_L1
                     +-- approval 2 --> APPROVED_L2
                     +-- approval 3 --> APPROVED_L3
                     +-- approval 4 --> APPROVED_L4
                     +-- approval 5 --> APPROVED_L5
                     +-- final required approval --> APPROVED
                     |
                     +-- reject --> REJECTED
                     +-- revision --> REVISION
                                         |
                                         +-- update --> REVISION
                                         +-- resubmit --> SUBMITTED

APPROVED
    |
    +-- finance lock --> LOCKED
                              |
                              +-- all open claims settled --> CLOSED
```

---

## 16. Risks and Observations

## Strengths

- dynamic routing is already implemented
- document lifecycle is explicit
- audit logs are embedded in the workflow
- the module composes related business data well

## Risks

- routing logic is embedded directly inside the router file
- number generation is still application-managed
- submission and workflow code is large and tightly coupled to transport

---

## 17. Recommended Refactors

1. Extract approval-chain building into a dedicated service.
2. Extract request lifecycle transitions into a state service.
3. Add tests for the three routing cases and deduplication.
4. Add tests for revision resubmission and approval-number regeneration.
5. Document which page components currently consume which procedures.
