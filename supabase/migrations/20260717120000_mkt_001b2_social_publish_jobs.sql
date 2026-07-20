-- MKT-001B.2 Slice 1 — Durable social publish jobs (execution queue)
-- Plan: docs/audits/marketing/MKT-001B.2-durable-publishing-queue-plan.md
--
-- Separates execution scheduling/retry/DLQ from marketing_publish_idempotency
-- (logical dedupe SoT). Service-role only. Forward-only / idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS public.social_publish_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL
    CHECK (provider IN ('facebook', 'google_business')),
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  target_ref text,
  promotion_id uuid REFERENCES public.promotions (id) ON DELETE SET NULL,
  campaign_name text,
  -- Sanitized PublishRequest snapshot. Never store tokens, secrets, or raw
  -- base64 imageDataUrl / providerPayload blobs.
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_by text NOT NULL,
  correlation_id text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN (
      'queued',
      'leased',
      'retryable',
      'succeeded',
      'dead_letter',
      'cancelled'
    )),
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz,
  attempts integer NOT NULL DEFAULT 0
    CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5
    CHECK (max_attempts >= 1 AND max_attempts <= 25),
  last_error text,
  failure_class text,
  retryable boolean,
  external_post_id text,
  ledger_id uuid,
  lease_holder text,
  lease_expires_at timestamptz,
  dead_lettered_at timestamptz,
  replayed_from_job_id uuid REFERENCES public.social_publish_jobs (id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_publish_jobs_leased_lease_check CHECK (
    status <> 'leased'
    OR (lease_holder IS NOT NULL AND lease_expires_at IS NOT NULL)
  ),
  CONSTRAINT social_publish_jobs_payload_object_check CHECK (jsonb_typeof(payload) = 'object')
);

COMMENT ON TABLE public.social_publish_jobs IS
  'MKT-001B.2: durable social publish execution queue. Logical dedupe remains in marketing_publish_idempotency.';

COMMENT ON COLUMN public.social_publish_jobs.payload IS
  'Sanitized publish snapshot: message, link, promotionId, campaignName, imageUrl only. No secrets / imageDataUrl / tokens.';

COMMENT ON COLUMN public.social_publish_jobs.external_post_id IS
  'When set, workers must not call SocialProvider.publish again — confirm ledger only.';

-- One active execution row per logical publish key.
CREATE UNIQUE INDEX IF NOT EXISTS social_publish_jobs_active_key_uidx
  ON public.social_publish_jobs (provider, idempotency_key)
  WHERE status IN ('queued', 'leased', 'retryable');

CREATE INDEX IF NOT EXISTS social_publish_jobs_due_idx
  ON public.social_publish_jobs (status, scheduled_for, next_attempt_at)
  WHERE status IN ('queued', 'retryable');

CREATE INDEX IF NOT EXISTS social_publish_jobs_lease_expiry_idx
  ON public.social_publish_jobs (lease_expires_at)
  WHERE status = 'leased';

CREATE INDEX IF NOT EXISTS social_publish_jobs_dlq_idx
  ON public.social_publish_jobs (dead_lettered_at DESC NULLS LAST)
  WHERE status = 'dead_letter';

CREATE INDEX IF NOT EXISTS social_publish_jobs_provider_created_idx
  ON public.social_publish_jobs (provider, created_at DESC);

ALTER TABLE public.social_publish_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS social_publish_jobs_service_role ON public.social_publish_jobs;
CREATE POLICY social_publish_jobs_service_role
  ON public.social_publish_jobs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

REVOKE ALL ON TABLE public.social_publish_jobs FROM anon;
REVOKE ALL ON TABLE public.social_publish_jobs FROM authenticated;
GRANT ALL ON TABLE public.social_publish_jobs TO service_role;

-- ---------------------------------------------------------------------------
-- Atomic multi-claim: due queued/retryable → leased (increments attempts)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_social_publish_jobs(
  p_limit integer DEFAULT 10,
  p_holder text DEFAULT NULL,
  p_lease_seconds integer DEFAULT 120
)
RETURNS SETOF public.social_publish_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 10), 50));
  v_holder text := NULLIF(btrim(COALESCE(p_holder, '')), '');
  v_lease integer := GREATEST(30, LEAST(COALESCE(p_lease_seconds, 120), 600));
  v_now timestamptz := now();
BEGIN
  IF v_holder IS NULL THEN
    RAISE EXCEPTION 'p_holder is required';
  END IF;

  RETURN QUERY
  WITH due AS (
    SELECT j.id
    FROM public.social_publish_jobs j
    WHERE j.status IN ('queued', 'retryable')
      AND j.scheduled_for <= v_now
      AND (j.next_attempt_at IS NULL OR j.next_attempt_at <= v_now)
      AND j.attempts < j.max_attempts
    ORDER BY j.scheduled_for ASC, j.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  ),
  claimed AS (
    UPDATE public.social_publish_jobs j
    SET
      status = 'leased',
      lease_holder = v_holder,
      lease_expires_at = v_now + make_interval(secs => v_lease),
      attempts = j.attempts + 1,
      next_attempt_at = NULL,
      updated_at = v_now
    FROM due
    WHERE j.id = due.id
      AND j.status IN ('queued', 'retryable')
    RETURNING j.*
  )
  SELECT * FROM claimed;
END;
$$;

COMMENT ON FUNCTION public.claim_social_publish_jobs(integer, text, integer) IS
  'MKT-001B.2: atomically claim due social publish jobs with per-job lease (SKIP LOCKED).';

REVOKE ALL ON FUNCTION public.claim_social_publish_jobs(integer, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_social_publish_jobs(integer, text, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Recover abandoned leases without incrementing attempts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recover_expired_social_publish_leases(
  p_limit integer DEFAULT 100
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
  v_count integer := 0;
BEGIN
  WITH expired AS (
    SELECT j.id
    FROM public.social_publish_jobs j
    WHERE j.status = 'leased'
      AND j.lease_expires_at IS NOT NULL
      AND j.lease_expires_at < now()
    ORDER BY j.lease_expires_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  ),
  recovered AS (
    UPDATE public.social_publish_jobs j
    SET
      status = 'queued',
      lease_holder = NULL,
      lease_expires_at = NULL,
      updated_at = now()
    FROM expired
    WHERE j.id = expired.id
      AND j.status = 'leased'
    RETURNING j.id
  )
  SELECT COUNT(*)::integer INTO v_count FROM recovered;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.recover_expired_social_publish_leases(integer) IS
  'MKT-001B.2: reset expired leased jobs to queued without incrementing attempts.';

REVOKE ALL ON FUNCTION public.recover_expired_social_publish_leases(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recover_expired_social_publish_leases(integer) TO service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- Primary sub-daily worker via Supabase pg_cron (Vercel Hobby is daily-only).
-- Safe if pg_cron / invoke_nextjs_cron are absent (notice + skip).
-- Distinct dollar-quote tags required: nested $$ reuse is invalid Postgres.
-- Historical reproducibility correction (MKT-001M.1) — behaviour unchanged.
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — skip social-publish-jobs schedule';
    RETURN;
  END IF;

  IF to_regprocedure('public.invoke_nextjs_cron(text)') IS NULL THEN
    RAISE NOTICE 'invoke_nextjs_cron missing — skip social-publish-jobs schedule';
    RETURN;
  END IF;

  FOR r IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN ('social-publish-jobs', 'process-social-publish-jobs')
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'social-publish-jobs',
    '*/5 * * * *',
    $cron$select public.invoke_nextjs_cron('/api/cron/process-social-publish-jobs');$cron$
  );
END
$do$;
