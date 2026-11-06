-- Issue #1076: native PostgreSQL replay acceptance.
-- DISPOSABLE TEST DATABASE ONLY. Never run in Supabase staging/production.
BEGIN;

SELECT set_config('request.jwt.claim.role', 'service_role', true);

INSERT INTO public.user_profiles (
  id, role, billing_email
)
VALUES (
  '00000000-0000-4000-8000-000000001076',
  'customer',
  'replay-1076@example.test'
);

DO $$
DECLARE
  v_outcome text;
  v_count integer;
  v_status text;
BEGIN
  SELECT outcome INTO v_outcome
  FROM public.marketing_record_consent_decision_atomic(
    '00000000-0000-4000-8000-000000001076',
    'replay-1076@example.test',
    'withdrawn',
    'signed_one_click',
    'marketing-email-2026-11-v1',
    'synthetic-token-1076',
    false
  );

  IF v_outcome IS DISTINCT FROM 'new' THEN
    RAISE EXCEPTION 'Initial withdrawal failed: %', v_outcome;
  END IF;

  UPDATE public.marketing_email_reconciliation_jobs
  SET status = 'completed'
  WHERE customer_id = '00000000-0000-4000-8000-000000001076';

  SELECT outcome INTO v_outcome
  FROM public.marketing_record_consent_decision_atomic(
    '00000000-0000-4000-8000-000000001076',
    'replay-1076@example.test',
    'withdrawn',
    'signed_one_click',
    'marketing-email-2026-11-v1',
    'synthetic-token-1076',
    false
  );

  IF v_outcome IS DISTINCT FROM 'replay_completed' THEN
    RAISE EXCEPTION 'Replay outcome incorrect: %', v_outcome;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.marketing_email_consent_events
  WHERE customer_id = '00000000-0000-4000-8000-000000001076';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Duplicate consent audit events: %', v_count;
  END IF;

  SELECT status INTO v_status
  FROM public.marketing_email_reconciliation_jobs
  WHERE customer_id = '00000000-0000-4000-8000-000000001076';

  IF v_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Replay reset completed job: %', v_status;
  END IF;

  -- A later explicit grant supersedes an already-used signed token.
  PERFORM * FROM public.marketing_record_consent_decision_atomic(
    '00000000-0000-4000-8000-000000001076','replay-1076@example.test',
    'granted','authenticated_preferences','marketing-email-2026-11-v1','grant-after-token',true);
  SELECT outcome INTO v_outcome FROM public.marketing_record_consent_decision_atomic(
    '00000000-0000-4000-8000-000000001076','replay-1076@example.test',
    'withdrawn','signed_one_click','marketing-email-2026-11-v1','synthetic-token-1076',false);
  IF v_outcome IS DISTINCT FROM 'superseded' THEN
    RAISE EXCEPTION 'Used token replay overrode newer grant: %',v_outcome;
  END IF;
  IF (SELECT status FROM public.marketing_email_reconciliation_jobs
      WHERE customer_id='00000000-0000-4000-8000-000000001076') IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Superseded replay reset completed job';
  END IF;
  -- A fresh authenticated withdrawal must requeue, unlike an old-token replay.
  SELECT outcome INTO v_outcome FROM public.marketing_record_consent_decision_atomic(
    '00000000-0000-4000-8000-000000001076','replay-1076@example.test',
    'withdrawn','authenticated_preferences','marketing-email-2026-11-v1','fresh-authenticated-withdrawal',false);
  IF v_outcome IS DISTINCT FROM 'new' OR
      (SELECT status FROM public.marketing_email_reconciliation_jobs
       WHERE customer_id='00000000-0000-4000-8000-000000001076') IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Fresh authenticated withdrawal did not requeue completed job';
  END IF;
END;
$$;

ROLLBACK;

SELECT 'PASS: completed unsubscribe replay preserved' AS result;
