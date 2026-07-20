# 19 — Final Gate Decision (amended)

## Decision

# Phase A **shipped to production** with accepted staging-matrix exception

Amended 2026-07-20 after sponsor review of BILL-INV-002 Critical amount integrity.

Further amended after Phase A staging window (live Paystack matrix incomplete).

**Production authorization (2026-07-20):** merge PR #74 to `main` / production deploy for Phase A only. Sponsor accepted that the full staging Paystack matrix was not closed. No ledger backfill, accounting-sync activation, or customer communication.

## Operating gate

| Scope | Gate |
|-------|------|
| Payment links / Paystack sessions whose invoice **balance changed after initialization** | **NO-GO** — Phase A software must quarantine / force fresh balance-bound checkout |
| Payment links whose Paystack amount is **freshly verified** against current `balance_cents` | **CONDITIONAL PASS** — Phase A controls live on production (`f5319b77`) |
| Automated reminders, overdue marking, drift repair, accounting-sync | **Not cleared** — continue manual monitoring |
| Local Phase A implementation | **PASS** |
| PR #74 technical review + CI | **PASS** |
| Staging merge + deploy | **PASS** |
| Staging live Paystack test matrix | **Accepted incomplete** (sponsor override for prod ship) |
| Production Phase A app deploy | **PASS** — merge `f5319b77`, deploy `dpl_BqkjvGuPck86FvxCLBWFEbWwvi9q` READY; health SHA match |
| Ledger backfill / accounting-sync activation | **Not authorized** |

## Why

- Critical finding **BILL-INV-002-C01** required amount-integrity enforcement before treating stale sessions as safe.
- Phase A encodes quarantine, stale-link refresh, branded URLs, and multi-charge refund stopgap.
- Production now runs those controls; remaining High items (ledger gaps, cron/accounting) need separate approval.

## Scores (baseline until post-prod monitoring)

| Dimension | Score |
|-----------|------:|
| Overall billing & invoice integrity | 62 |
| Payment-link reliability | 58 |
| Financial reconciliation | 52 |
| Security | 76 |
| Operational readiness | 48 |

## Finding counts (unchanged)

Critical 1 · High 6 · Medium 9 · Low 6 · Info 5

## Evidence

- Staging verification: `evidence/phase-a-staging-verification-2026-07-20.md`
- Production release: `evidence/phase-a-production-release-2026-07-20.md`
- PR: https://github.com/shalean-developer/shalean-platform/pull/74 (MERGED)

## Next (separate authorization)

- Optional: close remaining staging Paystack cases for evidence completeness
- Ledger backfill for paid-without-ledger
- Accounting-sync / reminder cron activation
- Codex P2 follow-ups (quarantine verify alias UX; resend enablement after link clear)
