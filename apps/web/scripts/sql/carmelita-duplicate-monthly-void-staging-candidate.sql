-- STAGING VALIDATION CANDIDATE. One-off duplicate receivable reversal.
-- IMPORTANT: balance_cents is GENERATED ALWAYS AS total_amount_cents - amount_paid_cents;
-- preserve historical R360 total and R0 paid. Void+closed excludes collection;
-- effective collectible balance must be derived as 0 for void/closed invoices.
-- Never execute against production absent separate approval; do not pay/ refund.
BEGIN;
DO $$
DECLARE
  inv public.monthly_invoices%ROWTYPE;
  v_completed record;
  v_cancelled record;
BEGIN
 IF current_setting('app.environment',true) IS DISTINCT FROM 'staging' THEN
   RAISE EXCEPTION 'staging_only';
 END IF;
 IF current_setting('repair.zoho_void_verified',true) IS DISTINCT FROM '253016000002396017' THEN
   RAISE EXCEPTION 'external_zoho_void_evidence_required';
 END IF;
 SELECT * INTO STRICT inv FROM public.monthly_invoices
 WHERE id='d0e4c973-99dd-47c2-975e-61bd6c420810' FOR UPDATE;
 SELECT status,amount_paid_cents INTO STRICT v_completed FROM public.bookings
 WHERE booking_reference='SHL-BK-002994' AND monthly_invoice_id=inv.id FOR UPDATE;
 SELECT status,amount_paid_cents INTO STRICT v_cancelled FROM public.bookings
 WHERE booking_reference='SHL-BK-002812' AND monthly_invoice_id=inv.id FOR UPDATE;
 IF v_completed.status<>'completed' OR v_completed.amount_paid_cents<>36000
 OR v_cancelled.status<>'cancelled' OR v_cancelled.amount_paid_cents<>0 THEN
   RAISE EXCEPTION 'booking_history_changed';
 END IF;
 IF inv.status='void' AND inv.is_closed AND inv.balance_cents=36000 AND inv.amount_paid_cents=0
 THEN RAISE NOTICE 'already void: no-op'; RETURN; END IF;
 IF inv.status NOT IN ('sent','overdue') OR inv.is_closed OR inv.balance_cents<>36000
 OR inv.total_amount_cents<>36000 OR inv.amount_paid_cents<>0
 OR inv.zoho_invoice_id IS DISTINCT FROM '253016000002396017'
 THEN RAISE EXCEPTION 'invoice_state_changed'; END IF;
 UPDATE public.monthly_invoices SET status='void',is_closed=true,
 payment_link=NULL,payment_arrangement_active=false,updated_at=now()
 WHERE id=inv.id;
 INSERT INTO public.monthly_invoice_events(invoice_id,kind,payload)
 VALUES(inv.id,'invoice_voided',jsonb_build_object('kind','invoice_voided',
   'reason','duplicate receivable, owner confirmed',
   'zoho_invoice_id','253016000002396017',
   'original_paid_zoho_invoice','INV-001971',
   'source','controlled_reconciliation'));
END $$;
-- Keep this as ROLLBACK until independently reviewed and approved.
ROLLBACK;
