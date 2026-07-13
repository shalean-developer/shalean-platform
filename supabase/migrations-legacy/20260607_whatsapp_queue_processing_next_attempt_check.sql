-- Invariant: `processing` means actively sending; schedule lives on `pending` only.
-- Aligns with recovery (only resets processing rows with null next_attempt_at) and claim clearing next_attempt_at.

update public.whatsapp_queue
set next_attempt_at = null
where status = 'processing'
  and next_attempt_at is not null;

alter table public.whatsapp_queue
  drop constraint if exists whatsapp_queue_processing_next_attempt_null;

alter table public.whatsapp_queue
  add constraint whatsapp_queue_processing_next_attempt_null
  check (not (status = 'processing' and next_attempt_at is not null));

comment on constraint whatsapp_queue_processing_next_attempt_null on public.whatsapp_queue is
  'While status is processing, next_attempt_at must be null (backoff only on pending).';
