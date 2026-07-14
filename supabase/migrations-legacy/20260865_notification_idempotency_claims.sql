-- Day 5: one claim row per (booking, event_type, channel) so verify + webhook + retries cannot double-send.
-- Distinct from audit `notification_logs` (delivery rows with template/recipient/provider).

create table if not exists public.notification_idempotency_claims (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  event_type text not null,
  channel text not null check (channel in ('email', 'sms', 'in_app')),
  created_at timestamptz not null default now(),
  unique (booking_id, event_type, channel)
);

create index if not exists notification_idempotency_claims_booking_id_idx
  on public.notification_idempotency_claims (booking_id);

comment on table public.notification_idempotency_claims is
  'Pre-send idempotency claims (Day 5). Insert before outbound send; unique violation = duplicate path.';

alter table public.notification_idempotency_claims enable row level security;
