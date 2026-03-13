# Approval Engine Workflow

**Project:** `travel-claim`  
**Workflow scope:** implemented approval processing for travel requests, claims, and bailouts  
**Source of truth:** `src/server/api/routers/approval.ts`, `src/server/api/routers/travelRequest.ts`, `prisma/schema.prisma`

---

## 1. Purpose

This document describes the approval engine as it exists in the current codebase. The engine is not implemented as a separate service package. It is implemented inside the approval router and connected domain routers.

The approval engine is responsible for:

- representing approval steps
- resolving who can act
- processing approve, reject, and revision actions
- updating the linked business document
- writing audit logs
- triggering notifications

---

## 2. Core Data Model

The approval engine centers on the `Approval` model.

Important fields:

- `approvalNumber`
- `travelRequestId`
- `bailoutId`
- `claimId`
- `sequence`
- `level`
- `status`
- `approverId`
- `comments`
- `rejectionReason`
- `approvedAt`
- `rejectedAt`

Important rules:

- one approval row represents one step in a chain
- exactly one business entity link should be populated
- `sequence` determines ordering inside a document
- routing logic is implemented in application code, not in the database

---

## 3. Supported Document Types

The approval engine is generic across:

- `TravelRequest`
- `Claim`
- `Bailout`

The document type is auto-detected from which foreign key is populated on the approval row.

---

## 4. Approval Status Model

The approval row statuses are:

- `PENDING`
- `APPROVED`
- `REJECTED`
- `REVISION_REQUESTED`

General meaning:

- `PENDING`: waiting for action
- `APPROVED`: current step accepted
- `REJECTED`: current step rejected and document stopped
- `REVISION_REQUESTED`: current step sent document back for revision

---

## 5. Approval Levels

The current approval levels are:

- `SALES_LEAD`
- `DEPT_CHIEF`
- `DIRECTOR`
- `SENIOR_DIRECTOR`
- `EXECUTIVE`

These levels are semantic labels, but ordering in runtime behavior is governed primarily by `sequence`.

---

## 6. Entry Points

Primary procedure:

- `approval.actOnApproval`

Supporting procedures:

- `approval.getAllApprovalsAdmin`
- `approval.adminActOnApproval`
- `approval.getTravelRequestsForDirectorReview`
- `approval.adminActOnTravelRequestDirect`

The approval module is unusual because one procedure serves multiple modes:

- web UI
- MCP agent calls
- WhatsApp-style incoming flows

---

## 7. Unified Action Model

The main approval action endpoint accepts an `action` discriminator.

Supported actions:

- `list`
- `pending_count`
- `get`
- `approve`
- `reject`
- `revision`

This makes the approval engine behave like a command processor rather than a set of isolated REST-style routes.

---

## 8. Identity and Authorization Model

## Normal web flow

For browser-authenticated use:

- user must pass `supervisorProcedure`
- session comes from NextAuth
- current approver is validated against `ctx.session.user.id`

## Incoming messaging or MCP-assisted flow

The system also supports:

- `approvalId` or `approvalNumber`
- optional `callerPhone`

When `callerPhone` is supplied:

- it must match the `approver.phoneNumber`
- mismatch causes a `FORBIDDEN` error

This is how the system supports phone-driven approval actions safely without relying only on browser session state.

---

## 9. List and Read Flows

## `list`

Returns approvals assigned to the current approver.

Supported filters:

- `status`
- `entityType`
- pagination inputs

The list call includes business context such as:

- travel request requester
- claim submitter
- linked travel request summary
- approver details

## `pending_count`

Returns how many approvals are waiting for the current approver.

## `get`

Returns full detail for one approval, including the linked business document and approver metadata.

---

## 10. Approve Flow

The general approve flow is:

1. Resolve the approval by `approvalId` or `approvalNumber`.
2. Optionally validate `callerPhone`.
3. Confirm the current actor is allowed to act.
4. Confirm the approval is still `PENDING`.
5. Update the approval row to `APPROVED`.
6. Update the linked document status.
7. Write an audit log.
8. Notify the next approver when another step remains.

## Document-specific effects

### Travel request

- current approval becomes `APPROVED`
- request moves to `APPROVED_L1` through `APPROVED_L5` based on sequence
- if this was the final required step, request becomes `APPROVED`
- next approver may be notified through WhatsApp

### Claim

- current approval becomes `APPROVED`
- claim status advances
- final approval can move the claim to `APPROVED`
- next approver may be notified

### Bailout

- current approval becomes `APPROVED`
- bailout status advances along its own business status model
- next approver may be notified

Architectural note:

The engine is generic at the approval-row layer, but the business effects remain entity-specific.

---

## 11. Reject Flow

