# 19 — Final Gate Decision (amended)

## Decision

# NO-GO (default) with scoped CONDITIONAL PASS exception

Amended 2026-07-20 after sponsor review of BILL-INV-002: an unresolved **Critical** payment-amount integrity defect cannot receive blanket CONDITIONAL PASS without a formally approved exception.

## Operating gate

| Scope | Gate |
|-------|------|
| Payment links / Paystack sessions whose invoice **balance changed after initialization** | **NO-GO** — do not treat as safe for customer payment |
| Payment links whose Paystack amount has been **freshly verified** against current `balance_cents` (balance-bound `_b{cents}` ref + matching checkout) | **CONDITIONAL PASS** — allowed under Phase A controls |
| Automated reminders, overdue marking, drift repair, accounting-sync | **Not cleared** — continue manual monitoring until proven |

## Why

- Critical finding **BILL-INV-002-C01** (stale Paystack amount vs ledger balance) is a financial integrity defect.
- Collection may continue only where amount freshness is enforced.
- Phase A implementation on branch `fix/bill-inv-002-phase-a-payment-amount-integrity` encodes the exception path in software (quarantine + stale-link refresh + branded URLs).

## Scores (unchanged from audit baseline until Phase A ships to staging/prod)

| Dimension | Score |
|-----------|------:|
| Overall billing & invoice integrity | 62 |
| Payment-link reliability | 58 |
| Financial reconciliation | 52 |
| Security | 76 |
| Operational readiness | 48 |

## Finding counts (unchanged)

Critical 1 · High 6 · Medium 9 · Low 6 · Info 5

## Phase A authorization (binding)

Approved for **implementation and staging preparation only**:

- Amount-integrity enforcement, stale-link prevention, branded-link controls, settlement quarantine, tests
- Dedicated branch + draft PR
- Paystack **test mode** only
- **No** production migration, backfill, deployment, live charge, refund, customer communication, or production-data change

Excluded from Phase A (separate approval later): nine-invoice ledger backfill, accounting cron activation, production release.

## Next

See `20-implementation-approval-package.md` and Phase A staging-ready evidence on the PR.
