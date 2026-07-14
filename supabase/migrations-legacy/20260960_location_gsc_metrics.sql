-- Search Console performance snapshots per location hub (synced via /api/admin/seo/gsc-sync or cron).

create table if not exists public.location_gsc_metrics (
  slug text primary key,
  page_url text not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr numeric not null default 0,
  avg_position numeric,
  synced_at timestamptz not null default now()
);

create index if not exists location_gsc_metrics_synced_at_idx
  on public.location_gsc_metrics (synced_at desc);

create index if not exists location_gsc_metrics_impressions_idx
  on public.location_gsc_metrics (impressions desc);

comment on table public.location_gsc_metrics is
  'Latest Google Search Console page metrics per /locations/{slug} hub; synced daily from GSC API.';

alter table public.location_gsc_metrics enable row level security;

create policy "location_gsc_metrics_service_role"
  on public.location_gsc_metrics for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
