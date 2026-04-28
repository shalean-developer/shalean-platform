-- Harden service_slug: finish backfill, default stragglers, NOT NULL, partial index for duplicate checks.

update public.bookings b
set service_slug = lower(trim(b.booking_snapshot->>'service_slug'))
where coalesce(trim(b.service_slug), '') = ''
  and b.booking_snapshot ? 'service_slug'
  and coalesce(trim(b.booking_snapshot->>'service_slug'), '') <> '';

update public.bookings b
set service_slug = lower(trim(b.booking_snapshot #>> '{locked,service}'))
where coalesce(trim(b.service_slug), '') = ''
  and coalesce(trim(b.booking_snapshot #>> '{locked,service}'), '') <> '';

-- Last resort for rows with no snapshot slug (legacy); safe default for duplicate guard.
update public.bookings
set service_slug = 'standard'
where coalesce(trim(service_slug), '') = '';

alter table public.bookings
  alter column service_slug set not null;

-- Status list must match TERMINAL_BOOKING_STATUSES_FOR_DUPLICATE_GUARD in apps/web/lib/booking/bookingTerminalStatuses.ts
create index if not exists idx_bookings_active_dup
  on public.bookings (user_id, date, time, service_slug)
  where status not in ('cancelled', 'failed', 'payment_expired');
