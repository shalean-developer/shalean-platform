-- REVIEW-ONLY DRAFT. DO NOT APPLY TO PRODUCTION.
-- Historical Paystack/Zoho settlement is already confirmed externally.
-- Transactional repair must execute on STAGING only after an isolated fixture
-- matches the exact target evidence. No Paystack, Zoho or messaging API calls.
--
-- This executable block is intentionally a fail-closed dry run. It locks and
-- assesses existing rows, but never writes payment records.
BEGIN;
DO $$
DECLARE
  v_doc record;
  v_booking record;
  v_ref text := 'sd_inv_dfadaa01-2de5-4700-86e6-34af6ded1770';
BEGIN
  IF current_setting('app.environment', true) IS DISTINCT FROM 'staging' THEN
    RAISE EXCEPTION 'staging_only_reconciliation_preflight';
  END IF;
  SELECT id,status,total_cents,amount_paid_cents,balance_cents,paystack_reference
  INTO STRICT v_doc FROM public.sales_documents
  WHERE id='dfadaa01-2de5-4700-86e6-34af6ded1770' FOR UPDATE;
  SELECT id,status,amount_paid_cents
  INTO STRICT v_booking FROM public.bookings
  WHERE sales_document_id=v_doc.id FOR UPDATE;
  IF v_doc.status NOT IN ('sent','accepted')
    OR v_doc.total_cents<>36000
    OR v_doc.amount_paid_cents<>0
    OR v_doc.balance_cents<>36000
    OR v_doc.paystack_reference IS DISTINCT FROM v_ref
    OR v_booking.status<>'pending_monthly'
    OR v_booking.amount_paid_cents<>0 THEN
    RAISE EXCEPTION 'historical_reconciliation_state_changed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_transactions WHERE gateway='paystack' AND gateway_reference=v_ref)
    OR EXISTS (SELECT 1 FROM public.sales_document_paystack_charge_dedup WHERE charge_reference=v_ref) THEN
    RAISE EXCEPTION 'historical_reconciliation_duplicate_evidence';
  END IF;
  RAISE NOTICE 'STAGING PREFLIGHT ONLY document=% booking=% amount=36000. No writes authorized.',v_doc.id,v_booking.id;
END $$;
ROLLBACK;
