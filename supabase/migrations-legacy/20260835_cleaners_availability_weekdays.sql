-- Days of week a cleaner may be scheduled (admin-edited; cleaners see read-only in app).
alter table public.cleaners
  add column if not exists availability_weekdays text[] not null
  default array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::text[];

comment on column public.cleaners.availability_weekdays is
  'Lowercase mon..sun; which weekdays ops may assign this cleaner. Cleaners cannot self-edit; use admin.';
