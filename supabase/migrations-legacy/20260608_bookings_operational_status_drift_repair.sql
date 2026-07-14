-- Repair: cleaner_response advanced while bookings.status stayed assignable.
-- Then enforce: response `started` cannot pair with offered/assigned/confirmed.

update public.bookings b
set
  status = 'in_progress',
  started_at = coalesce(b.started_at, now()),
  en_route_at = coalesce(b.en_route_at, now())
where lower(trim(coalesce(b.status, ''))) in ('assigned', 'offered', 'confirmed')
  and lower(trim(coalesce(b.cleaner_response_status, ''))) in ('on_my_way', 'started');

alter table public.bookings
drop constraint if exists booking_status_response_started_requires_in_progress;

alter table public.bookings
add constraint booking_status_response_started_requires_in_progress
check (
  not (
    lower(trim(coalesce(status, ''))) in ('assigned', 'offered', 'confirmed')
    and lower(trim(coalesce(cleaner_response_status, ''))) = 'started'
  )
);

comment on constraint booking_status_response_started_requires_in_progress on public.bookings is
  'cleaner_response_status started implies bookings.status has left assignable pre-active states.';
