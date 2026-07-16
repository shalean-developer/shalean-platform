# BEA-PAYOUT-001 — Cleaner earnings remediation

| Field | Value |
|-------|-------|
| **Defect** | BEA-PAYOUT-001 |
| **Date (UTC)** | 2026-07-16 |
| **Environment** | Staging |
| **Status** | Code fixed; optional historic backfill |

---

## Root cause

Completed bookings could leave `cleaner_id` / `payout_owner_cleaner_id` null. Then:

1. `ensureCleanerEarningsLedgerRow` skipped with `no_cleaner` → no `cleaner_earnings` row
2. `loadOfficePayoutPeriodReport` → `perCleanerAllocationsForBooking` returned `[]` → booking skipped
3. Office Visits / Earnings / Eligible / Profit all showed **0**

Completion already computed display earnings, but owner stamp was missing on the booking row.

---

## Before / after

| Step | Before | After |
|------|--------|-------|
| Solo cleaner complete | May leave `cleaner_id` null | Stamps `cleaner_id` + `payout_owner_cleaner_id` when missing |
| Auto-complete (booking-lifecycle) | Same gap | Same owner stamp |
| Ledger insert | Required `cleaner_id` only | Falls back to `payout_owner_cleaner_id` |
| Office report | Skips unallocated completed visits | Allocations resolve for stamped owners |

---

## Changes made

| File | Change |
|------|--------|
| `lib/cleaner/runCleanerBookingLifecycleAction.ts` | Completion owner stamp |
| `lib/payout/ensureCleanerEarningsLedger.ts` | Owner fallback + exported resolver |
| `app/api/cron/booking-lifecycle/route.ts` | Owner stamp on auto-complete |
| `lib/payout/__tests__/ensureCleanerEarningsLedger.test.ts` | New |
| `lib/cleaner/__tests__/runCleanerBookingLifecycleAction.completionOwnerStamp.test.ts` | New |
| `docs/audits/uat/beaulla/evidence/beaulla-ops-payout-code-remediation-2026-07-16T1522Z.json` | Audit evidence |

---

## Acceptance mapping

| Criterion | Result |
|-----------|--------|
| Completed bookings create earnings | Yes for new solo completions with owner stamp + finalized line earnings |
| Eligible payouts calculated | Unchanged rules (prepaid pending until batch; monthly after invoice paid) |
| Profit dashboard populated | Follows visit/revenue allocations once owners present |
| Monthly payout batches | Unchanged generator; needs payable bookings |

---

## Remaining risks

- Historic completed bookings with null cleaner still need optional backfill.
- Team jobs intentionally skip solo `cleaner_earnings` ledger (team payout path).
- `is_test=true` and pre-`2026-07-01` dates still excluded from monthly office epoch.
- Eligible ≠ completed for prepaid until weekly batch / monthly settle.
