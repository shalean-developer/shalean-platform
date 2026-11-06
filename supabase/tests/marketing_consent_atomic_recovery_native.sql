-- Issue #1076: partial withdrawal recovery.
-- DISPOSABLE PostgreSQL 17 TEST DATABASE ONLY.
BEGIN;

SELECT set_config('request.jwt.claim.role', 'service_role', true);

INSERT INTO public.user_profiles (id, role, billing_email)
VALUES (
  '00000000-0000-4000-8000-000000001078',
  'customer',
  'recovery-1078@example.test'
);

-- Simulate previously recorded evidence with incomplete downstream state.
INSERT INTO public.marketing_email_consent_events (
  customer_id, email, purpose, decision, source,
  policy_version, evidence_reference
)
VALUES (
  '00000000-0000-4000-8000-000000001078',
  'recovery-1078@example.test',
  'promotional_email',
  'withdrawn',
  'signed_one_click',
  'marketing-email-2026-11-v1',
  'synthetic-recovery-token'
);

DO $$
DECLARE
  v_outcome text;
  v_count integer;
  v_timestamp timestamptz;
  v_job_status text;
BEGIN
  SELECT outcome INTO v_outcome
  FROM public.marketing_record_consent_decision_atomic(
    '00000000-0000-4000-8000-000000001078',
    'recovery-1078@example.test',
    'withdrawn',
    'signed_one_click',
    'marketing-email-2026-11-v1',
    'synthetic-recovery-token',
    false
  );

  IF v_outcome IS DISTINCT FROM 'retry_required' THEN
    RAISE EXCEPTION 'Recovery outcome incorrect: %', v_outcome;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.marketing_email_consent_events
  WHERE customer_id = '00000000-0000-4000-8000-000000001078';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Recovery duplicated consent evidence';
  END IF;

  SELECT marketing_emails_unsubscribed_at INTO v_timestamp
  FROM public.user_profiles
  WHERE id = '00000000-0000-4000-8000-000000001078';

  IF v_timestamp IS NULL THEN
    RAISE EXCEPTION 'Recovery did not update CRM unsubscribe state';
  END IF;

  SELECT status INTO v_job_status
  FROM public.marketing_email_reconciliation_jobs
  WHERE customer_id = '00000000-0000-4000-8000-000000001078';

  IF v_job_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Recovery did not create pending job';
  END IF;
END;
$$;

ROLLBACK;

SELECT 'PASS: incomplete withdrawal recovered' AS result;
