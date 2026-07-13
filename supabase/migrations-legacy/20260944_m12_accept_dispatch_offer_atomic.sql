-- M-12 — Atomic dispatch offer accept (close booking↔offer race window).
--
-- Problem (pre-M-12):
--   `acceptDispatchOffer` performed two sequential writes:
--     1. UPDATE bookings SET cleaner_id, status='assigned', ...
--     2. UPDATE dispatch_offers SET status='accepted'
--   plus a follow-up `dispatch_expire_peer_offers` RPC.
--   A concurrent admin reassignment that landed BETWEEN (1) and (2) could:
--     - reassign bookings.cleaner_id to a different cleaner, or
--     - leave dispatch_offers.status='pending' even though the booking is
--       no longer assignable to that cleaner.
--   The dispatch_offers row would then show as a live, pending offer for a
--   booking already assigned elsewhere — the cleaner UI would display it
--   as still actionable until the next cron sweep.
--
-- Fix:
--   Single security-definer RPC that, in one transaction:
--     * locks the dispatch_offers row FOR UPDATE,
--     * locks the bookings row FOR UPDATE,
--     * verifies offer is still pending, cleaner matches, not expired,
--       not yet visible-window-gated,
--     * verifies booking is in an assignable state and not assigned to a
--       different cleaner,
--     * updates booking and offer atomically,
--     * expires every peer pending offer for the same booking,
--   returning a structured JSONB outcome the app maps to the existing
--   `AcceptDispatchOfferResult` typescript shape — no API contract change.
--
-- Constraints (M-12 scope):
--   * Does not change payout formulas or `display_earnings_cents`.
--   * Does not change cleaner-selection logic — only the order/atomicity
--     of the writes that record an already-decided accept.
--   * Idempotent: if the same offer is accepted twice (network retry / SMS
--     double-tap) the RPC returns `failure='not_pending'` with
--     `machine_reason='already_taken'` on the second call without rewriting
--     the booking. If the offer's booking has already been assigned to the
--     same cleaner, the RPC heals any lingering pending offer to 'accepted'
--     (race-recovery) and returns `failure='not_pending'` so the caller
--     does not double-emit notifications.

