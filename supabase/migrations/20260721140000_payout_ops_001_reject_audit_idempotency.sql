-- PAYOUT-OPS-001 / KI-OPS-003 — Reject audit exactly-once
-- 1) Explicit transition_applied on reject RPC (winner only).
-- 2) Deterministic reference + unique index so concurrent audit inserts cannot duplicate.
-- Forward-only. Does not mutate earnings or weaken maker–checker.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Deduplicate existing reject audits (keep earliest per proposal_id)
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY context->>'proposal_id'
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.payout_audit_events
  WHERE event_type = 'visit_earnings_adjustment_rejected'
    AND NULLIF(btrim(context->>'proposal_id'), '') IS NOT NULL
)
DELETE FROM public.payout_audit_events
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Backfill deterministic rejection reference for uniqueness
UPDATE public.payout_audit_events
SET reference = 'vea_rejected:' || (context->>'proposal_id')
WHERE event_type = 'visit_earnings_adjustment_rejected'
  AND NULLIF(btrim(context->>'proposal_id'), '') IS NOT NULL
  AND (
    reference IS NULL
    OR btrim(reference) = ''
    OR reference <> ('vea_rejected:' || (context->>'proposal_id'))
  );

-- ---------------------------------------------------------------------------
-- 2) Unique business key: one reject audit per proposal (via reference)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS payout_audit_events_vea_rejected_ref_uidx
  ON public.payout_audit_events (reference)
  WHERE event_type = 'visit_earnings_adjustment_rejected'
    AND reference IS NOT NULL;

COMMENT ON INDEX public.payout_audit_events_vea_rejected_ref_uidx IS
  'KI-OPS-003: at most one visit_earnings_adjustment_rejected audit per proposal (reference = vea_rejected:<proposal_id>). Other event types for the same proposal remain allowed.';

-- ---------------------------------------------------------------------------
-- 3) Reject RPC: return transition_applied so app audits only on winner
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_admin_money_action_proposal(
  p_proposal_id uuid,
  p_actor_id uuid,
  p_review_note text,
  p_allow_self boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.admin_money_action_proposals%ROWTYPE;
  v_note text;
BEGIN
  IF p_proposal_id IS NULL OR p_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_params', 'transition_applied', false);
  END IF;

  v_note := nullif(btrim(coalesce(p_review_note, '')), '');
  IF v_note IS NULL OR char_length(v_note) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'review_note_required', 'transition_applied', false);
  END IF;

  UPDATE public.admin_money_action_proposals
  SET status = 'expired'
  WHERE id = p_proposal_id
    AND status = 'pending'
    AND expires_at <= now();

  SELECT * INTO v_row
  FROM public.admin_money_action_proposals
  WHERE id = p_proposal_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'proposal_not_found', 'transition_applied', false);
  END IF;

  IF v_row.status = 'rejected' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'already_rejected',
      'already_processed', true,
      'transition_applied', false,
      'proposal', to_jsonb(v_row)
    );
  END IF;

  IF v_row.status = 'approved' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'proposal_already_approved',
      'status', v_row.status,
      'transition_applied', false
    );
  END IF;

  IF v_row.status = 'expired' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'proposal_expired',
      'status', v_row.status,
      'transition_applied', false
    );
  END IF;

  IF v_row.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'proposal_not_pending',
      'status', v_row.status,
      'transition_applied', false
    );
  END IF;

  IF NOT p_allow_self AND v_row.proposed_by = p_actor_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'maker_checker_self_approve',
      'status', v_row.status,
      'transition_applied', false
    );
  END IF;

  UPDATE public.admin_money_action_proposals
  SET
    status = 'rejected',
    reviewed_by = p_actor_id,
    reviewed_at = now(),
    review_note = v_note
  WHERE id = p_proposal_id
    AND status = 'pending'
    AND expires_at > now()
    AND (p_allow_self OR proposed_by <> p_actor_id)
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    -- Concurrent loser: re-read; if another request already rejected, idempotent success.
    SELECT * INTO v_row
    FROM public.admin_money_action_proposals
    WHERE id = p_proposal_id;

    IF FOUND AND v_row.status = 'rejected' THEN
      RETURN jsonb_build_object(
        'ok', true,
        'code', 'already_rejected',
        'already_processed', true,
        'transition_applied', false,
        'proposal', to_jsonb(v_row)
      );
    END IF;

    RETURN jsonb_build_object('ok', false, 'code', 'proposal_not_pending', 'transition_applied', false);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'ok',
    'already_processed', false,
    'transition_applied', true,
    'proposal', to_jsonb(v_row)
  );
END;
$$;

COMMENT ON FUNCTION public.reject_admin_money_action_proposal(uuid, uuid, text, boolean) IS
  'PAYOUT-OPS-001 / KI-OPS-003: atomically reject pending money-action proposal. transition_applied=true only for the winning pending→rejected update. Never mutates earnings.';

REVOKE ALL ON FUNCTION public.reject_admin_money_action_proposal(uuid, uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_admin_money_action_proposal(uuid, uuid, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.reject_admin_money_action_proposal(uuid, uuid, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reject_admin_money_action_proposal(uuid, uuid, text, boolean) TO service_role;

COMMIT;
