# dispatch-timeouts

**Phase:** 1 — Priority 2  
**Schedule:** `* * * * *` (every minute)  
**Replaces:** `apps/web/app/api/cron/dispatch-timeouts/route.ts`

## Responsibility

Expire stale `dispatch_offers`, cap offers per booking, enqueue reassignment via `dispatch_retry_queue`.

## Hybrid: PostgreSQL + Edge

| Step | Runtime | Source |
|------|---------|--------|
| Expire pending offers | **PostgreSQL** | `expire_pending_dispatch_offers()` (migration `20260489`) |
| Enqueue stranded bookings | **PostgreSQL** (add if missing) | `enqueueStrandedBookings` parity |
| Deferred offer notifications | **Edge** | `processDeferredDispatchOfferNotifications` |
| Offer cap / escalation | **Edge** | `runDispatchTimeouts` remainder |

## Source files to port

| File | Function |
|------|----------|
| `lib/dispatch/runDispatchTimeouts.ts` | Main orchestrator |
| `lib/dispatch/dispatchOffers.ts` | `processDeferredDispatchOfferNotifications` |
| `lib/dispatch/dispatchRetryQueue.ts` | `enqueueStrandedBookings` |
| `lib/dispatch/dispatchEscalation.ts` | Admin alerts |

## Est. CPU savings

~2.0–2.5 h/month

## Not implemented yet

Awaiting architecture approval.
