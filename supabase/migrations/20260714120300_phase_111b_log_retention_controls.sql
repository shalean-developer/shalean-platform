-- Phase 1.11B — P1: Safe log retention controls (no mass delete on apply)
-- Audit: F-OPS-001 / DEBT-DB-009
--
-- Introduces:
--   * public.data_retention_settings (config only; pruning stays opt-in)
--   * batched prune_notification_logs
--   * batched-capable prune_system_logs (optional p_batch_size; default keeps cron compatible)
--
-- Does NOT schedule notification_logs pruning and does NOT delete historical rows
-- unless an operator/cron explicitly calls the prune RPCs with an approved retention.
-- Recommended notification_logs retention for later approval: 90 days.

BEGIN;

CREATE TABLE IF NOT EXISTS public.data_retention_settings (
  table_name text PRIMARY KEY,
  retention_days integer NOT NULL,
  batch_size integer NOT NULL DEFAULT 5000,
  prune_enabled boolean NOT NULL DEFAULT false,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT data_retention_settings_days_chk CHECK (retention_days >= 1 AND retention_days <= 3650),
  CONSTRAINT data_retention_settings_batch_chk CHECK (batch_size >= 100 AND batch_size <= 100000)
);

COMMENT ON TABLE public.data_retention_settings IS
  'Phase 1.11B: declared retention policy. prune_enabled=false means operators must not auto-delete until approved.';

ALTER TABLE public.data_retention_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.data_retention_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.data_retention_settings TO service_role;

INSERT INTO public.data_retention_settings (table_name, retention_days, batch_size, prune_enabled, notes)
VALUES
  (
    'system_logs',
    30,
    5000,
    true,
    'Matches existing prune_system_logs cron default (SYSTEM_LOG_RETENTION_DAYS). Already in production use.'
  ),
  (
    'notification_logs',
    90,
    2000,
    false,
    'Proposed retention only. Do not enable auto-prune until finance/ops explicitly approve and wire cron.'
  )
ON CONFLICT (table_name) DO NOTHING;

-- Batched notification_logs prune (service_role only after grant lockdown migration).
CREATE OR REPLACE FUNCTION public.prune_notification_logs(
  p_retention_days integer DEFAULT NULL,
  p_batch_size integer DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_days integer;
  v_batch integer;
  v_enabled boolean;
  n bigint := 0;
BEGIN
  SELECT retention_days, batch_size, prune_enabled
  INTO v_days, v_batch, v_enabled
  FROM public.data_retention_settings
  WHERE table_name = 'notification_logs';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'data_retention_settings row missing for notification_logs';
  END IF;

  -- Explicit call args override table defaults, but prune_enabled gate remains
  -- unless caller passes p_retention_days AND we allow override... keep gate:
  IF NOT v_enabled THEN
    RAISE EXCEPTION
      'notification_logs prune_enabled=false; refuse delete until retention approved (set prune_enabled=true)';
  END IF;

  v_days := greatest(1, least(coalesce(p_retention_days, v_days), 3650));
  v_batch := greatest(100, least(coalesce(p_batch_size, v_batch), 100000));

  WITH d AS (
    DELETE FROM public.notification_logs nl
    USING (
      SELECT id
      FROM public.notification_logs
      WHERE created_at < now() - make_interval(days => v_days)
      ORDER BY created_at ASC
      LIMIT v_batch
    ) doomed
    WHERE nl.id = doomed.id
    RETURNING 1
  )
  SELECT count(*) INTO n FROM d;

  RETURN coalesce(n, 0);
END;
$$;

COMMENT ON FUNCTION public.prune_notification_logs(integer, integer) IS
  'Phase 1.11B: batched notification_logs delete. Requires data_retention_settings.prune_enabled=true. Default proposed retention 90d — NOT auto-scheduled.';

REVOKE ALL ON FUNCTION public.prune_notification_logs(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prune_notification_logs(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.prune_notification_logs(integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prune_notification_logs(integer, integer) TO service_role;

-- Upgrade system_logs prune to optional batching (backward compatible: single arg still works).
CREATE OR REPLACE FUNCTION public.prune_system_logs(
  p_retention_days integer DEFAULT 30,
  p_batch_size integer DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  days integer := greatest(1, least(coalesce(p_retention_days, 30), 365));
  v_batch integer;
  n bigint := 0;
BEGIN
  IF p_batch_size IS NULL THEN
    -- Legacy behaviour: delete all matching rows in one statement (existing weekly cron).
    WITH d AS (
      DELETE FROM public.system_logs
      WHERE created_at < now() - make_interval(days => days)
      RETURNING 1
    )
    SELECT count(*) INTO n FROM d;
  ELSE
    v_batch := greatest(100, least(p_batch_size, 100000));
    WITH d AS (
      DELETE FROM public.system_logs sl
      USING (
        SELECT id
        FROM public.system_logs
        WHERE created_at < now() - make_interval(days => days)
        ORDER BY created_at ASC
        LIMIT v_batch
      ) doomed
      WHERE sl.id = doomed.id
      RETURNING 1
    )
    SELECT count(*) INTO n FROM d;
  END IF;

  RETURN coalesce(n, 0);
END;
$$;

COMMENT ON FUNCTION public.prune_system_logs(integer, integer) IS
  'Deletes system_logs older than retention (1–365 days, default 30). Optional p_batch_size enables batched deletes. Returns rows removed.';

REVOKE ALL ON FUNCTION public.prune_system_logs(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prune_system_logs(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.prune_system_logs(integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prune_system_logs(integer, integer) TO service_role;

COMMIT;
