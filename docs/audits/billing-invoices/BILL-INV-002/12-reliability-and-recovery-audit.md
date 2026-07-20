# 12 — Reliability and Recovery Audit

| Failure scenario | Detection | Recovery | Residual risk |
|------------------|-----------|----------|---------------|
| Paystack init OK, DB update fails | Init error / missing link | Retry init; draft reuse logic | Medium |
| DB ref stored, Paystack init fails | Error return; ref may remain | Conflict guards; reopen helpers | Medium |
| Email OK, event append fails | Logs | Resend / timeline gaps | Low |
| Zoho fail, Paystack OK | Operational issue log | Office sync | Accounting lag |
| Webhook before callback | Dedup | Harmless | OK |
| Callback without webhook | Verify records ledger | OK if verify succeeds | OK |
| Repeated webhook | Dedup + ledger unique | Harmless | OK |
| Older link paid | Apply accepts amount | **No quarantine** | **C01** |
| Balance changes after link | Stale session | Late fee clears link; adjustments don't | **C01/H06** |
| Reopen after bad send | `reopenMonthlyInvoiceToDraft` | Manual | OK |
| Pay during adjustment | Race on totals | Cap at total; possible partial surprise | High |
| Manual mark-paid vs webhook | Status guards | Dedup / already_paid | Medium |
| Refund after payout eligible | Reverses children; counts eligible | Ops must stop payout | **H02/M15** |
| Provider timeout | Retries / cron | Finalize cron daily | OK for finalize |
| Reminder cron silent | **No cron_runs** | Manual resend only | **H05** |
| Accounting worker missing | Pending queue grows | Manual / missing cron | **H04** |

## Operator instructions (current)

1. Prefer branded pay URL; regenerate link after amount changes.
2. Use Sync payment / repair child settlement when paid but bookings wrong (probes currently clean).
3. Use `/office/billing` for Zoho gaps.
4. Do not assume reminders fire.
5. For refunds with multiple charges, reconcile in Paystack dashboard manually.
