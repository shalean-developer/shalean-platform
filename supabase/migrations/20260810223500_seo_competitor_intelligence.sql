create table if not exists public.seo_competitors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text not null unique,
  source text not null default 'manual' check (source in ('manual','discovered')),
  active boolean not null default true,
  ignored boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seo_tracked_keywords (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  target_path text,
  location_name text not null default 'Cape Town, Western Cape, South Africa',
  language_code text not null default 'en',
  device text not null default 'desktop' check (device in ('desktop','mobile')),
  priority text not null default 'p1' check (priority in ('p0','p1','p2')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(keyword, location_name, device)
);

create table if not exists public.seo_serp_snapshots (
  id uuid primary key default gen_random_uuid(),
  keyword_id uuid not null references public.seo_tracked_keywords(id) on delete cascade,
  provider text not null,
  fetched_at timestamptz not null default now(),
  result_count integer not null default 0,
  raw jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.seo_competitor_rankings (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.seo_serp_snapshots(id) on delete cascade,
  keyword_id uuid not null references public.seo_tracked_keywords(id) on delete cascade,
  competitor_id uuid references public.seo_competitors(id) on delete set null,
  domain text not null,
  position integer not null,
  result_type text not null default 'organic',
  url text,
  title text,
  is_shalean boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists seo_competitors_active_idx on public.seo_competitors(active, ignored, domain);
create index if not exists seo_tracked_keywords_active_idx on public.seo_tracked_keywords(active, priority, keyword);
create index if not exists seo_serp_snapshots_keyword_fetched_idx on public.seo_serp_snapshots(keyword_id, fetched_at desc);
create index if not exists seo_competitor_rankings_keyword_domain_idx on public.seo_competitor_rankings(keyword_id, domain, created_at desc);
create index if not exists seo_competitor_rankings_snapshot_position_idx on public.seo_competitor_rankings(snapshot_id, position);

alter table public.seo_competitors enable row level security;
alter table public.seo_tracked_keywords enable row level security;
alter table public.seo_serp_snapshots enable row level security;
alter table public.seo_competitor_rankings enable row level security;

comment on table public.seo_competitors is 'SEO-017 manually added or SERP-discovered competitor domains.';
comment on table public.seo_tracked_keywords is 'SEO-017 canonical target keyword portfolio used for competitor SERP tracking.';
comment on table public.seo_serp_snapshots is 'SEO-017 immutable SERP observations for a tracked keyword.';
comment on table public.seo_competitor_rankings is 'SEO-017 per-domain ranking observations derived from SERP snapshots.';
