# 08 — Ledger and Settlement Audit

## Ledger model

`payment_transactions`: entity_type ∈ `{booking, monthly_invoice, sales_document}`; unique `(gateway, gateway_reference)`.

Monthly Paystack success should call `recordPaystackMonthlyInvoicePayment` from webhook/verify.

## Production ledger gaps (verified)

| Probe | Value |
|------:|------|
| Paid monthly invoices | 42 |
| `payment_transactions` monthly rows | 33 |
| Paid without ledger | **9** |
| Of those with paystack_reference | **7** |
| Of those without paystack_reference | **2** |
| Charge dedup rows | 4 |

**H01:** Gateway cash ledger is incomplete relative to paid invoice status.

Manual mark-paid (`markMonthlyInvoicePaidManual`) does **not** write `payment_transactions` — expected for offline cash, but then those rows should be distinguishable (today: missing ledger ≈ ambiguous).

## Settlement

| Probe | Value |
|------:|------|
| Paid invoice + child `pending_monthly` | 0 |
| Eligible payout without full settlement | 0 |

Child settlement allocates from booking line amounts via `allocateMonthlyChildPaymentCents`, not pro-rata of charge — fine when invoice total tracks lines; adjustments need care (**L02**).

## Dedup / atomicity

- Dedup insert before invoice update; compensating delete on invoice update failure.
- After `paid`, child failure leaves invoice paid; `already_paid` path retries children (**M11**).
- Not a single DB transaction (documented Phase 10C).

## Refunds / reversals

`refundMonthlyInvoicePayment`:

- Only status `paid`
- Loads **first** dedup charge only (**H02**)
- Reverses child bookings toward `pending_monthly`
- Does not destroy historical cash intent if ledger row exists; multi-charge incomplete

## Manual vs gateway

| Path | Ledger | Distinguishable? |
|------|--------|------------------|
| Paystack webhook/verify | Yes (when path runs) | gateway=paystack |
| Admin mark-paid | No | Event `admin_mark_paid` only |
| Promo/credit cover | Separate booking helpers | N/A monthly |

## Recommendation

Backfill missing monthly ledger rows where Paystack charges exist; write explicit `payment_channel=manual_eft` (or similar) on mark-paid; enforce ledger write inside apply or fail closed.
