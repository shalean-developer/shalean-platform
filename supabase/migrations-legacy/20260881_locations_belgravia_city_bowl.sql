-- Cleaner preferred-area UI (`BOOKING_FLOW_LOCATION_HINTS` + `EXTRA_PREFERRED_AREAS`) must resolve
-- to `public.locations` for `approve_cleaner_change_request` (slug or display name match).
-- Belgravia + City Bowl were in the app catalog but missing from `locations_seed.sql`.

insert into public.locations (name, slug, city, province)
values
  ('Belgravia', 'belgravia', 'Cape Town', 'Western Cape'),
  ('City Bowl', 'city-bowl', 'Cape Town', 'Western Cape')
on conflict (slug) do update set
  name = excluded.name,
  city = excluded.city,
  province = excluded.province;
