# retry-dispatch

**Phase:** 1 — Priority 3b  
**Schedule:** `* * * * *`  
**Split from:** `apps/web/app/api/cron/retry-failed-jobs/route.ts`

## Responsibility

Dispatch subsystem retries and SLA monitoring only.

## Scope (ONLY)

- `processDispatchRetryQueue` — auto-assign backoff
- `runOfferExpiryMaintenance` — user-selected offer expiry redispatch
- `reportPendingBookingSlaBreaches` — SLA watchdog
- `emitSqlExpiredOfferTimeoutMetrics` — metric parity

## Source files to port

| File | Function |
|------|----------|
| `lib/dispatch/dispatchRetryQueue.ts` | `processDispatchRetryQueue` |
| `lib/dispatch/processUserSelectedOfferExpiryRedispatch.ts` | `runOfferExpiryMaintenance` |
| `lib/dispatch/dispatchSlaWatchdog.ts` | `reportPendingBookingSlaBreaches` |
| `lib/dispatch/offerTimeoutMetric.ts` | `emitSqlExpiredOfferTimeoutMetrics` |

## NOT in this function

- No `while` poll loops (`offerRace.ts` stays on Vercel for admin assign)
- No booking insert retries

## Not implemented yet

Awaiting architecture approval.
