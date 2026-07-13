-- Reference areas: cleaners, bookings, SEO routes, dispatch / AI matching (see 20260435 for RLS + slug NOT NULL)

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text default 'Cape Town',
  province text default 'Western Cape',
  slug text unique,
  created_at timestamptz not null default now()
);

comment on table public.locations is 'Normalized Western Cape service areas; slug = kebab-case for URLs.';
