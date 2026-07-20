# 17 — Recommended Implementation Plan

## Phase A — Financial and payment safety (P0)

1. Amount match / quarantine in `applyMonthlyInvoicePayment` (C01)
2. Null `payment_link` on adjustment / total change (H06)
3. Landing: if stored session amount ≠ balance, re-initialize (C01)
4. Stopgap: block monthly refund when dedup count > 1 (H02)
5. Tests for A1–A4

**Effort:** 3–5 eng-days · **Deps:** staging Paystack test keys · **Owner:** Payments

## Phase B — Link lifecycle and recovery (P0/P1)

1. Admin copy + InvoiceCard → branded URL only (H03)
2. Resend always validates/refreshes intent when balance drifted
3. Success page distinguishes partial vs full (M09)
4. Optional: avoid `sent` until email attempted success or explicit “link ready” substate (M08)

**Effort:** 2–3 eng-days · **Owner:** Web + Payments

## Phase C — Ledger and Zoho reconciliation (P1)

1. Schedule `accounting-sync` pg_cron; drain pending (H04)
2. Backfill missing monthly `payment_transactions` (H01)
3. Manual mark-paid writes explicit manual ledger row (H01)
4. Repair Zoho missing ids (M06) via office sync + scripts
5. Fix reminder/overdue/drift invocation; prove `cron_runs` (H05)

**Effort:** 4–6 eng-days · **Deps:** ops access to pg_cron logs · **Owner:** Platform + Finance

## Phase D — UX, observability, ops (P2)

1. Export implement or remove (M01)
2. Server-side KPI counts (M02/M03)
3. Fix legacy admin links (M04)
4. Cron-health expand (M16)
5. Rate limit monthly pay re-init (M14)
6. Mask refs in logs (L06)
7. Expand test matrix (doc 14)

**Effort:** 3–4 eng-days · **Owner:** Web + Platform

## Total estimated effort

**12–18 eng-days** plus 2–3 days staging verification and controlled production rollout.

## Dependencies

- Staging Paystack test mode authorization for payment tests
- Production read access for backfill (already available to ops)
- Explicit approval before any production code/data change (see approval package)
