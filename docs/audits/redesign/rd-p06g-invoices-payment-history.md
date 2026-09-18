# RD-P06G — Invoices + payment history

Status: IMPLEMENTED — CI / LOCAL VISUAL VALIDATION PENDING
Branch: `design/rd04-platform-redesign`
Validation base: `validation/rd-p06g-base` @ `3a4184eed52c777ffe6dda5f661104117eebe69c`
Scope: customer invoices and payment-history presentation only. No production deployment, production data mutation, Supabase mutation, invoice/payment-state mutation, Paystack action, refund mutation, booking mutation, auth/RBAC change, pricing change, or customer ownership change.

## Governing authority

RD-P06A defines `/account/invoices`, `/account/invoices/[invoiceId]`, and `/account/payments` as governed Customer Account billing surfaces.

RD-P06G follows the closed RD-P06F profile slice and is limited to presentation normalization of invoice/payment information already supplied by existing hooks and domain helpers.

The Shalean Global Reusable UI System remains the presentation authority:

- reuse shared `Card`, `Button`, and `Badge` primitives;
- use canonical semantic tokens rather than route-local gray/blue/red/green palettes;
- preserve canonical domain-status and money authority;
- keep loading, error, empty, focus, and responsive states accessible;
- make no functional billing/payment change inside a redesign slice.

## Preserved billing and payment authority

### Invoice list

`/account/invoices` continues to use:

- `useMonthlyInvoices()` for monthly invoice rows, loading, error, and refresh behavior;
- `useBookings()` plus `perBookingInvoicesFromBookings()` for per-visit invoice presentation;
- `formatZarFromCents()` for monthly money display;
- `invoiceOverdueEscalationText()` and `daysPastDueJhb()` for overdue messaging;
- existing monthly invoice sorting and statistics calculations;
- existing invoice-detail, book-clean, PDF, Pay-now, and WhatsApp destinations.

No invoice total, amount paid, balance, due date, invoice ownership, overdue condition, or payment eligibility rule changes in RD-P06G.

### Monthly invoice cards

`InvoiceCard` retains:

- existing balance fallback calculation;
- `customerMonthlyInvoiceStatusLabel()` status authority;
- `trustMonthlyInvoicePayPageUrl()` branded Paystack routing;
- current `canPay` eligibility;
- existing Zoho/PDF-ready handling;
- invoice-detail destination.

Only card/status/action presentation is normalized.

### Per-visit invoice cards

`PerBookingInvoiceCard` retains:

- existing invoice date/amount values;
- Zoho/PDF readiness behavior;
- booking-detail destination;
- current Paid interpretation supplied by `PerBookingInvoice` authority.

Only presentation is normalized.

### Invoice detail

`/account/invoices/[invoiceId]` retains:

- `useMonthlyInvoiceDetail()` and `useMonthlyInvoiceBookings()` data contracts;
- existing balance fallback calculation;
- `customerMonthlyInvoiceStatusLabel()` status label;
- due-date formatting;
- overdue escalation calculation;
- `trustMonthlyInvoicePayPageUrl()` branded payment destination;
- existing `canOfferPay` condition;
- monthly invoice PDF endpoint;
- Refresh behavior;
- `CustomerInvoiceTimeline` activity authority;
- booking/service/visit mapping and booking-detail destinations.

No payment initiation, confirmation, invoice mutation, total/balance computation, Paystack reference, or linked-booking semantics are changed.

### Payment history

`/account/payments` retains:

- `useBookings()` as the current account payment-history input;
- existing newest-first sorting by booking creation date;
- `customerPaymentRowDisplay()` as canonical paid/pending/refund/muted-row interpretation;
- `countsAsPaidTransaction` for payment statistics;
- existing booking `priceZar` values and Paystack references;
- booking-detail destinations;
- invoices destination and Paystack/refund explanatory copy.

RD-P06G does not reinterpret refunds, paid state, pending state, totals, average spend, or transaction count.

## Presentation normalization implemented

### Shared surfaces

- `InvoiceCard` now uses shared `Card` and `Badge` primitives.
- `PerBookingInvoiceCard` now uses shared `Card` and `Badge` primitives.
- paid, pending, overdue, error, and neutral states use semantic global tokens.
- invoice/payment action groups wrap safely on smaller widths.
- long service names and payment references wrap without forcing page overflow.

### `/account/invoices`

- page heading and descriptions now use semantic foreground roles;
- loading placeholders use semantic card/muted surfaces;
- load errors use semantic destructive alert presentation and shared Retry button;
- overdue notice uses a responsive semantic alert card;
- overview stat cards use global semantic token roles;
- empty state uses shared Card/Button treatment;
- monthly/per-visit section headings use one hierarchy;
- billing support card uses shared Card/Button and semantic primary roles.

### `/account/invoices/[invoiceId]`

- error and overdue states use semantic alert cards;
- header/status hierarchy uses shared Badge presentation;
- Amounts, Activity, and Visits sections use shared Card header/content structure;
- amount hierarchy emphasizes Balance without changing values;
- Pay/PDF/Refresh controls wrap to full-width mobile actions and inline desktop actions;
- linked-visit rows stack safely on mobile;
- booking-load errors expose alert semantics.

### `/account/payments`

- local payment status pill styling is replaced by shared `Badge` variants while retaining `CustomerPaymentBadgeTone` mapping;
- loading/error/empty states use shared semantic treatment;
- Paystack/monthly-billing explainer uses shared Card/Button composition;
- history rows use semantic status icon surfaces and focus-visible treatment;
- Paystack references can wrap safely;
- secure-payment and dispute-protection panels use shared cards;
- mobile payment rows and actions remain contained.

## Explicitly unchanged

RD-P06G does **not** change:

- invoice totals, amount-paid values, balances, due dates, or overdue authority;
- monthly vs per-visit invoice membership;
- invoice/payment ownership or customer visibility;
- invoice creation, update, reconciliation, credit-note, refund, or payout behavior;
- Paystack references, callback behavior, payment initiation, or confirmation;
- Zoho invoice creation/sync behavior;
- PDF endpoint behavior;
- refund interpretation or bank-timing text;
- booking prices or payment-history transaction calculations;
- Supabase schema/data;
- Auth/RBAC;
- AccountShell or AccountNav;
- production configuration/deployment.

## Validation gates

Before RD-P06G can close:

1. exact-head `web-test` must pass;
2. exact-head `migration-governance` must pass;
3. local desktop/mobile `/account/invoices` visual smoke must pass;
4. local desktop/mobile `/account/payments` visual smoke must pass;
5. if a monthly invoice fixture is available, `/account/invoices/[invoiceId]` desktop/mobile containment must pass;
6. overdue/payment/refund/status values must be inspected only — no real payment or data mutation;
7. no page-level horizontal overflow or mobile bottom-nav overlap;
8. validation PR must be closed unmerged after approval.

## Current decision

RD-P06G is **IMPLEMENTED — CI / LOCAL VISUAL VALIDATION PENDING**.

Validation base remains pinned at the closed RD-P06F head:

`validation/rd-p06g-base` → `3a4184eed52c777ffe6dda5f661104117eebe69c`
