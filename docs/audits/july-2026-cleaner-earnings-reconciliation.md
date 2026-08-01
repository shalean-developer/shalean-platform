# July 2026 cleaner-earnings reconciliation — engineering report

**Status:** application safeguards ready; production records verified reconciled on 2026-08-02
**Branch:** `cursor/july-cleaner-earnings-reconcile-e29f`
**Production project:** `tchayecuvzssixyxlvfu`
**Staging project:** `gbgnemlpyykyhpqqbgru`

The production verification was performed read-only. The proposed historical data migration was removed because the target records are already reconciled and the migration had never been applied. Deploying stale UPDATE/DELETE statements would create unnecessary risk.

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
| Tests + `scripts/julyEarningsReconciliationPrecheck.ts` | Regression + read-only precheck |

---

## 3. Production verification (2026-08-02)

| Booking | Cleaner | Verified production state |
|---------|---------|--------|-------|
| SHL-BK-000412/413/414 | Nyasha (lead) + Ethel (roster) | `status=completed`; `payment_status=pending_monthly` preserved |
| SHL-BK-000359 | Lucia | Snapshot, summary, payout owner, and pending earnings attributed to Lucia |
| SHL-BK-000360 | Lucia | Completed with Lucia snapshot and pending earnings; no Magaret ownership remains |
| SHL-BK-000540 | Lorraine | No automated mutation performed |

---

## 4–7. Verification checklist

The included precheck remains read-only and can be rerun for regression evidence:

```bash
cd apps/web
npx tsx --env-file=.env.local scripts/julyEarningsReconciliationPrecheck.ts
ALLOW_PROD_PRECHECK=1 npx tsx --env-file=.env.local scripts/julyEarningsReconciliationPrecheck.ts  # read-only only
```

Verify after application deployment:

1. Lynne trio: `status=completed`, same `completed_at`, `payment_status=pending_monthly`.
2. Magaret snapshot count on 359/360 = 0.
3. Payment/invoice fields remain unchanged.
4. No new `cleaner_payouts`, transfers, or `paid` mutations are caused by these application safeguards.
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
| Historical data migration | **REMOVED** — production is already reconciled |
| Read-only production state verification | **GO** |
| Application deployment | **GO after CI and Preview verification** |

### Rollback / forward-repair

- **Rollback:** revert the application commit; no database rollback is required because this PR no longer ships a data migration.
- **Forward:** use the canonical booking completion and payout persistence paths. Do not manually edit earnings to hide ownership drift.

**Recommendation:** pass focused tests and Preview verification, then merge the application safeguards to `main`.
