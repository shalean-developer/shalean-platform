# 16 — Remediation Options

## C01 / H06 — Amount integrity

| Option | Pros | Cons |
|--------|------|------|
| A. Reject apply if charge ≠ balance | Strong correctness | Needs customer retry / new session |
| B. Auto re-init on landing if stale | Better UX | Must detect staleness (store expected cents on link) |
| C. Clear link on any total change | Prevents most stale CTAs | Doesn't revoke already-open Paystack pages |
| **Recommended** | A + B + C | Combined |

## H01 — Ledger completeness

| Option | Pros | Cons |
|--------|------|------|
| A. Backfill from Paystack API | Restores history | One-off ops |
| B. Ledger inside `applyMonthlyInvoicePayment` | Single writer | Larger transactional scope |
| C. Explicit manual ledger on mark-paid | Distinguishes EFT | Schema/channel clarity |
| **Recommended** | A + B + C | |

## H02 — Multi-charge refund

| Option | Pros | Cons |
|--------|------|------|
| A. Refund all dedup rows | Correct | Complexity |
| B. Hard-block refund if count>1 | Safe stopgap | Ops manual in Paystack |
| **Recommended** | B then A | |

## H03 — Branded URLs

Replace copy/card href with `trustMonthlyInvoicePayPageUrl` only.

## H04 / H05 — Cron / accounting

| Option | Pros | Cons |
|--------|------|------|
| A. Fix invoke path + prove cron_runs | Restores design | Debug time |
| B. Also schedule critical jobs on Vercel | Redundancy | Hobby limits |
| C. Add accounting-sync to pg_cron | Unblocks queue | Must verify secret/URL |
| **Recommended** | A + C; B optional | |

## UX Mediums

Implement Export or hide button; raise list caps or server-side aggregates; fix `/office` links; quarantine zero-sent invoices.
