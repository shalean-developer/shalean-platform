-- Dispatch v2: canonical lat/lng on cleaners & locations; retry queue for auto-assign

-- Cleaners: latitude/longitude (backfill from legacy home_lat/home_lng)
alter table public.cleaners
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

update public.cleaners
set
  latitude = coalesce(latitude, home_lat),
  longitude = coalesce(longitude, home_lng)
where latitude is null or longitude is null;

comment on column public.cleaners.latitude is 'Dispatch / routing: job distance from cleaner (WGS84). Mirrors home_lat when unset.';
comment on column public.cleaners.longitude is 'Dispatch / routing: paired with latitude. Mirrors home_lng when unset.';

-- Locations: area centroid for Haversine between jobs
alter table public.locations
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

comment on column public.locations.latitude is 'Approximate centroid for dispatch distance (same area).';
comment on column public.locations.longitude is 'Approximate centroid for dispatch distance (same area).';

-- Optional job length for travel-buffer math (nullable = use app default)
alter table public.bookings
  add column if not exists duration_minutes integer;

comment on column public.bookings.duration_minutes is 'Scheduled job length in minutes; dispatch uses default when null.';

-- Retry queue (cron: see apps/web retry-failed-jobs handler)
create table if not exists public.dispatch_retry_queue (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  retries_done smallint not null default 0 check (retries_done >= 0 and retries_done <= 10),
  next_retry_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'abandoned')),
  last_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dispatch_retry_queue_pending_next_idx
  on public.dispatch_retry_queue (next_retry_at asc)
  where status = 'pending';

create unique index if not exists dispatch_retry_queue_booking_pending_uidx
  on public.dispatch_retry_queue (booking_id)
  where status = 'pending';

alter table public.dispatch_retry_queue enable row level security;

comment on table public.dispatch_retry_queue is 'Auto-assign backoff: 2m / 5m / 10m gaps; processed by service-role cron.';
