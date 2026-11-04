# Carmelita R360 — controlled duplicate-invoice reversal proposal (NOT authorized)

## Accounting evidence (2026-11-02)
- One successful Paystack transaction R360, reference `sd_inv_dfadaa01-2de5-4700-86e6-34af6ded1770`; Shalean and Bokkie share Paystack and the bank account but this is **Shalean** income.
- Zoho **INV-001971** for R360 has an existing R360 paid receipt, balance R0. Preserve it. Zoho's receipt shows Cash on 6 Oct; Paystack shows Capitec Pay on 5 Oct; confirm provenance before changing payment methods or accounting.
- Zoho **INV-002025** for R360 has R360 outstanding and is owner-confirmed duplicate. It is a *monthly* invoice, not a second payment. Do not mark it paid with another receipt.
- Completed booking **SHL-BK-002994** (8 Oct) records R360 and is linked to monthly invoice. Preserve service and existing recorded R360.
- Cancelled booking **SHL-BK-002812** (12 Oct) records R0 paid, links to both sales document and monthly invoice. Preserve cancellation and zero paid.

## Proposed change set (subject to separate production-write approval)
1. Confirm INV-002025 has no payments, credits, collections, other legitimate services or VAT treatment requiring a credit note. Confirm its full Zoho invoice detail and audit history.
2. In Zoho Books, **void** the duplicate INV-002025 if permitted by invoice/accounting state and VAT rules; otherwise use an approved full credit note. Preserve audit trail, never delete. Do NOT click Record Payment.
3. Reconcile the internal `monthly_invoices` receivable and booking links through an explicitly scoped, audit-logged transaction so no open R360 balance or future automated reminder/regeneration remains. Never change the completed booking's status or the cancelled booking's status; do not allocate an additional R360 to either booking.
4. Preserve paid INV-001971 and Paystack evidence. Correct stale sales-document display only if a separate evidence-based nonduplicating synchronization procedure can do so without generating another payment or notification. Never replay the ordinary Paystack handler.
5. Verify one R360 gross customer receipt across the shared Paystack/bank, correct Shalean business allocation, zero duplicate receivable, no Bokkie allocation, no new fee/settlement/Zoho receipts.
6. Test actual application code and DB-trigger effects on staging fixtures. Repeat operation must be a no-op, then stage release and request explicit owner approval before production financial writes.

## Stop conditions
- Any extra booking line on INV-002025, existing customer payment or credit, disputed payment, linked payout adjustment, unexpected trigger side effect, or unverified audit evidence.
- If the monthly invoice is not genuinely duplicate, abandon this proposal and reassess.

## Evidence gates
- CI for PR #1049 at `e29f4bf`: web-test PASS and migration-governance PASS.
- Staging schema inspected. Temporary table fixture established completed/ cancelled/ two-link expectations, followed by ROLLBACK.
- This test does not validate a real Zoho void, actual-table correction, or production write.
- PR stays Draft; production NO-GO.

## Actual-schema staging verification (2026-11-02)
- `monthly_invoices.balance_cents` is a GENERATED ALWAYS column (`total_amount_cents - amount_paid_cents`). **Never write it directly.** Preserve historical total 36000 and paid 0, hence stored balance remains 36000; `void` + `is_closed=true` must cause customer-facing and financial reporting to treat effective collectible balance as **zero**.
- Isolated real-table staging test: temporarily extended status constraint to include `void`, inserted a synthetic invoice using a staging customer foreign-key fixture, then executed void+closed update with an `invoice_voided` event. Second execution was a no-op; exactly one event. Transaction ended `ROLLBACK`; follow-up check found 0 synthetic invoices.
- This does not validate the hardcoded customer-specific candidate (not present on staging) or all reporting consumers. Production schema migration and application reporting coverage remain separate gates.
