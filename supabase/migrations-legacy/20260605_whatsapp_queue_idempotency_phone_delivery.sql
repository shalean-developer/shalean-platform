-- Idempotency: only one active row per key (explicit statuses).
-- Phone variants for debugging / non-SA expansion later.

drop index if exists public.whatsapp_queue_idempotency_active_uidx;
create unique index whatsapp_queue_idempotency_active_uidx
  on public.whatsapp_queue (idempotency_key)
  where idempotency_key is not null
    and status in ('pending', 'processing', 'sent');

alter table public.whatsapp_queue
  add column if not exists phone_raw text,
  add column if not exists phone_e164 text,
  add column if not exists phone_digits text;

update public.whatsapp_queue
set phone_digits = coalesce(phone_digits, phone)
where phone_digits is null and phone is not null;

comment on column public.whatsapp_queue.phone_raw is 'Original input from client/admin (truncated).';
comment on column public.whatsapp_queue.phone_e164 is 'Best-effort E.164 for SMS / logs (nullable).';
comment on column public.whatsapp_queue.phone_digits is 'Meta `to` digits; mirrors phone when unset.';
