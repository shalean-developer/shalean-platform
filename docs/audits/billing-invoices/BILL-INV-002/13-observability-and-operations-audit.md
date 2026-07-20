# 13 — Observability and Operations Audit

## Logging

- `logSystemEvent` / `reportOperationalIssue` on finalize, payment, Zoho, reminders, drift.
- Webhook logs include unmasked reference on some monthly success paths (**L06**).

## Metrics / alerts

- Cron health admin route includes `charge-monthly-invoices` critical set — **not** reminders / accounting-sync / drift (**M16**).
- No dedicated payment amount-mismatch metric.

## Cron scheduling

| Mechanism | Billing coverage |
|-----------|------------------|
| `apps/web/vercel.json` | **No** billing crons (Hobby-compatible subset only) |
| Supabase `cron.job` | charge, reminders, overdue, repair, generate-recurring — **active** |
| `accounting-sync` | **Not** in `cron.job` |
| `cron_http_targets` | `app_host=shalean.co.za` |

## Execution evidence

| Job | cron_runs |
|-----|-----------|
| charge-monthly-invoices | 66 (last success 2026-07-19) |
| send-invoice-reminders | **0** |
| mark-monthly-invoices-overdue | **0** |
| repair-monthly-payment-state-drift | **0** |
| accounting-sync | **0** / not scheduled |

**Inference:** pg_cron rows exist but HTTP invocation for several jobs is failing before `logCronRun`, or jobs are no-op without logging — requires ops debug of `invoke_nextjs_cron` responses for those paths (**H05**).

## Drift repair

Bounded scan/repair with lock — safe if it runs; currently no run evidence.

## Runbooks

Settlement invariant SQL exists: `supabase/queries/audit_monthly_invoice_settlement_invariants.sql`. No single billing runbook tying reminder outage + ledger backfill in-repo for this audit package (remediation plan adds one).
