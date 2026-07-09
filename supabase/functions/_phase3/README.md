# Phase 3 — Webhooks

**Status:** Not started. Migrate only after Phase 1 + Phase 2 crons are stable.

| Function | Replaces | Provider |
|----------|----------|----------|
| `paystack-checkout-webhook/` | `/api/paystack/webhook` | Paystack charge events |
| `paystack-transfer-webhook/` | `/api/webhooks/paystack` | Paystack transfer events |
| `whatsapp-webhook/` | `/api/webhooks/whatsapp` | Meta WhatsApp |

## Cutover procedure

1. Deploy Edge functions to staging
2. Register staging URLs in Paystack/Meta sandbox
3. Run dual-write (Vercel + Edge) for 7 days in production
4. Compare `system_logs` for parity
5. Update Paystack/Meta production webhook URLs
6. Vercel routes → `410` after 7 days stable

## Risk

**High** — `paystack-checkout-webhook` uses `finalizePaidBooking` (same complexity as `retry-booking-jobs`).

See [docs/backend-migration-architecture.md](../../docs/backend-migration-architecture.md) §8.
