-- Supplement `public.locations` from ops-provided service area labels (cleaned + deduped).
-- Aligns with `approve_cleaner_change_request` matching on slug or display name.
-- Skipped as ambiguous / not standard suburbs: Chempet, Glosderry, Rhodes (see repo docs / re-add manually if needed).
-- Includes `City Bowl` + `Belgravia` (same rows as 20260881 — safe if both migrations run).

insert into public.locations (name, slug, city, province)
values
  ('Belgravia', 'belgravia', 'Cape Town', 'Western Cape'),
  ('City Bowl', 'city-bowl', 'Cape Town', 'Western Cape'),
  ('Clareinch', 'clareinch', 'Cape Town', 'Western Cape'),
  ('Clovelly', 'clovelly', 'Cape Town', 'Western Cape'),
  ('Crawford', 'crawford', 'Cape Town', 'Western Cape'),
  ('Devil''s Peak Estate', 'devils-peak-estate', 'Cape Town', 'Western Cape'),
  ('Edgemead', 'edgemead', 'Cape Town', 'Western Cape'),
  ('Faure', 'faure', 'Cape Town', 'Western Cape'),
  ('Firgrove', 'firgrove', 'Cape Town', 'Western Cape'),
  ('Groote Schuur', 'groote-schuur', 'Cape Town', 'Western Cape'),
  ('Helderberg', 'helderberg', 'Cape Town', 'Western Cape'),
  ('Higgovale', 'higgovale', 'Cape Town', 'Western Cape'),
  ('Howard Place', 'howard-place', 'Cape Town', 'Western Cape'),
  ('Kenwyn', 'kenwyn', 'Cape Town', 'Western Cape'),
  ('Kommetjie', 'kommetjie', 'Cape Town', 'Western Cape'),
  ('Kreupelbosch', 'kreupelbosch', 'Cape Town', 'Western Cape'),
  ('Lansdowne', 'lansdowne', 'Cape Town', 'Western Cape'),
  ('Llandudno', 'llandudno', 'Cape Town', 'Western Cape'),
  ('Lower Vrede', 'lower-vrede', 'Cape Town', 'Western Cape'),
  ('Macassar', 'macassar', 'Cape Town', 'Western Cape'),
  ('Mowbray', 'mowbray', 'Cape Town', 'Western Cape'),
  ('Mutual Park', 'mutual-park', 'Cape Town', 'Western Cape'),
  ('Old Oak', 'old-oak', 'Cape Town', 'Western Cape'),
  ('Paarden Island', 'paarden-island', 'Cape Town', 'Western Cape'),
  ('Ravensmead', 'ravensmead', 'Cape Town', 'Western Cape'),
  ('Schotse Kloof', 'schotse-kloof', 'Cape Town', 'Western Cape'),
  ('Southfield', 'southfield', 'Cape Town', 'Western Cape'),
  ('Steenberg', 'steenberg', 'Cape Town', 'Western Cape'),
  ('Sun Valley', 'sun-valley', 'Cape Town', 'Western Cape'),
  ('Sunnyside', 'sunnyside', 'Cape Town', 'Western Cape'),
  ('Tyger Valley', 'tyger-valley', 'Cape Town', 'Western Cape'),
  ('Tygerberg', 'tygerberg', 'Cape Town', 'Western Cape'),
  ('University Estate', 'university-estate', 'Cape Town', 'Western Cape'),
  ('Walmer Estate', 'walmer-estate', 'Cape Town', 'Western Cape'),
  ('Wittebome', 'wittebome', 'Cape Town', 'Western Cape')
on conflict (slug) do update set
  name = excluded.name,
  city = excluded.city,
  province = excluded.province;

update public.locations l
set city_id = c.id
from public.cities c
where c.slug = 'cape-town'
  and l.city_id is null
  and coalesce(nullif(trim(l.city), ''), 'Cape Town') = 'Cape Town';

-- Validation (expect 0 rows in the NOT EXISTS branch for each slugified label):
-- select x
-- from (values ('Belgravia'), ('City Bowl'), ('Clareinch')) v(x)
-- where not exists (
--   select 1 from public.locations l
--   where lower(trim(l.slug)) = lower(regexp_replace(trim(v.x), '\s+', '-', 'g'))
--      or lower(trim(l.name)) = lower(trim(v.x))
-- );
--
-- Orphan cleaner_locations (expect 0 rows):
-- select distinct cl.location_id
-- from public.cleaner_locations cl
-- left join public.locations l on l.id = cl.location_id
-- where l.id is null;
