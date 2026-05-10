# Selected-cleaner earnings & completion — follow-up audit (2026-05-10)

## Executive summary

The first “selected cleaner” fix was incomplete because **paid solo bookings could reach cleaners and admin assignment completion without a durable earnings path**: (1) **`booking_line_items` were often absent** for checkout-finalized rows, so `computeCleanerEarningsForBooking` stayed on `no_line_items` while `display_earnings_cents` depended on the solo update path; (2) the **solo `UPDATE` filter** used `.not("is_team_job", "eq", true)`, which in SQL three-valued logic **excludes `is_team_job IS NULL` rows**, producing **`solo_display_update_noop`** and leaving `display_earnings_cents` null when the column was nullable in legacy data; (3) **admin PATCH** still called **`notifyCleanerAssignedBooking` even when `earnings_recompute.ok === false`**, so cleaners received “assigned” comms for jobs with no persisted basis; (4) **`resetBookingCleanerLineEarnings` errors were ignored**, so a failed reset left stale display while persist assumed a clean slate; (5) cleaner jobs used **`resolveCleanerEarningsCents` → null** but clients often rendered that as **R0** — null is not a real zero.

`persistCleanerPayoutIfUnset` could return **`{ ok: true, skipped: true, skipReason: "solo_display_update_noop" }`** while `finalizePersistResult` then upgraded that to **`{ ok: false, error: "Earnings not written" }`** when display stayed null — but **admin PATCH did not roll back assignment or block notify** for paid solo jobs.

## Root cause (real)

1. **Missing `booking_line_items`** after Paystack finalize when checkout did not dual-write lines (`updatePendingPaymentBookingForInit` only inserts when `checkoutLineItems` is present). Earnings allocation and line integrity tooling expect rows for normal paid flows.
2. **`solo_display_update_noop`** from the PostgREST-style filter **excluding `is_team_job = NULL`** on the solo earnings update (now replaced with `.or("is_team_job.eq.false,is_team_job.is.null")`).
3. **Operational gap**: assignment + notification proceeded even when earnings recompute failed for **gated** paid solo bookings.

## `persistCleanerPayoutIfUnset` skip / failure codes (relevant)

| Code / outcome | Meaning |
|----------------|---------|
| `solo_display_update_noop` | `UPDATE … RETURNING` matched **0 rows** — commonly **NULL `is_team_job` + old `.not(eq,true)` filter** |
| `weekly_payout_locked` | Booking already linked to a **frozen/paid** weekly payout |
| `cleaner_not_eligible` | `isCleanerAllowedForPersist` failed |
| `display_basis_missing` (admin) | Persist returned “success” path but `fetchBookingDisplayEarningsCents` still null |
| `persist_skipped:*` | Early idempotent skip; `finalizePersistResult` may still return **`ok: false`** if display null |
| `Could not resolve earnings` | `resolvePersistEarningsComputation` failed (no line basis + zero payout base + no fallback) |

## Files changed

