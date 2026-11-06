-- SOURCE ONLY. Do not apply without owner approval and native PostgreSQL verification.
-- All customer consent decisions use one customer-row lock and a single transaction.
-- Requires 20261104210000_marketing_email_consent_ledger.sql.
CREATE OR REPLACE FUNCTION public.marketing_record_consent_decision_atomic(
  p_customer_id uuid,
  p_email text,
  p_decision text,
  p_source text,
  p_policy_version text,
  p_evidence_reference text,
  p_explicit_opt_in boolean DEFAULT false
)
RETURNS TABLE (outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.user_profiles%ROWTYPE;
  v_email text;
  v_inserted uuid;
  v_latest_decision text;
  v_job_status text;
  v_job_id uuid;
  v_recovered boolean := false;
  v_now timestamptz;
BEGIN
  -- SECURITY DEFINER must not expose service-role writes to anon/authenticated.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'marketing consent operation not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_customer_id IS NULL OR p_email IS NULL OR p_email <> lower(btrim(p_email))
      OR length(p_email) = 0 OR p_evidence_reference IS NULL
      OR length(btrim(p_evidence_reference)) = 0
      OR p_policy_version IS NULL OR length(btrim(p_policy_version)) = 0
      OR p_source IS NULL OR p_source NOT IN ('authenticated_preferences','signed_one_click')
      OR p_decision IS NULL OR p_decision NOT IN ('granted','withdrawn')
      OR (p_decision = 'granted' AND (p_source <> 'authenticated_preferences' OR p_explicit_opt_in IS NOT TRUE))
      OR (p_source = 'signed_one_click' AND p_decision <> 'withdrawn') THEN
    RAISE EXCEPTION 'invalid marketing consent request' USING ERRCODE = '22023';
  END IF;

  -- Serialize both grants and withdrawals for this customer, not only replays.
  SELECT * INTO v_profile FROM public.user_profiles
    WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND OR v_profile.role IS DISTINCT FROM 'customer'
      OR lower(btrim(v_profile.billing_email)) IS DISTINCT FROM p_email THEN
    RAISE EXCEPTION 'customer identity unverified' USING ERRCODE = '42501';
  END IF;
  v_email := p_email;
  v_now := clock_timestamp();

  IF p_source = 'signed_one_click' THEN
    -- The partial unique index is the only ON CONFLICT arbiter. Other unique
    -- violations are not swallowed and fail the transaction closed.
    INSERT INTO public.marketing_email_consent_events (
      customer_id,email,purpose,decision,source,policy_version,
      evidence_reference,occurred_at,created_at
    ) VALUES (p_customer_id,v_email,'promotional_email','withdrawn',p_source,
              p_policy_version,p_evidence_reference,v_now,v_now)
    ON CONFLICT (customer_id,source,evidence_reference)
      WHERE source IN ('resend_contact_webhook','signed_one_click')
      DO NOTHING
    RETURNING id INTO v_inserted;
  ELSE
    INSERT INTO public.marketing_email_consent_events (
      customer_id,email,purpose,decision,source,policy_version,
      evidence_reference,occurred_at,created_at
    ) VALUES (p_customer_id,v_email,'promotional_email',p_decision,p_source,
              p_policy_version,p_evidence_reference,v_now,v_now)
    RETURNING id INTO v_inserted;
  END IF;

  -- On duplicate, an intervening grant MUST win. Preserve existing consent.
  IF p_source = 'signed_one_click' AND v_inserted IS NULL THEN
    SELECT decision INTO v_latest_decision
      FROM public.marketing_email_consent_events
      WHERE customer_id=p_customer_id AND email=v_email
        AND purpose='promotional_email'
      ORDER BY occurred_at DESC,created_at DESC,id DESC LIMIT 1;
    IF v_latest_decision IS DISTINCT FROM 'withdrawn' THEN
      RETURN QUERY SELECT 'superseded'::text; RETURN;
    END IF;
  END IF;

  IF p_decision = 'granted' THEN
    -- Grants do NOT clear the CRM opt-out as part of consent recording. The
    -- existing send gate continues to fail closed until explicit reconciliation.
    INSERT INTO public.marketing_email_enrollment_jobs (
      customer_id,email,status,attempt_count,last_error,claim_token,
      lease_expires_at,next_attempt_at,updated_at
    ) VALUES (p_customer_id,v_email,'pending',0,NULL,NULL,NULL,v_now,v_now)
    ON CONFLICT (customer_id,email) DO UPDATE SET
      status='pending',attempt_count=0,last_error=NULL,
      claim_token=NULL,lease_expires_at=NULL,
      next_attempt_at=EXCLUDED.next_attempt_at,updated_at=EXCLUDED.updated_at
      WHERE public.marketing_email_enrollment_jobs.status <> 'processing';
    RETURN QUERY SELECT 'retry_required'::text; RETURN;
  END IF;

  -- Only set profile unsubscribe timestamp if missing. Never refresh it on replay.
  IF v_profile.marketing_emails_unsubscribed_at IS NULL THEN
    UPDATE public.user_profiles
      SET marketing_emails_unsubscribed_at=v_now
      WHERE id=p_customer_id;
    v_recovered := true;
  END IF;

  -- Existing queue rows MUST NOT be reset; particularly completed and
  -- processing rows with active claim tokens and leases.
  SELECT id,status INTO v_job_id,v_job_status
    FROM public.marketing_email_reconciliation_jobs
    WHERE customer_id=p_customer_id AND email=v_email AND action='unsubscribe'
    FOR UPDATE;
  IF v_job_id IS NULL THEN
    INSERT INTO public.marketing_email_reconciliation_jobs (
      customer_id,email,action,status,next_attempt_at,updated_at
    ) VALUES (p_customer_id,v_email,'unsubscribe','pending',v_now,v_now);
    v_recovered := true;
  ELSIF v_inserted IS NOT NULL AND v_job_status = 'completed' THEN
    -- A genuinely new withdrawal after a later explicit grant needs new
    -- provider reconciliation. Never do this for a replay.
    UPDATE public.marketing_email_reconciliation_jobs SET
      status='pending',attempt_count=0,last_error=NULL,
      claim_token=NULL,lease_expires_at=NULL,
      next_attempt_at=v_now,updated_at=v_now
      WHERE id=v_job_id;
  END IF;

  IF v_inserted IS NULL THEN
    RETURN QUERY SELECT CASE WHEN v_recovered THEN 'retry_required' ELSE 'replay_completed' END::text;
  ELSE
    RETURN QUERY SELECT 'new'::text;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.marketing_record_consent_decision_atomic(uuid,text,text,text,text,text,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_record_consent_decision_atomic(uuid,text,text,text,text,text,boolean)
  TO service_role;
