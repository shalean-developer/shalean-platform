-- Structured dimensions for filtering and analytics (Stripe-style delivery audit).

ALTER TABLE public.notification_logs ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE public.notification_logs ADD COLUMN IF NOT EXISTS event_type TEXT;

CREATE INDEX IF NOT EXISTS notification_logs_role_created_idx ON public.notification_logs (role, created_at DESC);
CREATE INDEX IF NOT EXISTS notification_logs_event_type_created_idx ON public.notification_logs (event_type, created_at DESC);

COMMENT ON COLUMN public.notification_logs.role IS 'customer | cleaner | admin';
COMMENT ON COLUMN public.notification_logs.event_type IS 'Lifecycle / product step, e.g. payment_confirmed, assigned, reminder_2h, template_test_send';
