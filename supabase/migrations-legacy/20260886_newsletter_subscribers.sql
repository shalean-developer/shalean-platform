-- Marketing newsletter signups from the public site.
-- Inserts go through apps/web API routes using the Supabase service role (RLS has no policies for anon/authenticated).

create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text not null default 'marketing_footer',
  created_at timestamptz not null default now()
);

create unique index newsletter_subscribers_email_normalized_uidx
  on public.newsletter_subscribers (lower(trim(email)));

alter table public.newsletter_subscribers enable row level security;

comment on table public.newsletter_subscribers is
  'Newsletter signups; public writes only via /api/newsletter/subscribe (service role).';
