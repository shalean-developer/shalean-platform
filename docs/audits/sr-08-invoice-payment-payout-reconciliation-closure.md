# SR-08 — Invoice/payment/payout reconciliation closure

Status: Closure candidate
Date: 2026-08-28
Integration baseline: `d0d284f545803c099ca0f04a8412e269364b94ce`

## Scope reviewed

Final closure audit covered the current integration branch across:

- monthly-invoice payment application and manual/offline settlement;
- Paystack and manual payment ledger records;
- refund accounting, customer evidence, and refund amount propagation;
- Zoho payment reference/amount propagation for manual monthly-invoice settlement;
- payment reconciliation visibility and mismatch checks;
- cleaner payout release and paid-state convergence;
- cleaner-earnings disbursement paid-state convergence;
- existing maker-checker and test-payout protections.

## Concrete defects repaired during SR-08

1. **SR-08A — monthly-invoice refund amount reconciliation**
   - Gateway refund amount could differ from the amount written to refund ledger/snapshot/log/email.
   - Repaired downstream accounting and customer evidence to use the actual gateway-refunded amount.

2. **SR-08B — manual invoice payments in canonical ledger**
   - Manual/offline monthly-invoice settlement marked invoices paid without a canonical `payment_transactions` cash record.
   - Added deterministic manual-EFT payment ledger records using `manual:monthly_invoice:<invoiceId>` and remaining-balance amount.

3. **SR-08C — atomic payout paid-state convergence**
   - Payout parent rows could become paid before linked booking/earning rows synchronized.
   - Moved weekly payout and cleaner-earnings disbursement paid-state convergence into the same database transaction.

4. **SR-08D — manual payments visible in reconciliation**
   - Office reconciliation filtered the canonical ledger to Paystack, hiding valid manual/offline ledger rows.
   - Reconciliation now starts from all `payment_transactions`; Paystack-specific checks remain Paystack-only.

5. **SR-08E — Zoho manual-payment amount alignment**
   - For partially paid monthly invoices, internal manual EFT recorded the remaining balance while Zoho received the full invoice total.
   - Zoho now receives the same remaining manual-payment amount as the canonical ledger.

## Final invariant check

The current integration implementation now satisfies the SR-08 reconciliation boundaries reviewed here:

- refund cash amount matches refund accounting/evidence;
- manual monthly-invoice cash settlement is represented in the canonical payment ledger;
- manual partial settlement uses the same remaining amount for ledger and Zoho payment sync;
- Office reconciliation includes both Paystack and manual/offline canonical ledger transactions;
- Paystack-specific fee/reference-gap logic remains gateway-specific;
- weekly cleaner payout paid state converges linked booking/roster/team payout state transactionally;
- cleaner-earnings disbursement paid state converges linked earnings/booking state transactionally;
- maker-checker payout release protections remain intact;
- test payout release remains blocked.

## Closure result

No further concrete invoice/payment/payout reconciliation defect was identified in the final SR-08 closure audit on the integration baseline above.

Items that are primarily communication delivery, retry/observability, pagination/query-cost, or UI consolidation are outside SR-08 and remain assigned to their later SR slices.

**Closure recommendation: mark SR-08 Completed after this closure PR passes CI and is merged into `integration/shalean-repairs`. Next programme slice: SR-09 — Communications consolidation.**

No production database mutation, live payment/refund/payout action, live Zoho mutation, or merge to `main` is authorized by this closure record.
