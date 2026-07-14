-- Idempotency + Meta delivery lifecycle on outbound queue rows.

alter table public.whatsapp_queue
  add column if not exists idempotency_key text,
  add column if not exists delivery_status text;

comment on column public.whatsapp_queue.idempotency_key is 'Stable key (e.g. bookingId + event) to prevent duplicate sends while row is not failed.';
comment on column public.whatsapp_queue.delivery_status is 'Meta lifecycle: sent | delivered | read | failed (from webhooks); null until accepted or unknown.';

create unique index if not exists whatsapp_queue_idempotency_active_uidx
  on public.whatsapp_queue (idempotency_key)
  where idempotency_key is not null and status <> 'failed';
