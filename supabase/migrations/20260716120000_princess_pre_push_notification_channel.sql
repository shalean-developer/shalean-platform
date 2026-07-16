-- Princess PR E (local-first): allow Expo push on notification audit + idempotency tables.
-- DO NOT apply to production without separate approval.
-- Staging apply requires explicit operator approval after local validation.

-- notification_logs: channel + provider for Expo push delivery audit
ALTER TABLE public.notification_logs
  DROP CONSTRAINT IF EXISTS notification_logs_channel_check;
ALTER TABLE public.notification_logs
  ADD CONSTRAINT notification_logs_channel_check
  CHECK (channel = ANY (ARRAY['email'::text, 'whatsapp'::text, 'sms'::text, 'push'::text]));

ALTER TABLE public.notification_logs
  DROP CONSTRAINT IF EXISTS notification_logs_provider_check;
ALTER TABLE public.notification_logs
  ADD CONSTRAINT notification_logs_provider_check
  CHECK (provider = ANY (ARRAY['resend'::text, 'twilio'::text, 'meta'::text, 'expo'::text]));

-- notification_idempotency_claims: dedupe push sends by (reference, event_type, channel)
ALTER TABLE public.notification_idempotency_claims
  DROP CONSTRAINT IF EXISTS notification_idempotency_claims_channel_check;
ALTER TABLE public.notification_idempotency_claims
  ADD CONSTRAINT notification_idempotency_claims_channel_check
  CHECK (channel = ANY (ARRAY['email'::text, 'sms'::text, 'in_app'::text, 'push'::text]));

COMMENT ON CONSTRAINT notification_logs_channel_check ON public.notification_logs IS
  'Outbound channels including Expo push (Princess PR E).';
