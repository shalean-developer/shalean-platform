-- Persist the time a WhatsApp queue job is successfully handed to the provider.
--
-- `apps/web/lib/whatsapp/providerQueue.ts` already writes `sent_at` when it
-- transitions a job from processing -> sent. Production was missing this
-- column, causing the entire success update to fail and leaving jobs stuck in
-- `processing`; stale recovery then retried them and could resend the same
-- message repeatedly.

alter table public.whatsapp_queue
  add column if not exists sent_at timestamptz;
