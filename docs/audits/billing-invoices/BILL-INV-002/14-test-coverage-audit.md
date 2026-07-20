# 14 — Test Coverage Audit

## Existing coverage (examples)

- Monthly settlement / allocation / child booking tests under `lib/monthlyInvoice/__tests__/`
- Payment-state drift repair bounds
- Stable Paystack reference / reopen
- Late fee policy, Zoho line items, billing dates
- Webhook contract (`princessPrcWebhookContract`)
- Paystack initialize abuse limit (booking route)
- M-5 monthly routing convergence
- Cron lock overlap (H-15)
- E2E paystack webhook security / replay (booking-oriented)

## Critical gaps

| Gap | Severity |
|-----|----------|
| Apply amount must equal current balance / reject mismatch | High |
| Stale `payment_link` vs displayed balance | High |
| `/pay/invoice` IDOR / wrong-ref / missing-ref | High |
| Partial payment success UX not claiming full paid | Medium |
| Multi-charge refund walks all dedup rows | High |
| Callback/webhook race already covered lightly — keep | — |
| Wrong currency rejection on apply | Medium |
| Manual mark-paid creates distinguishable ledger row | Medium |
| Reminder eligibility includes/excludes `overdue` explicitly | Medium |
| Zoho create race / duplicate | Medium |
| Office Export handler | Low |
| Accounting-sync cron presence test / health | Medium |

## Recommendation

Add a focused `bill-inv-002` vitest suite before Phase A merge: amount quarantine, link invalidation on adjustment, refund multi-charge, pay landing authz matrix.
