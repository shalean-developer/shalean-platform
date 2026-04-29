-- Many-to-many: which normalized `locations` a cleaner can work.
create table if not exists public.cleaner_locations (
  id uuid primary key default gen_random_uuid(),
  cleaner_id uuid not null references public.cleaners (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint cleaner_locations_unique_pair unique (cleaner_id, location_id)
);

create index if not exists cleaner_locations_cleaner_id_idx on public.cleaner_locations (cleaner_id);
create index if not exists cleaner_locations_location_id_idx on public.cleaner_locations (location_id);

comment on table public.cleaner_locations is
  'Authoritative service areas for a cleaner; eligibility uses this instead of cleaner_preferences.preferred_areas.';

-- Calendar query performance (dispatch + slots scan by date).
create index if not exists cleaner_availability_date_idx on public.cleaner_availability (date);

alter table public.cleaner_locations enable row level security;

create policy cleaner_locations_no_anon
  on public.cleaner_locations
  for all
  using (false)
  with check (false);

-- Backfill from legacy single location + preference UUIDs.
insert into public.cleaner_locations (cleaner_id, location_id)
select c.id, c.location_id
from public.cleaners c
where c.location_id is not null
on conflict (cleaner_id, location_id) do nothing;

do $pref$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'cleaner_preferences'
  ) then
    insert into public.cleaner_locations (cleaner_id, location_id)
    select cp.cleaner_id, loc::uuid
    from public.cleaner_preferences cp
    cross join lateral unnest(cp.preferred_areas) as loc
    where loc ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    on conflict (cleaner_id, location_id) do nothing;
  end if;
end $pref$;

-- Seed calendar rows from default daily times when a day has no rows yet (non-destructive).
insert into public.cleaner_availability (cleaner_id, date, start_time, end_time, is_available)
select
  c.id,
  d::date,
  to_char(c.availability_start, 'HH24:MI'),
  to_char(c.availability_end, 'HH24:MI'),
  true
from public.cleaners c
cross join generate_series(current_date, current_date + 44, interval '1 day') as d
where c.availability_start is not null
  and c.availability_end is not null
  and not exists (
    select 1
    from public.cleaner_availability ca
    where ca.cleaner_id = c.id
      and ca.date = d::date
  );
