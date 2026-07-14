-- Multi-channel notification copy (email / WhatsApp / SMS). Read and updated via Next.js + service role.

CREATE TABLE IF NOT EXISTS public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'sms')),
  subject TEXT,
  content TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (key, channel)
);

CREATE INDEX IF NOT EXISTS templates_key_active_idx ON public.templates (key) WHERE is_active;

COMMENT ON TABLE public.templates IS 'Dynamic notification templates; server reads with service role.';

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

INSERT INTO public.templates (key, channel, subject, content, variables)
VALUES
  (
    'booking_confirmed',
    'email',
    'Booking Confirmed - {{customer_name}}',
    '<h1>Booking Confirmed</h1>
<p>Hi {{customer_name}},</p>
<p>Your cleaning is booked for {{date}} at {{time}}</p>
<p>Total: {{price}}</p>',
    '["customer_name","date","time","price"]'::jsonb
  ),
  (
    'booking_confirmed',
    'whatsapp',
    NULL,
    'Hi {{customer_name}} 👋

Your cleaning is confirmed:
📅 {{date}}
⏰ {{time}}
💰 {{price}}

– Shalean 💙',
    '["customer_name","date","time","price"]'::jsonb
  ),
  (
    'booking_confirmed',
    'sms',
    NULL,
    'Shalean: Booking {{date}} {{time}}. Ref {{booking_id}}',
    '["date","time","booking_id"]'::jsonb
  )
ON CONFLICT (key, channel) DO NOTHING;
