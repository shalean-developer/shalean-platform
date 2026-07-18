-- MKT-001I — Allow X (Twitter) on publish ledger + durable jobs
-- Registry / ledger key is `x`. social_accounts.provider remains `twitter` (existing CHECK).

BEGIN;

ALTER TABLE public.marketing_publish_idempotency
  DROP CONSTRAINT IF EXISTS marketing_publish_idempotency_provider_check;

ALTER TABLE public.marketing_publish_idempotency
  ADD CONSTRAINT marketing_publish_idempotency_provider_check
  CHECK (provider IN ('facebook', 'google_business', 'instagram', 'x'));

ALTER TABLE public.social_publish_jobs
  DROP CONSTRAINT IF EXISTS social_publish_jobs_provider_check;

ALTER TABLE public.social_publish_jobs
  ADD CONSTRAINT social_publish_jobs_provider_check
  CHECK (provider IN ('facebook', 'google_business', 'instagram', 'x'));

COMMIT;
