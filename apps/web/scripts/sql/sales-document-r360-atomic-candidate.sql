-- MANUAL, ONE-OFF REPAIR CANDIDATE. REVIEW AND TEST ON ISOLATED STAGING.
-- Not a migration; do not run in production without separate explicit approval.
-- Requires externally verified Paystack success and Zoho paid invoice evidence.
-- No external API calls or notifications. Shared Paystack/bank remain unchanged.
BEGIN;
DO $repair$
DECLARE
  d public.sales_documents%ROWTYPE;
  b public.bookings%ROWTYPE;
  p public.payment_transactions%ROWTYPE;
  v_ref constant text := 'sd_inv_dfadaa01-2de5-4700-86e6-34af6ded1770';
  v_doc constant uuid := 'dfadaa01-2de5-4700-86e6-34af6ded1770';
  v_paid_at timestamptz;
  v_count integer;
BEGIN
  IF current_setting('app.environment', true) IS DISTINCT FROM 'staging' THEN
    RAISE EXCEPTION 'staging-only: explicit production authorization required';
  END IF;
  -- Supply the *verified Paystack paid timestamp* in the session before this
  -- transaction. The CSV Created At time is not verified as paid timestamp.
  v_paid_at := nullif(current_setting('repair.verified_paid_at',true),'')::timestamptz;
  IF v_paid_at IS NULL OR v_paid_at::date NOT BETWEEN '2026-10-05' AND '2026-10-06' THEN
    RAISE EXCEPTION 'verified_paid_at_required';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_ref,0));
  SELECT * INTO STRICT d FROM public.sales_documents WHERE id=v_doc FOR UPDATE;
  SELECT count(*) INTO v_count FROM public.bookings WHERE sales_document_id=v_doc;
  IF v_count<>1 THEN RAISE EXCEPTION 'booking_cardinality_mismatch:%',v_count; END IF;
  SELECT * INTO STRICT b FROM public.bookings WHERE sales_document_id=v_doc FOR UPDATE;
  SELECT * INTO p FROM public.payment_transactions WHERE gateway='paystack' AND gateway_reference=v_ref;
  IF FOUND THEN
    -- A repeat is a no-op ONLY when every persisted component agrees.
    IF d.status='paid' AND d.amount_paid_cents=36000 AND d.balance_cents=0
       AND b.payment_status='success' AND b.amount_paid_cents=36000
       AND p.amount_cents=36000 AND p.entity_id=v_doc
       AND EXISTS(SELECT 1 FROM public.sales_document_paystack_charge_dedup
                  WHERE charge_reference=v_ref AND document_id=v_doc AND amount_cents=36000)
    THEN
      RAISE NOTICE 'ALREADY_RECONCILED: no changes';
      RETURN;
    END IF;
    RAISE EXCEPTION 'conflicting_existing_ledger';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sales_document_paystack_charge_dedup WHERE charge_reference=v_ref)
     OR EXISTS (SELECT 1 FROM public.payment_transactions WHERE gateway_transaction_id='6626862426')
  THEN RAISE EXCEPTION 'conflicting_existing_payment_evidence'; END IF;
  IF d.document_type<>'invoice' OR d.status NOT IN ('sent','accepted')
     OR d.total_cents<>36000 OR d.balance_cents<>36000
     OR d.amount_paid_cents<>0 OR d.paystack_reference IS DISTINCT FROM v_ref
     OR d.zoho_invoice_id IS DISTINCT FROM '253016000001724014'
     OR b.status<>'pending_monthly' OR b.amount_paid_cents<>0
     OR b.payment_status='success'
  THEN RAISE EXCEPTION 'unexpected_historical_state'; END IF;
  -- Atomic local accounting state only. Preserve b.status and historical dates.
  INSERT INTO public.sales_document_paystack_charge_dedup(charge_reference,document_id,amount_cents)
    VALUES (v_ref,v_doc,36000);
  UPDATE public.sales_documents SET status='paid',amount_paid_cents=36000,
    balance_cents=0,payment_link=NULL,payment_link_expires_at=NULL,updated_at=now()
    WHERE id=v_doc;
  UPDATE public.bookings SET amount_paid_cents=36000,total_paid_cents=36000,
    total_paid_zar=360,payment_status='success',payment_completed_at=v_paid_at,
    payment_reference_external=v_ref,updated_at=now()
    WHERE id=b.id;
  INSERT INTO public.payment_transactions
    (gateway,gateway_reference,gateway_transaction_id,entity_type,entity_id,
     amount_cents,currency_code,processing_fee_cents,net_settlement_cents,
     fee_calculation_method,settlement_status,payment_channel,paid_at,sync_status)
  VALUES ('paystack',v_ref,'6626862426','sales_document',v_doc,36000,'ZAR',
          828,35172,'paystack_reported','pending','capitec_pay',v_paid_at,'ignored');
  -- Abort the whole transaction if a trigger or concurrent change has
  -- altered expected state. This is not a substitute for full trigger tests.
  IF NOT EXISTS (
    SELECT 1 FROM public.sales_documents
    WHERE id=v_doc AND status='paid' AND amount_paid_cents=36000 AND balance_cents=0
  ) OR NOT EXISTS (
    SELECT 1 FROM public.bookings
    WHERE id=b.id AND status='pending_monthly'
      AND payment_status='success' AND amount_paid_cents=36000
      AND total_paid_cents=36000 AND payment_completed_at=v_paid_at
  ) OR (SELECT count(*) FROM public.payment_transactions
        WHERE gateway='paystack' AND gateway_reference=v_ref
          AND gateway_transaction_id='6626862426' AND amount_cents=36000)<>1
    OR (SELECT count(*) FROM public.sales_document_paystack_charge_dedup
        WHERE charge_reference=v_ref AND document_id=v_doc AND amount_cents=36000)<>1
  THEN
    RAISE EXCEPTION 'historical_reconciliation_postcondition_failed';
  END IF;
END
$repair$;
-- Postconditions must be independently inspected in the *same transaction*.
-- ROLLBACK by default; replacing with COMMIT requires separate review and
-- explicit authorization after staging fixture and repeat-run tests.
ROLLBACK;
