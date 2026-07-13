-- Prior-period GSC metrics for trend arrows and KPI deltas.

alter table public.location_gsc_metrics
  add column if not exists prev_clicks integer not null default 0,
  add column if not exists prev_impressions integer not null default 0,
  add column if not exists prev_avg_position numeric;

alter table public.location_gsc_queries
  add column if not exists prev_clicks integer not null default 0,
  add column if not exists prev_impressions integer not null default 0,
  add column if not exists prev_avg_position numeric;

create table if not exists public.location_gsc_sync_meta (
  id text primary key default 'latest',
  current_start_date text not null,
  current_end_date text not null,
  previous_start_date text not null,
  previous_end_date text not null,
  current_clicks integer not null default 0,
  current_impressions integer not null default 0,
  previous_clicks integer not null default 0,
  previous_impressions integer not null default 0,
  clicks_trend_pct numeric,
  impressions_trend_pct numeric,
  clicks_chart jsonb not null default '[]'::jsonb,
  synced_at timestamptz not null default now()
);

comment on table public.location_gsc_sync_meta is
  'Latest GSC sync window totals and daily clicks chart for the SEO dashboard.';

alter table public.location_gsc_sync_meta enable row level security;

create policy "location_gsc_sync_meta_service_role"
  on public.location_gsc_sync_meta for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
