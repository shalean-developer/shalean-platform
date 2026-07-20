# 05 — Financial Integrity Audit

## Production aggregates (verified 2026-07-20)

| Metric | Value |
|--------|------:|
| Monthly invoices | 63 |
| draft / sent / paid | 19 / 2 / 42 |
| Sum total (ZAR, rounded) | 179 476 |
| Sum paid (ZAR) | 114 319 |
| Sum balance (ZAR) | 65 157 |
| Negative balances | **0** |
| Overpayments (`amount_paid > total`) | **0** |
| `balance ≠ max(0,total−paid)` | **0** |
| Closed with balance > 0 | **0** |
| Duplicate `paystack_reference` groups | **0** |
| Missing payment_link on open balance | **0** |
| Missing paystack_reference on sentish/paid | **2** |
| Missing zoho_invoice_id on sentish/paid | **3** |
| Zero-total non-draft | **3** (2 paid closed, 1 **sent**) |
| Paid without `payment_transactions` | **9** (7 with Paystack ref) |
| Charge dedup rows | 4 |
| Multi-charge invoices | 0 |
| Paid invoice + child still `pending_monthly` | **0** |
| Payout eligible without full settlement | **0** |

## Per-state expectations

| Field | Expected behaviour | Prod observation |
|-------|--------------------|------------------|
| `total_amount_cents` | Booking lines + adjustments | Trigger `recompute_monthly_invoice_totals` |
| `amount_paid_cents` | Accumulated charges / manual | No overpay rows |
| `balance_cents` | Generated / consistent | 0 mismatches |
| Currency | ZAR at Paystack init | Column `currency` absent on table; init hardcodes ZAR |
| Late fees | Adjustment + clear link | Code path exists |
| Refunds | Status `refunded` | Not counted in status distribution (0 refunded) |

## Detected issues

| Issue | Severity | Finding |
|-------|----------|---------|
| Apply accepts any verified Paystack amount (no balance match) | Critical | BILL-INV-002-C01 |
| Paid invoices missing gateway ledger | High | BILL-INV-002-H01 |
| Zero-value invoice in `sent` | Medium | BILL-INV-002-M05 |
| Missing Zoho ids on sentish/paid | Medium | BILL-INV-002-M06 |
| Missing paystack refs on sentish/paid | Medium | BILL-INV-002-M07 |

## Classification

- **Verified:** aggregate probes above; child settlement clean.
- **Inference:** most paid volume is healthy on booking settlement; ledger gap is cash-accounting incomplete rather than double payout (eligible probe = 0).
- **Hypothesis:** 7 paid+ref without ledger are historical pre-ledger or verify-only paths before `recordPaystackMonthlyInvoicePayment` wiring; 2 without ref are manual mark-paid.
- **Unknown:** exact event timeline per missing-ledger invoice (requires event forensics).
