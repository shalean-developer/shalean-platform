-- Dedupe outbound "couldn't match" hints per inbound Meta message id (wamid).
-- Analytics for accept/decline that did not resolve to an assigned booking.

create table if not exists public.whatsapp_inbound_feedback_dedupe (
  meta_message_id text primary key,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_inbound_feedback_dedupe_created_at_idx
  on public.whatsapp_inbound_feedback_dedupe (created_at desc);

comment on table public.whatsapp_inbound_feedback_dedupe is
  'One row per inbound wamid that already received the unmatched-reply WhatsApp hint; prevents duplicate hints on Meta retries.';

alter table public.whatsapp_inbound_feedback_dedupe enable row level security;

create table if not exists public.whatsapp_cleaner_unmatched_intent_log (
  id uuid primary key default gen_random_uuid(),
  inbound_message_id text,
  cleaner_id uuid not null references public.cleaners (id) on delete cascade,
  phone text,
  intent text not null check (intent in ('accept', 'decline')),
  reason text not null check (reason in ('no_match', 'ambiguous')),
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_cleaner_unmatched_intent_log_cleaner_id_idx
  on public.whatsapp_cleaner_unmatched_intent_log (cleaner_id, created_at desc);

create index if not exists whatsapp_cleaner_unmatched_intent_log_created_at_idx
  on public.whatsapp_cleaner_unmatched_intent_log (created_at desc);

comment on table public.whatsapp_cleaner_unmatched_intent_log is
  'Cleaner WhatsApp reply looked like accept/decline but did not resolve to one assigned booking (no_match or ambiguous).';

alter table public.whatsapp_cleaner_unmatched_intent_log enable row level security;
