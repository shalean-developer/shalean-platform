-- MKT-001G — Allow Instagram on publish ledger + durable jobs
-- Instagram Content Publishing (Facebook Login / Page-linked professional account).
-- Forward-only, idempotent constraint widen.

BEGIN;

ALTER TABLE public.marketing_publish_idempotency
  DROP CONSTRAINT IF EXISTS marketing_publish_idempotency_provider_check;

ALTER TABLE public.marketing_publish_idempotency
  ADD CONSTRAINT marketing_publish_idempotency_provider_check
  CHECK (provider IN ('facebook', 'google_business', 'instagram'));

ALTER TABLE public.social_publish_jobs
  DROP CONSTRAINT IF EXISTS social_publish_jobs_provider_check;

ALTER TABLE public.social_publish_jobs
  ADD CONSTRAINT social_publish_jobs_provider_check
  CHECK (provider IN ('facebook', 'google_business', 'instagram'));

COMMIT;
