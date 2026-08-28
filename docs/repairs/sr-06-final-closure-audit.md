# SR-06 Final Closure Audit — Cleaner / team / assignment integrity

Status: Closure candidate
Priority: P0
Branch target: `integration/shalean-repairs`
Production data changes: none

## Scope

SR-06 is limited to cleaner, team, and assignment integrity. This closure audit verifies the repaired source-of-truth and access rails already accumulated on `integration/shalean-repairs`; it does not expand SR-06 into unrelated workforce features.

## Repaired integrity rails

### Cleaner truth
- Cleaner Management reads canonical lifecycle and dispatch availability instead of conflating arbitrary status labels.
- Office cleaner status presentation remains limited to `Available`, `Busy`, and `Offline`.
- Cleaner detail API uses centralized Office RBAC for view/edit access.

### Team truth
- Explicit booking team assignment is authoritative for supervisor scope.
- Roster overlap is only a fallback for legacy/solo bookings without an explicit team.
- Supervisor team membership respects both `active_from` and `active_to`; a future end date remains active until expiry.

### Assignment/performance truth
- Cleaner performance reliability uses period-scoped `dispatch_offers`, not lifetime acceptance snapshots.
- Cleaner self-performance is self-only and uses the canonical scorecard service.
- The cleaner performance UI exposes the canonical score period so evidence counts are not presented without their window.

### Quality truth
- Signed-off QA inspection status is realigned when later defect evidence changes the recommended outcome.
- Closed inspections remain closed absent an explicit reopen workflow.
- Supervisor QA access is constrained to bookings in the supervisor's authoritative team scope.

### Training/compliance truth
- Readiness fails closed when no compliance evidence exists.
- Cleaner and Office surfaces both expose the missing-evidence reason instead of showing an ambiguous zero issue count.

## Closure checks

- No remaining concrete P0 defect was identified in the current cleaner/team/assignment integrity rails during this audit.
- No production data mutation, team membership write, booking allocation change, earnings/payout/refund change, booking-price change, or customer-finance change is required for closure.
- Existing SR-06 regression contracts cover cleaner management truth, supervisor quality/team scope, performance window reliability, cleaner self-performance, training/compliance readiness, training visibility, and QA inspection state truth.

## Integration note

At audit time, `integration/shalean-repairs` contains the SR-01 through SR-06 repair accumulation and remains intentionally separate from `main`. Individual SR slices must not be merged to `main`; the integration branch is merged to `main` only after SR-01 through SR-15 are complete and validated.

## Decision

If CI for this documentation-only closure PR is green, mark **SR-06 — Cleaner/team/assignment integrity** as **Completed** and proceed to **SR-07 — Customer booking/account correctness**.
