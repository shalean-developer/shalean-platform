-- MKT-001A / WS4 — Publish idempotency & duplicate-post prevention
-- Source audit: docs/audits/marketing/MKT-001-marketing-platform-engineering-audit.md (C-3 / R-04 / TD-04)
--
-- Adds a server-side, database-enforced idempotency ledger for immediate social
-- publishing (Facebook Page, Google Business). Prevents double-clicks, client
-- retries, and concurrent races from creating duplicate external posts.
--
-- This is an integrity/security control only — NOT the full publish queue.
-- Forward-only, idempotent. Service-role only (writes come from server routes).

BEGIN;

CREATE TABLE IF NOT EXISTS public.marketing_publish_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  provider text NOT NULL,
  target_ref text,
  promotion_id uuid REFERENCES public.promotions (id) ON DELETE SET NULL,
  request_hash text NOT NULL,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'succeeded', 'failed')),
  external_post_id text,
  error_message text,
  attempts integer NOT NULL DEFAULT 1,
  published_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_publish_idempotency_provider_check
    CHECK (provider IN ('facebook', 'google_business'))
);

-- One logical publish per (provider, idempotency_key). This is the concurrency
-- guard: the first inserter wins; concurrent duplicates hit this constraint.
CREATE UNIQUE INDEX IF NOT EXISTS marketing_publish_idempotency_key_uidx
  ON public.marketing_publish_idempotency (provider, idempotency_key);

CREATE INDEX IF NOT EXISTS marketing_publish_idempotency_status_idx
  ON public.marketing_publish_idempotency (provider, status, created_at DESC);

CREATE INDEX IF NOT EXISTS marketing_publish_idempotency_promotion_idx
  ON public.marketing_publish_idempotency (promotion_id)
  WHERE promotion_id IS NOT NULL;

COMMENT ON TABLE public.marketing_publish_idempotency IS
  'MKT-001A: server-side idempotency ledger for social publishing. One row per logical publish (provider, idempotency_key). Prevents duplicate external posts.';

-- Deny-by-default: only the service-role server path may access it.
ALTER TABLE public.marketing_publish_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_publish_idempotency_service_role
  ON public.marketing_publish_idempotency;
CREATE POLICY marketing_publish_idempotency_service_role
  ON public.marketing_publish_idempotency
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

REVOKE ALL ON TABLE public.marketing_publish_idempotency FROM anon;
REVOKE ALL ON TABLE public.marketing_publish_idempotency FROM authenticated;
GRANT ALL ON TABLE public.marketing_publish_idempotency TO service_role;

COMMIT;
