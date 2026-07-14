-- Append-only payment link delivery attempts (multi-wave funnel; not overwritten).

create table if not exists public.payment_link_delivery_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'sms', 'email')),
  status text not null check (status in ('sent', 'failed')),
  pass_type text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_link_delivery_events_booking_created
  on public.payment_link_delivery_events (booking_id, created_at desc);

comment on table public.payment_link_delivery_events is
  'Per-channel send outcomes per wave (admin checkout, resend, reminders). Used for funnel + conversion_channel.';

alter table public.bookings
  add column if not exists conversion_channel text
    check (conversion_channel is null or conversion_channel in ('whatsapp', 'sms', 'email'));

comment on column public.bookings.conversion_channel is
  'Last channel with a successful payment-link delivery before checkout completed (from payment_link_delivery_events).';

alter table public.payment_link_delivery_events enable row level security;

revoke all on public.payment_link_delivery_events from public;
grant select, insert on public.payment_link_delivery_events to service_role;
