-- Route optimization primitives for scheduling and dispatch proximity.
alter table public.bookings
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists time_slot text;

alter table public.cleaners
  add column if not exists availability_start time,
  add column if not exists availability_end time;

update public.bookings b
set
  latitude = coalesce(b.latitude, l.latitude),
  longitude = coalesce(b.longitude, l.longitude),
  time_slot = coalesce(b.time_slot, b.time)
from public.locations l
where b.location_id = l.id
  and (b.latitude is null or b.longitude is null or b.time_slot is null);

comment on column public.bookings.latitude is 'Booking coordinate snapshot for route optimization.';
comment on column public.bookings.longitude is 'Booking coordinate snapshot for route optimization.';
comment on column public.bookings.time_slot is 'Booking window label/time slot used for scheduling clusters.';
comment on column public.cleaners.availability_start is 'Cleaner default daily availability start.';
comment on column public.cleaners.availability_end is 'Cleaner default daily availability end.';
