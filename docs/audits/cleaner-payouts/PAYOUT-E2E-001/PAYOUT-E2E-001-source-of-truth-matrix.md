# PAYOUT-E2E-001 — Source-of-Truth Matrix

## 1. Intended design (as implemented)

| Concern | Intended SoT |
|---------|--------------|
| Formula | `canonicalCleanerPayout` v3 (`CANONICAL_EARNINGS_MODEL_VERSION`) |
| First persist | `display_earnings_cents` + `earnings_summary` (+ member tables) |
| Cleaner dashboard / office allocation | Prefer `earnings_summary.per_cleaner_earnings[cleaner].total_cents`, else booking resolve hierarchy |
| Formal team member batching | `team_job_member_payouts` |
| Paired-solo non-lead batching | `booking_roster_member_payouts` |
| Open batch total | `cleaner_payouts.total_amount_cents` (may be manually overridden) |
| Money sent | Outbox amount from `cleaner_payouts.total_amount_cents` (weekly) or ledger claim total |
| Paid confirmation | `payout_transfers` success + webhook/reconcile idempotency |

## 2. Cleaner-facing read hierarchy

```text
resolveCleanerDashboardEarningsCents(booking, cleanerId):
  1. earnings_summary.per_cleaner_earnings[cleanerId].total_cents
  2. else resolveCleanerEarningsCents:
       a. cleaner_earnings_total_cents > 0
       b. payout_frozen_cents > 0 (with 0-frozen + positive display exception)
       c. display_earnings_cents

Office perCleanerAllocationsForBooking:
  1. summary per-cleaner rows (via resolve above)
  2. roster IDs not in summary
  3. team_job_member_payouts rows not already seen  ← critical
  4. else primary cleaner_id / payout_owner
```

## 3. Lifecycle matrix — which field wins

| State | Canonical source (intended / actual) | Notes |
|-------|--------------------------------------|-------|
| Booking created | Preview / unset | Often null until persist |
| Cleaner assigned | Preview via offer/job helpers | Persist may still be unset |
| Booking accepted | Same | |
| Booking completed | Persist engine → `display` + summary | Completion gated on display basis |
| Invoice unpaid (monthly child) | Pending payout status | May exclude from eligible batch |
| Invoice paid | Freeze → `payout_frozen_cents` + eligible | |
| Earnings manually edited (solo path) | Booking hybrid + optional summary patch | **Does not update TJ rows** |
| Earnings manually edited (team path) | Summary + `team_job_member_payouts` | Requires `is_team_job` + summary membership |
| Payout eligible | Frozen / display basis | |
| Payout frozen (batch) | Batch status `frozen` | Visit edit still allowed if batch pending/frozen and not in run |
| Batch generated | Sum of linked booking hybrid + roster/team candidates at generate time | |
| Batch adjusted | `total_amount_cents` override | `calculated_amount_cents` retained |
| Batch approved | Batch total locked for transfer | Visit edits blocked |
| Transfer created | Outbox + immutable reference | |
| Transfer succeeds | Webhook/reconcile → paid | Idempotent skip if already success |
| Transfer fails | Failed / retry eligibility | Uncertain network → `needs_reconcile` |
| Refund / booking adjustment | Separate booking money paths | Must re-check payout eligibility |
| Cleaner removed | `removeCleanerFromVisitPayout` | Clears or recomputes roster |
| Cleaner replaced | Assign + payout column clear + re-persist | Historical risk if re-persist fails |
| Team membership changes | Roster RPC + recompute | |

## 4. Disagreement matrix

| Field A | Field B | When they diverge |
|---------|---------|-------------------|
| `display_earnings_cents` | `earnings_summary.total_cleaner_earnings_cents` | Team: display is per-cleaner; total is sum |
| `cleaner_payout_cents` | `display_earnings_cents` | Team persist zeroes hybrid; solo adjust can drift |
| `cleaner_earnings_total_cents` | per-cleaner summary | Solo member edit sets line total to **team sum** after summary patch |
| `team_job_member_payouts` | summary per-cleaner | Persist locked; admin solo edit skips TJ |
| `booking_roster_member_payouts` | summary | Solo edit may patch summary but not roster rows |
| Office `earnings_cents` | booking hybrid columns shown in panel | Panel shows both; save uses earnings_cents but solo writes hybrid |
| `cleaner_payouts.total` | sum of visit allocations | Manual override; sync omission of TJ |
| `calculated_amount_cents` | `total_amount_cents` | After admin amount edit |
| Weekly batch | Ledger `cleaner_earnings` | Dual rail |
| Job card (`resolveCleanerEarningsCents`) | Dashboard (`resolveCleanerDashboardEarningsCents`) | Job ignores summary per-cleaner |

## 5. Recommended canonical classifier (not implemented)

A booking/cleaner edit should be classified as **multi-cleaner member adjustment** when **any** of:

- `is_team_job === true`, or
- `booking_cleaners` count > 1, or
- `earnings_summary.per_cleaner_earnings` count > 1, or
- a `team_job_member_payouts` row exists for `(booking, cleaner)`, or
- a `booking_roster_member_payouts` row exists for `(booking, cleaner)`, or
- requested `cleaner_id` ≠ `cleaner_id` / `payout_owner_cleaner_id` and a per-cleaner allocation exists

Solo booking-level patch should run **only** when exactly one cleaner owns the visit allocation and no member tables apply.

## 6. Post-condition required before success

```text
effective_cents_after = resolveOfficeAllocation(booking, cleanerId)
assert effective_cents_after === requested_total_cents
assert audit row durable
if open batch: assert batch total === recomputed sum including TJ + roster rails
```
