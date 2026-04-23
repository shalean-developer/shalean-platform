-- Speed admin financial queries (completed bookings only).

create index if not exists bookings_completed_created_at_idx
  on public.bookings (created_at desc)
  where lower(status) = 'completed';

create index if not exists bookings_completed_cleaner_id_idx
  on public.bookings (cleaner_id)
  where lower(status) = 'completed';

create index if not exists bookings_completed_location_idx
  on public.bookings (location)
  where lower(status) = 'completed' and location is not null and length(trim(location)) > 0;
