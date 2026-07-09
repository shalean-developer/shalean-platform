# retry-payment-jobs

**Phase:** 1 — Priority 3d  
**Schedule:** `*/5 * * * *`  
**Split from:** `apps/web/app/api/cron/retry-failed-jobs/route.ts`

## Responsibility

Payment reconciliation and settlement repair only.

## Scope (ONLY)

- Drain terminal `payment_mismatch` failed_jobs (log + delete)
- Drain terminal `booking_finalize` amount_mismatch rows
- `repairPaidMonthlyInvoiceChildSettlementDrift` (batch 300)
- Optional: `failed_jobs` terminal cleanup (7-day retention)

## Source files to port

| File | Function |
|------|----------|
| `lib/monthlyInvoice/repairPaidMonthlyInvoiceChildSettlementDrift.ts` | Child settlement repair |
| `lib/booking/failedJobPayloadPreview.ts` | Payload logging |

## Moves to ops-health (Phase 2)

- `failed_jobs` backlog alerts
- Unassignable bookings threshold alerts
- `maybeRollupYesterdayLifecycleMetrics`
- `syncCleanerQualityFlags`
- `logDailyOpsSummaryIfNeeded`

## Not implemented yet

Awaiting architecture approval.
