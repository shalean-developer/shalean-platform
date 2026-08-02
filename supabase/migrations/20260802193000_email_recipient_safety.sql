-- Prevent authentication-only aliases from entering customer email campaigns.
-- These addresses are generated from cleaner phone numbers and are not inboxes.

alter table if exists public.email_campaign_sends
  drop constraint if exists email_campaign_sends_real_recipient_check;

alter table if exists public.email_campaign_sends
  add constraint email_campaign_sends_real_recipient_check
  check (
    recipient_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and lower(recipient_email) not like '%@cleaner.shalean.com'
  ) not valid;

-- Existing historical bounce rows may violate the new rule. NOT VALID makes the
-- constraint apply to all new writes immediately without blocking deployment.

-- A database-backed idempotency key prevents two cron/server instances from
-- claiming and sending the same campaign email at the same time.
alter table if exists public.email_campaign_sends
  add column if not exists idempotency_key text;

create unique index if not exists email_campaign_sends_idempotency_key_uidx
  on public.email_campaign_sends (idempotency_key)
  where idempotency_key is not null;
