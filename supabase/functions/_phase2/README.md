# Phase 2 — Scheduled jobs

**Status:** Not started. Migrate after Phase 1 is stable (1 week monitoring).

| Function | Replaces | Schedule | CPU risk |
|----------|----------|----------|----------|
| `booking-lifecycle/` | `/api/cron/booking-lifecycle` | `*/15 * * * *` | High |
| `generate-recurring-bookings/` | `/api/cron/generate-recurring-bookings` | `*/10 * * * *` | High |
| `charge-recurring-bookings/` | `/api/cron/charge-recurring-bookings` | `*/10 * * * *` | High |
| `payment-link-reminders/` | `/api/cron/payment-link-reminders` | `*/15 * * * *` | High |
| `booking-reminders/` | `/api/cron/booking-reminders` | `*/15 * * * *` | Medium |
| `deferred-payment-link-emails/` | `/api/cron/deferred-payment-link-emails` | `*/5 * * * *` | Medium |
| `assignment-ack-timeout/` | `/api/cron/assignment-ack-timeout` | `*/5 * * * *` | Medium — **PostgreSQL candidate** |
| `notification-health/` | `/api/cron/notification-health` | `*/10 * * * *` | Low — **PostgreSQL candidate** |
| `ops-health/` | `/api/cron/ops-health` | `*/15 * * * *` | Medium — absorbs alerts from retry split |

See [docs/backend-migration-architecture.md](../../docs/backend-migration-architecture.md) §7.
