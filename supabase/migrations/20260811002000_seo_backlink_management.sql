create table if not exists public.seo_backlink_imports (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'gsc_links_export',
  import_type text not null default 'sample',
  imported_at timestamptz not null default now(),
  imported_by uuid,
  row_count integer not null default 0,
  new_links integer not null default 0,
  notes text
);

create table if not exists public.seo_backlinks (
  id uuid primary key default gen_random_uuid(),
  source_url text not null unique,
  source_domain text not null,
  target_url text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  latest_import_id uuid references public.seo_backlink_imports(id) on delete set null,
  verification_status text not null default 'unverified' check (verification_status in ('unverified','present','lost','unreachable')),
  verified_at timestamptz,
  suspicious boolean not null default false,
  suspicious_reason text,
  review_status text not null default 'unreviewed' check (review_status in ('unreviewed','safe','watch','remove_requested','disavow_review')),
  notes text,
  updated_at timestamptz not null default now()
);

create index if not exists seo_backlinks_domain_idx on public.seo_backlinks(source_domain);
create index if not exists seo_backlinks_seen_idx on public.seo_backlinks(last_seen_at desc);
create index if not exists seo_backlinks_review_idx on public.seo_backlinks(suspicious,review_status);

create table if not exists public.seo_backlink_opportunities (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  url text,
  opportunity_type text not null default 'outreach',
  priority text not null default 'P2',
  status text not null default 'open' check (status in ('open','contacted','won','lost','dismissed')),
  rationale text,
  owner text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.seo_backlink_imports enable row level security;
alter table public.seo_backlinks enable row level security;
alter table public.seo_backlink_opportunities enable row level security;
revoke all on public.seo_backlink_imports, public.seo_backlinks, public.seo_backlink_opportunities from anon, authenticated;
grant all on public.seo_backlink_imports, public.seo_backlinks, public.seo_backlink_opportunities to service_role;
