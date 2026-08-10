alter table public.seo_tracked_keywords
  add column if not exists service_name text,
  add column if not exists intent text,
  add column if not exists baseline_rank numeric,
  add column if not exists target_rank numeric,
  add column if not exists owner_email text,
  add column if not exists notes text;

alter table public.seo_tracked_keywords
  drop constraint if exists seo_tracked_keywords_intent_check;

alter table public.seo_tracked_keywords
  add constraint seo_tracked_keywords_intent_check
  check (intent is null or intent in ('transactional','commercial','informational','navigational','local'));

create index if not exists seo_tracked_keywords_target_path_idx
  on public.seo_tracked_keywords(target_path)
  where active;

create index if not exists seo_tracked_keywords_service_location_idx
  on public.seo_tracked_keywords(service_name, location_name)
  where active;

comment on table public.seo_tracked_keywords is
  'Canonical SEO keyword portfolio used by competitor intelligence and SEO-022 ownership/targets.';
