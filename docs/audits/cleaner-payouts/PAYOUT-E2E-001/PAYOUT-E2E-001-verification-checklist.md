# PAYOUT-E2E-001 — Verification Checklist

Use after remediation. All critical/high items must be checked with evidence links.

## 0. Identity gate

- [ ] Record repo, branch, commit SHA
- [ ] Record staging + production deployment SHAs
- [ ] Confirm code under test matches deployment under test
- [ ] Record Supabase project refs
- [ ] Record `PAYOUT_MAKER_CHECKER` and Paystack mode (test/live)

## 1. Source of truth

- [ ] Documented single classifier used by edit + remove + office + dashboard
- [ ] No success response without RAW match for selected cleaner
- [ ] Job card and dashboard use same per-cleaner resolver (or documented intentional difference)

## 2. Visit edit matrix (staging)

For each row: capture before JSON, request, response, after JSON, audit row, batch total.

| Case | Pass? | Evidence |
|------|-------|----------|
| Solo unbatched | | |
| Solo pending batch | | |
| Solo frozen batch | | |
| Paired `is_team_job=false` | | |
| True team job | | |
| Lead edit | | |
| Member edit | | |
| Summary present | | |
| Summary absent | | |
| TJ rows present | | |
| Roster member rows present | | |
| Approved batch (expect reject) | | |
| Paid booking (expect reject) | | |
| Invalid cleaner | | |
| Cleaner not on booking | | |
| Amount unchanged | | |
| Above cap | | |
| Concurrent edits | | |
| Maker–checker proposal (UI shows pending, not saved) | | |
| Maker–checker approve applies once | | |

## 3. Remove / reassignment

- [ ] Remove primary solo
- [ ] Remove member
- [ ] Remove lead from team
- [ ] Pending / frozen batch sync
- [ ] Reject after approved/paid
- [ ] No orphan TJ/roster rows for editable statuses
- [ ] Audit record present

## 4. Batch generation

- [ ] Eligibility rules documented and tested
- [ ] JHB month bounds correct
- [ ] Sum allocations == calculated batch amount
- [ ] No double rail inclusion for same earning
- [ ] Zero-value / cancelled / test excluded
- [ ] Re-generation idempotent

## 5. Approval / immutability

- [ ] Cannot edit visits after approve / transfer / paid
- [ ] Batch amount override requires note + maker–checker if enabled
- [ ] Self-approve blocked when configured

## 6. Paystack

- [ ] Outbox insert before API call
- [ ] Immutable reference on retry
- [ ] No second transfer after success
- [ ] Webhook replay idempotent
- [ ] Uncertain network → needs_reconcile (not failed)
- [ ] Success transfer ⇒ local paid
- [ ] Local paid ⇒ success transfer (or explicit manual mark with audit)
- [ ] No live transfer in verification unless authorized

## 7. Dashboard parity

- [ ] Sample N cleaners: office period total == cleaner dashboard period total
- [ ] Edited visit appears identically on both surfaces
- [ ] Removed cleaner disappears from both

## 8. Security

- [ ] Non-admin cannot call adjust/remove/generate/approve/pay
- [ ] Cleaner cannot read another cleaner’s earnings
- [ ] Cleaner cannot trigger transfers or view others’ bank details
- [ ] Service role not exposed to client
- [ ] Error messages do not leak secrets

## 9. Observability

For each money event: actor, timestamp, booking, cleaner, payout, before, after, reason, env, correlation id, transfer ref, outcome.

- [ ] Earnings calculated
- [ ] Manually edited
- [ ] Cleaner removed
- [ ] Batch generated / adjusted / frozen / approved
- [ ] Transfer queued / submitted / succeeded / failed
- [ ] Reconciled / reversed
- [ ] Accounting sync (if in scope) attempted/succeeded/failed

## 10. Data integrity pack

- [ ] Run `PAYOUT-E2E-001-data-integrity.md` SQL on staging then production (read-only)
- [ ] Pseudo-team risk count == 0 **or** accepted with compensating control
- [ ] TJ-missing-from-summary count == 0 **or** remediations applied
- [ ] Duplicate transfer references == 0
- [ ] Stale outbox == 0 or ticketed

## 11. Test suite gate

- [ ] Integration tests for F01–F05 scenarios in CI
- [ ] No “export-only” stub tests for money writers
- [ ] Concurrency + webhook replay tests green

## 12. Final decision

- [ ] All Critical findings closed or accepted in writing by finance + eng lead
- [ ] All High findings closed or time-boxed with compensating controls
- [ ] Decision: `PASS` / `CONDITIONAL PASS` / `NO-GO`

**Current audit decision (2026-07-20): NO-GO** — checklist not satisfied.
