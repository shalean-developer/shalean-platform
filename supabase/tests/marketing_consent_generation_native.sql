-- Disposable database only: generation revocation, identity and atomic rollback.
BEGIN;
SELECT set_config('request.jwt.claim.role','service_role',true);
INSERT INTO public.user_profiles(id,role,billing_email)
VALUES ('00000000-0000-4000-8000-000000001082','customer','generation@example.test');
DO $$
DECLARE
  u uuid := '00000000-0000-4000-8000-000000001082';
  email text := 'generation@example.test';
  result text;
  before_events integer;
BEGIN
  SELECT outcome INTO result FROM public.marketing_record_consent_decision_atomic(u,email,'withdrawn','signed_one_click','v1','legacy-token',false);
  IF result IS DISTINCT FROM 'legacy_confirmation_required' THEN RAISE EXCEPTION 'Legacy token mutated consent'; END IF;
  PERFORM * FROM public.marketing_record_consent_decision_atomic(u,email,'granted','authenticated_preferences','v1','first-grant',true);
  IF (SELECT marketing_consent_generation FROM public.user_profiles WHERE id=u) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Explicit grant did not advance generation';
  END IF;
  SELECT count(*) INTO before_events FROM public.marketing_email_consent_events WHERE customer_id=u;
  SELECT outcome INTO result FROM public.marketing_record_consent_decision_atomic(u,email,'withdrawn','signed_one_click','v1','previously-unused-token',false,0);
  IF result IS DISTINCT FROM 'superseded'
     OR (SELECT count(*) FROM public.marketing_email_consent_events WHERE customer_id=u) <> before_events
     OR EXISTS(SELECT 1 FROM public.marketing_email_reconciliation_jobs WHERE customer_id=u)
     OR (SELECT marketing_emails_unsubscribed_at FROM public.user_profiles WHERE id=u) IS NOT NULL THEN
    RAISE EXCEPTION 'Unused stale token changed consent/profile/queue';
  END IF;
  BEGIN
    PERFORM * FROM public.marketing_record_consent_decision_atomic(u,'other@example.test','withdrawn','signed_one_click','v1','wrong-identity',false,1);
    RAISE EXCEPTION 'Wrong identity accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  SELECT outcome INTO result FROM public.marketing_record_consent_decision_atomic(u,email,'withdrawn','signed_one_click','v1','current-token',false,1);
  IF result IS DISTINCT FROM 'new' THEN RAISE EXCEPTION 'Current generation withdrawal failed'; END IF;
  UPDATE public.marketing_email_reconciliation_jobs SET status='completed' WHERE customer_id=u;
  SELECT outcome INTO result FROM public.marketing_record_consent_decision_atomic(u,email,'withdrawn','signed_one_click','v1','current-token',false,1);
  IF result IS DISTINCT FROM 'replay_completed' THEN RAISE EXCEPTION 'Current token replay not idempotent'; END IF;
  PERFORM * FROM public.marketing_record_consent_decision_atomic(u,email,'granted','authenticated_preferences','v1','second-grant',true);
  SELECT count(*) INTO before_events FROM public.marketing_email_consent_events WHERE customer_id=u;
  SELECT outcome INTO result FROM public.marketing_record_consent_decision_atomic(u,email,'withdrawn','signed_one_click','v1','another-unused-generation-one-token',false,1);
  IF result IS DISTINCT FROM 'superseded'
     OR (SELECT marketing_consent_generation FROM public.user_profiles WHERE id=u) IS DISTINCT FROM 2
     OR (SELECT count(*) FROM public.marketing_email_consent_events WHERE customer_id=u) <> before_events
     OR (SELECT status FROM public.marketing_email_reconciliation_jobs WHERE customer_id=u) IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Second grant did not revoke unused prior-generation tokens';
  END IF;
  -- Fault injection proves generation and ledger updates roll back with queue failure.
  ALTER TABLE public.marketing_email_enrollment_jobs ADD CONSTRAINT synthetic_generation_queue_failure CHECK(email <> 'generation@example.test') NOT VALID;
  BEGIN
    PERFORM * FROM public.marketing_record_consent_decision_atomic(u,email,'granted','authenticated_preferences','v1','failed-grant',true);
    RAISE EXCEPTION 'Injected queue failure did not fire';
  EXCEPTION WHEN check_violation THEN NULL; END;
  ALTER TABLE public.marketing_email_enrollment_jobs DROP CONSTRAINT synthetic_generation_queue_failure;
  IF (SELECT marketing_consent_generation FROM public.user_profiles WHERE id=u) IS DISTINCT FROM 2
     OR (SELECT count(*) FROM public.marketing_email_consent_events WHERE customer_id=u) <> before_events THEN
    RAISE EXCEPTION 'Failed grant leaked generation/evidence';
  END IF;
END;
$$;
SET LOCAL ROLE service_role;
DO $$
DECLARE result text;
BEGIN
  SELECT outcome INTO result FROM public.marketing_record_consent_decision_atomic(
    '00000000-0000-4000-8000-000000001082','generation@example.test',
    'withdrawn','signed_one_click','v1','actual-service-role-token',false,2);
  IF result IS DISTINCT FROM 'new' THEN RAISE EXCEPTION 'Actual service-role execution failed'; END IF;
END;
$$;
RESET ROLE;
-- Even if a customer has normal profile UPDATE grants, generation is server-managed.
GRANT SELECT, UPDATE ON public.user_profiles TO authenticated;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    UPDATE public.user_profiles SET marketing_consent_generation=0
      WHERE id='00000000-0000-4000-8000-000000001082';
    RAISE EXCEPTION 'Customer reset server generation';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: unused stale-token revocation, generation ownership and atomic rollback' AS result;
