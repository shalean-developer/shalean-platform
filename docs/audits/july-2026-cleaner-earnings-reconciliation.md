# July 2026 cleaner-earnings reconciliation — engineering report

**Status:** code + idempotent migration ready · **staging apply / prod GO pending**  
**Branch:** `cursor/july-cleaner-earnings-reconcile-e29f`  
**Production project:** `tchayecuvzssixyxlvfu`  
**Staging project:** `gbgnemlpyykyhpqqbgru`

This agent environment has **no Supabase service-role credentials**. Live before/after matrices and `/office/payouts` screenshots require staging secrets + apply. Precheck script is included.

---

## 1. Root causes

### Defect 1 — Lynne recurring (412/413/414) `completed_at` + `status='assigned'`

1. Canonical writers set `status='completed'` and `completed_at` together (cleaner complete, cron, admin).
2. `propagateRecurringPlanToGeneratedBookings` mapped every non-`pending_payment` status through `recurringPropagateCleanerOperationalStatus` → `"pending"`, then `recurringOccurrenceCleanerPatch` forced **`status='assigned'`** without clearing `completed_at`.
3. `repairBookingCompletionCoherenceIfNeeded` early-returned on `isAuthoritativeBookingCompleted` (true when only `completed_at` is set), so the status heal never ran.
4. Office earnings load uses `.eq("status","completed")` → Ethel/Nyasha visits missing.

### Defect 2 — Magaret owns Lucia’s snapshot (359) / premature (360)

1. Pre-completion persist writes `booking_cleaner_earnings_snapshot` + `earnings_summary` for the then-assigned cleaner.
2. Later reassignment to Lucia often leaves `display_earnings_cents` set → `persistCleanerPayoutIfUnset` early-skips without rewriting snapshot/`earnings_summary` ownership.
3. Office allocations read `earnings_summary.per_cleaner_earnings`, so Magaret still received the visit.

### Defect 3 — Lorraine SHL-BK-000540 `in_progress`

No automatic repair. Completion requires lifecycle evidence (`bookings.completed_at` / `cleaner_response_status=completed`, roster `booking_cleaners.completed_at`, lifecycle logs). Assignment alone is insufficient.

**Ops action:** Confirm visit with customer/Lorraine; if done, admin PATCH `status=completed` (canonical path). If not done, leave `in_progress` or reset via official transition.

---

## 2. Files changed

| Path | Change |
|------|--------|
| `apps/web/lib/booking/repairBookingCompletionCoherenceIfNeeded.ts` | Heal when status ≠ completed even if `completed_at` set |
| `apps/web/lib/recurring/resolveRecurringPreferredCleanerId.ts` | `preserve_lifecycle` + identity-only patch |
| `apps/web/lib/recurring/propagateRecurringPlanToGeneratedBookings.ts` | Skip status rewrite for completed/`completed_at` rows |
| `apps/web/lib/booking/adminEditBookingDetails.ts` | Do not force `assigned` on terminal/completed_at rows |
| `apps/web/lib/payout/healBookingCleanerEarningsSnapshotOwnership.ts` | New — heal snapshot + summary owner drift |
| `apps/web/lib/payout/persistCleanerPayout.ts` | Call ownership heal on early-skip |
| `apps/web/lib/payout/bookingEarningsSummary.ts` | `remapEarningsSummaryCleanerId` |
| `supabase/migrations/20260724150000_july_cleaner_earnings_reconciliation_repair.sql` | Narrow idempotent data repair + audit table |
| Tests + `scripts/julyEarningsReconciliationPrecheck.ts` | Regression + read-only precheck |

---

## 3. Before/after matrix (expected after staging apply)

| Booking | Cleaner | Before | After |
|---------|---------|--------|-------|
| SHL-BK-000412/413/414 | Nyasha (lead) + Ethel (roster) | `assigned` + `completed_at` set → excluded | `status=completed`, `payment_status=pending_monthly` preserved → included in July earnings |
| SHL-BK-000359 | Lucia | Snapshot/summary Magaret | Snapshot/summary Lucia; ~R271.20 |
| SHL-BK-000360 | Lucia (future) | Premature Magaret snapshot | Magaret snapshot removed; finalize only after completion |
| SHL-BK-000540 | Lorraine | `in_progress` | **Unchanged** |

---

## 4–7. Staging/prod verification checklist

Run with service role (staging first):

```bash
cd apps/web
npx tsx --env-file=.env.local scripts/julyEarningsReconciliationPrecheck.ts
# staging migrate, then re-run precheck
ALLOW_PROD_PRECHECK=1 npx tsx --env-file=.env.local scripts/julyEarningsReconciliationPrecheck.ts  # read-only only
```

Prove after apply:

1. Lynne trio: `status=completed`, same `completed_at`, `payment_status=pending_monthly`.
2. Magaret snapshot count on 359/360 = 0.
3. Payment/invoice fields unchanged (`july_2026_cleaner_earnings_repair_audit` payment_drift=0).
4. No new `cleaner_payouts` / transfers / `paid` mutations from this migration.
5. Office `/office/payouts` July totals for Ethel, Nyasha, Lucia, Magaret, Lorraine.
6. `/office/payouts/approvals` unchanged (no batch generation).

---

## 8. Unit tests

```text
vitest: 30 passed (repair coherence, recurring preserve, snapshot ownership heal, completion integrity)
db:migrations:validate PASS
```

---

## 9–10. GO / NO-GO

| Gate | Result |
|------|--------|
| Code root-cause fixes + regression tests | **GO** |
| Idempotent migration (narrow IDs/refs) | **GO for staging apply** |
| Staging live verify + office UI | **BLOCKED** — no service-role in this agent |
| Production apply | **NO-GO** until explicit production GO after staging proof |

### Rollback / forward-repair

- **Rollback:** restore `status`/`snapshot`/`earnings_summary`/`cleaner_earnings.cleaner_id` from `july_2026_cleaner_earnings_repair_audit` phase=`before` (do not delete audit rows).
- **Forward:** re-run migration (idempotent); for earnings amount refresh use `persistCleanerPayoutIfUnset({ forceDisplayRecompute: true })` per booking — never manual “Edit earnings” to hide root cause.

**Recommendation:** Merge to staging → apply migration on `gbgnemlpyykyhpqqbgru` → run precheck + office UI → then issue production GO for `tchayecuvzssixyxlvfu`.
