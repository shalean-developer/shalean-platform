create table if not exists public.seo_indexing_states (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  path text not null,
  page_group text not null default 'core',
  priority text not null default 'p1' check (priority in ('p0','p1','p2')),
  in_sitemap boolean not null default true,
  state text not null default 'unknown' check (state in ('indexed','not_indexed','excluded','blocked','unknown')),
  verdict text,
  coverage_state text,
  robots_txt_state text,
  indexing_state text,
  page_fetch_state text,
  google_canonical text,
  user_canonical text,
  last_crawl_time timestamptz,
  inspected_at timestamptz,
  previous_state text,
  previous_coverage_state text,
  regression_detected boolean not null default false,
  action_required boolean not null default false,
  reason text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seo_indexing_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running' check (status in ('running','success','error','partial')),
  sitemap_urls integer not null default 0,
  inspected integer not null default 0,
  indexed integer not null default 0,
  not_indexed integer not null default 0,
  excluded integer not null default 0,
  blocked integer not null default 0,
  regressions integer not null default 0,
  errors integer not null default 0,
  message text
);

create index if not exists seo_indexing_states_status_idx on public.seo_indexing_states(state, priority, updated_at desc);
create index if not exists seo_indexing_states_regression_idx on public.seo_indexing_states(regression_detected, action_required, priority);
create index if not exists seo_indexing_runs_started_idx on public.seo_indexing_runs(started_at desc);

alter table public.seo_indexing_states enable row level security;
alter table public.seo_indexing_runs enable row level security;

comment on table public.seo_indexing_states is 'SEO-018 canonical sitemap URL indexing state from Search Console URL Inspection.';
comment on table public.seo_indexing_runs is 'SEO-018 audit history for scheduled whole-site index inspections.';
