-- Anti-spam + support visibility for admin payment links
alter table public.bookings
  add column if not exists payment_link_last_sent_at timestamptz;

alter table public.bookings
  add column if not exists payment_link_delivery jsonb not null default '{}'::jsonb;

alter table public.bookings
  add column if not exists payment_link_reminder_1h_sent_at timestamptz;

alter table public.bookings
  add column if not exists payment_link_reminder_15m_sent_at timestamptz;

comment on column public.bookings.payment_link_last_sent_at is
  'Last time payment-link notifications were sent (rate-limit resends).';

comment on column public.bookings.payment_link_delivery is
  'Latest per-channel outcome for payment link delivery: whatsapp|sms|email → sent|failed|skipped.';

comment on column public.bookings.payment_link_reminder_1h_sent_at is
  'Set when ~1h-before-expiry reminder was sent (cron idempotency).';

comment on column public.bookings.payment_link_reminder_15m_sent_at is
  'Set when ~15m-before-expiry reminder was sent (cron idempotency).';

create index if not exists idx_bookings_pending_payment_expires
  on public.bookings (payment_link_expires_at asc)
  where status = 'pending_payment';
