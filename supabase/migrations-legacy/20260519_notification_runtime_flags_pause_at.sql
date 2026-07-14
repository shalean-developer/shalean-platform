-- When the WhatsApp circuit last engaged (for resume cooldown vs flip-flopping).

alter table public.notification_runtime_flags
  add column if not exists whatsapp_paused_at timestamptz;

comment on column public.notification_runtime_flags.whatsapp_paused_at is
  'Wall time when outbound WhatsApp was last auto-paused; preserved while pause is extended. Cleared on resume.';
