-- Resend webhook event ledger and local suppression list.
-- Webhooks are at-least-once, so svix_id is the idempotency key.

create table if not exists public.email_delivery_events (
  id uuid primary key default gen_random_uuid(),
  svix_id text not null unique,
  event_type text not null,
  resend_email_id text,
  recipient_email text,
  subject text,
  event_created_at timestamptz,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

create index if not exists email_delivery_events_resend_email_idx
  on public.email_delivery_events (resend_email_id, event_created_at desc);

create index if not exists email_delivery_events_recipient_idx
  on public.email_delivery_events (lower(recipient_email), event_created_at desc);

create table if not exists public.email_suppressions (
  email text primary key,
  reason text not null check (reason in ('bounced', 'complained', 'suppressed', 'manual')),
  resend_email_id text,
  source_event_type text,
  details jsonb not null default '{}',
  suppressed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_delivery_events enable row level security;
alter table public.email_suppressions enable row level security;

-- Existing service-role email jobs can read this list before sending.
create or replace function public.is_email_suppressed(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.email_suppressions s
    where lower(s.email) = lower(trim(candidate))
  );
$$;

revoke all on function public.is_email_suppressed(text) from public;
grant execute on function public.is_email_suppressed(text) to service_role;
