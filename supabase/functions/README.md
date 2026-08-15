# Supabase Edge Functions

> **Status:** Architecture scaffold only. No production cron currently uses a Supabase Edge Function worker.

## Development

Only functions that still have an executable entrypoint under `supabase/functions/<name>/index.ts` may be served or deployed.

`whatsapp-worker` is **retired** under CR-07A and must not be served or deployed from `supabase/functions`. The canonical production worker is:

- `apps/web/app/api/cron/whatsapp-worker/route.ts`
- `apps/web/lib/whatsapp/providerQueue.ts`

## Conventions

1. **One responsibility per function** — max ~250 lines in `index.ts`
2. **Reuse `_shared/`** — never duplicate auth, logging, or Supabase client setup
3. **Queue pattern** — read batch → process → save → exit (no `while` poll loops)
4. **Auth** — `verifyCronSecret()` for pg_cron invocations; webhook HMAC for external callers
5. **Locking** — always use `cron_run_leases` via `_shared/cron.ts`
6. **Logging** — always call `logCronRun()` on completion

## Function inventory

| Function | Phase | Status / Replaces |
|----------|-------|-------------------|
| `whatsapp-worker` | 1 | **Retired by CR-07A** — canonical runtime remains `/api/cron/whatsapp-worker` |
| `dispatch-timeouts` | 1 | Candidate replacement for `/api/cron/dispatch-timeouts` |
| `retry-booking-jobs` | 1 | Candidate replacement for part of `/api/cron/retry-failed-jobs` |
| `retry-dispatch` | 1 | Candidate replacement for part of `/api/cron/retry-failed-jobs` |
| `retry-notifications` | 1 | Candidate replacement for part of `/api/cron/retry-failed-jobs` |
| `retry-payment-jobs` | 1 | Candidate replacement for part of `/api/cron/retry-failed-jobs` |
| `booking-lifecycle` | 2 | Candidate replacement for `/api/cron/booking-lifecycle` |
| `generate-recurring-bookings` | 2 | Candidate replacement for `/api/cron/generate-recurring-bookings` |
| `charge-recurring-bookings` | 2 | Candidate replacement for `/api/cron/charge-recurring-bookings` |
| `payment-link-reminders` | 2 | Candidate replacement for `/api/cron/payment-link-reminders` |
| `booking-reminders` | 2 | Candidate replacement for `/api/cron/booking-reminders` |
| `deferred-payment-link-emails` | 2 | Candidate replacement for `/api/cron/deferred-payment-link-emails` |
| `assignment-ack-timeout` | 2 | Candidate replacement for `/api/cron/assignment-ack-timeout` |
| `notification-health` | 2 | Candidate replacement for `/api/cron/notification-health` |
| `ops-health` | 2 | Candidate replacement for `/api/cron/ops-health` |
| `paystack-checkout-webhook` | 3 | Candidate replacement for `/api/paystack/webhook` |
| `paystack-transfer-webhook` | 3 | Candidate replacement for `/api/webhooks/paystack` |
| `whatsapp-webhook` | 3 | Candidate replacement for `/api/webhooks/whatsapp` |

See [docs/backend-migration-architecture.md](../../docs/backend-migration-architecture.md) for historical design context. Active production cron routing is documented in `docs/runbook-cron-secret-rotation.md`.
