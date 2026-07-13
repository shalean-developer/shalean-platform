-- Ops-controlled pause for all customer email/SMS outbound (Twilio + Resend).
-- Columns only — pause is off by default. Enable with:
--   update public.notification_runtime_flags
--   set customer_outbound_paused_until = now() + interval '7 days',
--       customer_outbound_paused_at = now(),
--       updated_at = now()
--   where id = 1;

alter table public.notification_runtime_flags
  add column if not exists customer_outbound_paused_until timestamptz,
  add column if not exists customer_outbound_paused_at timestamptz;

comment on column public.notification_runtime_flags.customer_outbound_paused_until is
  'When set and in the future, customer email/SMS outbound is skipped (cleaner/admin unaffected).';

comment on column public.notification_runtime_flags.customer_outbound_paused_at is
  'When the current customer outbound pause window started (ops audit).';
