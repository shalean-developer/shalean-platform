# BILL-INV-002 Phase A — Staging-ready evidence

| Field | Value |
|-------|-------|
| Branch | `fix/bill-inv-002-phase-a-payment-amount-integrity` |
| Authorization | Phase A implementation + staging prep only (2026-07-20) |
| Paystack | Test mode only for staging verification — no live charges |
| Production changes | None applied |

## Implemented controls

| Control | Finding | Status |
|---------|---------|--------|
| Apply quarantines charge ≠ remaining balance | C01 | Done |
| Quarantine short-circuits webhook/verify (no ledger, no booking fall-through) | C01 | Done |
| Paystack refs encode `_b{balance}` including drafts | C01/H06 | Done |
| Landing clears stale link and re-inits for current balance | C01 | Done |
| Init reuse only when ref matches current balance | C01 | Done |
| Adjustments clear `payment_link` | H06 | Done |
| Admin copy + customer Pay now use branded `/pay/invoice` URL | H03 | Done |
| Multi-charge refund blocked (`multi_charge_refund_unsupported`) | H02 | Done |
| Success page: quarantine / partial messaging | M09-related | Done |

## Tests

- `lib/monthlyInvoice/__tests__/billInv002PhaseAAmountIntegrity.test.ts`
- Updated stable-ref + apply child-allocation quarantine case

## Explicitly not in this PR

- Ledger backfill for 9 paid invoices
- `accounting-sync` pg_cron activation
- Reminder/overdue cron invoke repair
- Production deploy / migration apply

## Staging verification checklist (operator)

1. Deploy this branch to **staging** with Paystack **test** keys
2. Create draft monthly invoice → finalize → confirm branded email/link host is staging app
3. Adjust open invoice → confirm `payment_link` null → open old branded URL → checkout amount equals new balance (fresh init)
4. Simulate mismatched verify amount in unit/staging harness → quarantine state, invoice not marked paid
5. Attempt refund with two dedup rows (fixture) → `multi_charge_refund_unsupported`
6. Copy payment link in office → clipboard host is app origin, not `checkout.paystack.com`

Local validation complete. Staging deploy + verification report: `phase-a-staging-verification-2026-07-20.md` (live Paystack matrix still operator-gated).
