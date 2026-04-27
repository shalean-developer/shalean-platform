-- Phase 8B: cleaner WhatsApp product keys (match Meta template names; copy is for ops reference — sends use Cloud API + env overrides).

-- Retire customer WhatsApp row (cleaner-only policy; copy kept for historical reference, inactive)
update public.templates
set is_active = false, updated_at = now()
where key = 'booking_confirmed' and channel = 'whatsapp';

insert into public.templates (key, channel, subject, content, variables, is_active)
values
  (
    'booking_offer',
    'whatsapp',
    null,
    'Hi {cleaner_name} — new job. {location} · {date} {time} · {pay}. Reply 1=ACCEPT 2=DECLINE.',
    '["cleaner_name","location","date","time","pay"]'::jsonb,
    true
  ),
  (
    'booking_assigned',
    'whatsapp',
    null,
    'Job assigned. {location} · {date} {time}. Arrive on time.',
    '["location","date","time"]'::jsonb,
    true
  ),
  (
    'reminder',
    'whatsapp',
    null,
    'Reminder: job today. {location} · {time}. Reply if issues.',
    '["location","time"]'::jsonb,
    true
  ),
  (
    'offer_ack',
    'whatsapp',
    null,
    '{line}',
    '["line"]'::jsonb,
    true
  ),
  (
    'cleaner_welcome',
    'whatsapp',
    null,
    '{line}',
    '["line"]'::jsonb,
    true
  ),
  (
    'cleaner_approved',
    'whatsapp',
    null,
    '{line}',
    '["line"]'::jsonb,
    true
  )
on conflict (key, channel) do update set
  content = excluded.content,
  variables = excluded.variables,
  is_active = excluded.is_active,
  updated_at = now();
