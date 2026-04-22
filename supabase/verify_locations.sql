-- Run after migrations + seed/locations_seed.sql (see booking_stack_apply_order.sql)
-- Expect: all checks pass (true / zero).

-- Table exists
select 'locations table' as check_name, to_regclass('public.locations') is not null as ok;

-- Full dataset (100+ areas)
select 'row count >= 100' as check_name, (select count(*)::int from public.locations) >= 100 as ok;

-- No duplicate slugs
select 'duplicate slugs' as check_name,
  coalesce((select count(*)::int from (
    select slug from public.locations group by slug having count(*) > 1
  ) t), 0) = 0 as ok;

-- Slugs are non-null (after 20260435_locations_production.sql)
select 'slug not null' as check_name,
  not exists (select 1 from public.locations where slug is null) as ok;

-- Join cleaners → locations (seed cleaners with matching text labels)
select 'cleaners location_id joinable' as check_name,
  not exists (
    select 1 from public.cleaners c
    where c.location is not null
      and c.location_id is null
      and exists (
        select 1 from public.locations l
        where l.slug = lower(regexp_replace(trim(c.location), '\s+', '-', 'g'))
      )
  ) as ok;

-- Sample join (spot-check)
select 'sample: cleaners with location' as check_name,
  (select count(*)::int from public.cleaners c
   join public.locations l on l.id = c.location_id) >= 1 as ok;
