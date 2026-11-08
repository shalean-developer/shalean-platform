-- Disposable synthetic database only. Everything rolls back.
BEGIN;
CREATE TABLE IF NOT EXISTS public.email_suppressions(email text PRIMARY KEY);
SELECT set_config('request.jwt.claim.role','service_role',true);
INSERT INTO public.user_profiles(id,role,billing_email)
VALUES ('00000000-0000-4000-8000-000000001109','customer','resume@example.test');
DO $$
DECLARE
  u uuid := '00000000-0000-4000-8000-000000001109';
  e text := 'resume@example.test';
  n integer;
  result text;
BEGIN
  PERFORM * FROM public.marketing_record_consent_decision_atomic(u,e,'granted','authenticated_preferences','v1','first',true);
  PERFORM * FROM public.marketing_record_consent_decision_atomic(u,e,'withdrawn','signed_one_click','v1','token-one',false,1);
  IF public.marketing_resume_consented_delivery_atomic(u,e,1,'first') THEN RAISE EXCEPTION 'Withdrawal was ignored'; END IF;
  PERFORM * FROM public.marketing_record_consent_decision_atomic(u,e,'granted','authenticated_preferences','v1','second',true);
  IF public.marketing_resume_consented_delivery_atomic(u,e,1,'first')
      OR public.marketing_resume_consented_delivery_atomic(u,'wrong@example.test',2,'second')
      OR public.marketing_resume_consented_delivery_atomic(u,e,2,'wrong') THEN
    RAISE EXCEPTION 'Stale generation/identity/evidence resumed';
  END IF;
  INSERT INTO public.email_suppressions(email) VALUES(e);
  IF public.marketing_resume_consented_delivery_atomic(u,e,2,'second') THEN RAISE EXCEPTION 'Suppression lifted'; END IF;
  DELETE FROM public.email_suppressions WHERE email=e;
  UPDATE public.marketing_email_reconciliation_jobs SET status='processing',claim_token=gen_random_uuid(),
    lease_expires_at=clock_timestamp()-interval '1 minute' WHERE customer_id=u;
  IF public.marketing_resume_consented_delivery_atomic(u,e,2,'second') THEN RAISE EXCEPTION 'Expired in-flight job overridden'; END IF;
  UPDATE public.marketing_email_reconciliation_jobs SET status='pending',claim_token=NULL,lease_expires_at=NULL WHERE customer_id=u;
  -- Roll back both the queue fence and hold clearing if the profile update fails.
  ALTER TABLE public.user_profiles ADD CONSTRAINT synthetic_resume_failure
    CHECK(id <> '00000000-0000-4000-8000-000000001109' OR marketing_emails_unsubscribed_at IS NOT NULL) NOT VALID;
  BEGIN
    PERFORM public.marketing_resume_consented_delivery_atomic(u,e,2,'second');
    RAISE EXCEPTION 'Injected update failure did not fire';
  EXCEPTION WHEN check_violation THEN NULL; END;
  ALTER TABLE public.user_profiles DROP CONSTRAINT synthetic_resume_failure;
  IF (SELECT status FROM public.marketing_email_reconciliation_jobs WHERE customer_id=u) <> 'pending' THEN
    RAISE EXCEPTION 'Failed resume leaked queue mutation';
  END IF;
  SELECT count(*) INTO n FROM public.marketing_email_consent_events WHERE customer_id=u;
  IF NOT public.marketing_resume_consented_delivery_atomic(u,e,2,'second') THEN RAISE EXCEPTION 'Fresh grant did not resume'; END IF;
  IF (SELECT marketing_emails_unsubscribed_at FROM public.user_profiles WHERE id=u) IS NOT NULL
      OR (SELECT status FROM public.marketing_email_reconciliation_jobs WHERE customer_id=u) <> 'completed'
      OR (SELECT last_error FROM public.marketing_email_reconciliation_jobs WHERE customer_id=u) NOT LIKE 'superseded_by_explicit_consent:%'
      OR (SELECT count(*) FROM public.marketing_email_consent_events WHERE customer_id=u) <> n THEN
    RAISE EXCEPTION 'Resume failed or changed evidence';
  END IF;
  IF NOT public.marketing_resume_consented_delivery_atomic(u,e,2,'second') THEN RAISE EXCEPTION 'Resume not idempotent'; END IF;
  -- A stale queued worker's compare-and-claim must return no row after resume.
  UPDATE public.marketing_email_reconciliation_jobs SET status='processing' WHERE customer_id=u AND status='pending';
  IF FOUND THEN RAISE EXCEPTION 'Superseded unsubscribe remained claimable'; END IF;
  SELECT outcome INTO result FROM public.marketing_record_consent_decision_atomic(u,e,'withdrawn','signed_one_click','v1','old-unused-token',false,1);
  IF result <> 'superseded' THEN RAISE EXCEPTION 'Old token undid resume'; END IF;
  PERFORM * FROM public.marketing_record_consent_decision_atomic(u,e,'withdrawn','signed_one_click','v1','new-token',false,2);
  IF public.marketing_resume_consented_delivery_atomic(u,e,2,'second')
      OR (SELECT status FROM public.marketing_email_reconciliation_jobs WHERE customer_id=u) <> 'pending' THEN
    RAISE EXCEPTION 'Later withdrawal did not win';
  END IF;
END;
$$;
DO $$
BEGIN
  IF has_function_privilege('anon','public.marketing_resume_consented_delivery_atomic(uuid,text,integer,text)','EXECUTE')
      OR has_function_privilege('authenticated','public.marketing_resume_consented_delivery_atomic(uuid,text,integer,text)','EXECUTE')
      OR NOT has_function_privilege('service_role','public.marketing_resume_consented_delivery_atomic(uuid,text,integer,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Resume RPC grants unsafe';
  END IF;
END;
$$;
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$ BEGIN
  BEGIN
    PERFORM public.marketing_resume_consented_delivery_atomic('00000000-0000-4000-8000-000000001109','resume@example.test',2,'second');
    RAISE EXCEPTION 'Role guard failed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
ROLLBACK;
SELECT 'PASS: resume identity, evidence, generation, suppression, lease, rollback, replay and later-withdrawal fences' AS result;