| File | Change |
|------|--------|
| `apps/web/lib/booking/ensureBookingLineItemsForEarnings.ts` | **New** — backfill `booking_line_items` from `buildBookingLineItemsFromRow` when count is 0 (solo). |
| `apps/web/lib/payout/persistCleanerPayout.ts` | Call ensure before solo persist; **solo update filter** `.or("is_team_job.eq.false,is_team_job.is.null")`; export `PersistBookingRowForEarnings`. |
| `apps/web/lib/payout/adminBookingAssignmentEarningsGate.ts` | **New** — gate “paid solo must have earnings before cleaner notify”, `bookingPaidCustomerSignalsPresent`, revert helper, wide `before` select list. |
| `apps/web/app/api/admin/bookings/[id]/route.ts` | Preflight `resolvePersistEarningsComputation` + ensure; **revert assignment** on gated earnings failure (denylist for infra-only errors); conditional notify; `forceDisplayRecompute: true` on persist; **check reset errors**. |
| `apps/web/lib/payout/resetBookingCleanerLineEarnings.ts` | Return `{ ok, error }` and surface DB errors. |
| `apps/web/lib/dispatch/notifyCleanerAssigned.ts` | **Skip** `notifyBookingEvent` when gated paid solo and payout/display basis missing. |
| `apps/web/lib/cleaner/applyPreviewEarningsToCleanerJobRows.ts` | `earnings_basis_pending` when cents stay null (not an estimate). |
| `apps/web/lib/booking/adminEditBookingDetails.ts` | Handle reset return. |
| `apps/web/app/api/admin/bookings/[id]/reset-earnings/route.ts` | Handle reset return. |
| `apps/web/lib/payout/__tests__/persistCleanerPayout.test.ts` | Mock ensure; implement `.or()` on test QueryBuilder. |
| `apps/web/app/api/admin/bookings/[id]/__tests__/patch-earnings-recompute.test.ts` | Broader before mock; `resolvePersist` mock; preflight 422 test; `forceDisplayRecompute` expectation. |
| `apps/web/lib/payout/__tests__/adminBookingAssignmentEarningsGate.test.ts` | **New** unit tests. |
| `apps/web/lib/cleaner/__tests__/applyPreviewEarningsToCleanerJobRows.test.ts` | **New** — pending flag. |

## Tests added / updated

- `patch-earnings-recompute.test.ts` — preflight **422** `earnings_basis_uncomputable`; paid before row shape; `forceDisplayRecompute`.
- `adminBookingAssignmentEarningsGate.test.ts` — gate + paid signal helpers.
- `applyPreviewEarningsToCleanerJobRows.test.ts` — `earnings_basis_pending` when previews exhausted.
- `persistCleanerPayout.test.ts` — ensure mock + `.or` filter support.

## Commands run

```bash
cd apps/web
npx vitest run "app/api/admin/bookings/[id]/__tests__/patch-earnings-recompute.test.ts" lib/payout/__tests__/adminBookingAssignmentEarningsGate.test.ts lib/cleaner/__tests__/resolveCleanerEarnings.test.ts lib/payout/__tests__/persistCleanerPayout.test.ts lib/cleaner/__tests__/applyPreviewEarningsToCleanerJobRows.test.ts lib/cleaner/__tests__/runCleanerBookingLifecycleAction.completionNotifyGate.test.ts
npx tsc --noEmit
npx eslint "app/api/admin/bookings/[id]/route.ts" "lib/payout/resetBookingCleanerLineEarnings.ts" "lib/dispatch/notifyCleanerAssigned.ts" "lib/booking/ensureBookingLineItemsForEarnings.ts" "lib/payout/adminBookingAssignmentEarningsGate.ts" "lib/cleaner/applyPreviewEarningsToCleanerJobRows.ts" "lib/booking/adminEditBookingDetails.ts" "app/api/admin/bookings/[id]/reset-earnings/route.ts" --max-warnings 0
```

Note: `eslint` on `persistCleanerPayout.ts` still reports **existing** `react-hooks/rules-of-hooks` false positives for `useLegacyPayoutEngine()` naming; not introduced by this change.

## Behaviour changes (product)

- **Paid solo** bookings (per `bookingRequiresPersistedEarningsBeforeCleanerNotify`) now: **preflight** earnings + ensure line items **before** PATCH applies cleaner change; on post-assign persist failure (non-infra codes), **assignment is reverted** and response is **422** with `assignment_reverted: true`; **assigned notifications are skipped** if basis is still missing.
- **`persistCleanerPayoutIfUnset`** always tries to **ensure line items** for solo jobs before computing/persisting.
- Cleaner jobs wire includes **`earnings_basis_pending: true`** when amounts are still unknown (clients should show “Earnings pending”, not R0).

## Completion guard

**Unchanged by design**: `runCleanerBookingLifecycleAction` still requires `hasPersistedDisplayEarningsBasis` after `persistCleanerPayoutIfUnset`; null earnings are not treated as acceptable.
