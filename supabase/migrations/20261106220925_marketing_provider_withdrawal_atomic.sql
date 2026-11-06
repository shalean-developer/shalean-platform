-- #1076: signed provider withdrawals share the customer lock with interactive decisions.
CREATE OR REPLACE FUNCTION public.marketing_record_provider_withdrawal_atomic(
  p_customer_id uuid, p_email text, p_evidence_reference text, p_policy_version text
) RETURNS TABLE(outcome text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_profile public.user_profiles%ROWTYPE;
  v_inserted uuid;
  v_latest text;
  v_now timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'marketing provider operation not authorized' USING ERRCODE='42501';
  END IF;
  IF p_customer_id IS NULL OR p_email IS NULL OR p_email <> lower(btrim(p_email)) OR length(p_email)=0
    OR p_evidence_reference IS NULL OR length(btrim(p_evidence_reference))=0
    OR p_policy_version IS NULL OR length(btrim(p_policy_version))=0 THEN
    RAISE EXCEPTION 'invalid provider withdrawal' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_profile FROM public.user_profiles WHERE id=p_customer_id FOR UPDATE;
  IF NOT FOUND OR v_profile.role IS DISTINCT FROM 'customer'
    OR lower(btrim(v_profile.billing_email)) IS DISTINCT FROM p_email THEN
    RAISE EXCEPTION 'customer identity unverified' USING ERRCODE='42501';
  END IF;
  v_now := clock_timestamp();
  INSERT INTO public.marketing_email_consent_events(
    customer_id,email,purpose,decision,source,policy_version,evidence_reference,occurred_at,created_at
  ) VALUES(p_customer_id,p_email,'promotional_email','withdrawn','resend_contact_webhook',
    p_policy_version,p_evidence_reference,v_now,v_now)
  ON CONFLICT(customer_id,source,evidence_reference)
    WHERE source IN ('resend_contact_webhook','signed_one_click') DO NOTHING
  RETURNING id INTO v_inserted;
  IF v_inserted IS NULL THEN
    SELECT decision INTO v_latest FROM public.marketing_email_consent_events
      WHERE customer_id=p_customer_id AND email=p_email AND purpose='promotional_email'
      ORDER BY occurred_at DESC,created_at DESC,id DESC LIMIT 1;
    IF v_latest IS DISTINCT FROM 'withdrawn' THEN
      RETURN QUERY SELECT 'superseded'::text; RETURN;
    END IF;
  END IF;
  -- Preserve timestamps on replay; recover a missing profile projection atomically.
  IF v_profile.marketing_emails_unsubscribed_at IS NULL THEN
    UPDATE public.user_profiles SET marketing_emails_unsubscribed_at=v_now WHERE id=p_customer_id;
  END IF;
  -- Provider already withdrew the contact. No outbound/provider reconciliation write.
  RETURN QUERY SELECT CASE WHEN v_inserted IS NULL THEN 'replay_completed' ELSE 'new' END::text;
END;
$$;
REVOKE ALL ON FUNCTION public.marketing_record_provider_withdrawal_atomic(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_record_provider_withdrawal_atomic(uuid,text,text,text) TO service_role;
