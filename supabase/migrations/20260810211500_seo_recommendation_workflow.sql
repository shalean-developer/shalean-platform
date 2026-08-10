alter table public.seo_insights_recommendations
  add column if not exists workflow_status text not null default 'open',
  add column if not exists owner_email text,
  add column if not exists started_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists dismissed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists verification_note text;

alter table public.seo_insights_recommendations
  drop constraint if exists seo_insights_recommendations_workflow_status_check;

alter table public.seo_insights_recommendations
  add constraint seo_insights_recommendations_workflow_status_check
  check (workflow_status in ('open', 'in_progress', 'applied', 'verified', 'dismissed'));

update public.seo_insights_recommendations
set workflow_status = 'applied', updated_at = now()
where applied_at is not null and workflow_status = 'open';

create index if not exists seo_insights_recommendations_workflow_idx
  on public.seo_insights_recommendations (workflow_status, updated_at desc);

create table if not exists public.seo_recommendation_status_history (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.seo_insights_recommendations(id) on delete cascade,
  from_status text,
  to_status text not null,
  owner_email text,
  changed_by_email text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists seo_recommendation_status_history_rec_idx
  on public.seo_recommendation_status_history (recommendation_id, created_at desc);

alter table public.seo_recommendation_status_history enable row level security;

create policy "seo_recommendation_status_history_service_role"
  on public.seo_recommendation_status_history for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table public.seo_recommendation_status_history is
  'Immutable lifecycle history for SEO recommendations: status, owner, actor and verification/dismissal note.';