create or replace function public.accept_dispatch_offer_atomic(
  p_offer_id uuid,
  p_cleaner_id uuid,
  p_response_latency_ms integer,
  p_assign_meta jsonb default '{}'::jsonb,
  p_truth_patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer record;
  v_booking record;
  v_now timestamptz := now();
  v_booking_id uuid;
  v_status text;
  v_dispatch_status text;
  v_cleaner_id uuid;
  v_expired_peers integer := 0;
  v_latency_ms integer;
  v_assignment_type text;
  v_fallback_reason text;
  v_clear_fallback boolean := false;
  v_marketplace_cluster_id text;
  v_marketplace_forecast text;
begin
  v_latency_ms := greatest(0, coalesce(p_response_latency_ms, 0));

  -- 1. Lock the offer row first to serialise concurrent accept attempts.
  select id, booking_id, cleaner_id, status, expires_at, dispatch_visible_at
    into v_offer
  from public.dispatch_offers
  where id = p_offer_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'failure', 'not_found');
  end if;

  if v_offer.cleaner_id is distinct from p_cleaner_id then
    return jsonb_build_object(
      'ok', false,
      'failure', 'wrong_cleaner',
      'booking_id', v_offer.booking_id
    );
  end if;

  if v_offer.status is distinct from 'pending' then
    return jsonb_build_object(
      'ok', false,
      'failure', 'not_pending',
      'booking_id', v_offer.booking_id,
      'offer_status', v_offer.status,
      'machine_reason',
        case
          when v_offer.status = 'accepted' then 'already_taken'
          when v_offer.status = 'expired' then 'already_taken'
          else null
        end
    );
  end if;

  if v_offer.dispatch_visible_at is not null and v_offer.dispatch_visible_at > v_now then
    return jsonb_build_object(
      'ok', false,
      'failure', 'not_visible_yet',
      'booking_id', v_offer.booking_id
    );
  end if;

  if v_offer.expires_at is not null and v_offer.expires_at <= v_now then
    -- Auto-expire so a pending row never lingers behind an accept attempt
    -- that lost the deadline race.
    update public.dispatch_offers
    set status = 'expired',
        responded_at = v_now,
        response_latency_ms = v_latency_ms
    where id = p_offer_id
      and status = 'pending';

    return jsonb_build_object(
      'ok', false,
      'failure', 'expired',
      'booking_id', v_offer.booking_id
    );
  end if;

  v_booking_id := v_offer.booking_id;

  -- 2. Lock the booking row. This is the synchronisation point with admin
  --    reassignment / peer offer accept — whichever transaction acquires
  --    this row lock first commits its assignment; the other observes the
  --    final state and bails out cleanly.
  select id, status, dispatch_status, cleaner_id
    into v_booking
  from public.bookings
  where id = v_booking_id
  for update;

  if not found then
    -- Defensive: orphan offer (booking was deleted). Mark offer expired
    -- so it stops surfacing as pending in cleaner inbox queries.
    update public.dispatch_offers
    set status = 'expired',
        responded_at = v_now,
        response_latency_ms = v_latency_ms
    where id = p_offer_id
      and status = 'pending';
    return jsonb_build_object(
      'ok', false,
      'failure', 'not_found',
      'booking_id', v_booking_id
    );
  end if;

  v_status := lower(coalesce(v_booking.status, ''));
  v_dispatch_status := lower(coalesce(v_booking.dispatch_status, ''));
  v_cleaner_id := v_booking.cleaner_id;

  -- 3a. Race detection — booking is already assigned to a DIFFERENT cleaner
  --     (admin reassign, prior parallel offer accept, etc.). Mark offer
  --     expired in the same transaction so it doesn't linger pending.
  if v_status = 'assigned' and v_cleaner_id is distinct from p_cleaner_id then
    update public.dispatch_offers
    set status = 'expired',
        responded_at = v_now,
        response_latency_ms = v_latency_ms
    where id = p_offer_id
      and status = 'pending';

    return jsonb_build_object(
      'ok', false,
      'failure', 'assigned_other',
      'booking_id', v_booking_id,
      'machine_reason', 'already_taken'
    );
  end if;

  -- 3b. Idempotent re-accept by the SAME cleaner — booking is already
  --     assigned to us; heal the offer status if it lingered pending and
  --     return `not_pending` so the caller treats it as a no-op duplicate.
  if v_status = 'assigned' and v_cleaner_id = p_cleaner_id then
    update public.dispatch_offers
    set status = 'accepted',
        responded_at = coalesce(responded_at, v_now),
        response_latency_ms = coalesce(response_latency_ms, v_latency_ms)
    where id = p_offer_id
      and status = 'pending';

    return jsonb_build_object(
      'ok', false,
      'failure', 'not_pending',
      'booking_id', v_booking_id,
      'machine_reason', 'already_taken'
    );
  end if;

  -- 3c. Booking must be in an assignable lifecycle state. The original
  --     procedural code allowed: pending, pending_assignment, offered.
  if v_status not in ('pending', 'pending_assignment', 'offered') then
    update public.dispatch_offers
    set status = 'expired',
        responded_at = v_now,
        response_latency_ms = v_latency_ms
    where id = p_offer_id
      and status = 'pending';

    return jsonb_build_object(
      'ok', false,
      'failure', 'booking_taken',
      'booking_id', v_booking_id,
      'machine_reason', 'already_taken'
    );
  end if;

  if v_dispatch_status = 'assigned' then
    update public.dispatch_offers
    set status = 'expired',
        responded_at = v_now,
        response_latency_ms = v_latency_ms
    where id = p_offer_id
      and status = 'pending';

    return jsonb_build_object(
      'ok', false,
      'failure', 'booking_taken',
      'booking_id', v_booking_id,
      'machine_reason', 'already_taken'
    );
  end if;

  -- 4. ATOMIC ASSIGNMENT.
  --
  --    Booking-level meta computed by the caller (assignment_type,
  --    fallback_reason from `assignmentTruthPatchForOfferAccept`,
  --    marketplace_* from `marketplaceBookingPatchOnAssign`) is passed in
  --    via JSONB and merged here so the entire assignment is one write.
  --
  --    NULL-as-clear semantic for `fallback_reason`: the truth patch sets
  --    `fallback_reason: null` when the accepting cleaner matches the
  --    selected cleaner. We honour that by clearing the column iff the
  --    JSONB key exists with a JSON `null` value (use `?` to detect
  --    presence, then `->>` for typed read).

  v_assignment_type := nullif(p_assign_meta->>'assignment_type', '');
  if p_truth_patch ? 'assignment_type' then
    v_assignment_type := nullif(p_truth_patch->>'assignment_type', '');
  end if;

  v_fallback_reason := nullif(p_assign_meta->>'fallback_reason', '');
  if p_truth_patch ? 'fallback_reason' then
    v_clear_fallback := (jsonb_typeof(p_truth_patch->'fallback_reason') = 'null');
    if not v_clear_fallback then
      v_fallback_reason := nullif(p_truth_patch->>'fallback_reason', '');
    end if;
  end if;

  v_marketplace_cluster_id := nullif(p_assign_meta->>'marketplace_cluster_id', '');
  v_marketplace_forecast := nullif(p_assign_meta->>'marketplace_forecast_demand', '');

  update public.bookings
  set
    cleaner_id = p_cleaner_id,
    payout_owner_cleaner_id = p_cleaner_id,
    status = 'assigned',
    dispatch_status = 'assigned',
    assigned_at = v_now,
    accepted_at = v_now,
    cleaner_response_status = 'accepted',
    assignment_type = coalesce(v_assignment_type, assignment_type),
    fallback_reason = case
      when v_clear_fallback then null
      when v_fallback_reason is not null then v_fallback_reason
      else fallback_reason
    end,
    marketplace_cluster_id = coalesce(v_marketplace_cluster_id, marketplace_cluster_id),
    marketplace_forecast_demand = coalesce(v_marketplace_forecast, marketplace_forecast_demand)
  where id = v_booking_id;

  -- 5. Mark the winning offer accepted. Idempotent: the WHERE clause keeps
  --    us from clobbering a non-pending row.
  update public.dispatch_offers
  set status = 'accepted',
      responded_at = v_now,
      response_latency_ms = v_latency_ms
  where id = p_offer_id
    and status = 'pending';

  -- 6. Expire all peer pending offers for this booking in the same
  --    transaction. Replaces the previously-separate
  --    `dispatch_expire_peer_offers(p_booking_id, p_winner_offer_id)` call.
  with peer_expire as (
    update public.dispatch_offers
    set status = 'expired',
        responded_at = v_now
    where booking_id = v_booking_id
      and status = 'pending'
      and id <> p_offer_id
    returning 1
  )
  select count(*)::int into v_expired_peers from peer_expire;

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking_id,
    'expired_peers', coalesce(v_expired_peers, 0)
  );
end;
$$;

comment on function public.accept_dispatch_offer_atomic(uuid, uuid, integer, jsonb, jsonb) is
  'M-12: atomic offer accept. Locks the offer + booking row, verifies pending/assignability,
   updates both rows + expires peer offers in one transaction. Closes the race where admin
   reassignment between the booking update and the dispatch_offers update could leave a
   pending offer behind a no-longer-assignable booking.';

revoke all on function public.accept_dispatch_offer_atomic(uuid, uuid, integer, jsonb, jsonb) from public;
grant execute on function public.accept_dispatch_offer_atomic(uuid, uuid, integer, jsonb, jsonb) to service_role;
