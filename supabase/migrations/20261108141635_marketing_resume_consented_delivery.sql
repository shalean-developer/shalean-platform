-- Apply only after staging approval. No provider writes or evidence edits.
CREATE OR REPLACE FUNCTION public.marketing_resume_consented_delivery_atomic(
  p_customer_id uuid, p_email text, p_generation integer, p_evidence_reference text
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_profile public.user_profiles%ROWTYPE;
  v_consent public.marketing_email_consent_events%ROWTYPE;
  v_job public.marketing_email_reconciliation_jobs%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'marketing resume not authorized' USING ERRCODE='42501';
  END IF;
  IF p_customer_id IS NULL OR p_email IS NULL OR p_email <> lower(btrim(p_email))
      OR p_generation IS NULL OR p_generation < 1
      OR p_evidence_reference IS NULL OR btrim(p_evidence_reference) = '' THEN
    RETURN false;
  END IF;
  -- Same lock as grants, signed withdrawals and provider withdrawals.
  SELECT * INTO v_profile FROM public.user_profiles WHERE id=p_customer_id FOR UPDATE;
  IF NOT FOUND OR v_profile.role IS DISTINCT FROM 'customer'
      OR lower(btrim(v_profile.billing_email)) IS DISTINCT FROM p_email
      OR v_profile.marketing_consent_generation IS DISTINCT FROM p_generation THEN
    RETURN false;
  END IF;
  SELECT * INTO v_consent FROM public.marketing_email_consent_events
    WHERE customer_id=p_customer_id AND email=p_email AND purpose='promotional_email'
    ORDER BY occurred_at DESC,created_at DESC,id DESC LIMIT 1;
  IF NOT FOUND OR v_consent.decision IS DISTINCT FROM 'granted'
      OR v_consent.source IS DISTINCT FROM 'authenticated_preferences'
      OR v_consent.evidence_reference IS DISTINCT FROM p_evidence_reference
      OR (v_profile.marketing_emails_unsubscribed_at IS NOT NULL
          AND v_consent.occurred_at <= v_profile.marketing_emails_unsubscribed_at)
      OR EXISTS (SELECT 1 FROM public.email_suppressions WHERE email=p_email) THEN
    RETURN false;
  END IF;
  -- Serialize against worker claims. Even expired in-flight work stays paused
  -- because the provider outcome may still be unknown.
  SELECT * INTO v_job FROM public.marketing_email_reconciliation_jobs
    WHERE customer_id=p_customer_id AND email=p_email AND action='unsubscribe' FOR UPDATE;
  IF FOUND THEN
    IF v_job.status = 'processing' OR (v_job.updated_at > v_consent.occurred_at
        AND v_job.last_error IS DISTINCT FROM 'superseded_by_explicit_consent:' || v_consent.id::text) THEN
      RETURN false;
    END IF;
    IF v_job.status = 'pending' THEN
      UPDATE public.marketing_email_reconciliation_jobs SET status='completed',
        last_error='superseded_by_explicit_consent:' || v_consent.id::text,
        claim_token=NULL,lease_expires_at=NULL,updated_at=clock_timestamp()
        WHERE id=v_job.id;
    END IF;
  END IF;
  UPDATE public.user_profiles SET marketing_emails_unsubscribed_at=NULL WHERE id=p_customer_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.marketing_resume_consented_delivery_atomic(uuid,text,integer,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_resume_consented_delivery_atomic(uuid,text,integer,text)
  TO service_role;
