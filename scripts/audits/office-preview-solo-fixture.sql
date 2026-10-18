-- AUDIT963: governed, synthetic solo Office preview fixture.
-- Operator: use ONLY the explicitly selected staging project after fresh health
-- proves staging, the expected staging ref, Paystack test/test, outbound disabled,
-- issues=[] and the reviewed #963 application SHA. Never select production.
-- Two existing retired AUDIT956 controls below independently reject a wrong target.
-- Default is a rollback rehearsal. After successful rehearsal and read-only
-- preservation checks, replace ONLY the final ROLLBACK with COMMIT to apply.
-- No real customer, new identity, recurring schedule or money movement is created.
-- Existing synthetic cleaner tenure is retained; 16 March 2027 is five months
-- after its October 2026 creation, so the current standard R360 basis yields R252.
-- This fixture is is_test=true from creation and has no financial links.

BEGIN ISOLATION LEVEL REPEATABLE READ;
DO $audit963$
DECLARE
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.bookings
    WHERE id='95610000-0000-4000-8000-000000000001'
      AND paystack_reference='AUDIT956-PAIRED-UI' AND is_test
      AND metadata->>'audit_fixture'='AUDIT956-PAIRED-UI'
      AND metadata->>'synthetic'='true'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.cleaners
    WHERE id='95610000-0000-4000-8000-000000000002'
      AND email='audit956.lead@example.com' AND full_name='Audit956 Lead'
      AND joined_at IS NULL
      AND created_at >= '2026-10-15' AND created_at < '2026-10-16'
  ) THEN
    RAISE EXCEPTION 'AUDIT963 wrong-target or changed synthetic control; no writes allowed';
  END IF;

  IF EXISTS (SELECT 1 FROM public.bookings
      WHERE (id='96310000-0000-4000-8000-000000000001'
          OR paystack_reference='AUDIT963-PREVIEW-LINE-BASIS')
        AND (id='96310000-0000-4000-8000-000000000001'
          AND paystack_reference='AUDIT963-PREVIEW-LINE-BASIS' AND is_test
          AND metadata->>'audit_fixture'='AUDIT963-PREVIEW-LINE-BASIS'
          AND metadata->>'synthetic'='true'
          AND customer_email='audit963.customer@example.com'
          AND customer_id IS NULL AND recurring_id IS NULL
          AND cleaner_id='95610000-0000-4000-8000-000000000002'
          AND payout_owner_cleaner_id='95610000-0000-4000-8000-000000000002'
          AND date='2027-03-16' AND status='assigned'
          AND earnings_policy='current_v1' AND NOT is_team_job
          AND amount_paid_cents=0 AND coalesce(total_paid_cents,0)=0
          AND payment_status='pending' AND payout_status='pending'
          AND monthly_invoice_id IS NULL AND zoho_invoice_id IS NULL
          AND payment_transaction_id IS NULL AND paid_at IS NULL
          AND payout_id IS NULL AND payout_run_id IS NULL
          AND payout_paid_at IS NULL AND payout_frozen_cents IS NULL
          AND display_earnings_cents=25200 AND cleaner_payout_cents=25200
          AND payout_earnings_cents=25200 AND cleaner_bonus_cents=0
          AND company_revenue_cents=10800
          AND internal_earnings_cents=25200 AND total_paid_zar=360
          AND service_slug='standard' AND currency='ZAR' AND billing_type='pay_later'
          AND base_amount_cents IS NULL AND service_fee_cents=0
          AND earnings_summary IS NULL AND cleaner_earnings_total_cents=25000
          AND cleaner_line_earnings_finalized_at IS NULL AND team_id IS NULL
          AND payment_completed_at IS NULL AND payment_reference_external IS NULL
          AND marked_paid_by_admin_id IS NULL AND coalesce(deposit_paid_cents,0)=0
          AND refunded_at IS NULL AND refund_status IS NULL
          AND price_snapshot='{"v":1,"base_price":360,"total_price":360,"service_type":"standard"}'::jsonb
        ) IS NOT TRUE) THEN
    RAISE EXCEPTION 'AUDIT963 booking collision or changed/linked fixture; no writes allowed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.booking_line_items
      WHERE (id='96310000-0000-4000-8000-000000000002'
          OR booking_id='96310000-0000-4000-8000-000000000001')
        AND (id='96310000-0000-4000-8000-000000000002'
          AND booking_id='96310000-0000-4000-8000-000000000001'
          AND item_type='base' AND name='Audit963 synthetic service'
          AND quantity=1 AND unit_price_cents=36000 AND total_price_cents=36000
          AND earns_cleaner AND cleaner_earnings_cents=25000
          AND metadata->>'audit_fixture'='AUDIT963-PREVIEW-LINE-BASIS') IS NOT TRUE) THEN
    RAISE EXCEPTION 'AUDIT963 line collision or changed fixture; no writes allowed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.booking_cleaners WHERE booking_id='96310000-0000-4000-8000-000000000001')
    OR EXISTS (SELECT 1 FROM public.cleaner_earnings WHERE booking_id='96310000-0000-4000-8000-000000000001')
    OR EXISTS (SELECT 1 FROM public.booking_roster_member_payouts WHERE booking_id='96310000-0000-4000-8000-000000000001')
    OR EXISTS (SELECT 1 FROM public.team_job_member_payouts WHERE booking_id='96310000-0000-4000-8000-000000000001')
    OR EXISTS (SELECT 1 FROM public.cleaner_earnings_adjustments WHERE booking_id='96310000-0000-4000-8000-000000000001')
    OR EXISTS (SELECT 1 FROM public.payment_transactions WHERE booking_id='96310000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'AUDIT963 unexpected participation or financial rows; no writes allowed';
  END IF;

  v_before := jsonb_build_object(
    'bookings',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by id),'')) from public.bookings t where id <> '96310000-0000-4000-8000-000000000001'),
    'lines',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by id),'')) from public.booking_line_items t where booking_id <> '96310000-0000-4000-8000-000000000001'),
    'cleaners',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.cleaners t),
    'booking_cleaners',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.booking_cleaners t),
    'cleaner_earnings',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.cleaner_earnings t),
    'booking_roster_member_payouts',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.booking_roster_member_payouts t),
    'team_job_member_payouts',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.team_job_member_payouts t),
    'cleaner_earnings_adjustments',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.cleaner_earnings_adjustments t),
    'booking_cleaner_earnings_snapshot',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.booking_cleaner_earnings_snapshot t),
    'booking_cleaner_earnings_snapshot_lines',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.booking_cleaner_earnings_snapshot_lines t),
    'monthly_invoices',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.monthly_invoices t),
    'payment_transactions',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.payment_transactions t),
    'cleaner_payouts',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.cleaner_payouts t),
    'cleaner_payout_runs',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.cleaner_payout_runs t),
    'cleaner_earnings_disbursements',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.cleaner_earnings_disbursements t),
    'payout_transfers',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.payout_transfers t),
    'payout_transfer_outbox',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.payout_transfer_outbox t),
    'earnings_disbursement_transfers',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.earnings_disbursement_transfers t)
  );

  INSERT INTO public.bookings (
    id,paystack_reference,customer_name,customer_email,customer_phone,
    service_slug,service,date,time,is_test,is_team_job,status,dispatch_status,
    amount_paid_cents,total_paid_zar,currency,payment_status,billing_type,
    cleaner_id,payout_owner_cleaner_id,payout_status,display_earnings_cents,
    payout_earnings_cents,internal_earnings_cents,cleaner_payout_cents,
    cleaner_bonus_cents,company_revenue_cents,cleaner_earnings_total_cents,
    base_amount_cents,service_fee_cents,price_snapshot,booking_snapshot,metadata
  ) SELECT
    '96310000-0000-4000-8000-000000000001','AUDIT963-PREVIEW-LINE-BASIS',
    'Audit963 Synthetic Customer','audit963.customer@example.com','+270000009633',
    'standard','Standard','2027-03-16','09:00',true,false,'assigned','assigned',
    0,360,'ZAR','pending','pay_later',
    '95610000-0000-4000-8000-000000000002','95610000-0000-4000-8000-000000000002',
    'pending',25200,25200,25200,25200,0,10800,25000,NULL,0,
    '{"v":1,"base_price":360,"total_price":360,"service_type":"standard"}'::jsonb,
    '{"service_slug":"standard","synthetic":true}'::jsonb,
    '{"audit_fixture":"AUDIT963-PREVIEW-LINE-BASIS","synthetic":true,"no_payment_execution":true}'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.bookings WHERE id='96310000-0000-4000-8000-000000000001');

  INSERT INTO public.booking_line_items (
    id,booking_id,item_type,name,quantity,unit_price_cents,total_price_cents,
    earns_cleaner,cleaner_earnings_cents,pricing_source,metadata
  ) SELECT '96310000-0000-4000-8000-000000000002',
    '96310000-0000-4000-8000-000000000001','base','Audit963 synthetic service',
    1,36000,36000,true,25000,'exact_source_lines_v1',
    '{"audit_fixture":"AUDIT963-PREVIEW-LINE-BASIS"}'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.booking_line_items WHERE id='96310000-0000-4000-8000-000000000002');

  -- Repeat ownership, pricing and no-link guards after all insert triggers.
  IF EXISTS (SELECT 1 FROM public.bookings
      WHERE (id='96310000-0000-4000-8000-000000000001'
          OR paystack_reference='AUDIT963-PREVIEW-LINE-BASIS')
        AND (id='96310000-0000-4000-8000-000000000001'
          AND paystack_reference='AUDIT963-PREVIEW-LINE-BASIS' AND is_test
          AND metadata->>'audit_fixture'='AUDIT963-PREVIEW-LINE-BASIS'
          AND metadata->>'synthetic'='true'
          AND customer_email='audit963.customer@example.com'
          AND customer_id IS NULL AND recurring_id IS NULL
          AND cleaner_id='95610000-0000-4000-8000-000000000002'
          AND payout_owner_cleaner_id='95610000-0000-4000-8000-000000000002'
          AND date='2027-03-16' AND status='assigned'
          AND earnings_policy='current_v1' AND NOT is_team_job
          AND amount_paid_cents=0 AND coalesce(total_paid_cents,0)=0
          AND payment_status='pending' AND payout_status='pending'
          AND monthly_invoice_id IS NULL AND zoho_invoice_id IS NULL
          AND payment_transaction_id IS NULL AND paid_at IS NULL
          AND payout_id IS NULL AND payout_run_id IS NULL
          AND payout_paid_at IS NULL AND payout_frozen_cents IS NULL
          AND display_earnings_cents=25200 AND cleaner_payout_cents=25200
          AND payout_earnings_cents=25200 AND cleaner_bonus_cents=0
          AND company_revenue_cents=10800
          AND internal_earnings_cents=25200 AND total_paid_zar=360
          AND service_slug='standard' AND currency='ZAR' AND billing_type='pay_later'
          AND base_amount_cents IS NULL AND service_fee_cents=0
          AND earnings_summary IS NULL AND cleaner_earnings_total_cents=25000
          AND cleaner_line_earnings_finalized_at IS NULL AND team_id IS NULL
          AND payment_completed_at IS NULL AND payment_reference_external IS NULL
          AND marked_paid_by_admin_id IS NULL AND coalesce(deposit_paid_cents,0)=0
          AND refunded_at IS NULL AND refund_status IS NULL
          AND price_snapshot='{"v":1,"base_price":360,"total_price":360,"service_type":"standard"}'::jsonb
        ) IS NOT TRUE) THEN
    RAISE EXCEPTION 'AUDIT963 booking collision or changed/linked fixture; no writes allowed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.booking_line_items
      WHERE (id='96310000-0000-4000-8000-000000000002'
          OR booking_id='96310000-0000-4000-8000-000000000001')
        AND (id='96310000-0000-4000-8000-000000000002'
          AND booking_id='96310000-0000-4000-8000-000000000001'
          AND item_type='base' AND name='Audit963 synthetic service'
          AND quantity=1 AND unit_price_cents=36000 AND total_price_cents=36000
          AND earns_cleaner AND cleaner_earnings_cents=25000
          AND metadata->>'audit_fixture'='AUDIT963-PREVIEW-LINE-BASIS') IS NOT TRUE) THEN
    RAISE EXCEPTION 'AUDIT963 line collision or changed fixture; no writes allowed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.booking_cleaners WHERE booking_id='96310000-0000-4000-8000-000000000001')
    OR EXISTS (SELECT 1 FROM public.cleaner_earnings WHERE booking_id='96310000-0000-4000-8000-000000000001')
    OR EXISTS (SELECT 1 FROM public.booking_roster_member_payouts WHERE booking_id='96310000-0000-4000-8000-000000000001')
    OR EXISTS (SELECT 1 FROM public.team_job_member_payouts WHERE booking_id='96310000-0000-4000-8000-000000000001')
    OR EXISTS (SELECT 1 FROM public.cleaner_earnings_adjustments WHERE booking_id='96310000-0000-4000-8000-000000000001')
    OR EXISTS (SELECT 1 FROM public.payment_transactions WHERE booking_id='96310000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'AUDIT963 unexpected participation or financial rows; no writes allowed';
  END IF;

  IF (SELECT count(*) FROM public.bookings
      WHERE id='96310000-0000-4000-8000-000000000001' AND is_test
        AND earnings_policy='current_v1' AND display_earnings_cents=25200
        AND payout_status='pending' AND payment_status='pending') <> 1
    OR (SELECT count(*) FROM public.booking_line_items
      WHERE booking_id='96310000-0000-4000-8000-000000000001'
        AND total_price_cents=36000 AND earns_cleaner) <> 1 THEN
    RAISE EXCEPTION 'AUDIT963 fixture postcondition failed';
  END IF;

  v_after := jsonb_build_object(
    'bookings',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by id),'')) from public.bookings t where id <> '96310000-0000-4000-8000-000000000001'),
    'lines',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by id),'')) from public.booking_line_items t where booking_id <> '96310000-0000-4000-8000-000000000001'),
    'cleaners',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.cleaners t),
    'booking_cleaners',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.booking_cleaners t),
    'cleaner_earnings',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.cleaner_earnings t),
    'booking_roster_member_payouts',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.booking_roster_member_payouts t),
    'team_job_member_payouts',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.team_job_member_payouts t),
    'cleaner_earnings_adjustments',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.cleaner_earnings_adjustments t),
    'booking_cleaner_earnings_snapshot',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.booking_cleaner_earnings_snapshot t),
    'booking_cleaner_earnings_snapshot_lines',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.booking_cleaner_earnings_snapshot_lines t),
    'monthly_invoices',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.monthly_invoices t),
    'payment_transactions',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.payment_transactions t),
    'cleaner_payouts',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.cleaner_payouts t),
    'cleaner_payout_runs',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.cleaner_payout_runs t),
    'cleaner_earnings_disbursements',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.cleaner_earnings_disbursements t),
    'payout_transfers',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.payout_transfers t),
    'payout_transfer_outbox',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.payout_transfer_outbox t),
    'earnings_disbursement_transfers',(select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.earnings_disbursement_transfers t)
  );
  IF v_before IS DISTINCT FROM v_after THEN
    RAISE EXCEPTION 'AUDIT963 unrelated booking, identity, line or financial evidence changed';
  END IF;
END;
$audit963$;

SELECT id,date,is_test,status,earnings_policy,display_earnings_cents,
  cleaner_payout_cents,payout_status,payment_status
FROM public.bookings WHERE id='96310000-0000-4000-8000-000000000001';

ROLLBACK;
