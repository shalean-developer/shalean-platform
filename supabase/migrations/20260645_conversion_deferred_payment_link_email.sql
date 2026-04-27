-- Async payment-link email sends for conversion experiment (variant_a delay) without blocking serverless.

create table if not exists public.conversion_deferred_payment_link_emails (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  run_at timestamptz not null,
  email_payload jsonb not null,
  phone text,
  wa_payload jsonb,
  delivery_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text
);

create index if not exists conversion_deferred_payment_link_emails_due_idx
  on public.conversion_deferred_payment_link_emails (run_at asc)
  where sent_at is null;

create unique index if not exists conversion_deferred_payment_link_emails_pending_booking_uidx
  on public.conversion_deferred_payment_link_emails (booking_id)
  where sent_at is null;

comment on table public.conversion_deferred_payment_link_emails is
  'Queued payment-link emails (e.g. experiment delay); worker sends at run_at and may SMS-fallback on failure.';

alter table public.conversion_deferred_payment_link_emails enable row level security;

revoke all on public.conversion_deferred_payment_link_emails from public;
revoke all on public.conversion_deferred_payment_link_emails from anon;
revoke all on public.conversion_deferred_payment_link_emails from authenticated;
grant select, insert, update, delete on public.conversion_deferred_payment_link_emails to service_role;
