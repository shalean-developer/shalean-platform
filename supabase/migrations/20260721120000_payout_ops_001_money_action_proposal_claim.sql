-- PAYOUT-OPS-001 — Office pending approvals: atomic claim, statuses, queue index, duplicate guard
-- Adds processing/failed statuses, claim RPC, unique pending key, list index.
-- Forward-only. Service-role EXECUTE on claim RPC.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Status check: add processing + failed
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_money_action_proposals
  DROP CONSTRAINT IF EXISTS admin_money_action_proposals_status_check;

ALTER TABLE public.admin_money_action_proposals
  ADD CONSTRAINT admin_money_action_proposals_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'processing'::text,
    'approved'::text,
    'rejected'::text,
    'expired'::text,
    'failed'::text
  ]));

COMMENT ON COLUMN public.admin_money_action_proposals.status IS
  'pending → processing (atomic claim) → approved|failed; or pending → rejected|expired.';

-- ---------------------------------------------------------------------------
-- 2) Queue index for Office list
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS admin_money_action_proposals_queue_idx
  ON public.admin_money_action_proposals (status, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_money_action_proposals_cleaner_pending_idx
  ON public.admin_money_action_proposals (status, created_at DESC)
  WHERE status = ANY (ARRAY['pending'::text, 'processing'::text]);

-- ---------------------------------------------------------------------------
-- 3) Duplicate pending/processing guard (booking + action + cleaner key)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS admin_money_action_proposals_one_open_uidx
  ON public.admin_money_action_proposals (
    booking_id,
    action_type,
    (COALESCE(payload->>'cleaner_id', ''))
  )
  WHERE status = ANY (ARRAY['pending'::text, 'processing'::text]);

COMMENT ON INDEX public.admin_money_action_proposals_one_open_uidx IS
  'PAYOUT-OPS-001: at most one open (pending|processing) proposal per booking+action+cleaner.';

-- ---------------------------------------------------------------------------
-- 4) Atomic claim: pending → processing (exactly one winner)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_admin_money_action_proposal(
  p_proposal_id uuid,
  p_actor_id uuid,
  p_allow_self boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.admin_money_action_proposals%ROWTYPE;
BEGIN
  IF p_proposal_id IS NULL OR p_actor_id IS NULL THEN
    RETURN jsonb_build_object('claimed', false, 'code', 'invalid_params');
  END IF;

  -- Expire lazily if still pending past expires_at
  UPDATE public.admin_money_action_proposals
  SET status = 'expired'
  WHERE id = p_proposal_id
    AND status = 'pending'
    AND expires_at <= now();

  SELECT * INTO v_row
  FROM public.admin_money_action_proposals
  WHERE id = p_proposal_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('claimed', false, 'code', 'proposal_not_found');
  END IF;

  IF v_row.status = 'approved' THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'code', 'proposal_already_approved',
      'status', v_row.status,
      'proposal', to_jsonb(v_row)
    );
  END IF;

  IF v_row.status = 'rejected' THEN
    RETURN jsonb_build_object('claimed', false, 'code', 'proposal_already_rejected', 'status', v_row.status);
  END IF;

  IF v_row.status = 'expired' THEN
    RETURN jsonb_build_object('claimed', false, 'code', 'proposal_expired', 'status', v_row.status);
  END IF;

  IF v_row.status = 'failed' THEN
    RETURN jsonb_build_object('claimed', false, 'code', 'proposal_failed', 'status', v_row.status);
  END IF;

  IF v_row.status = 'processing' THEN
    RETURN jsonb_build_object('claimed', false, 'code', 'proposal_not_pending', 'status', v_row.status);
  END IF;

  IF v_row.status <> 'pending' THEN
    RETURN jsonb_build_object('claimed', false, 'code', 'proposal_not_pending', 'status', v_row.status);
  END IF;

  IF NOT p_allow_self AND v_row.proposed_by = p_actor_id THEN
    RETURN jsonb_build_object('claimed', false, 'code', 'maker_checker_self_approve', 'status', v_row.status);
  END IF;

  UPDATE public.admin_money_action_proposals
  SET
    status = 'processing',
    reviewed_by = p_actor_id,
    reviewed_at = now()
  WHERE id = p_proposal_id
    AND status = 'pending'
    AND expires_at > now()
    AND (p_allow_self OR proposed_by <> p_actor_id)
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('claimed', false, 'code', 'proposal_not_pending');
  END IF;

  RETURN jsonb_build_object(
    'claimed', true,
    'code', 'ok',
    'proposal', to_jsonb(v_row)
  );
END;
$$;

COMMENT ON FUNCTION public.claim_admin_money_action_proposal(uuid, uuid, boolean) IS
  'PAYOUT-OPS-001: atomically claim a pending money-action proposal (pending→processing). Exactly one concurrent caller wins.';

REVOKE ALL ON FUNCTION public.claim_admin_money_action_proposal(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_admin_money_action_proposal(uuid, uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.claim_admin_money_action_proposal(uuid, uuid, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_admin_money_action_proposal(uuid, uuid, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 5) Atomic reject: pending → rejected (no earnings mutation)
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
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_params');
  END IF;

  v_note := nullif(btrim(coalesce(p_review_note, '')), '');
  IF v_note IS NULL OR char_length(v_note) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'review_note_required');
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
    RETURN jsonb_build_object('ok', false, 'code', 'proposal_not_found');
  END IF;

  IF v_row.status = 'rejected' THEN
    RETURN jsonb_build_object('ok', true, 'code', 'already_rejected', 'already_processed', true, 'proposal', to_jsonb(v_row));
  END IF;

  IF v_row.status = 'approved' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'proposal_already_approved', 'status', v_row.status);
  END IF;

  IF v_row.status = 'expired' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'proposal_expired', 'status', v_row.status);
  END IF;

  IF v_row.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'proposal_not_pending', 'status', v_row.status);
  END IF;

  IF NOT p_allow_self AND v_row.proposed_by = p_actor_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'maker_checker_self_approve', 'status', v_row.status);
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
    RETURN jsonb_build_object('ok', false, 'code', 'proposal_not_pending');
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', 'ok', 'proposal', to_jsonb(v_row));
END;
$$;

COMMENT ON FUNCTION public.reject_admin_money_action_proposal(uuid, uuid, text, boolean) IS
  'PAYOUT-OPS-001: atomically reject a pending money-action proposal. Never mutates earnings.';

REVOKE ALL ON FUNCTION public.reject_admin_money_action_proposal(uuid, uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_admin_money_action_proposal(uuid, uuid, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.reject_admin_money_action_proposal(uuid, uuid, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reject_admin_money_action_proposal(uuid, uuid, text, boolean) TO service_role;

COMMIT;
