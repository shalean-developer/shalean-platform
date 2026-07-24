-- PAYOUT-OPS: expire overdue pending money-action proposals (list/read path)
-- Narrow, idempotent: ONLY status='pending' AND expires_at <= now() → status='expired'.
-- Does not mutate payload, payout values, earnings, approved/rejected/processing/failed rows.
-- Forward-only. Service-role EXECUTE only.

BEGIN;

CREATE OR REPLACE FUNCTION public.expire_overdue_admin_money_action_proposals(
  p_limit integer DEFAULT 500
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_limit integer;
  v_expired_count integer := 0;
  v_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 5000);

  WITH due AS (
    SELECT id
    FROM public.admin_money_action_proposals
    WHERE status = 'pending'
      AND expires_at <= now()
    ORDER BY expires_at ASC, id ASC
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.admin_money_action_proposals AS p
    SET status = 'expired'
    FROM due
    WHERE p.id = due.id
      AND p.status = 'pending'
      AND p.expires_at <= now()
    RETURNING p.id
  )
  SELECT
    COALESCE(array_agg(id), ARRAY[]::uuid[]),
    COALESCE(count(*)::integer, 0)
  INTO v_ids, v_expired_count
  FROM updated;

  RETURN jsonb_build_object(
    'ok', true,
    'expired_count', v_expired_count,
    'expired_ids', to_jsonb(v_ids)
  );
END;
$$;

COMMENT ON FUNCTION public.expire_overdue_admin_money_action_proposals(integer) IS
  'PAYOUT-OPS: idempotently expire overdue pending admin_money_action_proposals (pending→expired only). Safe under concurrent callers.';

REVOKE ALL ON FUNCTION public.expire_overdue_admin_money_action_proposals(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_overdue_admin_money_action_proposals(integer) FROM anon;
REVOKE ALL ON FUNCTION public.expire_overdue_admin_money_action_proposals(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.expire_overdue_admin_money_action_proposals(integer) TO service_role;

COMMIT;
