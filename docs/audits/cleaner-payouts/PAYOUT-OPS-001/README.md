# PAYOUT-OPS-001 — Office Pending Approval Workflow

| Field | Value |
|-------|-------|
| **Work package** | PAYOUT-OPS-001 |
| **Opened from** | PAYOUT-E2E-001 Phase A live review (2026-07-21) |
| **Classification** | Operational completeness / control-gap (UX + ops) |
| **Status** | **PRODUCTION DEPLOYED** (2026-07-21) — see `evidence/production-deploy-2026-07-21.md` |
| **Design gate (2026-07-21)** | **CONDITIONAL PASS** (design) |
| **Implementation gate (2026-07-21)** | **PASS** (implementation + staging verify + KI-OPS-003 remediation) |
| **Verification gate (2026-07-21)** | **PASS** for production authorization (residuals accepted — see `known-issues.md`) |
| **Distinct from** | PAYOUT-E2E-001 Phase A (earnings-source integrity + maker–checker **control**) |
| **Production** | **Deployed** — PR #78 merged; migrations applied; `shalean.co.za` @ `f628bf0b` |

## Authoritative governance baseline (2026-07-21)

| Area | Status |
|------|--------|
| Phase A – Financial Control | **PASS** |
| Operational Approval Workflow (design) | **PASS** |
| Operational Approval Workflow (implementation) | **PASS** |
| Production Readiness | **PASS — Approved for production deployment** |
| Production Deployment | **Authorized** (2026-07-21) — execute under change control |
| Maker–Checker Control | **Enabled** (`PAYOUT_MAKER_CHECKER=true`) — must remain |

**Interpretation:** Phase A delivered the financial control. PAYOUT-OPS-001 completes the Office operational approval workflow. Production merge and deploy are authorized subject to migration apply, flag confirmation, post-deploy verification, and rollback readiness.

**Implementation boundary:** Analysis, implementation, remediation, and non-production verification completed. Production cutover proceeds under approved change management.

## Governance framing

| Control Objective | Assessment | Status |
|-------------------|------------|--------|
| Prevent unauthorized earnings changes | Proposal does not immediately alter stored earnings | **PASS** (Phase A) |
| Preserve financial integrity after refresh | Original amount restored because proposal was not approved | **PASS** (Phase A) |
| Record pending approval | Proposal successfully created (`admin_money_action_proposals`) | **PASS** (Phase A) |
| Enable independent second-admin approval | Approval API exists (`PATCH …/adjust-payout-earnings` + `proposal_id`) | **PASS** (Phase A) — harden before Office UX |
| Provide operational approval workflow in Office | No UI / queue to complete approval | **CONTROL GAP** → design complete |
| Immutable proposal apply + atomic claim | Body-based apply; non-atomic status update | **CONDITIONS** for implementation |

Phase A delivered the **financial control**. This package completes the **operational process** design. Do **not** disable `PAYOUT_MAKER_CHECKER` to compensate for missing Office UX.

## Problem

With `PAYOUT_MAKER_CHECKER=true`:

- Visit earnings edits correctly create proposals and leave stored amounts unchanged.
- Refresh correctly restores the pre-proposal amount.
- Office shows no pending-approval queue, no `proposal_id`, and no Approve/Reject actions for earnings adjustments (unlike refund flows that surface `proposal_id`).

Operators therefore cannot complete the checker step from Office alone.

## Design summary (2026-07-21)

| Topic | Decision |
|-------|----------|
| UX placement | Dedicated `/office/payouts/approvals` |
| List API | `GET /api/admin/money-action-proposals` (new) |
| Approve | `POST …/proposals/:id/approve` applying **stored payload** + atomic claim |
| Reject | `POST …/proposals/:id/reject` with required `review_note` (new) |
| Schema | Sufficient for v1; optional queue index; snapshot originals in payload JSON |
| Hardening | Mandatory: SEC-OPS-001 (payload immutability), SEC-OPS-002 (race-safe claim) |

## Deliverables

| # | Document |
|---|----------|
| 1 | This `README.md` |
| 2 | [`current-state-analysis.md`](./current-state-analysis.md) |
| 3 | [`proposed-architecture.md`](./proposed-architecture.md) |
| 4 | [`ux-workflow.md`](./ux-workflow.md) |
| 5 | [`security-risk-assessment.md`](./security-risk-assessment.md) |
| 6 | [`api-data-contracts.md`](./api-data-contracts.md) |
| 7 | [`test-plan.md`](./test-plan.md) |
| 8 | [`implementation-plan.md`](./implementation-plan.md) |
| 9 | [`decision-log.md`](./decision-log.md) |
| 10 | [`evidence/index.md`](./evidence/index.md) |

## Suggested scope (when implementation authorized)

1. Display pending earnings adjustment proposals (optionally reprice types later).
2. Show proposal details: original amount, proposed amount, reason/note, proposer, timestamp, booking/cleaner links, `proposal_id`.
3. Allow only authorized **second** administrators to approve or reject.
4. Record approval/rejection with a complete audit trail.
5. Notify the initiating administrator of the outcome (phase 5).
6. Preserve maker–checker segregation of duties; prevent self-approval (`PAYOUT_ALLOW_SELF_APPROVE` remains off unless separately authorized).
7. Close SEC-OPS-001 / SEC-OPS-002 in the same change set as the Office UI.

## Non-goals (unless separately authorized)

- Turning off `PAYOUT_MAKER_CHECKER`
- Ledger backfills, payout regeneration, Zoho sync, production promotion of PR #76
- Weakening API self-approve protections
- Global cross-domain Office approvals inbox (expenses/refunds)

## Related

- Phase A evidence: `docs/audits/cleaner-payouts/PAYOUT-E2E-001/evidence/phase-a-staging-verification-2026-07-21.md`
- Maker–checker lib: `apps/web/lib/payout/earningsAdjustMakerChecker.ts`
- Approve API (legacy): `apps/web/app/api/admin/bookings/[id]/adjust-payout-earnings/route.ts`
- Table: `admin_money_action_proposals`
