create table if not exists public.site_gsc_metrics (
  page_url text primary key,
  page_group text not null check (page_group in ('core','service','blog','location','recruitment')),
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr double precision not null default 0,
  avg_position double precision,
  prev_clicks integer not null default 0,
  prev_impressions integer not null default 0,
  prev_avg_position double precision,
  synced_at timestamptz not null default now()
);

create index if not exists site_gsc_metrics_page_group_idx
  on public.site_gsc_metrics (page_group);

create index if not exists site_gsc_metrics_synced_at_idx
  on public.site_gsc_metrics (synced_at desc);

alter table public.site_gsc_metrics enable row level security;

comment on table public.site_gsc_metrics is
  'Whole-site Google Search Console page performance used by the Office SEO management dashboard. Service-role writes and admin server reads only.';
