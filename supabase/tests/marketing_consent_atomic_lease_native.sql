-- Issue #1076: processing lease preservation.
-- DISPOSABLE POSTGRESQL TEST DATABASE ONLY.
BEGIN;

SELECT set_config('request.jwt.claim.role', 'service_role', true);

INSERT INTO public.user_profiles (id, role, billing_email)
VALUES (
  '00000000-0000-4000-8000-000000001077',
  'customer',
  'lease-1077@example.test'
);

DO $$
DECLARE
  v_outcome text;
  v_claim uuid := '00000000-0000-4000-8000-000000009999';
  v_lease timestamptz := now() + interval '5 minutes';
  v_job record;
BEGIN
  SELECT outcome INTO v_outcome
  FROM public.marketing_record_consent_decision_atomic(
    '00000000-0000-4000-8000-000000001077',
    'lease-1077@example.test',
    'withdrawn',
    'signed_one_click',
    'marketing-email-2026-11-v1',
    'synthetic-lease-token',
    false
  );

  IF v_outcome IS DISTINCT FROM 'new' THEN
    RAISE EXCEPTION 'Initial withdrawal failed';
  END IF;

  UPDATE public.marketing_email_reconciliation_jobs
  SET status = 'processing',
      claim_token = v_claim,
      lease_expires_at = v_lease
  WHERE customer_id = '00000000-0000-4000-8000-000000001077';

  SELECT outcome INTO v_outcome
  FROM public.marketing_record_consent_decision_atomic(
    '00000000-0000-4000-8000-000000001077',
    'lease-1077@example.test',
    'withdrawn',
    'signed_one_click',
    'marketing-email-2026-11-v1',
    'synthetic-lease-token',
    false
  );

  SELECT status, claim_token, lease_expires_at
  INTO v_job
  FROM public.marketing_email_reconciliation_jobs
  WHERE customer_id = '00000000-0000-4000-8000-000000001077';

  IF v_outcome IS DISTINCT FROM 'replay_completed'
     OR v_job.status IS DISTINCT FROM 'processing'
     OR v_job.claim_token IS DISTINCT FROM v_claim
     OR v_job.lease_expires_at IS DISTINCT FROM v_lease THEN
    RAISE EXCEPTION 'Replay modified active worker lease';
  END IF;
END;
$$;

ROLLBACK;

SELECT 'PASS: active processing lease preserved' AS result;
