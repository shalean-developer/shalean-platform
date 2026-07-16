# BEA-BILLING-001 — Recurring billing presentation remediation

| Field | Value |
|-------|-------|
| **Defect** | BEA-BILLING-001 |
| **Date (UTC)** | 2026-07-16 |
| **Environment** | Staging (UI code) |
| **Status** | Fixed |

---

## Root cause

Checkout showed “Price per visit” beside a crude “Estimated monthly spend” (`×4 / ×2 / ×1`) while Review used bare “Estimated total” and Payment used “Total to pay” with no visit/month context. Admin revenue used a different visits/month formula. Customers could not tell what Paystack charges **today** vs estimated monthly.

Canonical model (unchanged fee engine):

- Self-serve default: **per-visit** Paystack charge = this visit total
- Admin monthly profiles: month-end invoice (unchanged)

---

## Before / after

| Surface | Before | After |
|---------|--------|-------|
| Summary panel | Price/visit + crude monthly estimate; “future visits charged at same price” | Price/visit · ~N visits/month · estimated monthly total · **Pay today** |
| Review | “Estimated total” only | “Price per visit” + visits/month + amount due today |
| Payment | “Total to pay” | “Pay today (this visit)” + monthly estimate line |
| Account recurring | Price/visit only | Price/visit + ~visits/month + est. monthly |
| Math | Wizard ×4/×2/×1 vs admin `(52/12)×days` | Shared `estimateRecurringMonthlySpend` / `estimateVisitsPerMonth` |

---

## Changes made

| File | Change |
|------|--------|
| `lib/recurring/estimateMonthlyRevenue.ts` | Shared visits/month + `estimateRecurringMonthlySpend` |
| `BookingV2SummaryPanel.tsx` | Consistent labels + Pay today |
| `Step3Review.tsx` | Align with summary model |
| `Step4Payment.tsx` | Pay today + estimate line |
| `account/recurring/page.tsx` | Show estimated monthly under price |

Paystack charge amount unchanged (still this visit’s `payAmountZar`).

---

## Remaining risks

- Monthly-invoice customers still pay the first visit at checkout unless profile is already `billing_type=monthly` (pre-existing).
- Estimate is forward-looking, not invoice actuals.
