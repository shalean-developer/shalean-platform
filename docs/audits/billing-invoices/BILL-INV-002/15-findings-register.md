# 15 — Findings Register

Severity counts: **Critical 1 · High 6 · Medium 9 · Low 6 · Info 5**

---

## BILL-INV-002-C01 — Stale Paystack amount accepted without balance match

| Field | Value |
|-------|-------|
| Severity | **Critical** |
| Verified evidence | `initializePaystackForMonthlyInvoice` charges `balance_cents`; `loadPayMonthlyInvoiceLanding` displays current balance but reuses stored `payment_link`; `applyMonthlyInvoicePayment` adds Paystack `amountCents` with no equality check to `balance_cents` / metadata |
| Affected | `initializePaystackForMonthlyInvoice.ts`, `loadPayMonthlyInvoiceLanding.ts`, `applyMonthlyInvoicePayment.ts`, `monthly_invoices.payment_link` |
| Root cause | Session amount frozen at init; apply trusts gateway amount; adjustments don't invalidate link |
| Customer impact | May pay wrong amount vs statement shown on branded page |
| Financial impact | Under/over collection vs ledger intent; overpay capped in ledger but money still taken at Paystack |
| Security / privacy | Low (integrity, not authz) |
| Likelihood | Medium (whenever amount changes after send) |
| Reproduction | Send invoice → adjust total without clearing link → open branded page → pay via CTA |
| Remediation | On apply: require `amountCents == balance_before` (or within policy); clear `payment_link` on any total/balance change; landing re-init when link amount ≠ balance |
| Dependencies | Phase A tests |
| Owner | Payments eng |
| Verification | Unit + staging pay with drifted balance rejected or refreshed |
| Blocks production use | **Yes for unconditional GO**; containment required for CONDITIONAL PASS |

---

## BILL-INV-002-H01 — Paid invoices missing payment_transactions

| Field | Value |
|-------|-------|
| Severity | High |
| Evidence | Prod: 9/42 paid lack ledger; 7 have paystack_reference |
| Affected | `payment_transactions`, webhook/verify ledger writers, `markMonthlyInvoicePaidManual` |
| Root cause | Historical gap and/or manual pay without ledger row; apply itself does not write ledger (delegates to callers) |
| Customer impact | Low direct |
| Financial impact | Reconciliation / Zoho fee sync incomplete |
| Likelihood | Confirmed in prod |
| Remediation | Backfill from Paystack; write ledger on mark-paid; optionally move ledger write into apply |
| Owner | Finance eng |
| Blocks production use | No (with manual recon) |

---

## BILL-INV-002-H02 — Refund only processes first charge-dedup row

| Field | Value |
|-------|-------|
| Severity | High |
| Evidence | `refundMonthlyInvoicePayment` `.limit(1)` on dedup |
| Affected | `refundMonthlyInvoicePayment.ts`, admin refund route |
| Root cause | Assumes single charge |
| Customer impact | Partial refund vs full intended |
| Financial impact | High if multi-partial used |
| Likelihood | Low today (0 multi-charge invoices) |
| Remediation | Sum/refund all charges; block refund if multi until implemented |
| Owner | Payments eng |
| Blocks production use | Conditional — block multi-partial refunds |

---

## BILL-INV-002-H03 — Admin copy + customer card distribute raw Paystack URLs

| Field | Value |
|-------|-------|
| Severity | High |
| Evidence | `InvoiceHeaderActions.copyLink`, `InvoiceCard` payHref |
| Remediation | Copy/send `trustMonthlyInvoicePayPageUrl` only |
| Owner | Web eng |
| Blocks production use | No with operator discipline |

---

## BILL-INV-002-H04 — accounting-sync worker not scheduled; queue all pending

| Field | Value |
|-------|-------|
| Severity | High |
| Evidence | `cron.job` lacks `accounting-sync`; 21 pending / 0 synced |
| Remediation | Schedule pg_cron + drain; alert on pending age |
| Owner | Platform ops |
| Blocks production use | No for collections; yes for automated accounting GO |

---

## BILL-INV-002-H05 — Reminder / overdue / drift crons have zero cron_runs

| Field | Value |
|-------|-------|
| Severity | High |
| Evidence | pg_cron active; `send-invoice-reminders` n=0; overdue/repair n=0; charge has 66 |
| Remediation | Debug `invoke_nextjs_cron`; fix auth/path; prove cron_runs; add health alerts |
| Owner | Platform ops |
| Blocks production use | No for collection; yes for automated collections ops GO |

---

## BILL-INV-002-H06 — Adjustments do not invalidate payment_link

| Field | Value |
|-------|-------|
| Severity | High |
| Evidence | Late fee clears link; adjustment insert path does not |
| Remediation | Trigger/app hook: null `payment_link` when totals change on open invoices |
| Owner | Payments eng |
| Related | C01 |

---

## Medium (M01–M09)

| ID | Title |
|----|-------|
| M01 | Export button no-op on office invoices |
| M02 | Invoice list hard-capped at 500 — KPI undercount risk |
| M03 | Billing Zoho inbox capped (250) — backlog understated |
| M04 | `AdminInvoicesListView` links to `/admin/invoices` |
| M05 | Zero-total invoice in `sent` status (1) |
| M06 | Missing Zoho ids on 3 sentish/paid |
| M07 | Missing paystack refs on 2 sentish/paid |
| M08 | `draft→sent` before email success |
| M09 | Success page labels partial as paid |

Detail: **M01** `office/invoices/page.tsx` Download without handler. **M02** `.limit(500)` in `loadAdminInvoiceList`. **M03** `loadAdminBillingDocuments` slice 250. **M04** Legacy `/admin/invoices` href. **M05** One zero-total `sent` invoice. **M06** Three missing Zoho ids. **M07** Two missing paystack refs. **M08** Status `sent` before email. **M09** Partial success UX says paid.

Related residual risks tracked in reliability/ops docs (not double-counted): booking fall-through on `monthly_error`, paid-before-children, Zoho create race, overdue status excluded from reminders, pay landing re-init rate limit, cron-health blind spots.

---

## Low

| ID | Title |
|----|-------|
| L01 | Header WhatsApp is chat-only |
| L02 | Child allocation from booking lines not charge amount |
| L03 | Zoho notes may embed non-branded URL |
| L04 | Thin customer ownership tests |
| L05 | Broad GRANTs on payment_transactions with RLS deny |
| L06 | Unmasked refs / emails in logs |

## Informational

| ID | Title |
|----|-------|
| I01 | Webhook HMAC verification solid |
| I02 | Charge dedup + ledger unique keys |
| I03 | Zoho non-blocking by design |
| I04 | Child settlement probes clean (0/0) |
| I05 | Public pay requires ref |
