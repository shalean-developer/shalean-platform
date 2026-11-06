-- DISPOSABLE DATABASE ONLY. Never execute this test file on hosted Supabase.
BEGIN;
SELECT set_config('request.jwt.claim.role','service_role',true);
INSERT INTO public.user_profiles(id,role,billing_email)
VALUES('00000000-0000-4000-8000-000000001099','customer','provider-1099@example.test');
DO $$
DECLARE u uuid := '00000000-0000-4000-8000-000000001099'; email text := 'provider-1099@example.test'; r text; before_stamp timestamptz;
BEGIN
  SELECT outcome INTO r FROM public.marketing_record_provider_withdrawal_atomic(u,email,'provider-event-1','v1');
  IF r IS DISTINCT FROM 'new' THEN RAISE EXCEPTION 'Initial provider withdrawal failed'; END IF;
  SELECT marketing_emails_unsubscribed_at INTO before_stamp FROM public.user_profiles WHERE id=u;
  PERFORM * FROM public.marketing_record_provider_withdrawal_atomic(u,email,'provider-event-1','v1');
  IF (SELECT count(*) FROM public.marketing_email_consent_events WHERE customer_id=u)<>1
    OR (SELECT marketing_emails_unsubscribed_at FROM public.user_profiles WHERE id=u) IS DISTINCT FROM before_stamp THEN
    RAISE EXCEPTION 'Provider replay refreshed timestamp/evidence'; END IF;
  IF EXISTS(SELECT 1 FROM public.marketing_email_reconciliation_jobs WHERE customer_id=u) THEN
    RAISE EXCEPTION 'Provider withdrawal queued provider writes'; END IF;
  UPDATE public.user_profiles SET marketing_emails_unsubscribed_at=NULL WHERE id=u;
  PERFORM * FROM public.marketing_record_provider_withdrawal_atomic(u,email,'provider-event-1','v1');
  IF (SELECT marketing_emails_unsubscribed_at FROM public.user_profiles WHERE id=u) IS NULL THEN
    RAISE EXCEPTION 'Partial provider projection was not recovered'; END IF;
  PERFORM * FROM public.marketing_record_consent_decision_atomic(u,email,'granted','authenticated_preferences','v1','later-grant',true);
  UPDATE public.user_profiles SET marketing_emails_unsubscribed_at=NULL WHERE id=u;
  SELECT outcome INTO r FROM public.marketing_record_provider_withdrawal_atomic(u,email,'provider-event-1','v1');
  IF r IS DISTINCT FROM 'superseded' OR (SELECT marketing_emails_unsubscribed_at FROM public.user_profiles WHERE id=u) IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate old provider event overrode newer grant'; END IF;
  -- A profile write failure must roll back the new provider evidence too.
  ALTER TABLE public.user_profiles ADD CONSTRAINT synthetic_provider_failure CHECK(id<>'00000000-0000-4000-8000-000000001099'::uuid OR marketing_emails_unsubscribed_at IS NULL) NOT VALID;
  BEGIN
    PERFORM * FROM public.marketing_record_provider_withdrawal_atomic(u,email,'provider-event-failure','v1');
    RAISE EXCEPTION 'Expected projection fault did not happen';
  EXCEPTION WHEN check_violation THEN NULL; END;
  ALTER TABLE public.user_profiles DROP CONSTRAINT synthetic_provider_failure;
  IF EXISTS(SELECT 1 FROM public.marketing_email_consent_events WHERE customer_id=u AND evidence_reference='provider-event-failure') THEN
    RAISE EXCEPTION 'Provider evidence leaked from failed transaction'; END IF;
  IF has_function_privilege('anon','public.marketing_record_provider_withdrawal_atomic(uuid,text,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.marketing_record_provider_withdrawal_atomic(uuid,text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Provider RPC exposed to client roles'; END IF;
END;
$$;
SET LOCAL ROLE service_role;
SELECT * FROM public.marketing_record_provider_withdrawal_atomic(
  '00000000-0000-4000-8000-000000001099','provider-1099@example.test','actual-service-provider-event','v1');
RESET ROLE;
ROLLBACK;
SELECT 'PASS: provider withdrawal replay, recovery, stale replay, rollback and actual service-role permissions' AS result;
