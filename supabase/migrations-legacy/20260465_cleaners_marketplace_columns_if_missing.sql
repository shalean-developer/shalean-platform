-- Repair divergent `public.cleaners` (e.g. legacy tables) missing marketplace / dispatch columns.

alter table public.cleaners add column if not exists phone_number text;
alter table public.cleaners add column if not exists jobs_completed integer default 0;
alter table public.cleaners add column if not exists home_lat double precision;
alter table public.cleaners add column if not exists home_lng double precision;
alter table public.cleaners add column if not exists latitude double precision;
alter table public.cleaners add column if not exists longitude double precision;
alter table public.cleaners add column if not exists location text;
alter table public.cleaners add column if not exists city_id uuid;
alter table public.cleaners add column if not exists location_id uuid;
alter table public.cleaners add column if not exists is_available boolean default true;
alter table public.cleaners add column if not exists availability_start time;
alter table public.cleaners add column if not exists availability_end time;
alter table public.cleaners add column if not exists auth_user_id uuid;
alter table public.cleaners add column if not exists acceptance_rate_recent real default 1.0;
alter table public.cleaners add column if not exists tier text default 'bronze';
alter table public.cleaners add column if not exists priority_score double precision default 0;

update public.cleaners
set phone_number = coalesce(nullif(trim(phone_number), ''), nullif(trim(phone), ''))
where phone_number is null or btrim(coalesce(phone_number, '')) = '';

update public.cleaners
set latitude = coalesce(latitude, home_lat),
    longitude = coalesce(longitude, home_lng)
where true;

create index if not exists cleaners_phone_number_idx on public.cleaners (phone_number);
create index if not exists cleaners_city_id_idx on public.cleaners (city_id);
create index if not exists cleaners_location_id_idx on public.cleaners (location_id);

comment on column public.cleaners.home_lat is 'Approximate latitude for routing.';
comment on column public.cleaners.home_lng is 'Approximate longitude for routing.';
