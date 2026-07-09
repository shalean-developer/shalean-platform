# Supabase Edge Functions

> **Status:** Architecture scaffold only. No functions deployed. No production behaviour changes.

## Development (after approval)

```bash
# From repo root
supabase functions serve whatsapp-worker --env-file supabase/.env.local

# Deploy to staging
supabase functions deploy whatsapp-worker --project-ref <staging-ref>
```

## Conventions

1. **One responsibility per function** — max ~250 lines in `index.ts`
2. **Reuse `_shared/`** — never duplicate auth, logging, or Supabase client setup
3. **Queue pattern** — read batch → process → save → exit (no `while` poll loops)
4. **Auth** — `verifyCronSecret()` for pg_cron invocations; webhook HMAC for external callers
5. **Locking** — always use `cron_run_leases` via `_shared/cron.ts`
6. **Logging** — always call `logCronRun()` on completion

## Function inventory

| Function | Phase | Replaces |
|----------|-------|----------|
| `whatsapp-worker` | 1 | `/api/cron/whatsapp-worker` |
| `dispatch-timeouts` | 1 | `/api/cron/dispatch-timeouts` |
| `retry-booking-jobs` | 1 | Part of `/api/cron/retry-failed-jobs` |
| `retry-dispatch` | 1 | Part of `/api/cron/retry-failed-jobs` |
| `retry-notifications` | 1 | Part of `/api/cron/retry-failed-jobs` |
| `retry-payment-jobs` | 1 | Part of `/api/cron/retry-failed-jobs` |
| `booking-lifecycle` | 2 | `/api/cron/booking-lifecycle` |
| `generate-recurring-bookings` | 2 | `/api/cron/generate-recurring-bookings` |
| `charge-recurring-bookings` | 2 | `/api/cron/charge-recurring-bookings` |
| `payment-link-reminders` | 2 | `/api/cron/payment-link-reminders` |
| `booking-reminders` | 2 | `/api/cron/booking-reminders` |
| `deferred-payment-link-emails` | 2 | `/api/cron/deferred-payment-link-emails` |
| `assignment-ack-timeout` | 2 | `/api/cron/assignment-ack-timeout` |
| `notification-health` | 2 | `/api/cron/notification-health` |
| `ops-health` | 2 | `/api/cron/ops-health` |
| `paystack-checkout-webhook` | 3 | `/api/paystack/webhook` |
| `paystack-transfer-webhook` | 3 | `/api/webhooks/paystack` |
| `whatsapp-webhook` | 3 | `/api/webhooks/whatsapp` |

See [docs/backend-migration-architecture.md](../../docs/backend-migration-architecture.md) for full design.
