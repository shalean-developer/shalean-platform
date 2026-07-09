-- Google Search Console query + location hub snapshots (synced with page metrics).

create table if not exists public.location_gsc_queries (
  query text not null,
  slug text not null,
  page_url text not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr numeric not null default 0,
  avg_position numeric,
  synced_at timestamptz not null default now(),
  primary key (query, slug)
);

create index if not exists location_gsc_queries_clicks_idx
  on public.location_gsc_queries (clicks desc);

create index if not exists location_gsc_queries_impressions_idx
  on public.location_gsc_queries (impressions desc);

create index if not exists location_gsc_queries_synced_at_idx
  on public.location_gsc_queries (synced_at desc);

comment on table public.location_gsc_queries is
  'Latest GSC query performance per /locations/{slug} hub; refreshed on each GSC sync.';

alter table public.location_gsc_queries enable row level security;

create policy "location_gsc_queries_service_role"
  on public.location_gsc_queries for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
