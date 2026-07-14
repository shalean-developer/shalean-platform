# Phase A staging verification matrix — BK-001 / BK-002 / BK-003

| Field | Value |
|-------|-------|
| **Branch** | `fix/bk-001-confirm-cash-columns-before-payment` |
| **Date** | 2026-07-13 |
| **Environment** | Staging only (not production) |
| **Related** | [`phase-a-bk001-bk003-remediation-2026-07-13.md`](./phase-a-bk001-bk003-remediation-2026-07-13.md), ADR `docs/adr/2026-07-13-booking-payment-settlement-cash-columns.md` |

## Preconditions

1. Deploy app branch to staging.
2. Apply forward migration `20260714140000_bookings_r0_paid_amount_constraint.sql` to **staging** DB only.
3. Confirm Paystack **test** keys and webhook URL point at staging.
4. Do not enable real customer notifications for validation accounts.
5. Use synthetic customers / emails only.

## Standard payment

| Step | Action | Expected |
|------|--------|----------|
| 1 | Confirm Booking V2 with payable > 0 | HTTP 200; `requiresPayment=true`; `payAmountZar` matches server total |
| 2 | Inspect DB row | `status=pending_payment`; `payment_status=pending`; `amount_paid_cents=0`; `total_paid_*=0`; `total_price` / snapshot payable correct |
| 3 | Initialize Paystack (test) | Charge amount equals payable cents |
| 4 | Complete test payment; webhook | Finalize writes exact `amount_paid_cents`; `payment_status=success`; confirmation path works |
| 5 | Replay webhook | Idempotent finalize; no duplicate ledger; no duplicate notifications |

## Abandoned payment

| Step | Action | Expected |
|------|--------|----------|
| 1 | Confirm then abandon checkout | Row remains unpaid; cash stays 0 |
| 2 | Recovery eligibility | Eligible for payment recovery jobs/emails |
| 3 | Earnings / paid ops gates | Not enabled for unpaid pending |

## Duplicate verify / webhook

| Step | Action | Expected |
|------|--------|----------|
| 1 | Successful charge | Settled once |
| 2 | Duplicate webhook + verify | No second cash write; no duplicate state transition |

## R0 covered booking

| Step | Action | Expected |
|------|--------|----------|
| 1 | Confirm with full cover (promo/credit → payable 0) | `requiresPayment=false` only after successful settle |
| 2 | DB | `payment_status=success`; cash 0; `payment_completed_at` set; `payment_transaction_id` linked |
| 3 | Ledger | `payment_transactions` row `gateway=other`, `payment_channel=promo_credit_cover`, `gateway_reference=r0:{bookingId}`, `amount_cents=0` |
| 4 | Duplicate confirm | Idempotent; no duplicate ledger (unique gateway_reference) |

## R0 failure

| Step | Action | Expected |
|------|--------|----------|
| 1 | Simulate ledger/update failure (staging fault injection or bad state) | Controlled API error (not success) |
| 2 | Client | No false zero-payment success UX |
| 3 | Logs | `r0_settlement_failed` and/or `r0_ledger_booking_mismatch` |

## Equipment change

| Step | Action | Expected |
|------|--------|----------|
| 1 | Paid booking: change equipment fee | Cash columns unchanged; `total_price` / mismatch updated; audit `booking_changes` |
| 2 | Unpaid pending: change equipment fee | Cash remains 0; payable updates |
| 3 | Non-admin | Unauthorized |

## Compatibility

| Surface | Expected |
|---------|----------|
| Customer-mobile confirm | Same success payload shape (`bookingId`, `payAmountZar`, `requiresPayment`, …) |
| Customer account | Status reflects settlement, not pending cash anomaly |
| Finance / ops | Distinguish payable vs collected |
| Earnings gates | Require authoritative settlement |

## Anomaly repair (staging only)

```bash
cd apps/web
npx tsx --env-file=.env.local scripts/repairPendingCollectedCashAnomaly.ts --dry-run
# apply only after reviewing dry-run on staging:
npx tsx --env-file=.env.local scripts/repairPendingCollectedCashAnomaly.ts --apply --confirm-apply-to-database
```

Do **not** use `--i-understand-this-is-production` unless production apply is separately approved.

## Local pre-staging gates (2026-07-13)

| Gate | Command / note | Result |
|------|----------------|--------|
| Phase A vitest slice | Targeted settlement / confirm / equipment / repair / R0 tests | Pass |
| Critical tests | `npm run test:critical` (apps/web) | Pass (34 tests) |
| Typecheck | `npm run typecheck` | Pass |
| ESLint (changed files only) | eslint on Phase A source files | Pass |
| Default `npm run build` | Next 16 Turbopack default | **Fail — baseline:** cannot resolve `@shalean/*` outside `apps/web` turbopack root (not Phase A) |
| Production build (official webpack path) | `next build --webpack` after blog-route validate + typecheck | **Pass** (~195s) |
| Isolated DB migration apply | Requires local Supabase/Docker | **Skipped** — CLI/`docker` unavailable on this machine |
| Constraint SQL cases | Documented in `supabase/tests/bk002_r0_paid_amount_constraint_validation.sql` | Ready for staging/local DB run |
| Paystack E2E / live notifications | Out of scope for local prep | Not run |

## Sign-off checklist

- [ ] Standard payment
- [ ] Abandoned payment
- [ ] Duplicate webhook/verify
- [ ] R0 success
- [ ] R0 failure
- [ ] Equipment paid + unpaid
- [ ] Mobile/account/finance spot-check
- [ ] Migration applied on staging
- [ ] Dry-run anomaly script reviewed
- [ ] Re-run `bk002_r0_paid_amount_constraint_validation.sql` on staging after migration
