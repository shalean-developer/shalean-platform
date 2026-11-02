-- READ-ONLY reconciliation gate. Execute on authorized Shalean staging only.
-- This script contains no financial writes and does NOT authorize void/credit.
BEGIN READ ONLY;
DO $$
DECLARE v_doc record; v_month record; v_done record; v_cancel record;
BEGIN
 IF current_setting('app.environment',true) IS DISTINCT FROM 'staging' THEN
   RAISE EXCEPTION 'requires_explicit_staging_environment';
 END IF;
 SELECT id,status,total_cents,amount_paid_cents,balance_cents,zoho_invoice_id
 INTO STRICT v_doc FROM public.sales_documents WHERE id='dfadaa01-2de5-4700-86e6-34af6ded1770';
 SELECT id,status,total_amount_cents,amount_paid_cents
 INTO STRICT v_month FROM public.monthly_invoices WHERE id='d0e4c973-99dd-47c2-975e-61bd6c420810';
 SELECT id,status,amount_paid_cents,monthly_invoice_id
 INTO STRICT v_done FROM public.bookings WHERE booking_reference='SHL-BK-002994';
 SELECT id,status,amount_paid_cents,monthly_invoice_id,sales_document_id
 INTO STRICT v_cancel FROM public.bookings WHERE booking_reference='SHL-BK-002812';
 IF v_doc.total_cents<>36000 OR v_doc.zoho_invoice_id IS DISTINCT FROM '253016000001724014'
 OR v_month.total_amount_cents<>36000 OR v_done.status<>'completed'
 OR v_done.amount_paid_cents<>36000 OR v_done.monthly_invoice_id IS DISTINCT FROM v_month.id
 OR v_cancel.status<>'cancelled' OR v_cancel.amount_paid_cents<>0
 OR v_cancel.sales_document_id IS DISTINCT FROM v_doc.id
 OR v_cancel.monthly_invoice_id IS DISTINCT FROM v_month.id THEN
   RAISE EXCEPTION 'evidence_changed_or_missing';
 END IF;
 RAISE NOTICE 'Read-only evidence consistent. Review duplicate invoice treatment and ledger classification; no writes authorized.';
END $$;
ROLLBACK;
