-- Per-recipient notification delivery audit (booking-scoped where applicable).

CREATE TABLE IF NOT EXISTS public.notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'sms')),
  template_key TEXT NOT NULL,
  recipient TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error TEXT,
  provider TEXT NOT NULL CHECK (provider IN ('resend', 'twilio', 'meta')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_logs_created_at_idx ON public.notification_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS notification_logs_booking_id_idx ON public.notification_logs (booking_id)
  WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notification_logs_channel_status_idx ON public.notification_logs (channel, status);
CREATE INDEX IF NOT EXISTS notification_logs_template_key_idx ON public.notification_logs (template_key);

COMMENT ON TABLE public.notification_logs IS 'Outbound notification audit; written from Next.js via service role.';

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
