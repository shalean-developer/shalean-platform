-- SEO automation: recommendations queue + optional auto-applied title variants (merged after env titleVariant).

create table if not exists public.seo_auto_title_variant (
  slug text primary key,
  variant text not null check (variant in ('A', 'B', 'C')),
  reason text,
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  source text not null default 'optimizer',
  updated_at timestamptz not null default now()
);

create index if not exists seo_auto_title_variant_updated_idx on public.seo_auto_title_variant (updated_at desc);

comment on table public.seo_auto_title_variant is
  'Winning A/B/C template id per hub slug when auto-apply runs; merged in resolveLocationTitleVariant after env titleVariant.';

create table if not exists public.seo_insights_recommendations (
  id uuid primary key default gen_random_uuid(),
  slug text,
  kind text not null,
  severity text not null default 'info' check (severity in ('info', 'warn', 'critical')),
  title text not null,
  detail jsonb not null default '{}'::jsonb,
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  applied_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists seo_insights_recommendations_slug_created_idx
  on public.seo_insights_recommendations (slug, created_at desc);

create index if not exists seo_insights_recommendations_created_idx
  on public.seo_insights_recommendations (created_at desc);

comment on table public.seo_insights_recommendations is
  'Automated SEO UX recommendations from GSC + user_events (scroll, CTA).';

alter table public.seo_auto_title_variant enable row level security;
alter table public.seo_insights_recommendations enable row level security;

create policy "seo_auto_title_variant_service_role"
  on public.seo_auto_title_variant for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "seo_insights_recommendations_service_role"
  on public.seo_insights_recommendations for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
