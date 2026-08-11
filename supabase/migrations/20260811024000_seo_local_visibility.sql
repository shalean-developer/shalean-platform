create table if not exists public.seo_local_visibility (
  id uuid primary key default gen_random_uuid(),
  area_name text not null,
  location_path text,
  gbp_location_id text,
  gbp_location_name text,
  gbp_connected boolean not null default false,
  review_count integer not null default 0,
  average_rating numeric,
  local_pack_position numeric,
  local_pack_keyword text,
  gsc_clicks integer not null default 0,
  gsc_impressions integer not null default 0,
  gsc_avg_position numeric,
  health text not null default 'unknown' check (health in ('healthy','watch','action','unknown')),
  notes text,
  checked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(area_name)
);

create table if not exists public.seo_local_visibility_snapshots (
  id uuid primary key default gen_random_uuid(),
  area_name text not null,
  location_path text,
  gbp_location_id text,
  review_count integer not null default 0,
  average_rating numeric,
  local_pack_position numeric,
  local_pack_keyword text,
  gsc_clicks integer not null default 0,
  gsc_impressions integer not null default 0,
  gsc_avg_position numeric,
  captured_at timestamptz not null default now()
);

create index if not exists seo_local_visibility_health_idx on public.seo_local_visibility(health, updated_at desc);
create index if not exists seo_local_visibility_path_idx on public.seo_local_visibility(location_path);
create index if not exists seo_local_visibility_snapshots_area_idx on public.seo_local_visibility_snapshots(area_name, captured_at desc);

alter table public.seo_local_visibility enable row level security;
alter table public.seo_local_visibility_snapshots enable row level security;
revoke all on public.seo_local_visibility from anon, authenticated;
revoke all on public.seo_local_visibility_snapshots from anon, authenticated;
grant all on public.seo_local_visibility to service_role;
grant all on public.seo_local_visibility_snapshots to service_role;
