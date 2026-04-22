-- Multi-city / dispatch: cleaners.city_id (and optional location_id) for admin + assign APIs.
-- Idempotent if already added by an updated 20260465.

alter table public.cleaners add column if not exists city_id uuid;
alter table public.cleaners add column if not exists location_id uuid;

create index if not exists cleaners_city_id_idx on public.cleaners (city_id);
create index if not exists cleaners_location_id_idx on public.cleaners (location_id);

comment on column public.cleaners.city_id is 'Service city (public.cities); optional FK added in full 20260453 when present.';
comment on column public.cleaners.location_id is 'Resolved public.locations row when available.';
