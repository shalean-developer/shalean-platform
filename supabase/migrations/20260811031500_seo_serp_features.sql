create table if not exists public.seo_serp_features (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.seo_serp_snapshots(id) on delete cascade,
  keyword_id uuid not null references public.seo_tracked_keywords(id) on delete cascade,
  feature_type text not null check (feature_type in ('featured_snippet','local_pack','people_also_ask','images','video','ai_overview','knowledge_panel','other')),
  owner_type text not null default 'unowned' check (owner_type in ('shalean','competitor','other','unowned')),
  owner_domain text,
  competitor_id uuid references public.seo_competitors(id) on delete set null,
  url text,
  title text,
  position numeric,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists seo_serp_features_keyword_observed_idx on public.seo_serp_features(keyword_id, observed_at desc);
create index if not exists seo_serp_features_type_owner_idx on public.seo_serp_features(feature_type, owner_type, observed_at desc);
create index if not exists seo_serp_features_snapshot_idx on public.seo_serp_features(snapshot_id);

alter table public.seo_serp_features enable row level security;
revoke all on public.seo_serp_features from anon, authenticated;
grant all on public.seo_serp_features to service_role;

comment on table public.seo_serp_features is 'SEO-025 SERP feature observations and ownership derived from SEO-017 SERP snapshots.';
