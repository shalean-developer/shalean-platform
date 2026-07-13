-- Human-readable service area for dispatch / AI matching (coordinates stay on home_lat / home_lng)

alter table public.cleaners add column if not exists location text;

comment on column public.cleaners.location is 'Primary suburb or area label (Western Cape seed data).';
comment on column public.cleaners.home_lat is 'Approximate latitude for routing / future GPS.';
comment on column public.cleaners.home_lng is 'Approximate longitude for routing / future GPS.';
