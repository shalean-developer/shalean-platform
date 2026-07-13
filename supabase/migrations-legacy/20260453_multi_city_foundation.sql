-- Multi-city foundation for scalable city-isolated operations.

create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  country text not null default 'South Africa',
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists cities_name_country_idx
  on public.cities (lower(name), lower(country));

create table if not exists public.city_configs (
  city_id uuid primary key references public.cities(id) on delete cascade,
  base_price_multiplier numeric not null default 1.0,
  surge_floor numeric not null default 1.0,
  surge_cap numeric not null default 2.0,
  default_availability_start time not null default '08:00',
  default_availability_end time not null default '18:00',
  updated_at timestamptz not null default now()
);

alter table public.locations
  add column if not exists city_id uuid references public.cities(id) on delete set null,
  add column if not exists slug text;

insert into public.cities (name, slug, country, is_active)
select distinct
  coalesce(nullif(trim(l.city), ''), 'Cape Town') as name,
  lower(regexp_replace(coalesce(nullif(trim(l.city), ''), 'Cape Town'), '\s+', '-', 'g')) as slug,
  'South Africa',
  true
from public.locations l
on conflict (slug) do update
set name = excluded.name;

insert into public.city_configs (city_id)
select c.id
from public.cities c
on conflict (city_id) do nothing;

update public.locations l
set
  city_id = c.id,
  slug = coalesce(l.slug, lower(regexp_replace(trim(l.name), '\s+', '-', 'g')))
from public.cities c
where c.slug = lower(regexp_replace(coalesce(nullif(trim(l.city), ''), 'Cape Town'), '\s+', '-', 'g'))
  and (l.city_id is null or l.slug is null);

create unique index if not exists locations_city_slug_idx
  on public.locations (city_id, slug);

alter table public.bookings
  add column if not exists city_id uuid references public.cities(id) on delete set null;

alter table public.cleaners
  add column if not exists city_id uuid references public.cities(id) on delete set null;

alter table public.subscriptions
  add column if not exists city_id uuid references public.cities(id) on delete set null;

alter table public.cleaner_applications
  add column if not exists city_id uuid references public.cities(id) on delete set null;

update public.bookings b
set city_id = l.city_id
from public.locations l
where b.location_id = l.id and b.city_id is null;

update public.cleaners c
set city_id = l.city_id
from public.locations l
where c.location_id = l.id and c.city_id is null;

update public.subscriptions s
set city_id = c.id
from public.cities c
where c.slug = 'cape-town' and s.city_id is null;

update public.cleaner_applications a
set city_id = c.id
from public.cities c
where c.slug = 'cape-town' and a.city_id is null;
