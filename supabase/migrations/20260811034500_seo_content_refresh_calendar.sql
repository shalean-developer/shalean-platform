create table if not exists public.seo_content_refreshes (
  id uuid primary key default gen_random_uuid(),
  blog_post_id uuid not null references public.blog_posts(id) on delete cascade,
  due_date date,
  owner_email text,
  editor_email text,
  status text not null default 'queued' check (status in ('queued','in_progress','completed','cancelled')),
  reason_codes text[] not null default '{}',
  notes text,
  baseline_clicks integer,
  baseline_impressions integer,
  baseline_position numeric,
  completed_clicks integer,
  completed_impressions integer,
  completed_position numeric,
  baseline_captured_at timestamptz,
  completed_at timestamptz,
  verification_due_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(blog_post_id, status)
);

create table if not exists public.seo_content_refresh_history (
  id uuid primary key default gen_random_uuid(),
  refresh_id uuid not null references public.seo_content_refreshes(id) on delete cascade,
  action text not null,
  actor_email text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists seo_content_refreshes_status_due_idx on public.seo_content_refreshes(status, due_date nulls last);
create index if not exists seo_content_refreshes_post_idx on public.seo_content_refreshes(blog_post_id, created_at desc);
create index if not exists seo_content_refresh_history_refresh_idx on public.seo_content_refresh_history(refresh_id, created_at desc);

alter table public.seo_content_refreshes enable row level security;
alter table public.seo_content_refresh_history enable row level security;
revoke all on public.seo_content_refreshes from anon, authenticated;
revoke all on public.seo_content_refresh_history from anon, authenticated;
grant all on public.seo_content_refreshes to service_role;
grant all on public.seo_content_refresh_history to service_role;

comment on table public.seo_content_refreshes is 'SEO-026 managed content refresh queue with baseline and post-refresh GSC verification.';
comment on table public.seo_content_refresh_history is 'SEO-026 audit trail for content refresh lifecycle actions.';
