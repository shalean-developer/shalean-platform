-- Social platform connections (Google Business Profile OAuth, etc.)
-- Stores encrypted refresh tokens; access tokens are short-lived and refreshed automatically.

create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null
    check (provider in (
      'google_business',
      'facebook',
      'instagram',
      'linkedin',
      'pinterest',
      'twitter'
    )),
  account_name text,
  account_id text,
  location_name text,
  location_id text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  connected_by text,
  connected_at timestamptz not null default now(),
  last_sync timestamptz,
  last_publish_at timestamptz,
  status text not null default 'pending_location'
    check (status in ('connected', 'pending_location', 'error', 'disconnected')),
  health text not null default 'unknown'
    check (health in ('healthy', 'degraded', 'error', 'unknown')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider)
);

comment on table public.social_accounts is
  'Admin social publishing connections. Refresh tokens must be stored encrypted at rest.';
comment on column public.social_accounts.refresh_token is
  'Encrypted OAuth refresh token (AES-256-GCM). Never expose to clients.';
comment on column public.social_accounts.access_token is
  'Encrypted short-lived access token; refreshed automatically when expired.';
comment on column public.social_accounts.metadata is
  'Provider-specific JSON (available locations, last error, Google account resource names, etc.).';

create index if not exists social_accounts_provider_status_idx
  on public.social_accounts (provider, status);

create table if not exists public.social_publish_history (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  promotion_id uuid references public.promotions (id) on delete set null,
  campaign_name text,
  status text not null
    check (status in ('published', 'failed')),
  response_id text,
  api_response jsonb not null default '{}'::jsonb,
  error_message text,
  published_by text,
  created_at timestamptz not null default now()
);

comment on table public.social_publish_history is
  'Audit trail for one-click social publishes (Google Business, Facebook, etc.).';

create index if not exists social_publish_history_provider_created_idx
  on public.social_publish_history (provider, created_at desc);

create index if not exists social_publish_history_promotion_idx
  on public.social_publish_history (promotion_id);

alter table public.social_accounts enable row level security;
alter table public.social_publish_history enable row level security;

create policy "social_accounts_service_role"
  on public.social_accounts for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "social_publish_history_service_role"
  on public.social_publish_history for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
