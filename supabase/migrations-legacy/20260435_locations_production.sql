-- Locations: slug required for SEO/API; RLS allows public read of reference data

alter table public.locations alter column slug set not null;

alter table public.locations enable row level security;

drop policy if exists locations_select_public on public.locations;
create policy locations_select_public on public.locations for select using (true);

comment on table public.locations is 'Normalized service areas for cleaners, bookings, SEO routes, and dispatch matching.';
comment on column public.locations.name is 'Display name and meta title base (title case).';
comment on column public.locations.slug is 'Unique kebab-case key for URLs and joins (stable id for SEO).';
comment on column public.locations.city is 'Municipal / metro label for filters and structured data.';
comment on column public.locations.province is 'Province for regional SEO and compliance.';
