-- Outbound WhatsApp queue: decouple API requests from Meta Cloud API delivery + retries.

create table if not exists public.whatsapp_queue (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  type text not null check (type in ('text', 'template')),
  payload jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts int not null default 0,
  last_error text,
  meta_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_queue_pending_created_idx
  on public.whatsapp_queue (created_at asc)
  where status = 'pending';

create index if not exists whatsapp_queue_meta_message_id_idx
  on public.whatsapp_queue (meta_message_id)
  where meta_message_id is not null;

comment on table public.whatsapp_queue is 'Meta WhatsApp outbound queue; processed by /api/cron/whatsapp-worker and inline flush for SMS fallback paths.';
comment on column public.whatsapp_queue.payload is 'text: {"kind":"text","text":"..."} | template: {"kind":"template","templateName":"...","language":"en","bodyParams":["..."]}';
comment on column public.whatsapp_queue.context is 'Opaque logging context (source, bookingId, etc.).';

alter table public.whatsapp_queue enable row level security;
