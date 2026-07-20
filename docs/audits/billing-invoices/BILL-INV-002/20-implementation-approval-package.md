# BILL-INV-002 — Implementation Approval Package

**Status:** Awaiting explicit authorization. **Do not implement until approved.**

## Exact files to change (proposed)

### Phase A
- `apps/web/lib/monthlyInvoice/applyMonthlyInvoicePayment.ts`
- `apps/web/lib/pay/loadPayMonthlyInvoiceLanding.ts`
- `apps/web/lib/monthlyInvoice/initializePaystackForMonthlyInvoice.ts`
- `apps/web/lib/monthlyInvoice/insertInvoiceAdjustment.ts` (and/or DB trigger)
- `apps/web/lib/monthlyInvoice/refundMonthlyInvoicePayment.ts`
- New tests under `apps/web/lib/monthlyInvoice/__tests__/`

### Phase B
- `apps/web/components/admin/invoices/InvoiceHeaderActions.tsx`
- `apps/web/components/account/InvoiceCard.tsx`
- `apps/web/app/pay/invoice/[invoiceId]/success/page.tsx`
- `apps/web/lib/monthlyInvoice/finalizeAndSendMonthlyInvoice.ts` (optional sent-vs-email)

### Phase C
- Supabase migration: schedule `accounting-sync` in `cron.job`
- Ops fix for `invoke_nextjs_cron` on reminders/overdue/drift (may be config-only)
- `apps/web/lib/monthlyInvoice/markMonthlyInvoicePaidManual.ts`
- Backfill script under `apps/web/scripts/` (new, dry-run first)
- Possibly `apps/web/lib/payments/backfillPaystackPaymentTransactions.ts` extension

### Phase D
- `apps/web/app/(ui-redesign)/office/invoices/page.tsx` (Export)
- `apps/web/lib/admin/invoices/loadAdminInvoiceList.ts` (caps/aggregates)
- `apps/web/lib/admin/billing/loadAdminBillingDocuments.ts`
- `apps/web/components/admin/invoices/AdminInvoicesListView.tsx`
- `apps/web/app/api/admin/cron-health/route.ts`
- Rate limit helper reuse for pay landing
- Log masking in webhook monthly success path

## Proposed migrations and backfills

1. **Migration:** `cron.schedule('accounting-sync', … invoke_nextjs_cron('/api/cron/accounting-sync'))`
2. **Optional migration:** trigger/function to null `monthly_invoices.payment_link` when totals change on open statuses
3. **Backfill:** create missing `payment_transactions` for paid monthly invoices with Paystack charges (dry-run → apply)
4. **Data correction:** quarantine or close zero-total `sent` invoice (1 row); sync 3 missing Zoho ids via existing admin tools

## Tests to add

- Amount mismatch reject / quarantine
- Landing re-init when balance ≠ session amount
- Adjustment clears payment_link
- Refund blocked when dedup count > 1
- Branded copy URL host assertion
- `/pay/invoice` missing ref / wrong ref / paid / zero matrix
- Manual mark-paid creates manual ledger row

## Data correction plan

1. Export masked list of 9 paid-without-ledger ids (ops only)
2. Classify: Paystack vs manual
3. Backfill Paystack via verify API
4. Insert manual ledger rows for EFT/mark-paid
5. Re-run probes until `paid_without_ledger = 0` (or only intentional manual with channel set)

## Staging verification plan

1. Deploy Phase A–B to staging with Paystack **test** keys
2. Create draft → adjust after send → confirm stale CTA cannot under/over collect
3. Partial pay → success copy says partial
4. Force-invoke reminder/overdue/accounting crons; confirm `cron_runs`
5. Refund multi-charge fixture blocked

## Production deployment plan

1. Feature flags where possible (amount quarantine first)
2. Deploy Phase A → monitor webhook errors 24h
3. Deploy Phase B
4. Apply accounting-sync schedule + cron invoke fix (Phase C)
5. Run backfill in maintenance window
6. Deploy Phase D

## Monitoring plan

- Alert: `send-invoice-reminders` / `mark-monthly-invoices-overdue` / `repair-monthly-payment-state-drift` / `accounting-sync` missing success in 36h
- Alert: `accounting_sync_records` pending age > 24h
- Metric: apply rejects `amount_mismatch`
- Daily: re-run settlement invariant SQL

## Rollback and recovery

- Revert app deploy to prior SHA if apply rejects spike incorrectly
- Cron schedule changes: `cron.unschedule` accounting-sync if harmful
- Backfill: idempotent on gateway_reference unique — safe to re-run; delete only with finance approval

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Amount quarantine blocks legitimate partials | Compare to remaining balance, not original total |
| Re-init storms | Rate limit landing init |
| Backfill duplicates | Unique (gateway, reference) |
| Reminder storm after fix | Start with dry-run / low batch |

## Explicit exclusions

- No live Paystack test charges on production
- No customer email/WhatsApp blasts as part of fix validation
- No schema drop of historical payment fields
- No force-close of open customer balances without finance sign-off
- Sales-document and prepaid booking rails out of Phase A except shared webhook safety
