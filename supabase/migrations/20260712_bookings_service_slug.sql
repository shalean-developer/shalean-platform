-- Canonical service slug on bookings for fast duplicate checks (no JSON scan).
alter table public.bookings add column if not exists service_slug text;

comment on column public.bookings.service_slug is
  'Canonical service id slug (e.g. standard, airbnb). Mirrors booking_snapshot; used for admin duplicate guard.';

-- Backfill from snapshot JSON (idempotent).
update public.bookings b
set service_slug = lower(trim(b.booking_snapshot->>'service_slug'))
where coalesce(trim(b.service_slug), '') = ''
  and b.booking_snapshot ? 'service_slug'
  and coalesce(trim(b.booking_snapshot->>'service_slug'), '') <> '';

update public.bookings b
set service_slug = lower(trim(b.booking_snapshot #>> '{locked,service}'))
where coalesce(trim(b.service_slug), '') = ''
  and coalesce(trim(b.booking_snapshot #>> '{locked,service}'), '') <> '';

create index if not exists idx_bookings_user_date_time_service
  on public.bookings (user_id, date, time, service_slug);
