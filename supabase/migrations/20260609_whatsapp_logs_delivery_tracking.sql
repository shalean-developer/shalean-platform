-- Meta webhook delivery receipts: link rows by Graph message id, store last webhook payload.

alter table public.whatsapp_logs drop constraint if exists whatsapp_logs_status_check;

alter table public.whatsapp_logs
  add constraint whatsapp_logs_status_check
  check (status in ('sent', 'failed', 'failed_delivery'));

alter table public.whatsapp_logs add column if not exists meta_message_id text;

alter table public.whatsapp_logs add column if not exists webhook_payload jsonb;

create unique index if not exists whatsapp_logs_meta_message_id_uidx
  on public.whatsapp_logs (meta_message_id)
  where meta_message_id is not null;

comment on column public.whatsapp_logs.meta_message_id is 'Meta Graph message id (wamid.*) from send response; matched on inbound status webhooks.';
comment on column public.whatsapp_logs.webhook_payload is 'Last Meta status object received for this message (delivery receipts).';
