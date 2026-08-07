alter table if exists public.whatsapp_queue
  add column if not exists provider text not null default 'meta',
  add column if not exists provider_message_id text,
  add column if not exists recipient_role text;

alter table if exists public.whatsapp_queue
  drop constraint if exists whatsapp_queue_provider_check;
alter table if exists public.whatsapp_queue
  add constraint whatsapp_queue_provider_check check (provider in ('meta','flaxxa'));

alter table if exists public.whatsapp_queue
  drop constraint if exists whatsapp_queue_recipient_role_check;
alter table if exists public.whatsapp_queue
  add constraint whatsapp_queue_recipient_role_check check (recipient_role is null or recipient_role in ('cleaner','customer'));

create table if not exists public.whatsapp_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('meta','flaxxa')),
  provider_event_id text,
  provider_message_id text,
  direction text not null check (direction in ('inbound','status')),
  phone text,
  event_type text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists whatsapp_provider_events_dedupe_idx
  on public.whatsapp_provider_events(provider, provider_event_id)
  where provider_event_id is not null;

create table if not exists public.whatsapp_marketing_consent (
  phone text primary key,
  customer_id uuid,
  status text not null default 'unknown' check (status in ('unknown','requested','granted','opted_out')),
  source text,
  template_name text,
  requested_at timestamptz,
  granted_at timestamptz,
  opted_out_at timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_provider_events enable row level security;
alter table public.whatsapp_marketing_consent enable row level security;

comment on table public.whatsapp_provider_events is 'Provider-neutral WhatsApp inbound/status webhook event ledger for Meta and Flaxxa.';
comment on table public.whatsapp_marketing_consent is 'Phone-level WhatsApp marketing consent state for customer campaigns.';
comment on column public.whatsapp_queue.provider_message_id is 'Provider-neutral outbound message id; meta_message_id remains legacy compatibility.';