The general reject flow is:

1. Resolve the target approval.
2. Validate actor identity.
3. Require a rejection reason with minimum length.
4. Confirm current approval is `PENDING`.
5. Mark approval as `REJECTED`.
6. Set `rejectedAt`.
7. Update the linked document to its rejected state.
8. Write an audit log.
9. Optionally notify the submitter or requester.

## Document-specific rejected states

- travel request -> `REJECTED`
- claim -> `REJECTED`
- bailout -> `REJECTED`

The reject action is terminal for the current workflow run.

---

## 12. Revision Flow

Revision is different from rejection. It sends the document back for correction.

General steps:

1. Resolve the target approval.
2. Validate actor identity.
3. Require revision comments.
4. Confirm approval is still `PENDING`.
5. Mark the current approval row as `REVISION_REQUESTED`.
6. Reset related approval rows back to `PENDING` where needed.
7. Update the linked business document to a revision state.
8. Write an audit log.
9. Notify the submitter or requester.

## Document-specific revision states

- travel request -> `REVISION`
- claim -> `REVISION`
- bailout -> revision-style workflow behavior inside bailout processing

Important implementation detail:

For travel requests, resubmission from `REVISION` deletes stale approval rows before creating fresh ones. This avoids approval-number collisions and stale chain reuse.

---

## 13. Notification Model

The approval engine uses WhatsApp utilities for outbound messaging.

Patterns:

- first approver is notified on travel request submission
- later approvers are notified as previous steps complete
- revision and rejection can notify the requester or submitter
- if WhatsApp config is missing, sending is skipped rather than failing the business action

This makes notifications best-effort, not transaction-blocking.

---

## 14. Numbering Model

Approval numbers follow:

- `APR-YYYY-NNNNN`

Generation behavior:

- based on the maximum existing suffix rather than raw count
- avoids collisions after approval deletion on revision resubmits

This is an improvement over naive count-based numbering, but concurrency should still be treated carefully.

---

## 15. Travel Approval Sequence Behavior

For travel requests, sequence affects the resulting status:

- sequence 1 -> `APPROVED_L1`
- sequence 2 -> `APPROVED_L2`
- sequence 3 -> `APPROVED_L3`
- sequence 4 -> `APPROVED_L4`
- sequence 5 -> `APPROVED_L5`
- last required approval -> `APPROVED`

The engine therefore does two related jobs:

- approve the current step
- compute the aggregate document state

---

## 16. Admin Override Paths

The approval module also contains admin-oriented actions.

Capabilities include:

- viewing all approvals at a given level
- acting on approvals without being the assigned approver
- directly creating a director-level approval action for a travel request

These paths are useful operationally, but they also mean the module contains:

- end-user workflow logic
- admin override logic
- review-reporting logic

That is convenient, but it also increases complexity.

---

## 17. Approval Engine Diagram

```text
Business document created
    |
    v
Approval chain created
    |
    v
Current approval step = PENDING
    |
    +-- approve
    |      |
    |      +-- mark step APPROVED
    |      +-- update document status
    |      +-- if next step exists, notify next approver
    |      +-- else mark document fully approved
    |
    +-- reject
    |      |
    |      +-- mark step REJECTED
    |      +-- mark document rejected
    |      +-- stop current workflow
    |
    +-- revision
           |
           +-- mark step REVISION_REQUESTED
           +-- reset or rebuild chain as needed
           +-- mark document revision state
           +-- return control to requester or submitter
```

---

## 18. Strengths of the Current Engine

- one generic approval model supports multiple document types
- sequence-based chains support variable hierarchy depth
- phone-based validation supports messaging workflows
- audit logging is integrated
- admin override paths exist for operational recovery

---

## 19. Risks and Weaknesses

## Risk 1: Very large router file

The approval engine is powerful, but concentrated in one router. That makes:

- testing harder
- reasoning harder
- future changes riskier

## Risk 2: Mixed responsibilities

The module combines:

- workflow execution
- transport handling
- identity verification
- admin reporting
- notification triggering

## Risk 3: Entity-specific behavior is embedded in a generic engine

The engine is generic in storage, but still contains document-specific branching. That is a sign it would benefit from dedicated internal strategy or service modules.

---

## 20. Recommended Refactors

1. Extract `resolve approval` and `verify actor` into dedicated helpers or services.
2. Split document-specific approval handling into:
   - travel approval handler
   - claim approval handler
   - bailout approval handler
3. Move notification dispatch behind a notification service interface.
4. Add tests for:
   - approve next-step routing
   - reject terminal behavior
   - revision reset behavior
   - phone ownership verification
   - admin override paths
5. Add a dedicated architecture decision record for why the approval engine remains router-centric or why it should move to services.
