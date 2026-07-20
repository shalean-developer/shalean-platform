# 01 — Executive Summary

## Verdict

**NO-GO** for payment links whose invoice balance changed after Paystack initialization.

**CONDITIONAL PASS** only for links whose Paystack amount is freshly verified against current `balance_cents` (Phase A exception path).

Automated reminders, overdue marking, drift repair, and accounting-sync remain under **manual monitoring** until proven.

## Scores (0–100)

| Dimension | Score | Rationale |
|-----------|------:|-----------|
| Overall billing & invoice integrity | **62** | Totals/balances match in DB; child settlement clean; material link/ledger/ops gaps |
| Payment-link reliability | **58** | Branded email URLs exist; landing can show current balance while opening stale Paystack session |
| Financial reconciliation | **52** | 9/42 paid invoices lack `payment_transactions`; accounting queue all `pending` |
| Security | **76** | Webhook HMAC + pay `?ref=` gate strong; public init rate-limit gap; raw Paystack copy surfaces |
| Operational readiness | **48** | Finalize cron works; reminders/overdue/drift have **zero** `cron_runs`; `accounting-sync` not scheduled |

## Finding counts

| Severity | Count |
|----------|------:|
| Critical | 1 |
| High | 6 |
| Medium | 9 |
| Low | 6 |
| Informational | 5 |

## Production identity (verified)

| Item | Value |
|------|-------|
| Git SHA | `c2c04d42acff0e60e7b09cc604a7d042b56a2b10` |
| Deployment | `production` / `main` |
| Supabase | `tchayecuvzssixyxlvfu` (matches expected) |
| Paystack | live secret + live public |
| Messaging outbound | enabled (`outboundDisabled: false`) |

## Production risk statement

Customers can pay monthly invoices today when checkout amount matches the current balance. Child-booking settlement probes show **zero** paid-invoice / pending-monthly drift and **zero** payout-eligible-without-full-settlement. Critical residual risk: completing an older Paystack checkout after the invoice balance changed (**C01**). Additional risks: incomplete cash ledger, non-firing reminder/overdue crons, stuck Zoho accounting queue.

## Immediate containment

1. Treat unpaid links as **NO-GO** after any balance change until regenerated / balance-bound.
2. Prefer branded `/pay/invoice/{id}?ref=…` only (Phase A also changes copy/card controls in code).
3. Do not rely on automated invoice reminders until `send-invoice-reminders` produces `cron_runs`.
4. Avoid multi-partial refunds until multi-charge refund is implemented (Phase A blocks).
5. Manually monitor Zoho sync inbox (`/office/billing`).

## Remediation phases

| Phase | Focus | Status |
|-------|--------|--------|
| A | Amount match, quarantine, stale-link prevention, branded links, tests | **In progress (this branch)** |
| B | Remaining link lifecycle polish | Pending |
| C | Accounting-sync cron; ledger backfill | Separate approval |
| D | UX / observability | Pending |

## Gate

See `19-final-gate-decision.md` (amended NO-GO / scoped CONDITIONAL PASS).
