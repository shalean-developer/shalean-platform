-- Booking funnel analytics (inserted via Next.js API with service role only).
CREATE TABLE IF NOT EXISTS public.booking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  step TEXT NOT NULL,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_events_session_id_idx ON public.booking_events (session_id);
CREATE INDEX IF NOT EXISTS booking_events_created_at_idx ON public.booking_events (created_at DESC);
CREATE INDEX IF NOT EXISTS booking_events_step_event_idx ON public.booking_events (step, event_type);

COMMENT ON TABLE public.booking_events IS 'Booking funnel: view/next/back/error/exit per session';

ALTER TABLE public.booking_events ENABLE ROW LEVEL SECURITY;
