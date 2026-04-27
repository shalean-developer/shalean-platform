-- Phase 8C: map inbound WhatsApp replies to the exact dispatch offer (Meta wamid + timing).

alter table public.dispatch_offers
  add column if not exists offer_whatsapp_message_id text,
  add column if not exists whatsapp_sent_at timestamptz,
  add column if not exists response_latency_ms integer;

comment on column public.dispatch_offers.offer_whatsapp_message_id is
  'Meta outbound message id (wamid) for the booking_offer template; matches inbound context.id when cleaner replies in-thread.';
comment on column public.dispatch_offers.whatsapp_sent_at is
  'When the offer WhatsApp was successfully sent to Meta (for response latency vs responded_at).';
comment on column public.dispatch_offers.response_latency_ms is
  'Cleaner reply latency from whatsapp_sent_at (fallback created_at) to accept/reject.';

create unique index if not exists dispatch_offers_whatsapp_message_id_uidx
  on public.dispatch_offers (offer_whatsapp_message_id)
  where offer_whatsapp_message_id is not null;

create index if not exists dispatch_offers_cleaner_pending_expires_idx
  on public.dispatch_offers (cleaner_id, status, expires_at desc)
  where status = 'pending';
