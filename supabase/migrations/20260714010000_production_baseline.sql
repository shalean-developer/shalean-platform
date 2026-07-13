-- =============================================================================
-- PROCESSED PRODUCTION SCHEMA BASELINE DRAFT (REVIEW ONLY)
-- =============================================================================
-- Source: docs/database-baseline/production-schema-source.sql
-- Branch: chore/database-schema-baseline
-- Generated: 2026-07-13T22:41:22.373Z
-- Status: DRAFT — do not apply to production; do not add to supabase/migrations yet
--
-- Preprocessing applied:
--   1. Removed all object-ownership reassignment statements
--   2. Excluded ephemeral blog draft backup tables and related DDL/ACL/RLS
--   3. Preserved public schema objects, auth.users FKs, grants, realtime pub membership
--   4. Did NOT replace YOUR_DOMAIN / YOUR_CRON_SECRET placeholders
--   5. Did NOT invent storage buckets, cron schedules, auth users, or secrets
--   6. SECURITY DEFINER functions left unchanged (see processed-baseline-review.md)
--
-- Source SHA-256: 9301dd5a6e168e1a570f19f029675e1475fcd0f0efa91a4f1f50f55a50b14af7
-- =============================================================================




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."blog_post_source" AS ENUM (
    'editorial',
    'programmatic',
    'high_conversion'
);


CREATE TYPE "public"."blog_post_status" AS ENUM (
    'draft',
    'published',
    'scheduled'
);


CREATE TYPE "public"."booking_status" AS ENUM (
    'draft',
    'awaiting_payment',
    'paid',
    'assigned',
    'cleaner_en_route',
    'cleaner_arrived',
    'in_progress',
    'completed',
    'cancelled',
    'refunded'
);


CREATE OR REPLACE FUNCTION "public"."accept_dispatch_offer_atomic"("p_offer_id" "uuid", "p_cleaner_id" "uuid", "p_response_latency_ms" integer, "p_assign_meta" "jsonb" DEFAULT '{}'::"jsonb", "p_truth_patch" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


COMMENT ON FUNCTION "public"."accept_dispatch_offer_atomic"("p_offer_id" "uuid", "p_cleaner_id" "uuid", "p_response_latency_ms" integer, "p_assign_meta" "jsonb", "p_truth_patch" "jsonb") IS 'M-12: atomic offer accept. Locks the offer + booking row, verifies pending/assignability,
   updates both rows + expires peer offers in one transaction. Closes the race where admin
   reassignment between the booking update and the dispatch_offers update could leave a
   pending offer behind a no-longer-assignable booking.';



CREATE OR REPLACE FUNCTION "public"."add_team_members_guarded"("p_team_id" "uuid", "p_cleaner_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_capacity int;
  v_current int;
  v_is_active boolean;
  v_to_add int;
  v_now timestamptz := now();
  v_inserted int := 0;
  v_ids jsonb := '[]'::jsonb;
  v_after int;
  v_new_ids uuid[];
  v_row_diag int;
  v_on_roster int;
begin
  if p_cleaner_ids is null or coalesce(array_length(p_cleaner_ids, 1), 0) = 0 then
    return jsonb_build_object('ok', true, 'inserted', 0, 'cleaner_ids', '[]'::jsonb);
  end if;

  if array_length(p_cleaner_ids, 1) > 50 then
    return jsonb_build_object(
      'ok', false,
      'error', 'Too many IDs.',
      'code', 'TOO_MANY_IDS',
      'http_status', 400
    );
  end if;

  set local lock_timeout = '2s';
  set local statement_timeout = '3s';

  begin
    select t.capacity_per_day, coalesce(t.is_active, false)
    into v_capacity, v_is_active
    from public.teams t
    where t.id = p_team_id
    for update;
    if not found then
      return jsonb_build_object(
        'ok', false,
        'error', 'Team not found.',
        'code', 'TEAM_NOT_FOUND',
        'http_status', 404
      );
    end if;
  exception
    when lock_not_available then
      return jsonb_build_object(
        'ok', false,
        'error', 'Team is busy, try again.',
        'code', 'TEAM_BUSY',
        'http_status', 409
      );
    when deadlock_detected then
      return jsonb_build_object(
        'ok', false,
        'error', 'Team is busy, try again.',
        'code', 'TEAM_BUSY',
        'http_status', 409
      );
    when query_canceled then
      if sqlerrm ilike '%lock timeout%' then
        return jsonb_build_object(
          'ok', false,
          'error', 'Team is busy, try again.',
          'code', 'TEAM_BUSY',
          'http_status', 409
        );
      end if;
      raise;
  end;

  if v_is_active is not true then
    return jsonb_build_object(
      'ok', false,
      'error', 'Team is inactive.',
      'code', 'TEAM_INACTIVE',
      'http_status', 400
    );
  end if;

  v_capacity := greatest(coalesce(v_capacity, 1), 1);

  select count(*)::int
  into v_current
  from public.team_members tm
  where tm.team_id = p_team_id
    and tm.cleaner_id is not null;

  with input_ids as (
    select distinct u.cid
    from unnest(p_cleaner_ids) as u(cid)
    where u.cid is not null
      and u.cid <> '00000000-0000-0000-0000-000000000000'::uuid
      and u.cid::text ~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  ),
  new_ids as (
    select i.cid
    from input_ids i
    inner join public.cleaners c on c.id = i.cid
    where not exists (
      select 1
      from public.team_members tm
      where tm.team_id = p_team_id
        and tm.cleaner_id = i.cid
    )
  )
  select count(*)::int into v_to_add from new_ids;

  if v_to_add = 0 then
    select count(*)::int
    into v_after
    from public.team_members tm
    where tm.team_id = p_team_id
      and tm.cleaner_id is not null;

    return jsonb_build_object(
      'ok', true,
      'inserted', 0,
      'cleaner_ids', '[]'::jsonb,
      'skipped_all_duplicates', true,
      'current', v_after,
      'capacity', v_capacity
    );
  end if;

  if v_current + v_to_add > v_capacity then
    return jsonb_build_object(
      'ok', false,
      'error', 'Exceeds team capacity.',
      'code', 'EXCEEDS_CAPACITY',
      'http_status', 409,
      'current', v_current,
      'capacity', v_capacity,
      'would_add', v_to_add
    );
  end if;

  with input_ids as (
    select distinct u.cid
    from unnest(p_cleaner_ids) as u(cid)
    where u.cid is not null
      and u.cid <> '00000000-0000-0000-0000-000000000000'::uuid
      and u.cid::text ~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  ),
  new_ids as (
    select i.cid
    from input_ids i
    inner join public.cleaners c on c.id = i.cid
    where not exists (
      select 1
      from public.team_members tm
      where tm.team_id = p_team_id
        and tm.cleaner_id = i.cid
    )
  )
  select coalesce(array_agg(cid order by cid), array[]::uuid[])
  into v_new_ids
  from new_ids;

  insert into public.team_members (team_id, cleaner_id, active_from, active_to)
  select p_team_id, x, v_now, null
  from unnest(v_new_ids) as x
  where x is not null
  on conflict on constraint team_members_team_id_cleaner_id_key do nothing;

  get diagnostics v_row_diag = row_count;

  select
    coalesce(count(*)::int, 0),
    coalesce(jsonb_agg(tm.cleaner_id order by tm.cleaner_id), '[]'::jsonb)
  into v_on_roster, v_ids
  from public.team_members tm
  where tm.team_id = p_team_id
    and tm.cleaner_id = any (v_new_ids);

  v_inserted := coalesce(v_row_diag, 0);

  if v_on_roster < coalesce(cardinality(v_new_ids), 0) then
    return jsonb_build_object(
      'ok', false,
      'error', 'Member insert verification failed.',
      'code', 'VERIFY_FAILED',
      'http_status', 500
    );
  end if;

  select count(*)::int
  into v_after
  from public.team_members tm
  where tm.team_id = p_team_id
    and tm.cleaner_id is not null;

  return jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'cleaner_ids', coalesce(v_ids, '[]'::jsonb),
    'current', v_after,
    'capacity', v_capacity
  );
end;
$_$;


COMMENT ON FUNCTION "public"."add_team_members_guarded"("p_team_id" "uuid", "p_cleaner_ids" "uuid"[]) IS 'Locks team (2s lock timeout, 3s statement timeout), validates is_active, normalizes/dedupes UUIDs, caps batch at 50, enforces roster vs capacity_per_day, inserts team_members with ON CONFLICT ON CONSTRAINT team_members_team_id_cleaner_id_key DO NOTHING.';



CREATE OR REPLACE FUNCTION "public"."admin_billing_switch_finalize"("p_customer_id" "uuid", "p_billing_type" "text", "p_target_schedule_type" "text", "p_schedule_enforced" boolean, "p_confirm" boolean, "p_confirm_strict" boolean, "p_strict_flip_enabled" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_from_billing text;
  v_from_schedule text;
  v_to_schedule text;
  v_jhb date;
  v_ym text;
  v_start text;
  v_end text;
  v_bookings int := 0;
  v_inv_status text;
  v_inv_month text;
  v_has_month_invoice boolean := false;
  v_has_activity boolean;
  v_flipping_monthly boolean;
  v_strict_scenario boolean;
  v_impact jsonb;
  v_now timestamptz := now();
  v_owner_col text;
begin
  if p_billing_type not in ('per_booking', 'monthly') then
    return jsonb_build_object('ok', false, 'error', 'invalid_billing_type');
  end if;

  if p_target_schedule_type not in ('fixed_schedule', 'on_demand') then
    return jsonb_build_object('ok', false, 'error', 'invalid_schedule_type');
  end if;

  select case
    when exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'bookings'
        and column_name = 'customer_id'
    ) then 'customer_id'
    else 'user_id'
  end
  into v_owner_col;

  insert into public.user_profiles (id, booking_count, total_spent_cents, billing_type, schedule_type, updated_at)
  values (p_customer_id, 0, 0, 'per_booking', 'on_demand', v_now)
  on conflict (id) do nothing;

  select
    coalesce(billing_type, 'per_booking'),
    coalesce(schedule_type, 'on_demand')
  into v_from_billing, v_from_schedule
  from public.user_profiles
  where id = p_customer_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'profile_missing');
  end if;

  v_to_schedule := case
    when p_billing_type = 'monthly' then 'on_demand'::text
    else p_target_schedule_type
  end;

  if v_from_billing = p_billing_type and v_from_schedule = v_to_schedule then
    v_jhb := (v_now at time zone 'Africa/Johannesburg')::date;
    v_ym := to_char(v_jhb, 'YYYY-MM');
    v_start := v_ym || '-01';
    v_end := to_char((date_trunc('month', v_jhb) + interval '1 month - 1 day')::date, 'YYYY-MM-DD');

    execute format(
      'select count(*)::int from public.bookings where %I = $1 and date >= $2 and date <= $3',
      v_owner_col
    )
    into v_bookings
    using p_customer_id, v_start, v_end;

    select mi.status, mi.month into v_inv_status, v_inv_month
    from public.monthly_invoices mi
    where mi.customer_id = p_customer_id
      and mi.month = v_ym
    limit 1;

    v_has_month_invoice := found;

    v_impact := jsonb_build_object(
      'bookings_count', v_bookings,
      'invoice_status', case when v_has_month_invoice then v_inv_status else null end,
      'invoice_month', case when v_has_month_invoice then coalesce(v_inv_month, v_ym) else null end,
      'has_month_invoice', v_has_month_invoice
    );

    return jsonb_build_object(
      'ok', true,
      'code', 'NO_CHANGE',
      'requires_confirmation', false,
      'requires_strict_confirmation', false,
      'billing_type', v_from_billing,
      'schedule_type', v_from_schedule,
      'schedule_enforced', false,
      'impact', v_impact
    );
  end if;

  v_jhb := (v_now at time zone 'Africa/Johannesburg')::date;
  v_ym := to_char(v_jhb, 'YYYY-MM');
  v_start := v_ym || '-01';
  v_end := to_char((date_trunc('month', v_jhb) + interval '1 month - 1 day')::date, 'YYYY-MM-DD');

  execute format(
    'select count(*)::int from public.bookings where %I = $1 and date >= $2 and date <= $3',
    v_owner_col
  )
  into v_bookings
  using p_customer_id, v_start, v_end;

  select mi.status, mi.month into v_inv_status, v_inv_month
  from public.monthly_invoices mi
  where mi.customer_id = p_customer_id
    and mi.month = v_ym
  limit 1;

  v_has_month_invoice := found;

  v_impact := jsonb_build_object(
    'bookings_count', v_bookings,
    'invoice_status', case when v_has_month_invoice then v_inv_status else null end,
    'invoice_month', case when v_has_month_invoice then coalesce(v_inv_month, v_ym) else null end,
    'has_month_invoice', v_has_month_invoice
  );

  v_has_activity := v_bookings > 0 or v_has_month_invoice;
  v_flipping_monthly :=
    (v_from_billing <> p_billing_type)
    and (v_from_billing = 'monthly' or p_billing_type = 'monthly');
  v_strict_scenario :=
    p_strict_flip_enabled
    and v_flipping_monthly
    and v_bookings > 0
    and v_has_month_invoice;

  if v_has_activity and not p_confirm then
    return jsonb_build_object(
      'ok', true,
      'code', 'EXISTING_ACTIVITY_THIS_MONTH',
      'requires_confirmation', true,
      'requires_strict_confirmation', false,
      'schedule_enforced', false,
      'reason', 'existing_activity_this_month',
      'details', jsonb_build_object(
        'bookings_count', v_bookings,
        'invoice_status', case when v_has_month_invoice then v_inv_status else null end,
        'invoice_month', case when v_has_month_invoice then coalesce(v_inv_month, v_ym) else null end
      ),
      'billing_type', v_from_billing,
      'schedule_type', v_from_schedule,
      'impact', v_impact
    );
  end if;

  if v_strict_scenario and p_confirm and not p_confirm_strict then
    return jsonb_build_object(
      'ok', true,
      'code', 'STRICT_CONFIRM_REQUIRED',
      'requires_confirmation', false,
      'requires_strict_confirmation', true,
      'schedule_enforced', false,
      'reason', 'mid_cycle_monthly_flip',
      'details', jsonb_build_object(
        'bookings_count', v_bookings,
        'invoice_status', case when v_has_month_invoice then v_inv_status else null end,
        'invoice_month', case when v_has_month_invoice then coalesce(v_inv_month, v_ym) else null end
      ),
      'billing_type', v_from_billing,
      'schedule_type', v_from_schedule,
      'impact', v_impact
    );
  end if;

  update public.user_profiles
  set
    billing_type = p_billing_type,
    schedule_type = v_to_schedule,
    updated_at = v_now
  where id = p_customer_id;

  return jsonb_build_object(
    'ok', true,
    'code', 'UPDATED',
    'requires_confirmation', false,
    'requires_strict_confirmation', false,
    'billing_type', p_billing_type,
    'schedule_type', v_to_schedule,
    'schedule_enforced', p_schedule_enforced,
    'impact', v_impact
  );
end;
$_$;


COMMENT ON FUNCTION "public"."admin_billing_switch_finalize"("p_customer_id" "uuid", "p_billing_type" "text", "p_target_schedule_type" "text", "p_schedule_enforced" boolean, "p_confirm" boolean, "p_confirm_strict" boolean, "p_strict_flip_enabled" boolean) IS 'Admin billing switch: FOR UPDATE on user_profiles, Johannesburg-month impact (customer_id or legacy user_id), confirmation guards, then UPDATE.';



CREATE OR REPLACE FUNCTION "public"."admin_mark_payout_paid"("p_cleaner_ids" "uuid"[]) RETURNS TABLE("updated_count" bigint, "payout_run_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_run_id uuid := gen_random_uuid();
  v_count bigint := 0;
begin
  with locked as (
    select b.id
    from public.bookings b
    where b.payout_status = 'eligible'
      and (
        b.cleaner_id = any(p_cleaner_ids)
        or b.payout_owner_cleaner_id = any(p_cleaner_ids)
        or (
          b.is_team_job = true
          and b.team_id is not null
          and exists (
            select 1
            from public.team_members tm
            where tm.team_id = b.team_id
              and tm.cleaner_id is not null
              and tm.cleaner_id = any(p_cleaner_ids)
          )
        )
      )
    for update
  ),
  updated as (
    update public.bookings b
    set
      payout_status = 'paid',
      payout_paid_at = now(),
      payout_run_id = v_run_id
    from locked l
    where b.id = l.id
    returning b.id
  )
  select count(*)::bigint into v_count from updated;

  return query select v_count, v_run_id;
end;
$$;


COMMENT ON FUNCTION "public"."admin_mark_payout_paid"("p_cleaner_ids" "uuid"[]) IS 'Marks eligible bookings paid for given cleaner ids: cleaner_id, payout_owner_cleaner_id, or team_members.cleaner_id on team jobs.';



CREATE OR REPLACE FUNCTION "public"."admin_whatsapp_reliability_metrics"("p_since" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with agg as (
    select
      message_id,
      bool_or(status = 'sent') as had_sent,
      bool_or(status = 'delivered') as had_delivered,
      bool_or(status = 'read') as had_read,
      bool_or(status = 'failed') as had_failed
    from public.whatsapp_delivery_events
    where event_at >= p_since
    group by message_id
  ),
  ch as (
    select
      count(*) filter (where had_sent)::bigint as messages_sent,
      count(*) filter (where had_delivered)::bigint as messages_delivered,
      count(*) filter (where had_read)::bigint as messages_read,
      count(*) filter (where had_failed)::bigint as messages_failed
    from agg
  ),
  disp as (
    select
      count(*)::bigint as offers_whatsapp_sent,
      count(*) filter (where responded_at is not null)::bigint as offers_replied,
      count(*) filter (where status = 'accepted')::bigint as offers_accepted,
      count(*) filter (where status = 'rejected')::bigint as offers_declined,
      avg(response_latency_ms)::double precision as avg_response_latency_ms,
      count(*) filter (where first_read_at is not null)::bigint as offers_read
    from public.dispatch_offers
    where whatsapp_sent_at is not null
      and whatsapp_sent_at >= p_since
  )
  select jsonb_build_object(
    'since', p_since,
    'channel', (
      select jsonb_build_object(
        'messages_sent', coalesce(messages_sent, 0),
        'messages_delivered', coalesce(messages_delivered, 0),
        'messages_read', coalesce(messages_read, 0),
        'messages_failed', coalesce(messages_failed, 0),
        'delivery_rate',
          case
            when coalesce(messages_sent, 0) > 0
              then round((coalesce(messages_delivered, 0)::numeric / messages_sent::numeric), 6)
          end,
        'read_rate',
          case
            when coalesce(messages_delivered, 0) > 0
              then round((coalesce(messages_read, 0)::numeric / messages_delivered::numeric), 6)
          end
      )
      from ch
    ),
    'dispatch', (
      select jsonb_build_object(
        'offers_whatsapp_sent', coalesce(offers_whatsapp_sent, 0),
        'offers_replied', coalesce(offers_replied, 0),
        'offers_accepted', coalesce(offers_accepted, 0),
        'offers_declined', coalesce(offers_declined, 0),
        'offers_with_read_receipt', coalesce(offers_read, 0),
        'reply_rate',
          case
            when coalesce(offers_whatsapp_sent, 0) > 0
              then round((coalesce(offers_replied, 0)::numeric / offers_whatsapp_sent::numeric), 6)
          end,
        'accept_rate',
          case
            when coalesce(offers_whatsapp_sent, 0) > 0
              then round((coalesce(offers_accepted, 0)::numeric / offers_whatsapp_sent::numeric), 6)
          end,
        'read_receipt_rate',
          case
            when coalesce(offers_whatsapp_sent, 0) > 0
              then round((coalesce(offers_read, 0)::numeric / offers_whatsapp_sent::numeric), 6)
          end,
        'avg_response_latency_ms', avg_response_latency_ms
      )
      from disp
    )
  );
$$;


COMMENT ON FUNCTION "public"."admin_whatsapp_reliability_metrics"("p_since" timestamp with time zone) IS 'Aggregated WhatsApp delivery + dispatch-offer funnel for admin dashboards (Phase 8D).';



CREATE OR REPLACE FUNCTION "public"."admin_whatsapp_reliability_metrics"("p_since" timestamp with time zone, "p_until" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with agg as (
    select
      message_id,
      bool_or(status = 'sent') as had_sent,
      bool_or(status = 'delivered') as had_delivered,
      bool_or(status = 'read') as had_read,
      bool_or(status = 'failed') as had_failed
    from public.whatsapp_delivery_events
    where event_at >= p_since
      and (p_until is null or event_at < p_until)
    group by message_id
  ),
  ch as (
    select
      count(*) filter (where had_sent)::bigint as messages_sent,
      count(*) filter (where had_delivered)::bigint as messages_delivered,
      count(*) filter (where had_read)::bigint as messages_read,
      count(*) filter (where had_failed)::bigint as messages_failed
    from agg
  ),
  disp as (
    select
      count(*)::bigint as offers_whatsapp_sent,
      count(*) filter (where responded_at is not null)::bigint as offers_replied,
      count(*) filter (where status = 'accepted')::bigint as offers_accepted,
      count(*) filter (where status = 'rejected')::bigint as offers_declined,
      avg(response_latency_ms)::double precision as avg_response_latency_ms,
      count(*) filter (where first_read_at is not null)::bigint as offers_read
    from public.dispatch_offers
    where whatsapp_sent_at is not null
      and whatsapp_sent_at >= p_since
      and (p_until is null or whatsapp_sent_at < p_until)
  )
  select jsonb_build_object(
    'since', p_since,
    'until', p_until,
    'channel', (
      select jsonb_build_object(
        'messages_sent', coalesce(messages_sent, 0),
        'messages_delivered', coalesce(messages_delivered, 0),
        'messages_read', coalesce(messages_read, 0),
        'messages_failed', coalesce(messages_failed, 0),
        'delivery_rate',
          case
            when coalesce(messages_sent, 0) > 0
              then round((coalesce(messages_delivered, 0)::numeric / messages_sent::numeric), 6)
          end,
        'read_rate',
          case
            when coalesce(messages_delivered, 0) > 0
              then round((coalesce(messages_read, 0)::numeric / messages_delivered::numeric), 6)
          end
      )
      from ch
    ),
    'dispatch', (
      select jsonb_build_object(
        'offers_whatsapp_sent', coalesce(offers_whatsapp_sent, 0),
        'offers_replied', coalesce(offers_replied, 0),
        'offers_accepted', coalesce(offers_accepted, 0),
        'offers_declined', coalesce(offers_declined, 0),
        'offers_with_read_receipt', coalesce(offers_read, 0),
        'reply_rate',
          case
            when coalesce(offers_whatsapp_sent, 0) > 0
              then round((coalesce(offers_replied, 0)::numeric / offers_whatsapp_sent::numeric), 6)
          end,
        'accept_rate',
          case
            when coalesce(offers_whatsapp_sent, 0) > 0
              then round((coalesce(offers_accepted, 0)::numeric / offers_whatsapp_sent::numeric), 6)
          end,
        'read_receipt_rate',
          case
            when coalesce(offers_whatsapp_sent, 0) > 0
              then round((coalesce(offers_read, 0)::numeric / offers_whatsapp_sent::numeric), 6)
          end,
        'avg_response_latency_ms', avg_response_latency_ms
      )
      from disp
    )
  );
$$;


COMMENT ON FUNCTION "public"."admin_whatsapp_reliability_metrics"("p_since" timestamp with time zone, "p_until" timestamp with time zone) IS 'Aggregated WhatsApp delivery + dispatch-offer funnel for admin dashboards (Phase 8D).';



CREATE OR REPLACE FUNCTION "public"."append_booking_conversion_analytics"("p_payload" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_kind text;
  v_surface text;
  v_path text;
  v_cadence text;
  v_band text;
  v_slug text;
  v_confirm text;
  v_viewport text;
  v_cohort text;
  v_booking_id uuid;
  v_client_at text;
  v_rollout jsonb;
  new_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  v_kind := left(btrim(p_payload->>'kind'), 96);
  IF v_kind IS NULL OR v_kind = '' THEN
    RAISE EXCEPTION 'invalid payload: kind' USING ERRCODE = '22023';
  END IF;

  v_surface := left(btrim(p_payload->>'surface'), 32);
  IF v_surface NOT IN ('booking_new', 'booking_confirm') THEN
    RAISE EXCEPTION 'invalid payload: surface' USING ERRCODE = '22023';
  END IF;

  v_path := nullif(left(btrim(p_payload->>'runtimePathId'), 64), '');
  v_cadence := nullif(left(btrim(p_payload->>'visitCadence'), 24), '');
  IF v_cadence IS NOT NULL AND v_cadence NOT IN ('once', 'weekly', 'biweekly', 'monthly') THEN
    RAISE EXCEPTION 'invalid payload: visitCadence' USING ERRCODE = '22023';
  END IF;

  v_band := nullif(left(btrim(p_payload->>'extrasEngagementBand'), 8), '');
  IF v_band IS NOT NULL AND v_band NOT IN ('0', '1-2', '3+') THEN
    RAISE EXCEPTION 'invalid payload: extrasEngagementBand' USING ERRCODE = '22023';
  END IF;

  v_slug := nullif(left(btrim(p_payload->>'serviceSlug'), 64), '');
  v_confirm := nullif(left(btrim(p_payload->>'confirmVariant'), 16), '');
  IF v_confirm IS NOT NULL AND v_confirm NOT IN ('default', 'retry') THEN
    RAISE EXCEPTION 'invalid payload: confirmVariant' USING ERRCODE = '22023';
  END IF;

  v_viewport := nullif(left(btrim(p_payload->>'viewportBand'), 16), '');
  IF v_viewport IS NOT NULL AND v_viewport NOT IN ('mobile', 'tablet', 'desktop') THEN
    RAISE EXCEPTION 'invalid payload: viewportBand' USING ERRCODE = '22023';
  END IF;

  v_cohort := nullif(left(btrim(p_payload->>'rolloutCohort'), 32), '');
  IF v_cohort IS NULL OR v_cohort = '' THEN
    v_cohort := 'control';
  ELSIF v_cohort NOT IN ('control', 'ux_rhythm_v1') THEN
    RAISE EXCEPTION 'invalid payload: rolloutCohort' USING ERRCODE = '22023';
  END IF;

  v_client_at := nullif(left(btrim(p_payload->>'clientEmittedAt'), 40), '');

  IF p_payload ? 'bookingId' AND p_payload->>'bookingId' IS NOT NULL AND btrim(p_payload->>'bookingId') <> '' THEN
    BEGIN
      v_booking_id := btrim(p_payload->>'bookingId')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid payload: bookingId' USING ERRCODE = '22023';
    END;
    IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE id = v_booking_id AND customer_id = v_uid) THEN
      RAISE EXCEPTION 'forbidden booking' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_rollout := p_payload->'serverRollout';
  IF v_rollout IS NOT NULL AND jsonb_typeof(v_rollout) <> 'object' THEN
    RAISE EXCEPTION 'invalid payload: serverRollout' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.analytics_events (
    event_kind,
    metric_kind,
    score_kind,
    "window",
    visibility,
    status,
    value,
    entity_kind,
    entity_id,
    booking_id,
    cleaner_id,
    customer_id,
    assignment_id,
    payment_id,
    formula,
    inputs,
    dimensions,
    explanations,
    metadata
  ) VALUES (
    'customer_experience_metric',
    NULL,
    NULL,
    'hour',
    'internal',
    'fresh',
    1,
    'booking_conversion',
    NULL,
    v_booking_id,
    NULL,
    v_uid,
    NULL,
    NULL,
    'booking_conversion:v1',
    jsonb_strip_nulls(
      jsonb_build_object(
        'kind', v_kind,
        'surface', v_surface,
        'clientEmittedAt', v_client_at
      )
    ),
    jsonb_strip_nulls(
      jsonb_build_object(
        'runtimePathId', v_path,
        'visitCadence', v_cadence,
        'extrasEngagementBand', v_band,
        'serviceSlug', v_slug,
        'confirmVariant', v_confirm,
        'viewportBand', v_viewport
      )
    ),
    ARRAY[]::text[],
    COALESCE(
      jsonb_strip_nulls(
        jsonb_build_object(
          'serverRollout', v_rollout,
          'rolloutCohort', v_cohort
        )
      ),
      '{}'::jsonb
    )
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;


COMMENT ON FUNCTION "public"."append_booking_conversion_analytics"("p_payload" "jsonb") IS 'Append governed booking conversion row; validates enums, optional booking ownership, viewportBand, deployment rolloutCohort in metadata.';



CREATE OR REPLACE FUNCTION "public"."apply_cleaning_credit_transaction"("p_user_id" "uuid", "p_amount_zar" numeric, "p_type" "text", "p_referral_id" "uuid" DEFAULT NULL::"uuid", "p_booking_id" "uuid" DEFAULT NULL::"uuid", "p_note" "text" DEFAULT NULL::"text", "p_created_by" "text" DEFAULT NULL::"text") RETURNS TABLE("ok" boolean, "balance_after_zar" numeric, "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_current numeric;
  v_balance_after numeric;
  v_amount numeric;
begin
  if p_user_id is null then
    return query select false, 0::numeric, 'missing_user_id';
    return;
  end if;

  v_amount := round(coalesce(p_amount_zar, 0)::numeric, 2);

  if p_type not in ('earn', 'spend', 'reverse', 'admin_adjust', 'expire') then
    return query select false, 0::numeric, 'invalid_type';
    return;
  end if;

  if p_type = 'earn' and v_amount <= 0 then
    return query select false, 0::numeric, 'earn_must_be_positive';
    return;
  end if;

  if p_type in ('spend', 'reverse', 'expire') and v_amount >= 0 then
    return query select false, 0::numeric, 'debit_must_be_negative';
    return;
  end if;

  select coalesce(credit_balance_zar, 0) into v_current
  from public.user_profiles
  where id = p_user_id
  for update;

  if not found then
    return query select false, 0::numeric, 'user_not_found';
    return;
  end if;

  v_balance_after := greatest(0, round((v_current + v_amount) * 100) / 100);

  if v_current + v_amount < -0.001 then
    return query select false, v_current, 'insufficient_credit';
    return;
  end if;

  update public.user_profiles
  set credit_balance_zar = v_balance_after
  where id = p_user_id;

  insert into public.cleaning_credit_transactions (
    user_id, amount_zar, balance_after_zar, type, referral_id, booking_id, note, created_by
  ) values (
    p_user_id, v_amount, v_balance_after, p_type, p_referral_id, p_booking_id, p_note, p_created_by
  );

  return query select true, v_balance_after, null::text;
exception
  when unique_violation then
    return query select false, v_current, 'duplicate_earn_for_referral';
end;
$$;


COMMENT ON FUNCTION "public"."apply_cleaning_credit_transaction"("p_user_id" "uuid", "p_amount_zar" numeric, "p_type" "text", "p_referral_id" "uuid", "p_booking_id" "uuid", "p_note" "text", "p_created_by" "text") IS 'Atomically updates user_profiles.credit_balance_zar and inserts cleaning_credit_transactions under row lock.';



CREATE OR REPLACE FUNCTION "public"."approve_cleaner_change_request"("p_request_id" "uuid", "p_reviewer" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  r public.cleaner_change_requests%rowtype;
  bad_day boolean;
  unmapped_labels int;
  primary_location_id uuid;
  primary_city_id uuid;
begin
  select * into r from public.cleaner_change_requests where id = p_request_id for update;
  if not found then
    raise exception 'change_request_not_found';
  end if;
  if r.status is distinct from 'pending' then
    raise exception 'change_request_not_pending';
  end if;
  if r.requested_days is null or cardinality(r.requested_days) = 0 then
    raise exception 'change_request_invalid_days';
  end if;
  if r.requested_locations is null or cardinality(r.requested_locations) = 0 then
    raise exception 'change_request_invalid_locations';
  end if;

  select exists (
    select 1
    from unnest(r.requested_days) as d(day)
    where lower(trim(day)) not in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')
  )
  into bad_day;
  if bad_day then
    raise exception 'change_request_invalid_days';
  end if;

  select count(*)::int
  into unmapped_labels
  from (
    select distinct trim(x) as lbl
    from unnest(r.requested_locations) as x
    where trim(x) is not null and trim(x) <> ''
  ) lb
  where not exists (
    select 1
    from public.locations l
    where lower(trim(l.slug)) = lower(regexp_replace(trim(lb.lbl), '\s+', '-', 'g'))
       or lower(trim(l.name)) = lower(trim(lb.lbl))
  );

  if unmapped_labels > 0 then
    raise exception 'change_request_unknown_location';
  end if;

  delete from public.cleaner_locations where cleaner_id = r.cleaner_id;

  insert into public.cleaner_locations (cleaner_id, location_id)
  select distinct r.cleaner_id, l.id
  from unnest(r.requested_locations) as x
  inner join public.locations l
    on lower(trim(l.slug)) = lower(regexp_replace(trim(x), '\s+', '-', 'g'))
    or lower(trim(l.name)) = lower(trim(x))
  where trim(x) is not null and trim(x) <> ''
  on conflict (cleaner_id, location_id) do nothing;

  select l.id, l.city_id
  into primary_location_id, primary_city_id
  from unnest(r.requested_locations) as x
  inner join public.locations l
    on lower(trim(l.slug)) = lower(regexp_replace(trim(x), '\s+', '-', 'g'))
    or lower(trim(l.name)) = lower(trim(x))
  where trim(x) is not null and trim(x) <> ''
  order by l.slug asc nulls last
  limit 1;

  update public.cleaners
  set
    location = nullif(trim(array_to_string(r.requested_locations, ', ')), ''),
    location_id = primary_location_id,
    city_id = coalesce(primary_city_id, city_id),
    availability_weekdays = r.requested_days
  where id = r.cleaner_id;

  update public.cleaner_change_requests
  set
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = nullif(trim(p_reviewer), '')
  where id = p_request_id;
end;
$$;


COMMENT ON FUNCTION "public"."approve_cleaner_change_request"("p_request_id" "uuid", "p_reviewer" "text") IS 'Applies a pending change request: replaces cleaner_locations from catalog labels, sets primary location_id/city_id, display location text, and availability_weekdays.';



CREATE OR REPLACE FUNCTION "public"."assign_booking_reference"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.booking_reference is null or btrim(new.booking_reference) = '' then
    new.booking_reference :=
      'SHL-BK-' || lpad(nextval('public.bookings_reference_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."assign_team_and_sync_roster"("p_booking_id" "uuid", "p_team_id" "uuid", "p_payout_owner_cleaner_id" "uuid", "p_team_member_count_snapshot" integer, "p_variant" "text", "p_source" "text" DEFAULT NULL::"text", "p_assigned_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_variant text := lower(trim(coalesce(p_variant, '')));
  v_fin timestamptz;
  v_src text;
  v_n int;
  v_lock_id uuid;
begin
  if p_booking_id is null or p_team_id is null or p_payout_owner_cleaner_id is null then
    raise exception 'assign_team_and_sync_roster: p_booking_id, p_team_id, and p_payout_owner_cleaner_id are required';
  end if;

  select b.id, b.cleaner_line_earnings_finalized_at
    into v_lock_id, v_fin
    from public.bookings b
   where b.id = p_booking_id
   for update;

  if v_lock_id is null then
    raise exception 'assign_team_and_sync_roster: booking % not found', p_booking_id;
  end if;

  if v_fin is not null then
    raise exception 'assign_team_and_sync_roster: roster changes blocked (cleaner line earnings finalized)';
  end if;

  if v_variant not in ('admin', 'dispatch') then
    raise exception 'assign_team_and_sync_roster: invalid variant %', p_variant;
  end if;

  v_src := nullif(trim(coalesce(p_source, '')), '');
  if v_src is null then
    v_src := case when v_variant = 'admin' then 'admin' else 'dispatch' end;
  end if;

  if v_variant = 'admin' then
    update public.bookings b set
      team_id = p_team_id,
      is_team_job = true,
      cleaner_id = p_payout_owner_cleaner_id,
      payout_owner_cleaner_id = p_payout_owner_cleaner_id,
      team_member_count_snapshot = coalesce(p_team_member_count_snapshot, b.team_member_count_snapshot),
      status = case
        when lower(trim(coalesce(b.status, ''))) in ('pending', 'pending_assignment', 'offered')
          then 'assigned'
        else b.status
      end,
      dispatch_status = case
        when lower(trim(coalesce(b.status, ''))) in ('pending', 'pending_assignment', 'offered')
          then 'assigned'
        when lower(trim(coalesce(b.dispatch_status, ''))) in ('searching', 'offered', 'failed', '')
          then 'assigned'
        else b.dispatch_status
      end,
      assigned_at = case
        when lower(trim(coalesce(b.status, ''))) in ('pending', 'pending_assignment', 'offered')
          then coalesce(b.assigned_at, coalesce(p_assigned_at, now()))
        else b.assigned_at
      end,
      cleaner_response_status = case
        when lower(trim(coalesce(b.cleaner_response_status, ''))) in (
          'accepted', 'on_my_way', 'started', 'completed'
        ) then b.cleaner_response_status
        else 'pending'
      end,
      en_route_at = case
        when lower(trim(coalesce(b.cleaner_response_status, ''))) in (
          'accepted', 'on_my_way', 'started', 'completed'
        ) then b.en_route_at
        else null
      end,
      started_at = case
        when lower(trim(coalesce(b.cleaner_response_status, ''))) in (
          'accepted', 'on_my_way', 'started', 'completed'
        ) then b.started_at
        else null
      end,
      accepted_at = case
        when lower(trim(coalesce(b.cleaner_response_status, ''))) in (
          'accepted', 'on_my_way', 'started', 'completed'
        ) then b.accepted_at
        else null
      end
    where b.id = p_booking_id;
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      raise exception 'assign_team_and_sync_roster: admin update expected 1 row (got %)', v_n;
    end if;
  else
    update public.bookings b set
      team_id = p_team_id,
      is_team_job = true,
      cleaner_id = p_payout_owner_cleaner_id,
      payout_owner_cleaner_id = p_payout_owner_cleaner_id,
      team_member_count_snapshot = coalesce(p_team_member_count_snapshot, b.team_member_count_snapshot),
      status = 'assigned',
      dispatch_status = 'assigned',
      assigned_at = coalesce(p_assigned_at, now()),
      cleaner_response_status = 'pending'
    where b.id = p_booking_id
      and lower(trim(coalesce(b.status, ''))) = 'pending'
      and b.cleaner_id is null;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      return jsonb_build_object('ok', false, 'reason', 'race_lost');
    end if;
  end if;

  perform public.sync_booking_cleaners_for_team_booking(p_booking_id, v_src);
  return jsonb_build_object('ok', true, 'variant', v_variant);
end;
$$;


COMMENT ON FUNCTION "public"."assign_team_and_sync_roster"("p_booking_id" "uuid", "p_team_id" "uuid", "p_payout_owner_cleaner_id" "uuid", "p_team_member_count_snapshot" integer, "p_variant" "text", "p_source" "text", "p_assigned_at" timestamp with time zone) IS 'Atomically assigns team on booking (lead on cleaner_id + payout_owner_cleaner_id), rebuilds booking_cleaners. JSON: {ok:true,variant} or {ok:false,reason:race_lost}. Admin variant promotes pending/offered to assigned and preserves lifecycle columns once accepted or beyond.';



CREATE OR REPLACE FUNCTION "public"."blog_is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  )
  OR coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin',
    false
  );
$$;


COMMENT ON FUNCTION "public"."blog_is_admin"() IS 'True when JWT claims include role=admin (app_metadata or user_metadata).';



CREATE OR REPLACE FUNCTION "public"."blog_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION "public"."booking_line_amount_cents"("p_total_paid_zar" integer, "p_amount_paid_cents" integer) RETURNS bigint
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case
    when coalesce(p_amount_paid_cents, 0) > 0 then greatest(0, p_amount_paid_cents::bigint)
    when coalesce(p_total_paid_zar, 0) > 0 then greatest(0, p_total_paid_zar::bigint * 100)
    else 0::bigint
  end;
$$;

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "paystack_reference" "text" NOT NULL,
    "customer_email" "text",
    "amount_paid_cents" integer NOT NULL,
    "currency" "text" DEFAULT 'ZAR'::"text" NOT NULL,
    "booking_snapshot" "jsonb",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "service" "text",
    "rooms" integer,
    "bathrooms" integer,
    "extras" "jsonb",
    "location" "text",
    "date" "text",
    "time" "text",
    "total_paid_zar" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "customer_name" "text",
    "customer_phone" "text",
    "customer_id" "uuid",
    "cleaner_id" "uuid",
    "assigned_at" timestamp with time zone,
    "en_route_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "assignment_attempts" integer DEFAULT 0 NOT NULL,
    "location_id" "uuid",
    "duration_minutes" integer,
    "surge_multiplier" real DEFAULT 1.0 NOT NULL,
    "demand_level" "text" DEFAULT 'normal'::"text" NOT NULL,
    "dispatch_status" "text" DEFAULT 'searching'::"text" NOT NULL,
    "surge_reason" "text",
    "latitude" double precision,
    "longitude" double precision,
    "time_slot" "text",
    "city_id" "uuid",
    "cleaner_response_status" "text",
    "dispatch_attempts" integer DEFAULT 0 NOT NULL,
    "cleaner_payout_cents" integer,
    "company_revenue_cents" integer,
    "payout_percentage" numeric(5,4),
    "payout_type" "text",
    "service_fee_cents" integer DEFAULT 0 NOT NULL,
    "base_amount_cents" integer,
    "payout_id" "uuid",
    "pricing_version_id" "uuid",
    "price_breakdown" "jsonb",
    "total_price" numeric(12,2),
    "became_pending_at" timestamp with time zone,
    "selected_cleaner_id" "uuid",
    "assignment_type" "text",
    "fallback_reason" "text",
    "attempted_cleaner_id" "text",
    "dispatch_attempt_count" smallint DEFAULT 0 NOT NULL,
    "dispatch_next_recovery_at" timestamp with time zone,
    "dispatch_recovery_lease_until" timestamp with time zone,
    "last_admin_retry_dispatch_at" timestamp with time zone,
    "first_offer_kpi_logged_at" timestamp with time zone,
    "total_paid_cents" integer,
    "extras_amount_cents" integer DEFAULT 0,
    "cleaner_bonus_cents" integer DEFAULT 0,
    "is_test" boolean DEFAULT false NOT NULL,
    "display_earnings_cents" integer,
    "payout_earnings_cents" integer,
    "internal_earnings_cents" integer,
    "earnings_model_version" "text",
    "earnings_percentage_applied" numeric(5,4),
    "earnings_cap_cents_applied" integer,
    "earnings_tenure_months_at_assignment" numeric(6,2),
    "is_team_job" boolean DEFAULT false NOT NULL,
    "team_id" "uuid",
    "location_slug" "text",
    "team_member_count_snapshot" integer,
    "last_declined_by_cleaner_id" "uuid",
    "last_declined_at" timestamp with time zone,
    "created_by_admin" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "payment_link" "text",
    "payment_link_expires_at" timestamp with time zone,
    "payment_link_send_count" integer DEFAULT 0 NOT NULL,
    "payment_link_first_sent_at" timestamp with time zone,
    "payment_needs_follow_up" boolean DEFAULT false NOT NULL,
    "payment_completed_at" timestamp with time zone,
    "payment_conversion_seconds" integer,
    "payment_link_last_sent_at" timestamp with time zone,
    "payment_link_delivery" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "payment_link_reminder_1h_sent_at" timestamp with time zone,
    "payment_link_reminder_15m_sent_at" timestamp with time zone,
    "payment_conversion_bucket" "text",
    "conversion_channel" "text",
    "normalized_phone" "text",
    "payment_first_touch_channel" "text",
    "payment_last_touch_channel" "text",
    "payment_assist_channels" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "booking_priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "last_decision_snapshot" "jsonb",
    "recurring_id" "uuid",
    "is_recurring_generated" boolean DEFAULT false NOT NULL,
    "auto_charge_attempted_at" timestamp with time zone,
    "payment_status" "text",
    "recurring_retry_count" integer DEFAULT 0 NOT NULL,
    "recurring_next_charge_attempt_at" timestamp with time zone,
    "recurring_last_charge_attempt_at" timestamp with time zone,
    "recurring_first_failure_at" timestamp with time zone,
    "recurring_fallback_at" timestamp with time zone,
    "recurring_precharge_notified_at" timestamp with time zone,
    "assignment_outcome_score" double precision,
    "marketplace_cluster_id" "text",
    "marketplace_forecast_demand" "text",
    "cancelled_by" "text",
    "monthly_invoice_id" "uuid",
    "is_monthly_billing_booking" boolean DEFAULT false NOT NULL,
    "payout_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payout_frozen_cents" integer,
    "service_slug" "text" NOT NULL,
    "slot_duplicate_exempt" boolean DEFAULT false NOT NULL,
    "admin_force_slot_override" boolean DEFAULT false NOT NULL,
    "payout_paid_at" timestamp with time zone,
    "payout_run_id" "uuid",
    "payout_owner_cleaner_id" "uuid",
    "last_earnings_recompute_at" timestamp with time zone,
    "payout_integrity_first_seen_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "booking_source" "text" DEFAULT 'website'::"text" NOT NULL,
    "created_by_admin_id" "uuid",
    "ignore_cleaner_conflict" boolean DEFAULT false NOT NULL,
    "cleaner_slot_override_reason" "text",
    "price_snapshot" "jsonb",
    "cleaner_earnings_total_cents" integer,
    "cleaner_line_earnings_finalized_at" timestamp with time zone,
    "cleaner_share_percentage" numeric,
    "marked_paid_by_admin_id" "uuid",
    "payment_method" "text",
    "payment_reference_external" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payment_mismatch" boolean DEFAULT false NOT NULL,
    "referral_reconciliation_required" boolean DEFAULT false NOT NULL,
    "lifecycle_issue" boolean DEFAULT false NOT NULL,
    "accepted_at" timestamp with time zone,
    "payment_state" "text",
    "deposit_paid_cents" integer,
    "billing_type" "text" DEFAULT 'prepaid'::"text" NOT NULL,
    "admin_recurring_unpaid_completion_override_at" timestamp with time zone,
    "admin_recurring_unpaid_completion_override_by" "text",
    "refunded_at" timestamp with time zone,
    "refund_status" "text",
    "service_details" "jsonb",
    "selected_extras" "jsonb",
    "pricing_summary" "jsonb",
    "cleaner_mode" "text",
    "assigned_team_id" "text",
    "cleaner_count" integer DEFAULT 1,
    "booking_type" "text",
    "alt_date" "text",
    "alt_time" "text",
    "suburb" "text",
    "postal_code" "text",
    "access_instructions" "text",
    "parking_instructions" "text",
    "gate_code" "text",
    "recurring_frequency" "text",
    "recurring_days" "jsonb",
    "recurring_start_date" "text",
    "recurring_end_date" "text",
    "city" "text",
    "zoho_invoice_id" "text",
    "recurring_discount_cents" integer DEFAULT 0 NOT NULL,
    "estimated_duration_minutes" integer,
    "preferred_dispatch_status" "text",
    "booking_reference" "text",
    "earnings_summary" "jsonb",
    "estimate_status" "text",
    "estimated_at" timestamp with time zone,
    "quote_id" "uuid",
    "pricing_engine_version" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "equipment_required" boolean DEFAULT false NOT NULL,
    "equipment_distance_km" numeric(6,2),
    "equipment_base_fee" integer,
    "equipment_price_per_km" integer,
    "equipment_distance_charge" integer,
    "equipment_logistics_fee" integer,
    "equipment_base_location" "text",
    "manual_quote_required" boolean DEFAULT false NOT NULL,
    "equipment_pricing_snapshot" "jsonb",
    "equipment_fee_override_reason" "text",
    "sales_document_id" "uuid",
    "zoho_invoice_number" "text",
    "payment_transaction_id" "uuid",
    "duration_hours" numeric(5,2),
    "cleaner_workload" numeric(8,2),
    "estimated_finish_at" timestamp with time zone,
    "quote_calculation_version" integer,
    "admin_completion_gate_override_at" timestamp with time zone,
    "admin_completion_gate_override_by" "text",
    "admin_completion_gate_override_reason" "text",
    "admin_completion_gate_override_codes" "text"[],
    "fulfillment_mode" "text",
    "fulfillment_reason" "text",
    CONSTRAINT "booking_status_response_started_requires_in_progress" CHECK ((NOT (("lower"(TRIM(BOTH FROM COALESCE("status", ''::"text"))) = ANY (ARRAY['assigned'::"text", 'offered'::"text", 'confirmed'::"text"])) AND ("lower"(TRIM(BOTH FROM COALESCE("cleaner_response_status", ''::"text"))) = 'started'::"text")))),
    CONSTRAINT "bookings_assigned_requires_status" CHECK ((NOT ((("cleaner_id" IS NOT NULL) OR ("selected_cleaner_id" IS NOT NULL)) AND ("lower"(TRIM(BOTH FROM COALESCE("status", ''::"text"))) = 'pending'::"text")))),
    CONSTRAINT "bookings_billing_type_check" CHECK (("billing_type" = ANY (ARRAY['prepaid'::"text", 'recurring_invoice'::"text", 'monthly_contract'::"text", 'pay_later'::"text"]))),
    CONSTRAINT "bookings_booking_priority_check" CHECK (("booking_priority" = ANY (ARRAY['normal'::"text", 'high'::"text"]))),
    CONSTRAINT "bookings_booking_type_check" CHECK (("booking_type" = ANY (ARRAY['once_off'::"text", 'recurring'::"text"]))),
    CONSTRAINT "bookings_cancelled_by_check" CHECK ((("cancelled_by" IS NULL) OR ("cancelled_by" = ANY (ARRAY['customer'::"text", 'cleaner'::"text", 'system'::"text"])))),
    CONSTRAINT "bookings_cleaner_mode_check" CHECK (("cleaner_mode" = ANY (ARRAY['team'::"text", 'individual_cleaners'::"text"]))),
    CONSTRAINT "bookings_cleaner_payout_lte_financial_cap" CHECK ((("cleaner_payout_cents" IS NULL) OR ((COALESCE("cleaner_payout_cents", 0) + COALESCE("cleaner_bonus_cents", 0)) <=
CASE
    WHEN (("lower"(TRIM(BOTH FROM COALESCE("billing_type", ''::"text"))) = ANY (ARRAY['recurring_invoice'::"text", 'monthly_contract'::"text", 'pay_later'::"text"])) OR COALESCE("is_monthly_billing_booking", false) OR ("lower"(TRIM(BOTH FROM COALESCE("payment_status", ''::"text"))) = 'pending_monthly'::"text") OR ("monthly_invoice_id" IS NOT NULL)) THEN COALESCE(("total_paid_cents")::bigint,
    CASE
        WHEN (("total_paid_zar" IS NOT NULL) AND ("total_paid_zar" > 0)) THEN ("round"((("total_paid_zar" * 100))::double precision))::bigint
        ELSE NULL::bigint
    END, (NULLIF("amount_paid_cents", 0))::bigint, (0)::bigint)
    ELSE (COALESCE("total_paid_cents", "amount_paid_cents",
    CASE
        WHEN (("total_paid_zar" IS NOT NULL) AND ("total_paid_zar" > 0)) THEN ("round"((("total_paid_zar" * 100))::double precision))::integer
        ELSE NULL::integer
    END))::bigint
END))),
    CONSTRAINT "bookings_completed_requires_display_earnings" CHECK ((("lower"(TRIM(BOTH FROM COALESCE("status", ''::"text"))) IS DISTINCT FROM 'completed'::"text") OR ("display_earnings_cents" IS NOT NULL))),
    CONSTRAINT "bookings_conversion_channel_check" CHECK ((("conversion_channel" IS NULL) OR ("conversion_channel" = ANY (ARRAY['whatsapp'::"text", 'sms'::"text", 'email'::"text"])))),
    CONSTRAINT "bookings_demand_level_check" CHECK (("demand_level" = ANY (ARRAY['low'::"text", 'normal'::"text", 'peak'::"text"]))),
    CONSTRAINT "bookings_deposit_paid_cents_nonneg" CHECK ((("deposit_paid_cents" IS NULL) OR ("deposit_paid_cents" >= 0))),
    CONSTRAINT "bookings_dispatch_status_check" CHECK ((("dispatch_status" IS NULL) OR ("dispatch_status" = ANY (ARRAY['searching'::"text", 'offered'::"text", 'assigned'::"text", 'failed'::"text", 'no_cleaner'::"text", 'unassignable'::"text", 'unassigned'::"text", 'accepted'::"text", 'expired'::"text"])))),
    CONSTRAINT "bookings_eligible_paid_require_frozen_cents" CHECK ((("payout_status" <> ALL (ARRAY['eligible'::"text", 'paid'::"text"])) OR ("payout_frozen_cents" IS NOT NULL))),
    CONSTRAINT "bookings_estimate_status_chk" CHECK ((("estimate_status" IS NULL) OR ("estimate_status" = ANY (ARRAY['none'::"text", 'preview'::"text", 'quoted'::"text", 'stale'::"text", 'superseded'::"text"])))),
    CONSTRAINT "bookings_fulfillment_mode_check" CHECK ((("fulfillment_mode" IS NULL) OR ("fulfillment_mode" = ANY (ARRAY['instant'::"text", 'ops_assignment'::"text", 'area_review'::"text"])))),
    CONSTRAINT "bookings_paid_not_pending_payment" CHECK ((NOT (("payment_status" = 'success'::"text") AND ("status" = 'pending_payment'::"text")))),
    CONSTRAINT "bookings_paid_requires_amount" CHECK ((("payment_status" IS DISTINCT FROM 'success'::"text") OR (("amount_paid_cents" IS NOT NULL) AND ("amount_paid_cents" > 0)))),
    CONSTRAINT "bookings_paid_requires_run_id" CHECK ((("payout_status" <> 'paid'::"text") OR ("payout_run_id" IS NOT NULL))),
    CONSTRAINT "bookings_paid_requires_timestamp" CHECK ((("payment_status" IS DISTINCT FROM 'success'::"text") OR ("payment_completed_at" IS NOT NULL))),
    CONSTRAINT "bookings_payment_conversion_bucket_check" CHECK ((("payment_conversion_bucket" IS NULL) OR ("payment_conversion_bucket" = ANY (ARRAY['instant'::"text", 'fast'::"text", 'medium'::"text", 'slow'::"text"])))),
    CONSTRAINT "bookings_payment_conversion_seconds_check" CHECK ((("payment_conversion_seconds" IS NULL) OR ("payment_conversion_seconds" >= 0))),
    CONSTRAINT "bookings_payment_first_touch_channel_check" CHECK ((("payment_first_touch_channel" IS NULL) OR ("payment_first_touch_channel" = ANY (ARRAY['whatsapp'::"text", 'sms'::"text", 'email'::"text"])))),
    CONSTRAINT "bookings_payment_last_touch_channel_check" CHECK ((("payment_last_touch_channel" IS NULL) OR ("payment_last_touch_channel" = ANY (ARRAY['whatsapp'::"text", 'sms'::"text", 'email'::"text"])))),
    CONSTRAINT "bookings_payment_link_send_count_check" CHECK (("payment_link_send_count" >= 0)),
    CONSTRAINT "bookings_payment_method_chk" CHECK ((("payment_method" IS NULL) OR ("payment_method" = ANY (ARRAY['cash'::"text", 'zoho'::"text", 'eft'::"text", 'card'::"text"])))),
    CONSTRAINT "bookings_payment_state_check" CHECK ((("payment_state" IS NULL) OR ("payment_state" = ANY (ARRAY['awaiting_authorization'::"text", 'charge_scheduled'::"text", 'charged'::"text", 'retry_scheduled'::"text", 'failed'::"text", 'fallback_sent'::"text"])))),
    CONSTRAINT "bookings_payment_status_check" CHECK ((("payment_status" IS NULL) OR ("payment_status" = ANY (ARRAY['pending'::"text", 'success'::"text", 'failed'::"text", 'pending_monthly'::"text"])))),
    CONSTRAINT "bookings_payout_status_check" CHECK (("payout_status" = ANY (ARRAY['pending'::"text", 'eligible'::"text", 'paid'::"text"]))),
    CONSTRAINT "bookings_preferred_dispatch_status_check" CHECK ((("preferred_dispatch_status" IS NULL) OR ("preferred_dispatch_status" = ANY (ARRAY['preferred_cleaner_pending'::"text", 'preferred_cleaner_accepted'::"text", 'preferred_cleaner_expired'::"text", 'preferred_cleaner_skipped_urgent'::"text", 'backup_dispatch_started'::"text", 'backup_offer_pending'::"text", 'assigned_to_backup_cleaner'::"text", 'accepted'::"text", 'expired'::"text"])))),
    CONSTRAINT "bookings_recurring_frequency_check" CHECK (("recurring_frequency" = ANY (ARRAY['weekly'::"text", 'fortnightly'::"text", 'monthly'::"text", 'custom'::"text"]))),
    CONSTRAINT "bookings_surge_multiplier_check" CHECK (("surge_multiplier" > (0)::double precision)),
    CONSTRAINT "bookings_team_has_payout_owner" CHECK ((("is_team_job" IS NOT TRUE) OR ("payout_owner_cleaner_id" IS NOT NULL)))
);

ALTER TABLE ONLY "public"."bookings" REPLICA IDENTITY FULL;


COMMENT ON COLUMN "public"."bookings"."amount_paid_cents" IS 'Payment amount in minor units; retained for app compatibility.';



COMMENT ON COLUMN "public"."bookings"."status" IS 'Lifecycle status (text). Includes area_review for unpaid expansion leads. Legacy confirmed normalizes to assigned in app code. pending_assignment remains selected-cleaner offer wait.';



COMMENT ON COLUMN "public"."bookings"."total_paid_zar" IS 'Customer-paid total in ZAR for app compatibility and reporting.';



COMMENT ON COLUMN "public"."bookings"."created_at" IS 'Set by the database (default now()). Do not send created_at from clients so concurrent-slot clustering stays deterministic.';



COMMENT ON COLUMN "public"."bookings"."en_route_at" IS 'When cleaner marks “on the way” (Uber-style tracking).';



COMMENT ON COLUMN "public"."bookings"."assignment_attempts" IS 'Increments when a cleaner rejects — dispatch fallback.';



COMMENT ON COLUMN "public"."bookings"."location_id" IS 'Resolved area; bookings.location may still hold free-form text.';



COMMENT ON COLUMN "public"."bookings"."duration_minutes" IS 'Scheduled job length in minutes; dispatch uses default when null.';



COMMENT ON COLUMN "public"."bookings"."surge_multiplier" IS 'Pricing / dispatch weighting (1 = baseline).';



COMMENT ON COLUMN "public"."bookings"."demand_level" IS 'Supply-demand hint: low | normal | peak.';



COMMENT ON COLUMN "public"."bookings"."dispatch_status" IS 'Dispatch funnel: searching → offered → assigned | accepted | failed | no_cleaner | unassignable | unassigned | expired.';



COMMENT ON COLUMN "public"."bookings"."latitude" IS 'Booking coordinate snapshot for route optimization.';



COMMENT ON COLUMN "public"."bookings"."longitude" IS 'Booking coordinate snapshot for route optimization.';



COMMENT ON COLUMN "public"."bookings"."time_slot" IS 'Booking window label/time slot used for scheduling clusters.';



COMMENT ON COLUMN "public"."bookings"."cleaner_response_status" IS 'Ack lifecycle: none | pending | accepted | declined | timeout (DB source of truth; Supabase Realtime pushes changes).';



COMMENT ON COLUMN "public"."bookings"."dispatch_attempts" IS 'Count of auto re-dispatch rounds after ack timeout / escalation (separate from assignment_attempts on cleaner reject).';



COMMENT ON COLUMN "public"."bookings"."cleaner_payout_cents" IS 'Cleaner base payout in cents; immutable after assignment unless reassigned.';



COMMENT ON COLUMN "public"."bookings"."company_revenue_cents" IS 'Platform share in cents after cleaner payout and bonus.';



COMMENT ON COLUMN "public"."bookings"."payout_percentage" IS 'Applied payout percentage for hybrid model.';



COMMENT ON COLUMN "public"."bookings"."payout_type" IS 'Payout model identifier.';



COMMENT ON COLUMN "public"."bookings"."service_fee_cents" IS 'Platform fee in cents; not included in cleaner payout base.';



COMMENT ON COLUMN "public"."bookings"."base_amount_cents" IS 'Visit subtotal in cents before company-only service fee.';



COMMENT ON COLUMN "public"."bookings"."payout_id" IS 'Set when this completed job was included in a cleaner_payouts batch.';



COMMENT ON COLUMN "public"."bookings"."became_pending_at" IS 'Set when status transitions into pending (paid / re-opened for dispatch). Used for unassigned SLA; distinct from created_at for long-lived pending_payment rows.';



COMMENT ON COLUMN "public"."bookings"."selected_cleaner_id" IS 'Cleaner the customer chose at checkout; mirrors snapshot when assignment_type = user_selected.';



COMMENT ON COLUMN "public"."bookings"."assignment_type" IS 'user_selected = customer pick applied; auto_dispatch = smart dispatch; auto_fallback = customer UUID invalid/missing row, dispatch assigned another cleaner.';



COMMENT ON COLUMN "public"."bookings"."fallback_reason" IS 'When assignment_type = auto_fallback: e.g. invalid_cleaner_id, cleaner_not_available, cleaner_offline.';



COMMENT ON COLUMN "public"."bookings"."attempted_cleaner_id" IS 'Cleaner id the customer chose at checkout (text); may differ from cleaner_id when fallback. For user_selected often matches selected_cleaner_id.';



COMMENT ON COLUMN "public"."bookings"."dispatch_attempt_count" IS 'Increments on each user-selected offer recovery (decline/expire → re-dispatch); capped by MAX_DISPATCH_ATTEMPTS.';



COMMENT ON COLUMN "public"."bookings"."dispatch_next_recovery_at" IS 'Earliest time cron may start another user-selected recovery wave after the last wave (backoff).';



COMMENT ON COLUMN "public"."bookings"."dispatch_recovery_lease_until" IS 'Short lease while a worker runs recovery for this booking; prevents duplicate redispatch in the same cron tick.';



COMMENT ON COLUMN "public"."bookings"."last_admin_retry_dispatch_at" IS 'Set when an admin triggers POST /api/admin/bookings/:id/retry-dispatch; enforces per-booking cooldown.';



COMMENT ON COLUMN "public"."bookings"."first_offer_kpi_logged_at" IS 'Set once when time_to_first_offer_ms KPI is emitted (idempotent under parallel offer creation).';



COMMENT ON COLUMN "public"."bookings"."total_paid_cents" IS 'Authoritative customer-paid amount in cents for payout constraints and reporting.';



COMMENT ON COLUMN "public"."bookings"."extras_amount_cents" IS 'Extras subtotal in cents from checkout pricing snapshot.';



COMMENT ON COLUMN "public"."bookings"."cleaner_bonus_cents" IS 'Cleaner bonus cents when percentage share exceeds the base payout cap.';



COMMENT ON COLUMN "public"."bookings"."is_test" IS 'Test bookings are excluded from payout batches and production financial settlement.';



COMMENT ON COLUMN "public"."bookings"."display_earnings_cents" IS 'Cleaner-visible earnings amount in cents.';



COMMENT ON COLUMN "public"."bookings"."payout_earnings_cents" IS 'Actual payout amount in cents used for payroll.';



COMMENT ON COLUMN "public"."bookings"."internal_earnings_cents" IS 'Internal earnings amount in cents, may include hidden adjustments.';



COMMENT ON COLUMN "public"."bookings"."earnings_model_version" IS 'Version string for earnings model snapshot at assignment.';



COMMENT ON COLUMN "public"."bookings"."is_team_job" IS 'True when booking is fulfilled by a team, not an individual cleaner.';



COMMENT ON COLUMN "public"."bookings"."team_id" IS 'Assigned team for team jobs.';



COMMENT ON COLUMN "public"."bookings"."team_member_count_snapshot" IS 'Active team roster count for the booking date, set when a team is assigned.';



COMMENT ON COLUMN "public"."bookings"."last_declined_by_cleaner_id" IS 'Cleaner who last declined this row via assigned-booking WhatsApp flow; cleared on assignment / timeout release.';



COMMENT ON COLUMN "public"."bookings"."last_declined_at" IS 'When last_declined_by_cleaner_id was set; used for recent-decline dispatch penalty.';



COMMENT ON COLUMN "public"."bookings"."created_by_admin" IS 'True when checkout was started from admin tools (same Paystack pipeline as self-serve).';



COMMENT ON COLUMN "public"."bookings"."created_by" IS 'Auth user id of the admin who created the pending_payment checkout, when applicable.';



COMMENT ON COLUMN "public"."bookings"."payment_link" IS 'Last Paystack authorization_url issued for this row (admin resend / support); customer checkout may omit.';



COMMENT ON COLUMN "public"."bookings"."payment_link_expires_at" IS 'When the stored Paystack authorization_url should be treated as stale (admin / ops UX).';



COMMENT ON COLUMN "public"."bookings"."payment_link_send_count" IS 'Increments on each payment-link delivery persist (admin sends + cron reminders).';



COMMENT ON COLUMN "public"."bookings"."payment_link_first_sent_at" IS 'Timestamp of the first payment-link notification wave; anchor for payment_conversion_seconds.';



COMMENT ON COLUMN "public"."bookings"."payment_needs_follow_up" IS 'Ops escalation: unpaid link expired, or payment_link_send_count reached follow-up threshold.';



COMMENT ON COLUMN "public"."bookings"."payment_completed_at" IS 'Customer payment settled (Paystack); used with payment_link_first_sent_at for conversion.';



COMMENT ON COLUMN "public"."bookings"."payment_conversion_seconds" IS 'Seconds from payment_link_first_sent_at to payment_completed_at when both are set.';



COMMENT ON COLUMN "public"."bookings"."payment_link_last_sent_at" IS 'Last time payment-link notifications were sent (rate-limit resends).';



COMMENT ON COLUMN "public"."bookings"."payment_link_delivery" IS 'Latest per-channel outcome for payment link delivery: whatsapp|sms|email → sent|failed|skipped.';



COMMENT ON COLUMN "public"."bookings"."payment_link_reminder_1h_sent_at" IS 'Set when ~1h-before-expiry reminder was sent (cron idempotency).';



COMMENT ON COLUMN "public"."bookings"."payment_link_reminder_15m_sent_at" IS 'Set when ~15m-before-expiry reminder was sent (cron idempotency).';



COMMENT ON COLUMN "public"."bookings"."payment_conversion_bucket" IS 'Funnel bucket from payment_conversion_seconds: instant <5m, fast <30m, medium <2h, else slow.';



COMMENT ON COLUMN "public"."bookings"."conversion_channel" IS 'Last channel with a successful payment-link delivery before checkout completed (from payment_link_delivery_events).';



COMMENT ON COLUMN "public"."bookings"."normalized_phone" IS 'Digits-only E.164-style key from customer_phone (non-digits stripped); maintained by trigger.';



COMMENT ON COLUMN "public"."bookings"."payment_first_touch_channel" IS 'First successful payment-link delivery channel for this checkout (from payment_link_delivery_events).';



COMMENT ON COLUMN "public"."bookings"."payment_last_touch_channel" IS 'Last successful delivery channel before payment (mirrors conversion_channel).';



COMMENT ON COLUMN "public"."bookings"."payment_assist_channels" IS 'Ordered unique middle channels between first and last successful sends (JSON array of strings).';



COMMENT ON COLUMN "public"."bookings"."booking_priority" IS 'Elevated attention for predictive payment risk (distinct from payment_needs_follow_up).';



COMMENT ON COLUMN "public"."bookings"."last_decision_snapshot" IS 'Latest payment-link decision output (channels, risk, reason) for debugging and ops review.';



COMMENT ON COLUMN "public"."bookings"."recurring_id" IS 'Source recurring subscription when this row was spawned by the recurring engine.';



COMMENT ON COLUMN "public"."bookings"."is_recurring_generated" IS 'True when created by /api/cron/generate-recurring-bookings.';



COMMENT ON COLUMN "public"."bookings"."auto_charge_attempted_at" IS 'Last auto-charge attempt (idempotency / duplicate cron guard).';



COMMENT ON COLUMN "public"."bookings"."payment_status" IS 'Sub-state: pending_monthly = included on open MonthlyInvoice; no per-booking Paystack link.';



COMMENT ON COLUMN "public"."bookings"."recurring_retry_count" IS 'Auto-charge attempts for this pending recurring-generated row.';



COMMENT ON COLUMN "public"."bookings"."recurring_next_charge_attempt_at" IS 'Do not charge before this time (backoff / smart delay); null = eligible immediately.';



COMMENT ON COLUMN "public"."bookings"."recurring_last_charge_attempt_at" IS 'Last Paystack charge_authorization attempt at.';



COMMENT ON COLUMN "public"."bookings"."recurring_first_failure_at" IS 'First failed auto-charge (starts grace window for retries before fallback).';



COMMENT ON COLUMN "public"."bookings"."recurring_fallback_at" IS 'Payment-link fallback was invoked after retries/grace.';



COMMENT ON COLUMN "public"."bookings"."recurring_precharge_notified_at" IS 'Customer pre-charge reminder sent (cron).';



COMMENT ON COLUMN "public"."bookings"."assignment_outcome_score" IS 'Observed outcome quality after completion (on-time + review blend); used for cleaner EMA learning.';



COMMENT ON COLUMN "public"."bookings"."marketplace_cluster_id" IS 'Stable geo/time cluster key for routing + affinity dispatch.';



COMMENT ON COLUMN "public"."bookings"."marketplace_forecast_demand" IS 'Optional snapshot: low|medium|high from forecastDemand at quote/assign time.';



COMMENT ON COLUMN "public"."bookings"."cancelled_by" IS 'Who initiated cancellation when status = cancelled: customer, cleaner, system (ops/automation). Null for legacy or non-cancelled.';



COMMENT ON COLUMN "public"."bookings"."monthly_invoice_id" IS 'Set by trigger for monthly-billed customers (draft invoice for service bucket month).';



COMMENT ON COLUMN "public"."bookings"."is_monthly_billing_booking" IS 'True when this row is on consolidated monthly billing (DB-enforced for billing_type=monthly).';



COMMENT ON COLUMN "public"."bookings"."payout_status" IS 'Cleaner-side payout: pending until customer monthly invoice fully paid; then eligible for payout batch.';



COMMENT ON COLUMN "public"."bookings"."payout_frozen_cents" IS 'ZAR line in cents frozen when payout_status becomes eligible (invoice fully paid); payout batches use this, not live totals.';



COMMENT ON COLUMN "public"."bookings"."service_slug" IS 'Canonical catalog service slug; nullable for legacy bookings. Authorization must not depend on this column alone.';



COMMENT ON COLUMN "public"."bookings"."slot_duplicate_exempt" IS 'When true, row is excluded from partial unique index idx_bookings_unique_active_customer_slot (intentional duplicate slot, e.g. admin force).';



COMMENT ON COLUMN "public"."bookings"."admin_force_slot_override" IS 'True when an admin explicitly bypassed duplicate-slot guard for this booking (audit / UI flag).';



COMMENT ON COLUMN "public"."bookings"."payout_paid_at" IS 'When payout_status was set to paid (e.g. admin invoice payout run).';



COMMENT ON COLUMN "public"."bookings"."payout_run_id" IS 'Shared UUID for all bookings marked paid in the same mark-paid action (audit / reconciliation).';



COMMENT ON COLUMN "public"."bookings"."payout_owner_cleaner_id" IS 'Cleaner id used for admin payout grouping / mark-paid RPC when cleaner_id is null (team jobs).';



COMMENT ON COLUMN "public"."bookings"."last_earnings_recompute_at" IS 'Last time a server claimed a stuck-earnings recompute for this booking; used with claim_booking_earnings_recompute.';



COMMENT ON COLUMN "public"."bookings"."payout_integrity_first_seen_at" IS 'Set once when cleaner earnings (or ops) first records a payout integrity anomaly for this row; used for MTTR-style debugging.';



COMMENT ON COLUMN "public"."bookings"."paid_at" IS 'Customer payment confirmed at (e.g. Paystack success). Used alongside payment_status and cent totals for stuck display repair.';



COMMENT ON COLUMN "public"."bookings"."booking_source" IS 'Origin: website, admin, whatsapp, etc. Defaults to website for legacy rows.';



COMMENT ON COLUMN "public"."bookings"."created_by_admin_id" IS 'Admin staff user id when booking was created via admin tools; mirrors created_by for staff-created rows.';



COMMENT ON COLUMN "public"."bookings"."ignore_cleaner_conflict" IS 'True when admin create used ignore_cleaner_slot_conflict after a same-slot cleaner overlap warning.';



COMMENT ON COLUMN "public"."bookings"."cleaner_slot_override_reason" IS 'Free-text context when admin acknowledged a cleaner slot overlap (paired with ignore_cleaner_conflict).';



COMMENT ON COLUMN "public"."bookings"."cleaner_earnings_total_cents" IS 'Sum of booking_line_items.cleaner_earnings_cents after one-shot finalize; null until computed.';



COMMENT ON COLUMN "public"."bookings"."cleaner_line_earnings_finalized_at" IS 'When line-item cleaner earnings were frozen; never recompute after this is set.';



COMMENT ON COLUMN "public"."bookings"."cleaner_share_percentage" IS 'Share of each eligible line item total allocated to cleaner at booking time; recompute reads this, not process env.';



COMMENT ON COLUMN "public"."bookings"."marked_paid_by_admin_id" IS 'Auth user id (admin) who recorded off-platform payment; null when paid via Paystack checkout.';



COMMENT ON COLUMN "public"."bookings"."payment_method" IS 'Off-platform settlement channel set by admin mark-paid: cash | zoho.';



COMMENT ON COLUMN "public"."bookings"."payment_reference_external" IS 'External reference (e.g. Zoho invoice id) supplied when marking paid; distinct from paystack_reference.';



COMMENT ON COLUMN "public"."bookings"."updated_at" IS 'Row version for optimistic concurrency (admin edit-details and similar).';



COMMENT ON COLUMN "public"."bookings"."payment_mismatch" IS 'True when visit total was raised after payment was recorded — customer may owe a top-up.';



COMMENT ON COLUMN "public"."bookings"."referral_reconciliation_required" IS 'Set when checkout used a referral discount but post-payment redemption insert failed (non-idempotent); ops/finance review.';



COMMENT ON COLUMN "public"."bookings"."lifecycle_issue" IS 'Set when post-payment lifecycle job scheduling failed (Day 6); cleared after successful repair.';



COMMENT ON COLUMN "public"."bookings"."accepted_at" IS 'Cleaner committed to the booking (dispatch offer accepted); aligns with cleaner_response accepted in unified flow.';



COMMENT ON COLUMN "public"."bookings"."payment_state" IS 'Derived label for recurring-generated Paystack collection flow (see deriveRecurringPaymentState). Null when not applicable.';



COMMENT ON COLUMN "public"."bookings"."billing_type" IS 'Financial mode: prepaid (collected cash caps hybrid payout), recurring_invoice / monthly_contract / pay_later (accrual cap from invoice line / service value before customer settlement).';



COMMENT ON COLUMN "public"."bookings"."admin_recurring_unpaid_completion_override_at" IS 'Set when an admin marks completed while the visit was recurring cleaner-visible pending_payment; cleaner travel/start/complete were policy-locked until this override.';



COMMENT ON COLUMN "public"."bookings"."admin_recurring_unpaid_completion_override_by" IS 'Admin identity (email preferred) recorded with admin_recurring_unpaid_completion_override_at.';



COMMENT ON COLUMN "public"."bookings"."refunded_at" IS 'When a refund or reversal was recorded for this booking.';



COMMENT ON COLUMN "public"."bookings"."refund_status" IS 'Refund lifecycle, e.g. partial | full | reversed — null means no refund.';



COMMENT ON COLUMN "public"."bookings"."service_details" IS 'Service-specific step 1 answers (JSONB map of question key → answer)';



COMMENT ON COLUMN "public"."bookings"."selected_extras" IS 'Array of selected extra service IDs';



COMMENT ON COLUMN "public"."bookings"."pricing_summary" IS 'Itemised price breakdown at time of booking confirmation';



COMMENT ON COLUMN "public"."bookings"."cleaner_mode" IS 'team = deep/moving cleaning, individual_cleaners = all other services';



COMMENT ON COLUMN "public"."bookings"."assigned_team_id" IS 'Team 1/2/3 assigned for deep or moving cleaning bookings';



COMMENT ON COLUMN "public"."bookings"."cleaner_count" IS 'Number of individual cleaners (1–3) for non-team services';



COMMENT ON COLUMN "public"."bookings"."booking_type" IS 'once_off or recurring';



COMMENT ON COLUMN "public"."bookings"."recurring_frequency" IS 'Weekly, fortnightly, monthly, or custom schedule';



COMMENT ON COLUMN "public"."bookings"."recurring_days" IS 'Array of weekday names for custom recurring schedules';



COMMENT ON COLUMN "public"."bookings"."city" IS 'City for the booking address (e.g. Cape Town). Mirrors booking_snapshot.city.';



COMMENT ON COLUMN "public"."bookings"."zoho_invoice_id" IS 'Zoho Books invoice ID synced at per-booking payment (charge.success webhook). NULL until synced.';



COMMENT ON COLUMN "public"."bookings"."recurring_discount_cents" IS 'Recurring plan discount applied at booking-v2 checkout (cents).';



COMMENT ON COLUMN "public"."bookings"."estimated_duration_minutes" IS 'Estimated job duration in minutes at booking-v2 confirm time.';



COMMENT ON COLUMN "public"."bookings"."preferred_dispatch_status" IS 'Customer-selected cleaner dispatch phase (preferred offer → backup wave → assigned).';



COMMENT ON COLUMN "public"."bookings"."booking_reference" IS 'Human-readable customer reference (SHL-BK-######), assigned on insert.';



COMMENT ON COLUMN "public"."bookings"."earnings_summary" IS 'Frozen server-computed earnings breakdown (v3 rules): customer total, per-cleaner payouts, bonuses, company revenue.';



COMMENT ON COLUMN "public"."bookings"."estimate_status" IS 'Non-authoritative estimate lifecycle; must never override total_cents for payment.';



COMMENT ON COLUMN "public"."bookings"."estimated_at" IS 'When an estimate snapshot was produced; informational only.';



COMMENT ON COLUMN "public"."bookings"."quote_id" IS 'Optional link to a server quote record when pricing engine exists; not used for Paystack amount.';



COMMENT ON COLUMN "public"."bookings"."pricing_engine_version" IS 'Optional pricing engine / ruleset label for audit and stale detection.';



COMMENT ON COLUMN "public"."bookings"."equipment_required" IS 'Customer or admin requested Shalean to bring cleaning equipment.';



COMMENT ON COLUMN "public"."bookings"."equipment_distance_km" IS 'One-way distance (km) from equipment base to customer address at quote time.';



COMMENT ON COLUMN "public"."bookings"."equipment_logistics_fee" IS 'Equipment delivery + collection fee (ZAR) charged on booking; 0 when manual quote required.';



COMMENT ON COLUMN "public"."bookings"."equipment_pricing_snapshot" IS 'Frozen equipment pricing config and geocode metadata at booking time.';



COMMENT ON COLUMN "public"."bookings"."equipment_fee_override_reason" IS 'Admin reason when equipment logistics fee was manually overridden.';



COMMENT ON COLUMN "public"."bookings"."sales_document_id" IS 'When set, this booking was created from an accepted sales document invoice (quote → invoice flow).';



COMMENT ON COLUMN "public"."bookings"."zoho_invoice_number" IS 'Zoho Books invoice_number (e.g. INV-000123) for the linked zoho_invoice_id.';



COMMENT ON COLUMN "public"."bookings"."duration_hours" IS 'One-decimal scheduled job length in hours; mirrors duration_minutes at confirm time.';



COMMENT ON COLUMN "public"."bookings"."cleaner_workload" IS 'Canonical workload weight from unified quote engine at confirm time.';



COMMENT ON COLUMN "public"."bookings"."estimated_finish_at" IS 'Scheduled end instant (Johannesburg wall clock): date + time + duration_minutes.';



COMMENT ON COLUMN "public"."bookings"."quote_calculation_version" IS 'BOOKING_QUOTE_ENGINE_VERSION at confirm; binds price + duration snapshot.';



COMMENT ON COLUMN "public"."bookings"."admin_completion_gate_override_at" IS 'When set, admin completed the booking while cleaner completion gates (duration/timer/quote) were not satisfied.';



COMMENT ON COLUMN "public"."bookings"."admin_completion_gate_override_by" IS 'Admin email or user id that applied the completion-gate override.';



COMMENT ON COLUMN "public"."bookings"."admin_completion_gate_override_reason" IS 'Free-text admin reason recorded with the completion-gate override.';



COMMENT ON COLUMN "public"."bookings"."admin_completion_gate_override_codes" IS 'Cleaner completion gate codes bypassed by admin (e.g. minimum_duration_not_elapsed).';



COMMENT ON COLUMN "public"."bookings"."fulfillment_mode" IS 'How checkout accepted the booking: instant (eligible cleaner), ops_assignment (paid reserve for ops), area_review (unpaid expansion lead).';



COMMENT ON COLUMN "public"."bookings"."fulfillment_reason" IS 'Short machine reason for fulfillment_mode (ops/analytics).';



COMMENT ON CONSTRAINT "booking_status_response_started_requires_in_progress" ON "public"."bookings" IS 'cleaner_response_status started implies bookings.status has left assignable pre-active states.';



COMMENT ON CONSTRAINT "bookings_assigned_requires_status" ON "public"."bookings" IS 'Forbids operational pending when cleaner_id or selected_cleaner_id is set (cleaner lifecycle requires assigned).';



COMMENT ON CONSTRAINT "bookings_cleaner_payout_lte_financial_cap" ON "public"."bookings" IS 'Hybrid cleaner_payout+bonus must not exceed: prepaid → coalesce(total_paid_cents, amount_paid_cents, zar_minor); invoice/recurring → coalesce(total_paid_cents, zar_minor, nullif(amount_paid_cents,0),0) so explicit 0 paid does not mask quoted line value.';



COMMENT ON CONSTRAINT "bookings_completed_requires_display_earnings" ON "public"."bookings" IS 'Completed bookings must have display_earnings_cents populated (including 0 for free/promo jobs).';



COMMENT ON CONSTRAINT "bookings_eligible_paid_require_frozen_cents" ON "public"."bookings" IS 'eligible/paid bookings must have payout_frozen_cents set (cleaner earnings basis).';



COMMENT ON CONSTRAINT "bookings_paid_requires_run_id" ON "public"."bookings" IS 'paid rows must carry a batch/run id for reconciliation (admin RPC sets this).';



COMMENT ON CONSTRAINT "bookings_payment_method_chk" ON "public"."bookings" IS 'Allowed off-platform settlement methods. Paystack uses paystack_reference + payment_status=success rather than this column. Extended in 20260936 to include eft and card.';



COMMENT ON CONSTRAINT "bookings_team_has_payout_owner" ON "public"."bookings" IS 'Team jobs must have a canonical payout_owner_cleaner_id for admin grouping and invariants.';



CREATE OR REPLACE FUNCTION "public"."booking_matches_active_admin_slot"("b" "public"."bookings", "p_user_id" "uuid", "p_date" "text", "p_time" "text", "p_service_slug" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    AS $$
declare
  v_owner uuid;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bookings'
      and column_name = 'customer_id'
  ) then
    v_owner := b.customer_id;
  else
    v_owner := b.user_id;
  end if;

  return v_owner is not distinct from p_user_id
    and b.date is not distinct from p_date
    and b.time is not distinct from p_time
    and lower(trim(b.service_slug)) is not distinct from lower(trim(p_service_slug))
    and b.status not in ('cancelled', 'failed', 'payment_expired');
end;
$$;


COMMENT ON FUNCTION "public"."booking_matches_active_admin_slot"("b" "public"."bookings", "p_user_id" "uuid", "p_date" "text", "p_time" "text", "p_service_slug" "text") IS 'Predicate: booking row is same customer slot as duplicate probe / race resolver. Uses customer_id when present, else legacy user_id.';



CREATE OR REPLACE FUNCTION "public"."bookings_after_write_monthly_invoice"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_billing text;
  v_bucket text;
  v_inv_id uuid;
  v_inv_status text;
  v_line bigint;
  v_cutoff smallint;
  v_old_line bigint;
  v_explicit_monthly boolean;
begin
  begin
    v_cutoff := nullif(trim(current_setting('app.monthly_invoice_last_day_cutoff_hour', true)), '')::smallint;
  exception when others then
    v_cutoff := null;
  end;
  v_cutoff := coalesce(v_cutoff, 18::smallint);

  v_explicit_monthly :=
    coalesce(new.is_monthly_billing_booking, false)
    or coalesce(new.payment_status, '') = 'pending_monthly';

  if new.customer_id is not null then
    select coalesce(up.billing_type, 'per_booking')
    into v_billing
    from public.user_profiles up
    where up.id = new.customer_id;

    -- Do not rewrite prepaid Paystack checkout rows (payment_status='pending').
    -- Those are card-settled at booking time even for monthly-profile customers.
    if (v_billing = 'monthly' or v_explicit_monthly)
       and coalesce(new.payment_status, '') not in ('success', 'failed', 'pending')
    then
      new.payment_status := 'pending_monthly';
      new.is_monthly_billing_booking := true;
    elsif coalesce(new.payment_status, '') = 'pending_monthly' then
      new.is_monthly_billing_booking := true;
    end if;
  end if;

  if tg_op = 'UPDATE'
     and coalesce(old.status, '') is distinct from 'cancelled'
     and coalesce(new.status, '') = 'cancelled'
     and old.monthly_invoice_id is not null
  then
    select status into v_inv_status from public.monthly_invoices where id = old.monthly_invoice_id;
    if v_inv_status = 'draft' then
      v_old_line := public.booking_line_amount_cents(old.total_paid_zar, old.amount_paid_cents);
      update public.monthly_invoices
      set
        total_bookings = greatest(0, total_bookings - 1),
        total_amount_cents = greatest(0, total_amount_cents - v_old_line),
        updated_at = now()
      where id = old.monthly_invoice_id;
    end if;
    return new;
  end if;

  if new.customer_id is null then
    return new;
  end if;

  select coalesce(up.billing_type, 'per_booking')
  into v_billing
  from public.user_profiles up
  where up.id = new.customer_id;

  if v_billing is distinct from 'monthly' and not v_explicit_monthly then
    return new;
  end if;

  if coalesce(new.status, '') = 'cancelled' then
    return new;
  end if;

  if coalesce(new.payment_status, '') is distinct from 'pending_monthly' then
    return new;
  end if;

  if new.monthly_invoice_id is not null then
    return new;
  end if;

  v_bucket := public.monthly_invoice_bucket_month(new.created_at, new.date, v_cutoff);
  if v_bucket is null then
    return new;
  end if;

  v_line := public.booking_line_amount_cents(new.total_paid_zar, new.amount_paid_cents);

  insert into public.monthly_invoices (customer_id, month, status, due_date)
  values (
    new.customer_id,
    v_bucket,
    'draft',
    public.monthly_invoice_due_date(v_bucket)
  )
  on conflict (customer_id, month) do nothing;

  select id, status into v_inv_id, v_inv_status
  from public.monthly_invoices
  where customer_id = new.customer_id and month = v_bucket
  limit 1;

  if v_inv_id is null or v_inv_status is distinct from 'draft' then
    return new;
  end if;

  new.monthly_invoice_id := v_inv_id;
  update public.monthly_invoices
  set
    total_bookings = total_bookings + 1,
    total_amount_cents = total_amount_cents + v_line,
    updated_at = now()
  where id = v_inv_id and status = 'draft';

  return new;
end;
$$;


COMMENT ON FUNCTION "public"."bookings_after_write_monthly_invoice"() IS 'Monthly invoice attach for monthly customers / explicit monthly flags. Preserves prepaid payment_status=pending for Paystack checkout.';



CREATE OR REPLACE FUNCTION "public"."bookings_before_delete_monthly_invoice"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_status text;
  v_line bigint;
begin
  if old.monthly_invoice_id is null then
    return old;
  end if;
  select status into v_status from public.monthly_invoices where id = old.monthly_invoice_id;
  if v_status is distinct from 'draft' then
    return old;
  end if;
  if coalesce(old.status, '') = 'cancelled' then
    return old;
  end if;
  v_line := public.booking_line_amount_cents(old.total_paid_zar, old.amount_paid_cents);
  update public.monthly_invoices
  set
    total_bookings = greatest(0, total_bookings - 1),
    total_amount_cents = greatest(0, total_amount_cents - v_line),
    updated_at = now()
  where id = old.monthly_invoice_id;
  return old;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."bookings_default_price_snapshot_if_missing"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  z numeric;
  slug text;
begin
  if new.price_snapshot is not null then
    return new;
  end if;

  z := round(coalesce(new.total_paid_zar::numeric, new.total_price::numeric, 0));
  slug := nullif(trim(coalesce(new.service_slug::text, '')), '');
  if slug is null or slug = '' then
    slug := 'standard';
  end if;

  if z < 1 and new.booking_snapshot is not null then
    z := 1;
  end if;

  if z < 1 then
    return new;
  end if;

  z := greatest(1, z);

  new.price_snapshot := jsonb_build_object(
    'v', 1,
    'service_type', slug,
    'base_price', z,
    'extras', '[]'::jsonb,
    'total_price', z
  );

  return new;
end;
$$;


COMMENT ON FUNCTION "public"."bookings_default_price_snapshot_if_missing"() IS 'BEFORE INSERT: if price_snapshot is null, derive minimal PriceSnapshotV1-shaped jsonb from total_paid_zar/total_price and service_slug.';



CREATE OR REPLACE FUNCTION "public"."bookings_lock_under_finalized_monthly_invoice"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_st text;
begin
  if old.monthly_invoice_id is null then
    return new;
  end if;
  select status into v_st from public.monthly_invoices where id = old.monthly_invoice_id;
  if v_st is null or v_st not in ('sent', 'partially_paid', 'overdue', 'paid') then
    return new;
  end if;

  if coalesce(old.payment_status, '') = 'pending_monthly'
     and coalesce(new.payment_status, '') = 'success'
     and new.status is not distinct from old.status
     and new.total_paid_zar is not distinct from old.total_paid_zar
     and new.customer_id is not distinct from old.customer_id
     and new.monthly_invoice_id is not distinct from old.monthly_invoice_id
     and (
       new.payment_status is distinct from old.payment_status
       or new.amount_paid_cents is distinct from old.amount_paid_cents
     )
  then
    return new;
  end if;

  if new.total_paid_zar is distinct from old.total_paid_zar
     or new.amount_paid_cents is distinct from old.amount_paid_cents
     or new.monthly_invoice_id is distinct from old.monthly_invoice_id
     or new.customer_id is distinct from old.customer_id
     or new.payment_status is distinct from old.payment_status
     or (
       new.status is distinct from old.status
       and coalesce(new.status, '') = 'cancelled'
     )
  then
    raise exception 'booking_update_blocked_monthly_invoice_finalized'
      using hint = 'Invoice is finalized; financial/cancel changes are blocked. Reschedule date/time is allowed. Use invoice_adjustments for credits/charges.';
  end if;

  return new;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."bookings_normalize_billing_type"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.billing_type in ('pay_later', 'monthly_contract') then
    return new;
  end if;

  if coalesce(new.is_monthly_billing_booking, false)
     or lower(trim(coalesce(new.payment_status, ''))) = 'pending_monthly'
     or new.monthly_invoice_id is not null
  then
    new.billing_type := 'recurring_invoice';
    return new;
  end if;

  if new.billing_type is null
     or btrim(coalesce(new.billing_type, '')) = ''
     or lower(trim(coalesce(new.billing_type, ''))) not in ('prepaid', 'recurring_invoice', 'monthly_contract', 'pay_later')
  then
    new.billing_type := 'prepaid';
  end if;

  return new;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."bookings_record_payment_link_delivery"("p_booking_id" "uuid", "p_payment_link_delivery" "jsonb", "p_touch_last_sent_at" boolean DEFAULT true) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_count integer;
begin
  update public.bookings
  set
    payment_link_delivery = p_payment_link_delivery,
    payment_link_send_count = coalesce(payment_link_send_count, 0) + 1,
    payment_link_first_sent_at = coalesce(payment_link_first_sent_at, now()),
    payment_link_last_sent_at = case
      when p_touch_last_sent_at then now()
      else payment_link_last_sent_at
    end,
    payment_needs_follow_up = case
      when coalesce(payment_link_send_count, 0) + 1 >= 3 then true
      else payment_needs_follow_up
    end
  where id = p_booking_id
  returning payment_link_send_count into v_count;

  if v_count is null then
    raise exception 'booking not found: %', p_booking_id;
  end if;
end;
$$;


COMMENT ON FUNCTION "public"."bookings_record_payment_link_delivery"("p_booking_id" "uuid", "p_payment_link_delivery" "jsonb", "p_touch_last_sent_at" boolean) IS 'Atomically merges payment link delivery JSON, increments send count, first/last sent timestamps, and follow-up flag.';



CREATE OR REPLACE FUNCTION "public"."bookings_set_normalized_phone"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.normalized_phone :=
    nullif(regexp_replace(coalesce(new.customer_phone, ''), '\D', '', 'g'), '');
  return new;
end;
$$;


COMMENT ON FUNCTION "public"."bookings_set_normalized_phone"() IS 'Keeps bookings.normalized_phone in sync with customer_phone for indexed identity lookups.';



CREATE OR REPLACE FUNCTION "public"."bookings_touch_became_pending_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.status = 'pending' then
    if tg_op = 'INSERT' then
      new.became_pending_at := coalesce(new.became_pending_at, now());
    elsif old.status is distinct from 'pending' then
      new.became_pending_at := now();
    end if;
  end if;
  return new;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."bookings_trg_ensure_payout_owner_in_team"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if tg_op = 'UPDATE' then
    -- Billing link sync: only zoho_invoice_id (+ updated_at) changed.
    if new.zoho_invoice_id is distinct from old.zoho_invoice_id
       and (to_jsonb(new) - 'zoho_invoice_id' - 'updated_at')
           is not distinct from (to_jsonb(old) - 'zoho_invoice_id' - 'updated_at') then
      return new;
    end if;

    -- Quote / duration persistence: do not re-validate team roster when only authoritative quote fields change.
    if (to_jsonb(new)
          - 'duration_minutes'
          - 'estimated_duration_minutes'
          - 'duration_hours'
          - 'cleaner_workload'
          - 'estimated_finish_at'
          - 'quote_calculation_version'
          - 'pricing_summary'
          - 'total_paid_zar'
          - 'total_price'
          - 'amount_paid_cents'
          - 'service_fee_cents'
          - 'base_amount_cents'
          - 'recurring_discount_cents'
          - 'updated_at')
        is not distinct from (to_jsonb(old)
          - 'duration_minutes'
          - 'estimated_duration_minutes'
          - 'duration_hours'
          - 'cleaner_workload'
          - 'estimated_finish_at'
          - 'quote_calculation_version'
          - 'pricing_summary'
          - 'total_paid_zar'
          - 'total_price'
          - 'amount_paid_cents'
          - 'service_fee_cents'
          - 'base_amount_cents'
          - 'recurring_discount_cents'
          - 'updated_at') then
      return new;
    end if;
  end if;

  if new.is_team_job is true
     and new.team_id is not null
     and new.payout_owner_cleaner_id is not null then
    if exists (
      select 1
        from public.team_members tm
       where tm.team_id = new.team_id
         and tm.cleaner_id = new.payout_owner_cleaner_id
    ) or exists (
      select 1
        from public.booking_cleaners bc
       where bc.booking_id = new.id
         and bc.cleaner_id = new.payout_owner_cleaner_id
         and bc.role = 'lead'
    ) then
      return new;
    end if;
    raise exception 'payout_owner_cleaner_id must be lead on booking_cleaners or member of team_members for team_id %', new.team_id;
  end if;
  return new;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."bookings_trg_payout_frozen_immutable_after_eligible"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  prev text;
  batch_open boolean;
begin
  if tg_op <> 'update' then
    return new;
  end if;

  prev := lower(coalesce(old.payout_status::text, ''));
  if prev not in ('eligible', 'paid') then
    return new;
  end if;

  if new.payout_frozen_cents is not distinct from old.payout_frozen_cents then
    return new;
  end if;

  batch_open := false;
  if new.payout_id is not null then
    select exists (
      select 1
      from public.cleaner_payouts cp
      where cp.id = new.payout_id
        and cp.status in ('pending', 'frozen')
    )
    into batch_open;
  end if;

  if batch_open then
    return new;
  end if;

  raise exception 'payout_frozen_cents is immutable once payout_status is eligible or paid (booking %)', old.id;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."claim_booking_dispatch_recovery_lease"("p_booking_id" "uuid", "p_lease_seconds" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_secs integer;
  v_prev timestamptz;
  v_stolen boolean := false;
begin
  v_secs := greatest(60, least(120, coalesce(nullif(p_lease_seconds, 0), 90)));

  select b.dispatch_recovery_lease_until into v_prev
  from public.bookings b
  where b.id = p_booking_id;

  update public.bookings
  set dispatch_recovery_lease_until = now() + make_interval(secs => v_secs)
  where id = p_booking_id
    and (dispatch_recovery_lease_until is null or dispatch_recovery_lease_until < now());

  if not found then
    return jsonb_build_object('claimed', false, 'stole_expired_lease', false);
  end if;

  v_stolen := v_prev is not null and v_prev < now();
  return jsonb_build_object('claimed', true, 'stole_expired_lease', v_stolen);
end;
$$;


COMMENT ON FUNCTION "public"."claim_booking_dispatch_recovery_lease"("p_booking_id" "uuid", "p_lease_seconds" integer) IS 'Atomically extends dispatch_recovery_lease_until using DB now(); returns claimed + stole_expired_lease.';



CREATE OR REPLACE FUNCTION "public"."claim_booking_earnings_recompute"("p_booking_id" "uuid", "p_cooldown_seconds" integer DEFAULT 120) RETURNS TABLE("claimed" boolean, "next_allowed_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_last timestamptz;
  v_next timestamptz;
  v_cooldown interval := make_interval(secs => p_cooldown_seconds);
begin
  select b.last_earnings_recompute_at
  into v_last
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    return query
    select false::boolean, null::timestamptz;
    return;
  end if;

  if v_last is null or v_last < now() - v_cooldown then
    update public.bookings
    set last_earnings_recompute_at = now()
    where id = p_booking_id;
    v_next := now() + v_cooldown;
    return query
    select true::boolean, v_next;
    return;
  end if;

  v_next := v_last + v_cooldown;
  return query
  select false::boolean, v_next;
end;
$$;


COMMENT ON FUNCTION "public"."claim_booking_earnings_recompute"("p_booking_id" "uuid", "p_cooldown_seconds" integer) IS 'Sets last_earnings_recompute_at when outside cooldown (claimed=true). When claimed=false, next_allowed_at is earliest time a claim may succeed.';



CREATE OR REPLACE FUNCTION "public"."claim_cleaner_earnings_for_paystack"("p_cleaner_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_disb_id uuid;
  v_total integer;
  v_ids uuid[];
begin
  if p_cleaner_id is null then
    raise exception 'cleaner_id_required';
  end if;

  perform pg_advisory_xact_lock(910772, abs(hashtext(p_cleaner_id::text)));

  select coalesce(array_agg(id), '{}'::uuid[]), coalesce(sum(amount_cents), 0)::integer
  into v_ids, v_total
  from (
    select ce.id, ce.amount_cents
    from public.cleaner_earnings ce
    inner join public.bookings b on b.id = ce.booking_id
    where ce.cleaner_id = p_cleaner_id
      and ce.status = 'approved'
      and ce.disbursement_id is null
      and b.payout_id is null
      and lower(coalesce(b.payout_status, '')) is distinct from 'paid'
      and b.payout_paid_at is null
      and b.refunded_at is null
      and lower(coalesce(b.refund_status, '')) not in ('refunded', 'partial_refund', 'reversed')
      and lower(coalesce(b.status, '')) = 'completed'
    order by ce.created_at asc
    for update of ce
  ) s;

  if v_total is null or v_total <= 0 or v_ids is null or cardinality(v_ids) = 0 then
    raise exception 'no_approved_earnings';
  end if;

  insert into public.cleaner_earnings_disbursements (cleaner_id, total_amount_cents, status)
  values (p_cleaner_id, v_total, 'processing')
  returning id into v_disb_id;

  update public.cleaner_earnings
  set
    disbursement_id = v_disb_id,
    status = 'processing'
  where id = any(v_ids);

  return v_disb_id;
end;
$$;


COMMENT ON FUNCTION "public"."claim_cleaner_earnings_for_paystack"("p_cleaner_id" "uuid") IS 'Advisory lock + FOR UPDATE; claims approved ledger rows not already on weekly payout rail / paid / refunded.';



CREATE OR REPLACE FUNCTION "public"."claim_team_capacity_slot"("p_team_id" "uuid", "p_booking_date" "date", "p_capacity_per_day" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  did_claim boolean := false;
begin
  insert into public.team_daily_capacity_usage (team_id, booking_date, used_slots)
  values (p_team_id, p_booking_date, 1)
  on conflict (team_id, booking_date) do update
    set used_slots = public.team_daily_capacity_usage.used_slots + 1,
        updated_at = now()
  where public.team_daily_capacity_usage.used_slots < p_capacity_per_day;

  get diagnostics did_claim = row_count;
  return did_claim;
end;
$$;


COMMENT ON FUNCTION "public"."claim_team_capacity_slot"("p_team_id" "uuid", "p_booking_date" "date", "p_capacity_per_day" integer) IS 'Atomic team-day slot claim via team_daily_capacity_usage. Pre-sort slot load in apps/web/lib/dispatch/assignTeamToBooking.ts counts is_team_job rows whose status is in CAPACITY_STATUSES (pending, assigned, in_progress) — keep that set aligned with how used_slots moves so allocator and RPC do not drift.';



CREATE OR REPLACE FUNCTION "public"."cleaner_payouts_block_mutate_when_frozen"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  old_status text := lower(coalesce(old.status::text, ''));
  new_status text := lower(coalesce(new.status::text, ''));
  pre_approval boolean;
begin
  pre_approval := old.payout_run_id is null
    and old_status in ('pending', 'frozen')
    and new_status in ('pending', 'frozen');

  if pre_approval then
    if new.cleaner_id is distinct from old.cleaner_id
      or new.period_start is distinct from old.period_start
      or new.period_end is distinct from old.period_end
    then
      raise exception 'cleaner_payouts %: cannot change cleaner or period before approval', old.id;
    end if;
    return new;
  end if;

  if old.frozen_at is not null or old.payout_run_id is not null then
    if new.total_amount_cents is distinct from old.total_amount_cents
      or new.cleaner_id is distinct from old.cleaner_id
      or new.period_start is distinct from old.period_start
      or new.period_end is distinct from old.period_end
    then
      raise exception 'cleaner_payouts % is frozen or in a disbursement run: cannot change amount, cleaner, or period', old.id;
    end if;
  end if;

  return new;
end;
$$;


COMMENT ON FUNCTION "public"."cleaner_payouts_block_mutate_when_frozen"() IS 'Blocks cleaner/period changes after freeze; allows total_amount_cents edits while status is pending/frozen and not in a disbursement run.';



CREATE OR REPLACE FUNCTION "public"."dispatch_cleaner_offer_accepted"("p_cleaner_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.cleaners
  set
    accepted_offers = accepted_offers + 1,
    acceptance_rate = case
      when total_offers > 0 then
        least(1.0::real, greatest(0.0::real, (accepted_offers + 1)::real / total_offers::real))
      else 1.0::real
    end
  where id = p_cleaner_id;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."dispatch_cleaner_offer_sent"("p_cleaner_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.cleaners
  set
    total_offers = total_offers + 1,
    acceptance_rate = case
      when total_offers + 1 > 0 then
        least(1.0::real, greatest(0.0::real, accepted_offers::real / (total_offers + 1)::real))
      else 1.0::real
    end
  where id = p_cleaner_id;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."dispatch_expire_peer_offers"("p_booking_id" "uuid", "p_winner_offer_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_batch uuid;
begin
  select batch_id into v_batch
  from public.dispatch_offers
  where id = p_winner_offer_id;

  update public.dispatch_offers
  set
    status = 'expired',
    responded_at = now()
  where booking_id = p_booking_id
    and status = 'pending'
    and id <> p_winner_offer_id;

  if v_batch is not null then
    update public.dispatch_offers
    set
      status = 'expired',
      responded_at = now()
    where batch_id = v_batch
      and status = 'pending'
      and id <> p_winner_offer_id;
  end if;
end;
$$;


COMMENT ON FUNCTION "public"."dispatch_expire_peer_offers"("p_booking_id" "uuid", "p_winner_offer_id" "uuid") IS 'Expire pending sibling offers for the booking; also expire pending offers in the same batch_id (Dispatch v2).';



CREATE OR REPLACE FUNCTION "public"."dispatch_record_offer_response"("p_cleaner_id" "uuid", "p_latency_ms" double precision, "p_accepted" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  old_avg double precision;
  new_avg double precision;
  old_recent real;
  new_recent real;
begin
  select avg_response_time_ms, acceptance_rate_recent
    into old_avg, old_recent
  from public.cleaners
  where id = p_cleaner_id;

  if old_avg is null or old_avg <= 0 then
    new_avg := greatest(p_latency_ms, 0.0);
  else
    new_avg := old_avg * 0.8 + p_latency_ms * 0.2;
  end if;

  old_recent := coalesce(old_recent, 1.0::real);
  new_recent := (old_recent * 0.7::real + (case when p_accepted then 1.0 else 0.0 end)::real * 0.3::real);
  new_recent := least(1.0::real, greatest(0.0::real, new_recent));

  update public.cleaners
  set
    avg_response_time_ms = new_avg,
    last_response_at = now(),
    acceptance_rate_recent = new_recent
  where id = p_cleaner_id;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."draft_monthly_invoice_due_date"("p_invoice_id" "uuid", "p_month" "text") RETURNS "date"
    LANGUAGE "sql" STABLE
    AS $$
  select coalesce(
    (
      select max(b.date::date)
      from public.bookings b
      where b.monthly_invoice_id = p_invoice_id
        and coalesce(b.status, '') is distinct from 'cancelled'
        and b.date::date >= (p_month || '-01')::date
        and b.date::date <= (
          date_trunc('month', (p_month || '-01')::date) + interval '1 month' - interval '1 day'
        )::date
    ),
    public.monthly_invoice_due_date(p_month)
  );
$$;


COMMENT ON FUNCTION "public"."draft_monthly_invoice_due_date"("p_invoice_id" "uuid", "p_month" "text") IS 'Provisional due_date for a draft monthly invoice: last visit in billing month, else last calendar day of month.';



CREATE OR REPLACE FUNCTION "public"."enqueue_stranded_pending_bookings"("p_limit" integer DEFAULT 50) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_inserted bigint;
begin
  if p_limit is null or p_limit < 1 then
    p_limit := 50;
  end if;
  if p_limit > 200 then
    p_limit := 200;
  end if;

  with picked as (
    select b.id as booking_id
    from public.bookings b
    where lower(trim(coalesce(b.status, ''))) in ('pending', 'pending_assignment', 'offered')
      and b.cleaner_id is null
      and b.location_id is not null
      and lower(trim(coalesce(b.dispatch_status, ''))) in ('searching', 'offered', 'failed')
      and not exists (
        select 1
        from public.dispatch_offers o
        where o.booking_id = b.id
          and o.status = 'pending'
      )
      and not exists (
        select 1
        from public.dispatch_retry_queue q
        where q.booking_id = b.id
          and q.status = 'pending'
      )
    order by coalesce(b.became_pending_at, b.created_at) asc
    limit p_limit
  ),
  ins as (
    insert into public.dispatch_retry_queue (
      booking_id,
      retries_done,
      next_retry_at,
      status,
      last_reason,
      updated_at
    )
    select
      p.booking_id,
      0::smallint,
      now(),
      'pending',
      'stranded_pending',
      now()
    from picked p
    returning id
  )
  select count(*) into v_inserted from ins;

  return jsonb_build_object(
    'stranded_enqueued', coalesce(v_inserted, 0),
    'ran_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
exception
  when others then
    insert into public.dispatch_logs (source, level, message, context)
    values (
      'enqueue_stranded_pending_bookings',
      'error',
      sqlerrm,
      jsonb_build_object('sqlstate', sqlstate, 'p_limit', p_limit)
    );
    return jsonb_build_object('ok', false, 'error', sqlerrm, 'sqlstate', sqlstate);
end;
$$;


COMMENT ON FUNCTION "public"."enqueue_stranded_pending_bookings"("p_limit" integer) IS 'Queue pending unassigned bookings that have no pending offer and no pending retry row.';



CREATE OR REPLACE FUNCTION "public"."expire_old_offers"() RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.expire_pending_dispatch_offers(100);
$$;


CREATE OR REPLACE FUNCTION "public"."expire_pending_dispatch_offers"("p_limit" integer DEFAULT 100) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_expired bigint;
  v_enqueued bigint;
begin
  if p_limit is null or p_limit < 1 then
    p_limit := 100;
  end if;
  if p_limit > 500 then
    p_limit := 500;
  end if;

  with candidates as (
    select d.id, d.booking_id, d.offer_type
    from public.dispatch_offers d
    where d.status = 'pending'
      and d.expires_at < now()
    order by d.expires_at asc
    limit p_limit
    for update skip locked
  ),
  expired as (
    update public.dispatch_offers d
    set
      status = 'expired',
      responded_at = now(),
      expired_at = now()
    from candidates c
    where d.id = c.id
      and d.status = 'pending'
    returning d.booking_id, d.offer_type
  ),
  preferred_bookings as (
    update public.bookings b
    set preferred_dispatch_status = 'preferred_cleaner_expired'
    from (
      select distinct e.booking_id
      from expired e
      where coalesce(e.offer_type, '') = 'preferred'
    ) pb
    where b.id = pb.booking_id
      and b.cleaner_id is null
      and coalesce(b.preferred_dispatch_status, '') in ('', 'preferred_cleaner_pending')
    returning b.id
  ),
  need as (
    select distinct e.booking_id
    from expired e
    inner join public.bookings b on b.id = e.booking_id
    where lower(trim(coalesce(b.status, ''))) in ('pending', 'pending_assignment', 'offered')
      and b.cleaner_id is null
      and lower(trim(coalesce(b.dispatch_status, ''))) <> 'unassignable'
  ),
  ins as (
    insert into public.dispatch_retry_queue (
      booking_id,
      retries_done,
      next_retry_at,
      status,
      last_reason,
      updated_at
    )
    select
      n.booking_id,
      1::smallint,
      now(),
      'pending',
      'offer_expired',
      now()
    from need n
    where not exists (
      select 1
      from public.dispatch_retry_queue q
      where q.booking_id = n.booking_id
        and q.status = 'pending'
    )
    returning id
  ),
  stats as (
    select
      (select count(*) from expired) as expired_n,
      (select count(*) from ins) as enqueued_n
  )
  select expired_n, enqueued_n into v_expired, v_enqueued from stats;

  return jsonb_build_object(
    'expired', v_expired,
    'enqueued', v_enqueued
  );
end;
$$;


COMMENT ON FUNCTION "public"."expire_pending_dispatch_offers"("p_limit" integer) IS 'Expire stale pending dispatch_offers; mark preferred_cleaner_expired; enqueue retry when unassigned.';



CREATE TABLE IF NOT EXISTS "public"."whatsapp_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phone" "text" NOT NULL,
    "type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "meta_message_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "idempotency_key" "text",
    "delivery_status" "text",
    "priority" integer DEFAULT 0 NOT NULL,
    "next_attempt_at" timestamp with time zone,
    "phone_raw" "text",
    "phone_e164" "text",
    "phone_digits" "text",
    CONSTRAINT "whatsapp_queue_processing_next_attempt_null" CHECK ((NOT (("status" = 'processing'::"text") AND ("next_attempt_at" IS NOT NULL)))),
    CONSTRAINT "whatsapp_queue_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'sent'::"text", 'failed'::"text", 'dead'::"text"]))),
    CONSTRAINT "whatsapp_queue_type_check" CHECK (("type" = ANY (ARRAY['text'::"text", 'template'::"text"])))
);


COMMENT ON TABLE "public"."whatsapp_queue" IS 'Meta WhatsApp outbound queue; processed by /api/cron/whatsapp-worker and inline flush for SMS fallback paths.';



COMMENT ON COLUMN "public"."whatsapp_queue"."payload" IS 'text: {"kind":"text","text":"..."} | template: {"kind":"template","templateName":"...","language":"en","bodyParams":["..."]}';



COMMENT ON COLUMN "public"."whatsapp_queue"."context" IS 'Opaque logging context (source, bookingId, etc.).';



COMMENT ON COLUMN "public"."whatsapp_queue"."idempotency_key" IS 'Stable key (e.g. bookingId + event) to prevent duplicate sends while row is not failed.';



COMMENT ON COLUMN "public"."whatsapp_queue"."delivery_status" IS 'Meta lifecycle: sent | delivered | read | failed (from webhooks); null until accepted or unknown.';



COMMENT ON COLUMN "public"."whatsapp_queue"."priority" IS 'Higher = sooner (worker orders priority DESC, created_at ASC).';



COMMENT ON COLUMN "public"."whatsapp_queue"."next_attempt_at" IS 'When status=pending after a failure, do not pick until this time (exponential backoff).';



COMMENT ON COLUMN "public"."whatsapp_queue"."phone_raw" IS 'Original input from client/admin (truncated).';



COMMENT ON COLUMN "public"."whatsapp_queue"."phone_e164" IS 'Best-effort E.164 for SMS / logs (nullable).';



COMMENT ON COLUMN "public"."whatsapp_queue"."phone_digits" IS 'Meta `to` digits; mirrors phone when unset.';



COMMENT ON CONSTRAINT "whatsapp_queue_processing_next_attempt_null" ON "public"."whatsapp_queue" IS 'While status is processing, next_attempt_at must be null (backoff only on pending).';



CREATE OR REPLACE FUNCTION "public"."get_pending_whatsapp_jobs"("limit_count" integer, "max_delivery_attempts" integer DEFAULT 5) RETURNS SETOF "public"."whatsapp_queue"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select *
  from public.whatsapp_queue
  where status = 'pending'
    and attempts < greatest(1, max_delivery_attempts)
    and (next_attempt_at is null or next_attempt_at <= now())
  order by priority desc nulls last, created_at asc
  limit greatest(1, least(coalesce(limit_count, 15), 50));
$$;


COMMENT ON FUNCTION "public"."get_pending_whatsapp_jobs"("limit_count" integer, "max_delivery_attempts" integer) IS 'Returns eligible pending WhatsApp queue rows for the cron worker (priority, backoff).';



CREATE OR REPLACE FUNCTION "public"."get_whatsapp_queue_status_metrics"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  with agg as (
    select status::text as st, count(*)::bigint as cnt
    from public.whatsapp_queue
    group by status
  )
  select jsonb_build_object(
    'pending', coalesce((select cnt from agg where st = 'pending'), 0),
    'processing', coalesce((select cnt from agg where st = 'processing'), 0),
    'sent', coalesce((select cnt from agg where st = 'sent'), 0),
    'failed', coalesce((select cnt from agg where st = 'failed'), 0),
    'dead', coalesce((select cnt from agg where st = 'dead'), 0),
    'pending_retry', (
      select count(*)::bigint
      from public.whatsapp_queue
      where status = 'pending' and attempts > 0
    )
  );
$$;


COMMENT ON FUNCTION "public"."get_whatsapp_queue_status_metrics"() IS 'Single-query queue depth: counts by status plus pending_retry (pending with attempts > 0).';



CREATE OR REPLACE FUNCTION "public"."increment_monthly_invoice_reminder_count"("p_invoice_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.monthly_invoices
  set
    reminder_count = reminder_count + 1,
    updated_at = now()
  where id = p_invoice_id;
end;
$$;


COMMENT ON FUNCTION "public"."increment_monthly_invoice_reminder_count"("p_invoice_id" "uuid") IS 'Atomic bump for monthly_invoices.reminder_count after a reminder channel succeeds (service_role only).';



CREATE OR REPLACE FUNCTION "public"."increment_promotion_redemption_counters"("p_promotion_id" "uuid", "p_discount_zar" numeric, "p_revenue_zar" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.promotions%rowtype;
begin
  if p_promotion_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_promotion_id');
  end if;
  if p_discount_zar is null or p_discount_zar < 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_discount');
  end if;

  update public.promotions
  set
    redemptions_count = redemptions_count + 1,
    budget_spent_zar = budget_spent_zar + p_discount_zar,
    revenue_generated_zar = revenue_generated_zar + greatest(coalesce(p_revenue_zar, 0), 0),
    updated_at = now()
  where id = p_promotion_id
    and (usage_limit_total is null or redemptions_count < usage_limit_total)
    and (budget_zar is null or budget_spent_zar + p_discount_zar <= budget_zar)
  returning * into v_row;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'limit_or_budget_exceeded');
  end if;

  return jsonb_build_object(
    'ok', true,
    'redemptions_count', v_row.redemptions_count,
    'budget_spent_zar', v_row.budget_spent_zar,
    'revenue_generated_zar', v_row.revenue_generated_zar
  );
end;
$$;


COMMENT ON FUNCTION "public"."increment_promotion_redemption_counters"("p_promotion_id" "uuid", "p_discount_zar" numeric, "p_revenue_zar" numeric) IS 'Atomically increments promotion redemption counters with usage/budget guards. Phase 1 revenue integrity.';



CREATE OR REPLACE FUNCTION "public"."increment_user_profile_stats"("p_user_id" "uuid", "p_amount" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.user_profiles (id, booking_count, total_spent_cents, updated_at)
  values (p_user_id, 1, p_amount, now())
  on conflict (id) do update set
    booking_count = user_profiles.booking_count + 1,
    total_spent_cents = user_profiles.total_spent_cents + excluded.total_spent_cents,
    updated_at = now();
end;
$$;


CREATE OR REPLACE FUNCTION "public"."initialize_customer_draft_booking"("p_scheduled_start" timestamp with time zone, "p_scheduled_end" timestamp with time zone, "p_service_timezone" "text", "p_address_line1" "text", "p_locality" "text", "p_region" "text", "p_postal_code" "text", "p_country_code" "text", "p_service_notes" "text", "p_currency" "text", "p_subtotal_cents" bigint, "p_fees_cents" bigint, "p_tax_cents" bigint, "p_total_cents" bigint, "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_service_slug" "text" DEFAULT NULL::"text", "p_estimate_status" "text" DEFAULT NULL::"text", "p_estimated_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_quote_id" "uuid" DEFAULT NULL::"uuid", "p_pricing_engine_version" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "status" "public"."booking_status", "customer_id" "uuid", "scheduled_start" timestamp with time zone, "scheduled_end" timestamp with time zone, "created_at" timestamp with time zone, "row_version" integer, "idempotent_replay" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  uid uuid := auth.uid();
  v_metadata jsonb := COALESCE(p_metadata, '{}'::jsonb);
  v_key text;
  v_existing uuid;
  v_id uuid;
  v_status public.booking_status;
  v_cust uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_created_at timestamptz;
  v_row_version integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'BOOKING_INIT_NOT_AUTHENTICATED';
  END IF;

  IF p_scheduled_end <= p_scheduled_start THEN
    RAISE EXCEPTION 'BOOKING_INIT_INVALID_SCHEDULE';
  END IF;

  IF p_subtotal_cents + p_fees_cents + p_tax_cents <> p_total_cents THEN
    RAISE EXCEPTION 'BOOKING_INIT_INVALID_AMOUNTS';
  END IF;

  v_key := NULLIF(trim(COALESCE(v_metadata->>'idempotency_key', '')), '');
  IF v_key IS NOT NULL AND char_length(v_key) < 8 THEN
    v_key := NULL;
  END IF;

  IF v_key IS NOT NULL THEN
    SELECT b.id
    INTO v_existing
    FROM public.bookings b
    WHERE b.customer_id = uid
      AND b.metadata->>'idempotency_key' = v_key
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      INSERT INTO public.booking_preferences (booking_id, cadence, preference_mode, notes, metadata)
      VALUES (v_existing, 'once', 'best_available', NULL, '{}'::jsonb)
      ON CONFLICT (booking_id) DO NOTHING;

      RETURN QUERY
      SELECT
        b.id,
        b.status,
        b.customer_id,
        b.scheduled_start,
        b.scheduled_end,
        b.created_at,
        b.row_version,
        true AS idempotent_replay
      FROM public.bookings b
      WHERE b.id = v_existing;
      RETURN;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.bookings (
      customer_id,
      status,
      scheduled_start,
      scheduled_end,
      service_timezone,
      address_line1,
      locality,
      region,
      postal_code,
      country_code,
      service_notes,
      currency,
      subtotal_cents,
      fees_cents,
      tax_cents,
      total_cents,
      metadata,
      service_slug,
      estimate_status,
      estimated_at,
      quote_id,
      pricing_engine_version
    )
    VALUES (
      uid,
      'draft'::public.booking_status,
      p_scheduled_start,
      p_scheduled_end,
      COALESCE(NULLIF(trim(p_service_timezone), ''), 'UTC'),
      p_address_line1,
      p_locality,
      p_region,
      p_postal_code,
      upper(trim(p_country_code))::char(2),
      COALESCE(p_service_notes, ''),
      upper(trim(p_currency))::char(3),
      p_subtotal_cents,
      p_fees_cents,
      p_tax_cents,
      p_total_cents,
      v_metadata,
      p_service_slug,
      p_estimate_status,
      p_estimated_at,
      p_quote_id,
      p_pricing_engine_version
    )
    RETURNING
      bookings.id,
      bookings.status,
      bookings.customer_id,
      bookings.scheduled_start,
      bookings.scheduled_end,
      bookings.created_at,
      bookings.row_version
    INTO v_id, v_status, v_cust, v_start, v_end, v_created_at, v_row_version;

    INSERT INTO public.booking_preferences (booking_id, cadence, preference_mode, notes, metadata)
    VALUES (v_id, 'once', 'best_available', NULL, '{}'::jsonb)
    ON CONFLICT (booking_id) DO NOTHING;

    RETURN QUERY
    SELECT v_id, v_status, v_cust, v_start, v_end, v_created_at, v_row_version, false AS idempotent_replay;
  EXCEPTION
    WHEN unique_violation THEN
      IF v_key IS NULL THEN
        RAISE;
      END IF;

      SELECT b.id
      INTO v_existing
      FROM public.bookings b
      WHERE b.customer_id = uid
        AND b.metadata->>'idempotency_key' = v_key
      LIMIT 1;

      IF v_existing IS NULL THEN
        RAISE;
      END IF;

      INSERT INTO public.booking_preferences (booking_id, cadence, preference_mode, notes, metadata)
      VALUES (v_existing, 'once', 'best_available', NULL, '{}'::jsonb)
      ON CONFLICT (booking_id) DO NOTHING;

      RETURN QUERY
      SELECT
        b.id,
        b.status,
        b.customer_id,
        b.scheduled_start,
        b.scheduled_end,
        b.created_at,
        b.row_version,
        true AS idempotent_replay
      FROM public.bookings b
      WHERE b.id = v_existing;
  END;

  RETURN;
END;
$$;


COMMENT ON FUNCTION "public"."initialize_customer_draft_booking"("p_scheduled_start" timestamp with time zone, "p_scheduled_end" timestamp with time zone, "p_service_timezone" "text", "p_address_line1" "text", "p_locality" "text", "p_region" "text", "p_postal_code" "text", "p_country_code" "text", "p_service_notes" "text", "p_currency" "text", "p_subtotal_cents" bigint, "p_fees_cents" bigint, "p_tax_cents" bigint, "p_total_cents" bigint, "p_metadata" "jsonb", "p_service_slug" "text", "p_estimate_status" "text", "p_estimated_at" timestamp with time zone, "p_quote_id" "uuid", "p_pricing_engine_version" "text") IS 'Atomically creates draft booking + default booking_preferences for auth.uid(); idempotent replay when metadata.idempotency_key matches.';



CREATE OR REPLACE FUNCTION "public"."invoice_adjustments_after_insert_route"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  inv_id uuid;
  inv_status text;
  inv_closed boolean;
  v_paid bigint;
  v_total bigint;
  v_bal bigint;
begin
  select id, status, is_closed
  into inv_id, inv_status, inv_closed
  from public.monthly_invoices
  where customer_id = new.customer_id
    and month = new.month_applied
  limit 1;

  if inv_id is null then
    return new;
  end if;

  if coalesce(inv_closed, false) = true then
    raise exception 'invoice_adjustments_month_closed'
      using hint = 'This billing month is closed; use a future month_applied.';
  end if;

  if inv_status = 'draft' then
    update public.invoice_adjustments
    set
      applied_to_invoice_id = inv_id,
      applied_at = now()
    where id = new.id;

    perform public.recompute_monthly_invoice_totals(inv_id);
    return new;
  end if;

  if inv_status in ('sent', 'partially_paid', 'overdue') then
    update public.monthly_invoices
    set
      total_amount_cents = greatest(0, total_amount_cents + new.amount_cents),
      updated_at = now()
    where id = inv_id;

    update public.invoice_adjustments
    set
      applied_to_invoice_id = inv_id,
      applied_at = now()
    where id = new.id;

    select
      coalesce(amount_paid_cents, 0)::bigint,
      coalesce(total_amount_cents, 0)::bigint
    into v_paid, v_total
    from public.monthly_invoices
    where id = inv_id;

    v_bal := greatest(0::bigint, v_total - v_paid);

    perform public.monthly_invoice_append_snapshot_event(
      inv_id,
      jsonb_build_object(
        'kind', 'adjustment_applied',
        'at', now(),
        'adjustment_id', new.id,
        'amount_cents', new.amount_cents,
        'reason', new.reason,
        'category', new.category,
        'booking_id', new.booking_id,
        'amount_paid_cents_after', v_paid,
        'balance_cents_after', v_bal,
        'actor', 'system',
        'reference', 'adjustment:' || new.id::text
      )
    );
  end if;

  return new;
end;
$$;


COMMENT ON FUNCTION "public"."invoice_adjustments_after_insert_route"() IS 'Post-send corrections: if an invoice row exists for customer+month in sent/partially_paid/overdue, bump total immediately and stamp applied_to_invoice_id. If month is already paid, insert with a future month_applied for the next draft.';



CREATE OR REPLACE FUNCTION "public"."invoice_adjustments_block_if_month_closed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if exists (
    select 1
    from public.monthly_invoices mi
    where mi.customer_id = new.customer_id
      and mi.month = new.month_applied
      and mi.is_closed = true
  ) then
    raise exception 'invoice_adjustments_month_closed'
      using hint = 'This billing month is closed; use a future month_applied or reopen the invoice.';
  end if;
  return new;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."invoke_nextjs_cron"("cron_path" "text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_cfg record;
  v_url text;
  v_path text;
  v_req_id bigint;
begin
  if cron_path is null or btrim(cron_path) = '' then
    raise exception 'cron_path is required';
  end if;

  v_path := cron_path;
  if left(v_path, 1) <> '/' then
    v_path := '/' || v_path;
  end if;

  select app_base_url, cron_secret
  into v_cfg
  from public.cron_http_targets
  where singleton
  limit 1;

  if v_cfg is null then
    raise exception 'cron_http_targets row missing';
  end if;

  if v_cfg.app_base_url like '%YOUR_DOMAIN%' or v_cfg.cron_secret = 'YOUR_CRON_SECRET' then
    raise exception 'cron_http_targets still has placeholder values — update app_base_url and cron_secret';
  end if;

  v_url := rtrim(v_cfg.app_base_url, '/') || v_path;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_cfg.cron_secret,
      'x-cron-secret', v_cfg.cron_secret
    ),
    body := '{}'::jsonb
  )
  into v_req_id;

  return v_req_id;
end;
$$;


COMMENT ON FUNCTION "public"."invoke_nextjs_cron"("cron_path" "text") IS 'pg_net POST to Next.js /api/cron/* using cron_http_targets (Bearer + x-cron-secret).';



CREATE OR REPLACE FUNCTION "public"."jsonb_array_tail"("p_arr" "jsonb", "p_max" integer) RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select coalesce(
    (
      select jsonb_agg(elem order by ord)
      from (
        select t.elem, t.ord
        from jsonb_array_elements(coalesce(p_arr, '[]'::jsonb)) with ordinality as t(elem, ord)
      ) x
      where x.ord > (
        select greatest(0, count(*)::int - p_max)
        from jsonb_array_elements(coalesce(p_arr, '[]'::jsonb)) e
      )
    ),
    '[]'::jsonb
  );
$$;


CREATE OR REPLACE FUNCTION "public"."link_booking_to_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.customer_id is null
     and new.customer_email is not null
     and length(trim(new.customer_email)) > 0 then
    new.customer_id := public.resolve_auth_user_id_by_email(new.customer_email);
  end if;
  return new;
end;
$$;


COMMENT ON FUNCTION "public"."link_booking_to_user"() IS 'Safety net: sets bookings.customer_id from auth.users when insert omits customer_id but customer_email matches.';



CREATE OR REPLACE FUNCTION "public"."list_bookings_due_user_selected_recovery"("p_max_attempts" integer, "p_limit" integer, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "selected_cleaner_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select b.id, b.selected_cleaner_id
  from public.bookings b
  where lower(trim(coalesce(b.status, ''))) in ('pending', 'pending_assignment', 'offered')
    and b.cleaner_id is null
    and b.assignment_type = 'user_selected'
    and b.dispatch_attempt_count < p_max_attempts
    and b.dispatch_status in ('offered', 'searching')
    and (b.dispatch_next_recovery_at is null or b.dispatch_next_recovery_at <= now())
    and b.selected_cleaner_id is not null
    and not exists (
      select 1
      from public.dispatch_offers o
      where o.booking_id = b.id
        and o.status = 'pending'
    )
  order by b.dispatch_next_recovery_at nulls first, b.created_at asc
  limit greatest(1, least(coalesce(nullif(p_limit, 0), 40), 500))
  offset greatest(0, coalesce(p_offset, 0));
$$;


COMMENT ON FUNCTION "public"."list_bookings_due_user_selected_recovery"("p_max_attempts" integer, "p_limit" integer, "p_offset" integer) IS 'Cron: user-selected recovery; includes pending_assignment (post-pay offer wait).';



CREATE OR REPLACE FUNCTION "public"."mark_bookings_paid_for_cleaner_payout"("p_payout_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_count integer := 0;
begin
  if p_payout_id is null then
    return 0;
  end if;

  update public.bookings b
  set
    payout_status = 'paid',
    payout_paid_at = coalesce(b.payout_paid_at, now())
  where b.payout_id = p_payout_id
    and (
      lower(coalesce(b.payout_status, '')) is distinct from 'paid'
      or b.payout_paid_at is null
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


COMMENT ON FUNCTION "public"."mark_bookings_paid_for_cleaner_payout"("p_payout_id" "uuid") IS 'Idempotent: sets linked bookings to payout_status=paid when weekly batch Paystack succeeds or manual mark-paid.';



CREATE OR REPLACE FUNCTION "public"."mark_bookings_paid_for_earnings_disbursement"("p_disbursement_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_count integer := 0;
begin
  if p_disbursement_id is null then
    return 0;
  end if;

  update public.bookings b
  set
    payout_status = 'paid',
    payout_paid_at = coalesce(b.payout_paid_at, now())
  from public.cleaner_earnings ce
  where ce.disbursement_id = p_disbursement_id
    and ce.booking_id = b.id
    and (
      lower(coalesce(b.payout_status, '')) is distinct from 'paid'
      or b.payout_paid_at is null
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


COMMENT ON FUNCTION "public"."mark_bookings_paid_for_earnings_disbursement"("p_disbursement_id" "uuid") IS 'Idempotent: marks bookings paid for earnings rows in a successful ledger disbursement.';



CREATE OR REPLACE FUNCTION "public"."mark_monthly_invoice_overdue_flags"("p_today" "date") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_n integer := 0;
  v_grace integer := 5;
begin
  update public.monthly_invoices
  set
    is_overdue = true,
    updated_at = now()
  where (due_date + v_grace) < p_today
    and status in ('sent', 'partially_paid')
    and coalesce(total_amount_cents, 0) > coalesce(amount_paid_cents, 0);

  get diagnostics v_n = row_count;

  update public.monthly_invoices
  set
    is_overdue = false,
    updated_at = now()
  where is_overdue = true
    and coalesce(total_amount_cents, 0) <= coalesce(amount_paid_cents, 0);

  update public.user_profiles up
  set account_billing_risk = 'at_risk', updated_at = now()
  where exists (
    select 1
    from public.monthly_invoices mi
    where mi.customer_id = up.id
      and mi.is_overdue = true
      and coalesce(mi.total_amount_cents, 0) > coalesce(mi.amount_paid_cents, 0)
  );

  update public.user_profiles up
  set account_billing_risk = 'ok', updated_at = now()
  where up.account_billing_risk = 'at_risk'
    and not exists (
      select 1
      from public.monthly_invoices mi
      where mi.customer_id = up.id
        and mi.is_overdue = true
        and coalesce(mi.total_amount_cents, 0) > coalesce(mi.amount_paid_cents, 0)
    );

  return v_n;
end;
$$;


COMMENT ON FUNCTION "public"."mark_monthly_invoice_overdue_flags"("p_today" "date") IS 'Marks sent/partially_paid invoices overdue when due_date + 5 grace days < p_today.';



CREATE OR REPLACE FUNCTION "public"."monthly_invoice_append_snapshot_event"("p_invoice_id" "uuid", "p_event" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_cur jsonb;
  v_ver integer;
  v_total bigint;
  v_paid bigint;
  v_events jsonb;
  v_adj jsonb;
  v_kind text;
  const_max constant integer := 50;
begin
  insert into public.monthly_invoice_events (invoice_id, kind, payload)
  values (
    p_invoice_id,
    coalesce(p_event ->> 'kind', 'unknown'),
    p_event
  );

  select
    snapshot_current,
    snapshot_version,
    total_amount_cents,
    amount_paid_cents
  into v_cur, v_ver, v_total, v_paid
  from public.monthly_invoices
  where id = p_invoice_id
  for update;

  if not found then
    return;
  end if;

  v_cur := coalesce(
    v_cur,
    jsonb_build_object(
      'schema', 'monthly_invoice_snapshot_current_v1',
      'events', '[]'::jsonb,
      'adjustments_applied_after_send', '[]'::jsonb
    )
  );

  v_events := public.jsonb_array_tail(
    coalesce(v_cur -> 'events', '[]'::jsonb) || jsonb_build_array(p_event),
    const_max
  );

  v_cur := jsonb_set(v_cur, '{events}', v_events, true);

  v_kind := coalesce(p_event ->> 'kind', '');
  if v_kind in ('adjustment_applied', 'adjustment_post_send') then
    v_adj := public.jsonb_array_tail(
      coalesce(v_cur -> 'adjustments_applied_after_send', '[]'::jsonb) || jsonb_build_array(p_event),
      const_max
    );
    v_cur := jsonb_set(v_cur, '{adjustments_applied_after_send}', v_adj, true);
  end if;

  v_cur := jsonb_set(
    v_cur,
    '{last_totals}',
    jsonb_build_object(
      'total_amount_cents', coalesce(v_total, 0),
      'amount_paid_cents', coalesce(v_paid, 0),
      'balance_cents', greatest(0, coalesce(v_total, 0) - coalesce(v_paid, 0))
    ),
    true
  );

  v_cur := jsonb_set(v_cur, '{events_tail_max}', to_jsonb(const_max), true);

  update public.monthly_invoices
  set
    snapshot_current = v_cur,
    snapshot_version = coalesce(v_ver, 0) + 1,
    updated_at = now()
  where id = p_invoice_id;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."monthly_invoice_bucket_month"("p_created_at" timestamp with time zone, "p_service_date" "text", "p_cutoff_hour" smallint DEFAULT 18) RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    AS $$
declare
  v_service date;
  v_jhb timestamptz;
  v_last_day date;
begin
  if p_created_at is null then
    return null;
  end if;
  if p_service_date is null or btrim(p_service_date) = '' then
    return null;
  end if;
  begin
    v_service := p_service_date::date;
  exception when others then
    return null;
  end;

  v_jhb := p_created_at at time zone 'Africa/Johannesburg';
  v_last_day := (date_trunc('month', v_service::timestamp)::date + interval '1 month - 1 day')::date;

  if v_service = v_last_day
     and (v_jhb::date) = v_service
     and extract(hour from v_jhb)::int >= coalesce(p_cutoff_hour, 18)
  then
    return to_char(v_service + interval '1 month', 'YYYY-MM');
  end if;

  return to_char(v_service, 'YYYY-MM');
end;
$$;


COMMENT ON FUNCTION "public"."monthly_invoice_bucket_month"("p_created_at" timestamp with time zone, "p_service_date" "text", "p_cutoff_hour" smallint) IS 'YYYY-MM bucket for monthly invoice rows. Last service day + same-day JHB creation after cutoff_hour rolls forward one month.';



CREATE OR REPLACE FUNCTION "public"."monthly_invoice_due_date"("p_month" "text") RETURNS "date"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select (date_trunc('month', (p_month || '-01')::date) + interval '1 month' - interval '1 day')::date;
$$;


COMMENT ON FUNCTION "public"."monthly_invoice_due_date"("p_month" "text") IS 'Provisional due_date for draft monthly_invoices.month (YYYY-MM): last day of billing month; replaced at finalize.';



CREATE OR REPLACE FUNCTION "public"."monthly_invoice_hard_close"("p_invoice_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_prev boolean;
  v_n integer;
begin
  select is_closed into v_prev from public.monthly_invoices where id = p_invoice_id;
  if not found or coalesce(v_prev, false) then
    return;
  end if;

  update public.monthly_invoices
  set
    is_closed = true,
    updated_at = now()
  where id = p_invoice_id
    and status in ('draft', 'sent', 'partially_paid', 'overdue', 'paid');

  get diagnostics v_n = row_count;
  if v_n = 1 then
    perform public.monthly_invoice_append_snapshot_event(
      p_invoice_id,
      jsonb_build_object(
        'kind', 'invoice_closed',
        'at', now(),
        'via', 'manual'
      )
    );
  end if;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."monthly_invoice_last_event_times"("p_invoice_ids" "uuid"[]) RETURNS TABLE("invoice_id" "uuid", "last_event_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select e.invoice_id, max(e.created_at) as last_event_at
  from public.monthly_invoice_events e
  where e.invoice_id = any(p_invoice_ids)
    and coalesce(e.payload ->> 'kind', '') in (
      'payment_received',
      'payment_applied',
      'adjustment_applied',
      'adjustment_post_send',
      'admin_mark_paid',
      'invoice_finalized',
      'finalize',
      'invoice_closed',
      'invoice_resent',
      'invoice_reminder_sent'
    )
  group by e.invoice_id;
$$;


COMMENT ON FUNCTION "public"."monthly_invoice_last_event_times"("p_invoice_ids" "uuid"[]) IS 'Latest monthly_invoice_events.created_at per invoice for admin list “last activity”: payments, adjustments, finalize/close, manual mark paid, invoice resend/reminder — not reads or non-financial snapshot churn.';



CREATE OR REPLACE FUNCTION "public"."monthly_invoices_after_status_paid_append_closed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.status = 'paid' and coalesce(old.status, '') is distinct from 'paid' then
    perform public.monthly_invoice_append_snapshot_event(
      new.id,
      jsonb_build_object(
        'kind', 'invoice_closed',
        'at', now(),
        'via', 'paid'
      )
    );
  end if;
  return new;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."monthly_invoices_append_invoice_closed_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_via text;
begin
  if coalesce(old.is_closed, false) = true or coalesce(new.is_closed, false) = false then
    return new;
  end if;

  if new.status = 'paid' and coalesce(old.status, '') is distinct from 'paid' then
    v_via := 'paid';
  else
    v_via := 'manual';
  end if;

  perform public.monthly_invoice_append_snapshot_event(
    new.id,
    jsonb_build_object(
      'kind', 'invoice_closed',
      'at', now(),
      'via', v_via
    )
  );

  return new;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."monthly_invoices_before_write_auto_close"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.status = 'paid' and coalesce(old.status, '') is distinct from 'paid' then
    new.is_closed := true;
  end if;
  return new;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."monthly_invoices_stamp_adjustments_applied_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.status in ('sent', 'paid') and coalesce(old.status, '') = 'draft' then
    update public.invoice_adjustments
    set
      applied_to_invoice_id = new.id,
      applied_at = coalesce(applied_at, now())
    where customer_id = new.customer_id
      and month_applied = new.month
      and applied_to_invoice_id is null;
  end if;
  return new;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."monthly_invoices_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."notification_system_logs_daily"("p_days" integer DEFAULT 7) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object('day', day, 'source', source, 'cnt', cnt)
        order by day asc, source asc
      )
      from (
        select
          (created_at at time zone 'utc')::date::text as day,
          source,
          count(*)::bigint as cnt
        from public.system_logs
        where created_at >= now() - (greatest(1, least(coalesce(p_days, 7), 90))::text || ' days')::interval
          and source in (
            'cleaner_whatsapp_sent',
            'cleaner_whatsapp_failed',
            'cleaner_sms_fallback_used',
            'sms_fallback_sent',
            'email_sent',
            'email_failed',
            'slow_notification',
            'reminder_2h_sent',
            'assigned_sent',
            'completed_sent',
            'sla_breach_sent'
          )
        group by 1, 2
      ) s
    ),
    '[]'::jsonb
  );
$$;


COMMENT ON FUNCTION "public"."notification_system_logs_daily"("p_days" integer) IS 'UTC date + source + count for notification monitoring time-series.';



CREATE OR REPLACE FUNCTION "public"."notification_system_logs_summary"("p_days" integer DEFAULT 7) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    jsonb_object_agg(source, to_jsonb(cnt)),
    '{}'::jsonb
  )
  from (
    select source, count(*)::bigint as cnt
    from public.system_logs
    where created_at >= now() - (greatest(1, least(coalesce(p_days, 7), 90))::text || ' days')::interval
      and source in (
        'cleaner_whatsapp_sent',
        'cleaner_whatsapp_failed',
        'cleaner_sms_fallback_used',
        'sms_fallback_sent',
        'sms_fallback_disabled',
        'missing_customer_email',
        'reminder_2h_sent',
        'assigned_sent',
        'completed_sent',
        'sla_breach_sent'
      )
    group by source
  ) s;
$$;


COMMENT ON FUNCTION "public"."notification_system_logs_summary"("p_days" integer) IS 'Counts by source for the last p_days (1–90, default 7) for notification pipeline observability.';



CREATE OR REPLACE FUNCTION "public"."payout_period_is_canonical_jhb_month"("p_start" "date", "p_end" "date") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select p_start = date_trunc('month', p_start)::date
     and p_end = (date_trunc('month', p_start) + interval '1 month' - interval '1 day')::date;
$$;


COMMENT ON FUNCTION "public"."payout_period_is_canonical_jhb_month"("p_start" "date", "p_end" "date") IS 'True when period_start/period_end span a full calendar month (Johannesburg YMD dates).';



CREATE OR REPLACE FUNCTION "public"."populate_daily_analytics_rollups"("p_day" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_quote_views int;
  v_payment_reached int;
  v_distinct_sessions int;
  v_pay_open int;
  v_book_done int;
  v_bc_direct int;
  v_starts int;
  v_completed int;
  v_pay_init int;
  v_pay_done int;
  v_abandon numeric;
begin
  select quote_views, payment_step_reached, distinct_sessions
    into v_quote_views, v_payment_reached, v_distinct_sessions
  from public.mv_booking_funnel_daily
  where day = p_day;

  select paystack_opened, booking_completed_events
    into v_pay_open, v_book_done
  from public.mv_payment_conversion_daily
  where day = p_day;

  select count(*)::int
    into v_bc_direct
  from public.user_events
  where (created_at at time zone 'UTC')::date = p_day
    and event_type = 'booking_completed';

  insert into public.daily_booking_funnel_metrics (
    day,
    quote_starts,
    payment_reached,
    booking_completed_signals,
    paystack_opened,
    paystack_completed,
    unique_sessions,
    updated_at
  )
  values (
    p_day,
    coalesce(v_quote_views, 0),
    coalesce(v_payment_reached, 0),
    coalesce(v_bc_direct, 0),
    coalesce(v_pay_open, 0),
    coalesce(v_book_done, 0),
    coalesce(v_distinct_sessions, 0),
    now()
  )
  on conflict (day) do update set
    quote_starts = excluded.quote_starts,
    payment_reached = excluded.payment_reached,
    booking_completed_signals = excluded.booking_completed_signals,
    paystack_opened = excluded.paystack_opened,
    paystack_completed = excluded.paystack_completed,
    unique_sessions = excluded.unique_sessions,
    updated_at = excluded.updated_at;

  select count(*)::int into v_starts
  from public.user_events
  where (created_at at time zone 'UTC')::date = p_day and event_type = 'booking_started';

  select count(*)::int into v_completed
  from public.user_events
  where (created_at at time zone 'UTC')::date = p_day and event_type = 'booking_completed';

  select count(*)::int into v_pay_init
  from public.user_events
  where (created_at at time zone 'UTC')::date = p_day and event_type = 'payment_initiated';

  select count(*)::int into v_pay_done
  from public.user_events
  where (created_at at time zone 'UTC')::date = p_day and event_type = 'payment_completed';

  insert into public.daily_conversion_metrics (
    day,
    booking_started,
    booking_completed,
    payment_initiated,
    payment_completed,
    updated_at
  )
  values (
    p_day,
    coalesce(v_starts, 0),
    coalesce(v_completed, 0),
    coalesce(v_pay_init, 0),
    coalesce(v_pay_done, 0),
    now()
  )
  on conflict (day) do update set
    booking_started = excluded.booking_started,
    booking_completed = excluded.booking_completed,
    payment_initiated = excluded.payment_initiated,
    payment_completed = excluded.payment_completed,
    updated_at = excluded.updated_at;

  v_abandon :=
    case
      when coalesce(v_pay_open, 0) > 0 then
        round(((v_pay_open - coalesce(v_book_done, 0))::numeric / v_pay_open::numeric) * 100, 2)
      else null
    end;

  insert into public.daily_payment_metrics (
    day,
    paystack_opened,
    payment_failed_signals,
    abandonment_pct,
    updated_at
  )
  values (
    p_day,
    coalesce(v_pay_open, 0),
    0,
    v_abandon,
    now()
  )
  on conflict (day) do update set
    paystack_opened = excluded.paystack_opened,
    payment_failed_signals = excluded.payment_failed_signals,
    abandonment_pct = excluded.abandonment_pct,
    updated_at = excluded.updated_at;
end;
$$;


COMMENT ON FUNCTION "public"."populate_daily_analytics_rollups"("p_day" "date") IS 'Upserts daily_* rollup rows for one UTC calendar day (run after MV refresh).';



CREATE OR REPLACE FUNCTION "public"."prune_cleaner_job_lifecycle_idempotency"() RETURNS bigint
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with d as (
    delete from public.cleaner_job_lifecycle_idempotency
    where created_at < now() - interval '48 hours'
    returning 1
  )
  select coalesce(count(*)::bigint, 0) from d;
$$;


COMMENT ON FUNCTION "public"."prune_cleaner_job_lifecycle_idempotency"() IS 'Deletes idempotency claim rows older than 48h. Safe after actions are durable on bookings.';



CREATE OR REPLACE FUNCTION "public"."prune_dispatch_offer_exposure_dedupe"("p_retention_days" integer DEFAULT 30) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_days int := greatest(coalesce(p_retention_days, 30), 7);
  v_deleted bigint;
begin
  -- Range on inserted_at uses dispatch_offer_exposure_dedupe_inserted_at_idx (btree on inserted_at).
  with d as (
    delete from public.dispatch_offer_exposure_dedupe
    where inserted_at < (now() - make_interval(days => v_days))
    returning 1
  )
  select count(*)::bigint into v_deleted from d;

  insert into public.system_logs (level, source, message, context)
  values (
    'info',
    'prune_dispatch_offer_exposure_dedupe',
    format('Pruned %s dispatch_offer_exposure_dedupe row(s)', coalesce(v_deleted, 0)),
    jsonb_build_object(
      'deleted', coalesce(v_deleted, 0),
      'retention_days', v_days
    )
  );

  return coalesce(v_deleted, 0);
end;
$$;


COMMENT ON FUNCTION "public"."prune_dispatch_offer_exposure_dedupe"("p_retention_days" integer) IS 'Deletes exposure dedupe rows older than p_retention_days (default 30, min 7). Cron uses 30; call with 60/90 during long A/B windows. Logs deleted count to system_logs.';



CREATE OR REPLACE FUNCTION "public"."prune_short_lived_notification_idempotency_claims"() RETURNS bigint
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with d as (
    delete from public.notification_idempotency_claims
    where created_at < now() - interval '48 hours'
      and (
        event_type in ('dispatch_offer_tracked_link_open', 'cleaner_job_magic_session')
        or reference like 'sms_offer_click:%'
        or reference like 'job_magic_jti:%'
      )
    returning 1
  )
  select coalesce(count(*)::bigint, 0) from d;
$$;


COMMENT ON FUNCTION "public"."prune_short_lived_notification_idempotency_claims"() IS 'Deletes short-lived notification idempotency rows (tracked offer clicks, magic session jti) older than 48h.';



CREATE OR REPLACE FUNCTION "public"."prune_system_logs"("p_retention_days" integer DEFAULT 30) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  n bigint;
  days int := greatest(1, least(coalesce(p_retention_days, 30), 365));
begin
  with d as (
    delete from public.system_logs
    where created_at < now() - (days::text || ' days')::interval
    returning 1
  )
  select count(*) into n from d;
  return coalesce(n, 0);
end;
$$;


COMMENT ON FUNCTION "public"."prune_system_logs"("p_retention_days" integer) IS 'Deletes system_logs older than retention (1–365 days, default 30). Returns row count removed.';



CREATE OR REPLACE FUNCTION "public"."public_marketing_reviews_for_area"("p_area" "text", "p_limit" integer DEFAULT 4) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with params as (
    select nullif(
      regexp_replace(lower(trim(coalesce(p_area, ''))), '[%_]', '', 'g'),
      ''
    ) as q
  ),
  lim as (
    select greatest(1, least(coalesce(nullif(p_limit, 0), 4), 8))::int as n
  ),
  matched as (
    select
      r.id as review_id,
      r.rating::int as rating,
      left(
        trim(regexp_replace(coalesce(r.comment, ''), E'\\s+', ' ', 'g')),
        220
      ) as comment_excerpt,
      case
        when strpos(coalesce(b.location, ''), ',') > 0 then
          trim(substring(b.location from strpos(b.location, ',') + 1))
        else nullif(trim(coalesce(b.location, '')), '')
      end as suburb_raw,
      case
        when nullif(trim(b.customer_name), '') is not null then split_part(trim(b.customer_name), ' ', 1)
        else 'Customer'
      end as reviewer_first,
      r.created_at
    from public.reviews r
    inner join public.bookings b on b.id = r.booking_id
    cross join params p
    cross join lim l
    where coalesce(r.is_hidden, false) = false
      and r.rating >= 4
      and length(trim(coalesce(r.comment, ''))) >= 20
      and p.q is not null
      and lower(coalesce(b.location, '')) like '%' || p.q || '%'
    order by r.created_at desc
    limit (select n from lim)
  )
  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', review_id,
          'rating', rating,
          'comment_excerpt', comment_excerpt,
          'suburb_label', coalesce(suburb_raw, ''),
          'reviewer_label', reviewer_first
        )
        order by created_at desc
      )
      from matched
    ),
    '[]'::jsonb
  );
$$;


COMMENT ON FUNCTION "public"."public_marketing_reviews_for_area"("p_area" "text", "p_limit" integer) IS 'Marketing location hubs: recent non-hidden reviews with comments whose booking address contains the area phrase (case-insensitive).';



CREATE OR REPLACE FUNCTION "public"."public_review_banner_stats"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'avg_rating',
      case
        when count(*) = 0 then null
        else round(avg(rating::numeric), 1)
      end,
    'review_count',
    count(*)::bigint
  )
  from public.reviews
  where coalesce(is_hidden, false) = false;
$$;


COMMENT ON FUNCTION "public"."public_review_banner_stats"() IS 'Marketing homepage: avg rating and count of non-hidden reviews.';



CREATE OR REPLACE FUNCTION "public"."purge_stale_pending_payment_bookings"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_deleted bigint;
begin
  delete from public.bookings
  where status = 'pending_payment'
    and created_at < now() - interval '2 hours';

  get diagnostics v_deleted = row_count;

  raise log 'purge_stale_pending_payment_bookings: purged % pending_payment rows',
    v_deleted;

  insert into public.dispatch_logs (source, level, message, context)
  values (
    'purge_stale_pending_payment_bookings',
    'info',
    'purged stale pending_payment bookings',
    jsonb_build_object('deleted', v_deleted)
  );

  return jsonb_build_object(
    'ok', true,
    'deleted', v_deleted,
    'ran_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
exception
  when others then
    insert into public.dispatch_logs (source, level, message, context)
    values (
      'purge_stale_pending_payment_bookings',
      'error',
      sqlerrm,
      jsonb_build_object('sqlstate', sqlstate)
    );
    return jsonb_build_object('ok', false, 'error', sqlerrm, 'sqlstate', sqlstate);
end;
$$;


COMMENT ON FUNCTION "public"."purge_stale_pending_payment_bookings"() IS 'Deletes bookings stuck in pending_payment older than 2h (abandoned checkout). Run hourly via pg_cron.';



CREATE OR REPLACE FUNCTION "public"."recalculate_user_tier"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.user_profiles
  set
    tier = case
      when booking_count >= 10 or total_spent_cents >= 800000 then 'platinum'
      when booking_count >= 5 or total_spent_cents >= 300000 then 'gold'
      when booking_count >= 2 or total_spent_cents >= 100000 then 'silver'
      else 'regular'
    end,
    updated_at = now()
  where id = p_user_id;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."recompute_monthly_invoice_totals"("p_invoice_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_status text;
  v_customer uuid;
  v_month text;
  v_cnt integer;
  v_sum bigint;
  v_adj bigint;
  v_total bigint;
  v_due date;
begin
  select status, customer_id, month
  into v_status, v_customer, v_month
  from public.monthly_invoices
  where id = p_invoice_id;

  if v_status is null or v_status is distinct from 'draft' then
    return;
  end if;

  select
    count(*)::int,
    coalesce(sum(public.booking_line_amount_cents(b.total_paid_zar, b.amount_paid_cents)), 0)::bigint
  into v_cnt, v_sum
  from public.bookings b
  where b.monthly_invoice_id = p_invoice_id
    and coalesce(b.status, '') is distinct from 'cancelled';

  select coalesce(sum(ia.amount_cents), 0)::bigint
  into v_adj
  from public.invoice_adjustments ia
  where ia.customer_id = v_customer
    and ia.month_applied = v_month
    and (ia.applied_to_invoice_id is null or ia.applied_to_invoice_id = p_invoice_id);

  v_total := greatest(0::bigint, v_sum + v_adj);
  v_due := public.draft_monthly_invoice_due_date(p_invoice_id, v_month);

  update public.monthly_invoices
  set
    total_bookings = v_cnt,
    total_amount_cents = v_total,
    due_date = v_due,
    updated_at = now()
  where id = p_invoice_id and status = 'draft';
end;
$$;


COMMENT ON FUNCTION "public"."recompute_monthly_invoice_totals"("p_invoice_id" "uuid") IS 'Draft invoice totals: non-cancelled bookings + adjustments for the billing month (unapplied or applied to this invoice).';



CREATE OR REPLACE FUNCTION "public"."record_monthly_invoice_view"("invoice_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.monthly_invoices
  set
    view_count = view_count + 1,
    last_viewed_at = now(),
    first_viewed_at = coalesce(first_viewed_at, now())
  where id = invoice_id;
$$;


CREATE OR REPLACE FUNCTION "public"."record_sales_document_view"("doc_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.sales_documents
  set
    view_count = view_count + 1,
    last_viewed_at = now(),
    first_viewed_at = coalesce(first_viewed_at, now())
  where id = doc_id;
$$;


CREATE OR REPLACE FUNCTION "public"."recurring_bookings_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."referral_discount_redemptions_enforce_limits"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  cap int;
  exp_at timestamptz;
  cnt int;
begin
  select p.referral_code_max_uses, p.referral_code_expires_at
  into cap, exp_at
  from public.user_profiles p
  where p.referral_code = new.referral_code
  limit 1;

  if found then
    if exp_at is not null and exp_at < now() then
      raise exception 'referral_code_expired' using errcode = '23514';
    end if;
    if cap is not null and cap > 0 then
      select count(*)::int into cnt
      from public.referral_discount_redemptions
      where referral_code = new.referral_code;
      if cnt >= cap then
        raise exception 'referral_code_max_uses_reached' using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  select c.referral_code_max_uses, c.referral_code_expires_at
  into cap, exp_at
  from public.cleaners c
  where c.referral_code = new.referral_code
  limit 1;

  if found then
    if exp_at is not null and exp_at < now() then
      raise exception 'referral_code_expired' using errcode = '23514';
    end if;
    if cap is not null and cap > 0 then
      select count(*)::int into cnt
      from public.referral_discount_redemptions
      where referral_code = new.referral_code;
      if cnt >= cap then
        raise exception 'referral_code_max_uses_reached' using errcode = '23514';
      end if;
    end if;
  end if;

  return new;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."refresh_analytics_materialized_views"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  refresh materialized view public.mv_booking_funnel_daily;
  refresh materialized view public.mv_payment_conversion_daily;
end;
$$;


COMMENT ON FUNCTION "public"."refresh_analytics_materialized_views"() IS 'Non-concurrent MV refresh (transaction-safe). Schedule nightly after traffic dip.';



CREATE OR REPLACE FUNCTION "public"."refresh_cleaner_rating"("p_cleaner_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  avg_r double precision;
  cnt int;
begin
  select coalesce(avg(rating::double precision), 5), count(*)::int
    into avg_r, cnt
  from public.reviews
  where cleaner_id = p_cleaner_id
    and coalesce(is_hidden, false) = false;

  update public.cleaners
  set
    rating = round(avg_r::numeric, 2)::real,
    review_count = cnt
  where id = p_cleaner_id;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."refresh_dispatch_experiment_snapshots"("p_week_start" "date" DEFAULT NULL::"date") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_week date;
  v_start timestamptz;
  v_end timestamptz;
  n int;
begin
  v_week := coalesce(
    p_week_start,
    ((date_trunc('week', timezone('utc', now())))::date - 7)
  );
  v_start := v_week::timestamp AT TIME ZONE 'UTC';
  v_end := (v_week + 7)::timestamp AT TIME ZONE 'UTC';

  insert into public.dispatch_experiment_snapshots (
    week_start,
    ux_variant,
    p95_time_to_accept_ms,
    accept_rate,
    offers_per_booking,
    resolved_offers
  )
  with b as (
    select o.*
    from public.dispatch_offers o
    where o.created_at >= v_start
      and o.created_at < v_end
      and o.ux_variant in ('control', 'sound_on', 'high_urgency', 'cta_v2')
  ),
  vars as (
    select unnest(array['control', 'sound_on', 'high_urgency', 'cta_v2']::text[]) as ux_variant
  ),
  agg as (
    select
      ux_variant,
      count(*) filter (where status in ('accepted', 'rejected', 'expired'))::bigint as resolved_n,
      count(*) filter (where status = 'accepted')::bigint as accepted_n,
      count(*)::double precision
        / nullif(count(distinct booking_id) filter (where booking_id is not null), 0)::double precision as opb_all
    from b
    group by ux_variant
  ),
  lat as (
    select
      ux_variant,
      percentile_disc(0.95) within group (
        order by extract(epoch from (responded_at - created_at)) * 1000.0
      ) as p95_ms
    from b
    where status = 'accepted'
      and responded_at is not null
      and created_at is not null
    group by ux_variant
  )
  select
    v_week,
    v.ux_variant,
    lat.p95_ms,
    case
      when coalesce(agg.resolved_n, 0) > 0 then agg.accepted_n::double precision / agg.resolved_n::double precision
    end as accept_rate,
    agg.opb_all,
    coalesce(agg.resolved_n, 0)::integer
  from vars v
  left join agg on agg.ux_variant = v.ux_variant
  left join lat on lat.ux_variant = v.ux_variant
  on conflict (week_start, ux_variant) do update set
    p95_time_to_accept_ms = excluded.p95_time_to_accept_ms,
    accept_rate = excluded.accept_rate,
    offers_per_booking = excluded.offers_per_booking,
    resolved_offers = excluded.resolved_offers;

  get diagnostics n = row_count;
  return n;
end;
$$;


COMMENT ON FUNCTION "public"."refresh_dispatch_experiment_snapshots"("p_week_start" "date") IS 'Upserts one row per ux_variant for the calendar week [p_week_start, p_week_start+7) UTC. Default p_week_start: previous ISO week Monday.';



CREATE OR REPLACE FUNCTION "public"."release_cron_lock"("p_job_name" "text", "p_holder_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_deleted int;
begin
  if p_job_name is null or btrim(p_job_name) = '' or p_holder_id is null then
    return false;
  end if;

  delete from public.cron_run_leases
  where job_name = p_job_name
    and holder_id = p_holder_id;

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;


COMMENT ON FUNCTION "public"."release_cron_lock"("p_job_name" "text", "p_holder_id" "uuid") IS 'H-15: owner-checked cron lease release. Returns true iff a row matching (job_name, holder_id) was deleted.';



CREATE OR REPLACE FUNCTION "public"."release_team_capacity_slot"("p_team_id" "uuid", "p_booking_date" "date") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  did_release boolean := false;
begin
  update public.team_daily_capacity_usage
     set used_slots = greatest(0, used_slots - 1),
         updated_at = now()
   where team_id = p_team_id
     and booking_date = p_booking_date
     and used_slots > 0;

  get diagnostics did_release = row_count;
  return did_release;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."repair_empty_team_booking_rosters"("p_batch" integer DEFAULT 40) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  r record;
  n int := 0;
  v_lim int := greatest(1, least(coalesce(p_batch, 40), 200));
begin
  for r in
    select b.id
      from public.bookings b
     where b.team_id is not null
       and coalesce(b.is_team_job, false) = true
       and b.cleaner_line_earnings_finalized_at is null
       and not exists (select 1 from public.booking_cleaners bc where bc.booking_id = b.id)
     limit v_lim
  loop
    perform public.sync_booking_cleaners_for_team_booking(r.id, 'cron_repair');
    n := n + 1;
  end loop;
  return n;
end;
$$;


COMMENT ON FUNCTION "public"."repair_empty_team_booking_rosters"("p_batch" integer) IS 'Rebuilds booking_cleaners for team jobs missing roster rows (pre-finalize). Returns count repaired.';



CREATE OR REPLACE FUNCTION "public"."replace_booking_cleaners_admin_atomic"("p_booking_id" "uuid", "p_rows" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  n_total int;
  n_lead int;
  n_distinct int;
  lead_id uuid;
  elem jsonb;
  v_fin timestamptz;
begin
  if p_booking_id is null then
    raise exception 'replace_booking_cleaners_admin_atomic: p_booking_id required';
  end if;

  select b.cleaner_line_earnings_finalized_at into v_fin
    from public.bookings b
   where b.id = p_booking_id;
  if not found then
    raise exception 'replace_booking_cleaners_admin_atomic: booking not found';
  end if;
  if v_fin is not null then
    raise exception 'replace_booking_cleaners_admin_atomic: roster locked (cleaner_line_earnings_finalized_at is set)';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1 then
    raise exception 'replace_booking_cleaners_admin_atomic: members must be a non-empty array';
  end if;

  select count(*) from jsonb_array_elements(p_rows) e into n_total;

  select count(*) from jsonb_array_elements(p_rows) e
   where lower(trim(coalesce(e->>'role', ''))) = 'lead' into n_lead;
  if n_lead <> 1 then
    raise exception 'replace_booking_cleaners_admin_atomic: exactly one lead required (got %)', n_lead;
  end if;

  select count(distinct trim(coalesce(e->>'cleaner_id', '')))
    from jsonb_array_elements(p_rows) e into n_distinct;
  if n_distinct <> n_total then
    raise exception 'replace_booking_cleaners_admin_atomic: duplicate cleaner_id';
  end if;

  for elem in select * from jsonb_array_elements(p_rows)
  loop
    if trim(coalesce(elem->>'cleaner_id', '')) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'replace_booking_cleaners_admin_atomic: invalid cleaner_id';
    end if;
    if lower(trim(coalesce(elem->>'role', ''))) not in ('lead', 'member') then
      raise exception 'replace_booking_cleaners_admin_atomic: invalid role %', elem->>'role';
    end if;
  end loop;

  delete from public.booking_cleaners where booking_id = p_booking_id;

  insert into public.booking_cleaners (
    booking_id,
    cleaner_id,
    role,
    payout_weight,
    lead_bonus_cents,
    source
  )
  select
    p_booking_id,
    trim(e->>'cleaner_id')::uuid,
    lower(trim(e->>'role')),
    case
      when (e->>'payout_weight') is null or trim(e->>'payout_weight') = '' then 1::numeric
      else (e->>'payout_weight')::numeric
    end,
    case
      when (e->>'lead_bonus_cents') is null or trim(e->>'lead_bonus_cents') = '' then 0
      else (e->>'lead_bonus_cents')::integer
    end,
    coalesce(nullif(trim(e->>'source'), ''), 'admin')
  from jsonb_array_elements(p_rows) e;

  select bc.cleaner_id into lead_id
    from public.booking_cleaners bc
   where bc.booking_id = p_booking_id
     and bc.role = 'lead'
   limit 1;

  if lead_id is null then
    raise exception 'replace_booking_cleaners_admin_atomic: lead row missing after insert';
  end if;

  update public.bookings b
     set payout_owner_cleaner_id = lead_id
   where b.id = p_booking_id;
end;
$_$;


COMMENT ON FUNCTION "public"."replace_booking_cleaners_admin_atomic"("p_booking_id" "uuid", "p_rows" "jsonb") IS 'Replaces booking_cleaners for a booking and sets bookings.payout_owner_cleaner_id to the lead.';



CREATE OR REPLACE FUNCTION "public"."replace_booking_line_items_atomic"("p_booking_id" "uuid", "p_rows" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_count integer := 0;
  v_expect integer := 0;
begin
  if p_booking_id is null then
    raise exception 'replace_booking_line_items_atomic: p_booking_id required';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1 then
    raise exception 'replace_booking_line_items_atomic: at least one line item row is required';
  end if;

  v_expect := jsonb_array_length(p_rows);

  delete from public.booking_line_items where booking_id = p_booking_id;

  insert into public.booking_line_items (
    booking_id,
    item_type,
    slug,
    name,
    quantity,
    unit_price_cents,
    total_price_cents,
    pricing_source,
    metadata,
    earns_cleaner,
    cleaner_earnings_cents
  )
  select
    p_booking_id,
    r->>'item_type',
    nullif(trim(r->>'slug'), ''),
    coalesce(r->>'name', ''),
    greatest(1, coalesce((r->>'quantity')::integer, 1)),
    (r->>'unit_price_cents')::integer,
    (r->>'total_price_cents')::integer,
    nullif(trim(r->>'pricing_source'), ''),
    case
      when jsonb_typeof(r->'metadata') = 'object' then r->'metadata'
      else '{}'::jsonb
    end,
    coalesce((r->>'earns_cleaner')::boolean, (r->>'item_type')::text is distinct from 'adjustment'),
    case
      when r ? 'cleaner_earnings_cents' and r->>'cleaner_earnings_cents' is not null and trim(r->>'cleaner_earnings_cents') <> ''
        then (r->>'cleaner_earnings_cents')::integer
      else null
    end
  from jsonb_array_elements(p_rows) as r;

  get diagnostics v_count = row_count;

  if v_count <> v_expect then
    raise exception 'replace_booking_line_items_atomic: expected % line rows, inserted %', v_expect, v_count;
  end if;

  select count(*)::integer into v_count from public.booking_line_items where booking_id = p_booking_id;

  if v_count < 1 then
    raise exception 'replace_booking_line_items_atomic: booking has no line items after insert';
  end if;

  return v_count;
end;
$$;


COMMENT ON FUNCTION "public"."replace_booking_line_items_atomic"("p_booking_id" "uuid", "p_rows" "jsonb") IS 'Deletes all booking_line_items for a booking and inserts the provided rows in one transaction.';



CREATE OR REPLACE FUNCTION "public"."resolve_admin_monthly_booking_race"("p_our_id" "uuid", "p_user_id" "uuid", "p_date" "text", "p_time" "text", "p_service_slug" "text", "p_force" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_slug text := lower(trim(p_service_slug));
  v_t0 timestamptz;
  v_t1 timestamptz;
  v_winner uuid;
  v_winner_created timestamptz;
  v_deleted uuid[] := '{}';
  r_id uuid;
  v_json_deleted jsonb;
  v_active_count int;
  v_our_exists boolean;
  v_cluster_size int;
begin
  if p_force then
    return jsonb_build_object(
      'action', 'proceed',
      'ok', true,
      'winner_id', null,
      'deleted_ids', '[]'::jsonb,
      'cluster_start', null,
      'cluster_end', null,
      'cluster_size', null,
      'winner_created_at', null,
      'left_duplicate', false,
      'rolled_back_self', false
    );
  end if;

  perform 1
  from public.bookings b
  where public.booking_matches_active_admin_slot(b, p_user_id, p_date, p_time, v_slug)
  for update;

  select exists(select 1 from public.bookings b where b.id = p_our_id) into v_our_exists;

  select count(*)::int into v_active_count
  from public.bookings b
  where public.booking_matches_active_admin_slot(b, p_user_id, p_date, p_time, v_slug);

  if v_active_count = 0 then
    return jsonb_build_object(
      'action', 'proceed',
      'ok', true,
      'winner_id', null,
      'deleted_ids', '[]'::jsonb,
      'cluster_start', null,
      'cluster_end', null,
      'cluster_size', 0,
      'winner_created_at', null,
      'left_duplicate', false,
      'rolled_back_self', false
    );
  end if;

  if not v_our_exists then
    select min(b.created_at) into v_t0
    from public.bookings b
    where public.booking_matches_active_admin_slot(b, p_user_id, p_date, p_time, v_slug);

    if v_t0 is null then
      return jsonb_build_object(
        'action', 'reject',
        'ok', false,
        'winner_id', null,
        'deleted_ids', '[]'::jsonb,
        'cluster_start', null,
        'cluster_end', null,
        'cluster_size', v_active_count,
        'winner_created_at', null,
        'left_duplicate', false,
        'rolled_back_self', true
      );
    end if;

    v_t1 := v_t0 + interval '2 seconds';

    select count(*)::int into v_cluster_size
    from public.bookings b
    where public.booking_matches_active_admin_slot(b, p_user_id, p_date, p_time, v_slug)
      and b.created_at >= v_t0
      and b.created_at <= v_t1;

    select b.id, b.created_at into v_winner, v_winner_created
    from public.bookings b
    where public.booking_matches_active_admin_slot(b, p_user_id, p_date, p_time, v_slug)
      and b.created_at >= v_t0
      and b.created_at <= v_t1
      and b.monthly_invoice_id is not null
      and exists (
        select 1 from public.monthly_invoices mi
        where mi.id = b.monthly_invoice_id and lower(mi.status) is distinct from 'draft'
      )
    order by b.created_at asc, b.id asc
    limit 1;

    if v_winner is null then
      select b.id, b.created_at into v_winner, v_winner_created
      from public.bookings b
      where public.booking_matches_active_admin_slot(b, p_user_id, p_date, p_time, v_slug)
        and b.created_at >= v_t0
        and b.created_at <= v_t1
      order by b.created_at asc, b.id asc
      limit 1;
    end if;

    return jsonb_build_object(
      'action', 'reject',
      'ok', false,
      'winner_id', v_winner,
      'deleted_ids', '[]'::jsonb,
      'cluster_start', v_t0,
      'cluster_end', v_t1,
      'cluster_size', v_cluster_size,
      'winner_created_at', v_winner_created,
      'left_duplicate', false,
      'rolled_back_self', true
    );
  end if;

  if v_active_count = 1 then
    select b.id, b.created_at into v_winner, v_winner_created
    from public.bookings b
    where public.booking_matches_active_admin_slot(b, p_user_id, p_date, p_time, v_slug)
    order by b.created_at asc, b.id asc
    limit 1;

    v_t0 := v_winner_created;
    v_t1 := coalesce(v_winner_created, now()) + interval '2 seconds';

    return jsonb_build_object(
      'action', 'proceed',
      'ok', true,
      'winner_id', v_winner,
      'deleted_ids', '[]'::jsonb,
      'cluster_start', v_t0,
      'cluster_end', v_t1,
      'cluster_size', 1,
      'winner_created_at', v_winner_created,
      'left_duplicate', false,
      'rolled_back_self', false
    );
  end if;

  select min(b.created_at) into v_t0
  from public.bookings b
  where public.booking_matches_active_admin_slot(b, p_user_id, p_date, p_time, v_slug);

  if v_t0 is null then
    return jsonb_build_object(
      'action', 'proceed',
      'ok', true,
      'winner_id', null,
      'deleted_ids', '[]'::jsonb,
      'cluster_start', null,
      'cluster_end', null,
      'cluster_size', 0,
      'winner_created_at', null,
      'left_duplicate', false,
      'rolled_back_self', false
    );
  end if;

  v_t1 := v_t0 + interval '2 seconds';

  select count(*)::int into v_cluster_size
  from public.bookings b
  where public.booking_matches_active_admin_slot(b, p_user_id, p_date, p_time, v_slug)
    and b.created_at >= v_t0
    and b.created_at <= v_t1;

  select b.id, b.created_at into v_winner, v_winner_created
  from public.bookings b
  where public.booking_matches_active_admin_slot(b, p_user_id, p_date, p_time, v_slug)
    and b.created_at >= v_t0
    and b.created_at <= v_t1
    and b.monthly_invoice_id is not null
    and exists (
      select 1 from public.monthly_invoices mi
      where mi.id = b.monthly_invoice_id and lower(mi.status) is distinct from 'draft'
    )
  order by b.created_at asc, b.id asc
  limit 1;

  if v_winner is null then
    select b.id, b.created_at into v_winner, v_winner_created
    from public.bookings b
    where public.booking_matches_active_admin_slot(b, p_user_id, p_date, p_time, v_slug)
      and b.created_at >= v_t0
      and b.created_at <= v_t1
    order by b.created_at asc, b.id asc
    limit 1;
  end if;

  if v_winner is null then
    return jsonb_build_object(
      'action', 'proceed',
      'ok', true,
      'winner_id', null,
      'deleted_ids', '[]'::jsonb,
      'cluster_start', v_t0,
      'cluster_end', v_t1,
      'cluster_size', v_cluster_size,
      'winner_created_at', null,
      'left_duplicate', false,
      'rolled_back_self', false
    );
  end if;

  for r_id in
    select b.id
    from public.bookings b
    where public.booking_matches_active_admin_slot(b, p_user_id, p_date, p_time, v_slug)
      and b.created_at >= v_t0
      and b.created_at <= v_t1
      and b.id <> v_winner
    order by b.created_at asc, b.id asc
  loop
    if exists (
      select 1 from public.bookings b
      where b.id = r_id
        and (
          b.payment_status is null
          or b.payment_status in ('pending', 'pending_monthly')
        )
        and (
          b.monthly_invoice_id is null
          or exists (
            select 1 from public.monthly_invoices mi
            where mi.id = b.monthly_invoice_id and lower(mi.status) = 'draft'
          )
        )
    ) then
      delete from public.bookings where id = r_id;
      v_deleted := array_append(v_deleted, r_id);
    end if;
  end loop;

  select coalesce(jsonb_agg(x::text), '[]'::jsonb) into v_json_deleted from unnest(v_deleted) as x;

  if not exists (select 1 from public.bookings where id = p_our_id) then
    return jsonb_build_object(
      'action', 'reject',
      'ok', false,
      'winner_id', v_winner,
      'deleted_ids', v_json_deleted,
      'cluster_start', v_t0,
      'cluster_end', v_t1,
      'cluster_size', v_cluster_size,
      'winner_created_at', v_winner_created,
      'left_duplicate', false,
      'rolled_back_self', true
    );
  end if;

  if p_our_id is distinct from v_winner then
    return jsonb_build_object(
      'action', 'reject',
      'ok', false,
      'winner_id', v_winner,
      'deleted_ids', v_json_deleted,
      'cluster_start', v_t0,
      'cluster_end', v_t1,
      'cluster_size', v_cluster_size,
      'winner_created_at', v_winner_created,
      'left_duplicate', true,
      'rolled_back_self', false
    );
  end if;

  return jsonb_build_object(
    'action', 'proceed',
    'ok', true,
    'winner_id', v_winner,
    'deleted_ids', v_json_deleted,
    'cluster_start', v_t0,
    'cluster_end', v_t1,
    'cluster_size', v_cluster_size,
    'winner_created_at', v_winner_created,
    'left_duplicate', false,
    'rolled_back_self', false
  );
end;
$$;


COMMENT ON FUNCTION "public"."resolve_admin_monthly_booking_race"("p_our_id" "uuid", "p_user_id" "uuid", "p_date" "text", "p_time" "text", "p_service_slug" "text", "p_force" boolean) IS 'Uses booking_matches_active_admin_slot; winners ordered by created_at ASC, id ASC.';



CREATE OR REPLACE FUNCTION "public"."resolve_auth_user_id_by_email"("p_email" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select u.id
  from auth.users u
  where lower(trim(u.email::text)) = lower(trim(coalesce(p_email, '')))
  limit 1;
$$;


COMMENT ON FUNCTION "public"."resolve_auth_user_id_by_email"("p_email" "text") IS 'Maps a normalised customer email to auth.users.id. Used by admin customer/booking lookup, Paystack upsert RPC, and link_booking_to_user.';



CREATE OR REPLACE FUNCTION "public"."retry_unassigned_jobs"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_req_id bigint;
begin
  select
    net.http_post(
      url := 'https://YOUR_DOMAIN/api/cron/retry-failed-jobs',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_CRON_SECRET'
      ),
      body := '{}'::jsonb
    )
  into v_req_id;

  insert into public.dispatch_logs (source, level, message, context)
  values (
    'retry_unassigned_jobs',
    'info',
    'triggered http retry-failed-jobs',
    jsonb_build_object('pg_net_request_id', v_req_id)
  );

  return jsonb_build_object(
    'ok', true,
    'pg_net_request_id', v_req_id,
    'ran_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
exception
  when others then
    insert into public.dispatch_logs (source, level, message, context)
    values (
      'retry_unassigned_jobs',
      'error',
      sqlerrm,
      jsonb_build_object('sqlstate', sqlstate)
    );
    return jsonb_build_object('ok', false, 'error', sqlerrm, 'sqlstate', sqlstate);
end;
$$;


COMMENT ON FUNCTION "public"."retry_unassigned_jobs"() IS 'Cron retry-unassigned: pg_net POST to /api/cron/retry-failed-jobs (processDispatchRetryQueue, etc.).';



CREATE OR REPLACE FUNCTION "public"."run_analytics_warehouse_nightly"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_yesterday date := (timezone('utc', now()))::date - 1;
begin
  perform public.refresh_analytics_materialized_views();
  perform public.populate_daily_analytics_rollups(v_yesterday);
end;
$$;


COMMENT ON FUNCTION "public"."run_analytics_warehouse_nightly"() IS 'Single entrypoint: refresh MVs + populate yesterday''s rollups (UTC).';



CREATE OR REPLACE FUNCTION "public"."run_dispatch_cycle"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_expire jsonb;
  v_strand jsonb;
  v_out jsonb;
begin
  v_expire := public.expire_pending_dispatch_offers(200);
  v_strand := public.enqueue_stranded_pending_bookings(50);

  v_out := jsonb_build_object(
    'step', 'run_dispatch_cycle',
    'expire', coalesce(v_expire, '{}'::jsonb),
    'stranded', coalesce(v_strand, '{}'::jsonb),
    'ok',
    not (
      ((v_expire -> 'ok') is not null and (v_expire -> 'ok') = to_jsonb(false))
      or ((v_strand -> 'ok') is not null and (v_strand -> 'ok') = to_jsonb(false))
      or (v_expire ? 'error')
      or (v_strand ? 'error')
    )
  );

  insert into public.dispatch_logs (source, level, message, context)
  values ('run_dispatch_cycle', 'info', 'dispatch-cycle', v_out);

  return v_out;
exception
  when others then
    insert into public.dispatch_logs (source, level, message, context)
    values (
      'run_dispatch_cycle',
      'error',
      sqlerrm,
      jsonb_build_object('sqlstate', sqlstate)
    );
    return jsonb_build_object('ok', false, 'error', sqlerrm, 'sqlstate', sqlstate);
end;
$$;


COMMENT ON FUNCTION "public"."run_dispatch_cycle"() IS 'Cron dispatch-cycle: expire offers + enqueue stranded pending bookings. JS assign via retry-unassigned job.';



CREATE OR REPLACE FUNCTION "public"."sales_documents_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION "public"."sync_booking_cleaners_for_team_booking"("p_booking_id" "uuid", "p_source" "text" DEFAULT 'sync'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  b_team uuid;
  b_date date;
  b_assigned date;
  b_membership date;
  b_lead uuid;
  b_is_team boolean;
  b_finalized timestamptz;
  b_status text;
  v_start timestamptz;
  v_end timestamptz;
  v_src text;
begin
  if p_booking_id is null then
    raise exception 'sync_booking_cleaners_for_team_booking: p_booking_id required';
  end if;

  select b.team_id,
         b.date::date,
         (b.assigned_at at time zone 'UTC')::date,
         b.payout_owner_cleaner_id,
         coalesce(b.is_team_job, false),
         b.cleaner_line_earnings_finalized_at,
         lower(trim(coalesce(b.status, '')))
    into b_team, b_date, b_assigned, b_lead, b_is_team, b_finalized, b_status
    from public.bookings b
   where b.id = p_booking_id;

  if not found then
    raise exception 'sync_booking_cleaners_for_team_booking: booking % not found', p_booking_id;
  end if;

  if b_is_team is not true or b_team is null then
    return;
  end if;

  if b_finalized is not null then
    raise exception 'sync_booking_cleaners_for_team_booking: roster locked (cleaner_line_earnings_finalized_at is set)';
  end if;

  if b_status = 'completed' then
    return;
  end if;

  v_src := nullif(trim(coalesce(p_source, '')), '');
  if v_src is null then
    v_src := 'sync';
  end if;

  b_membership := greatest(coalesce(b_date, b_assigned), coalesce(b_assigned, b_date));
  v_start := (b_membership::text || ' 00:00:00+00')::timestamptz;
  v_end := (b_membership::text || ' 23:59:59.999+00')::timestamptz;

  delete from public.booking_cleaners where booking_id = p_booking_id;

  insert into public.booking_cleaners (
    booking_id,
    cleaner_id,
    role,
    payout_weight,
    lead_bonus_cents,
    source
  )
  with active as (
    select tm.cleaner_id
    from public.team_members tm
    where tm.team_id = b_team
      and tm.cleaner_id is not null
      and (tm.active_from is null or tm.active_from <= v_end)
      and (tm.active_to is null or tm.active_to >= v_start)
  ),
  effective_lead as (
    select coalesce(
      case
        when exists (select 1 from active a0 where a0.cleaner_id = b_lead) then b_lead
      end,
      (select t.lead_cleaner_id from public.teams t where t.id = b_team and exists (
        select 1 from active a2 where a2.cleaner_id = t.lead_cleaner_id
      )),
      (select a1.cleaner_id from active a1 order by a1.cleaner_id asc limit 1)
    ) as cid
  )
  select
    p_booking_id,
    a.cleaner_id,
    case when a.cleaner_id = el.cid then 'lead'::text else 'member'::text end,
    1,
    0,
    v_src
  from active a
  cross join effective_lead el
  where el.cid is not null;
end;
$$;


COMMENT ON FUNCTION "public"."sync_booking_cleaners_for_team_booking"("p_booking_id" "uuid", "p_source" "text") IS 'Rebuild booking_cleaners from team_members using greatest(visit date, assigned_at date). Skips completed visits.';



CREATE OR REPLACE FUNCTION "public"."sync_promotion_statuses"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  updated_count integer := 0;
begin
  update public.promotions
  set status = 'active', updated_at = now()
  where status = 'scheduled'
    and starts_at is not null
    and starts_at <= now()
    and (ends_at is null or ends_at > now());
  get diagnostics updated_count = row_count;

  update public.promotions
  set status = 'expired', updated_at = now()
  where status in ('active', 'scheduled', 'paused')
    and ends_at is not null
    and ends_at <= now();

  return updated_count;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."touch_bookings_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."touch_payout_integrity_first_seen"("p_booking_id" "uuid") RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_out timestamptz := null;
begin
  update public.bookings b
  set payout_integrity_first_seen_at = coalesce(b.payout_integrity_first_seen_at, now())
  where b.id = p_booking_id
  returning b.payout_integrity_first_seen_at into v_out;
  return v_out;
end;
$$;


COMMENT ON FUNCTION "public"."touch_payout_integrity_first_seen"("p_booking_id" "uuid") IS 'Sets payout_integrity_first_seen_at on first call per booking; returns current value (null if booking id missing).';



CREATE OR REPLACE FUNCTION "public"."trg_bookings_completed_refresh_tier"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.status = 'completed'
     and (old.status is distinct from 'completed')
     and new.customer_id is not null then
    perform public.recalculate_user_tier(new.customer_id);
  end if;
  return new;
end;
$$;


CREATE OR REPLACE FUNCTION "public"."trg_reviews_refresh_cleaner"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  cid uuid;
begin
  cid := coalesce(new.cleaner_id, old.cleaner_id);
  if cid is not null then
    perform public.refresh_cleaner_rating(cid);
  end if;
  return coalesce(new, old);
end;
$$;


CREATE OR REPLACE FUNCTION "public"."try_acquire_cron_lock"("p_job_name" "text", "p_holder_id" "uuid", "p_lease_seconds" integer DEFAULT 600) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_now timestamptz := now();
  v_lease_seconds int := greatest(30, least(3600, coalesce(p_lease_seconds, 600)));
  v_expires_at timestamptz := v_now + make_interval(secs => v_lease_seconds);
  v_holds boolean;
begin
  if p_job_name is null or btrim(p_job_name) = '' or p_holder_id is null then
    return false;
  end if;

  insert into public.cron_run_leases (job_name, holder_id, acquired_at, expires_at)
  values (p_job_name, p_holder_id, v_now, v_expires_at)
  on conflict (job_name) do update
    set holder_id = excluded.holder_id,
        acquired_at = excluded.acquired_at,
        expires_at = excluded.expires_at
    where public.cron_run_leases.expires_at < v_now;

  select exists (
    select 1
    from public.cron_run_leases
    where job_name = p_job_name
      and holder_id = p_holder_id
      and expires_at > v_now
  ) into v_holds;

  return coalesce(v_holds, false);
end;
$$;


COMMENT ON FUNCTION "public"."try_acquire_cron_lock"("p_job_name" "text", "p_holder_id" "uuid", "p_lease_seconds" integer) IS 'H-15: atomic per-job cron lease claim. Returns true iff caller now holds an unexpired lease. Lease TTL clamped to [30s, 3600s].';



CREATE OR REPLACE FUNCTION "public"."user_has_booking_with_cleaner"("p_cleaner_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.bookings b
    where b.cleaner_id = p_cleaner_id
      and b.user_id = auth.uid()
  );
$$;


COMMENT ON FUNCTION "public"."user_has_booking_with_cleaner"("p_cleaner_id" "uuid") IS 'True when the current user owns a booking assigned to p_cleaner_id. SECURITY DEFINER avoids bookings↔cleaners SELECT policy recursion.';



CREATE OR REPLACE FUNCTION "public"."user_owns_booking"("p_booking_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.bookings b
    where b.id = p_booking_id
      and b.user_id = auth.uid()
  );
$$;


COMMENT ON FUNCTION "public"."user_owns_booking"("p_booking_id" "uuid") IS 'True when auth.uid() owns the booking. SECURITY DEFINER avoids bookings↔booking_cleaners SELECT policy recursion.';



CREATE OR REPLACE FUNCTION "public"."user_profiles_prevent_customer_billing_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  if new.billing_type is not distinct from old.billing_type
     and new.schedule_type is not distinct from old.schedule_type then
    return new;
  end if;
  if (select auth.role()) = 'service_role' then
    return new;
  end if;
  if auth.uid() is not distinct from new.id then
    raise exception 'user_profiles_billing_model_locked'
      using hint = 'billing_type and schedule_type can only be changed via admin (service role).';
  end if;
  return new;
end;
$$;


COMMENT ON FUNCTION "public"."user_profiles_prevent_customer_billing_change"() IS 'Blocks self-serve updates to billing_type / schedule_type; service_role bypasses for admin tooling.';



CREATE TABLE IF NOT EXISTS "public"."accounting_invoice_sync" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "zoho_invoice_id" "text",
    "zoho_invoice_number" "text",
    "zoho_customer_id" "text",
    "booking_id" "uuid",
    "invoice_status" "text",
    "invoice_total_cents" integer,
    "tax_amount_cents" integer,
    "outstanding_balance_cents" integer,
    "currency_code" "text" DEFAULT 'ZAR'::"text" NOT NULL,
    "sync_status" "text" DEFAULT 'not_synced'::"text" NOT NULL,
    "sync_errors" "text",
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "accounting_invoice_sync_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['booking'::"text", 'monthly_invoice'::"text", 'sales_document'::"text"]))),
    CONSTRAINT "accounting_invoice_sync_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['not_synced'::"text", 'pending'::"text", 'synced'::"text", 'failed'::"text"])))
);


COMMENT ON TABLE "public"."accounting_invoice_sync" IS 'Zoho Books invoice sync metadata for bookings, monthly invoices, and sales documents.';



CREATE TABLE IF NOT EXISTS "public"."accounting_sync_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "external_accounting_id" "text",
    "sync_status" "text" DEFAULT 'not_synced'::"text" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "sync_errors" "text",
    "payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "retry_count" integer DEFAULT 0 NOT NULL,
    "next_retry_at" timestamp with time zone,
    CONSTRAINT "accounting_sync_records_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['expense'::"text", 'recurring_expense'::"text", 'budget'::"text", 'expense_account'::"text", 'booking'::"text", 'invoice'::"text", 'vendor'::"text", 'payment_transaction'::"text"]))),
    CONSTRAINT "accounting_sync_records_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['not_synced'::"text", 'pending'::"text", 'synced'::"text", 'failed'::"text"])))
);


CREATE TABLE IF NOT EXISTS "public"."admin_api_idempotency" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "route" "text" NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "status_code" smallint NOT NULL,
    "response_body" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL
);


COMMENT ON TABLE "public"."admin_api_idempotency" IS 'Short-lived replay cache for admin POSTs. Key = Idempotency-Key header + route + invoice_id + action.';



CREATE TABLE IF NOT EXISTS "public"."admin_billing_idempotency" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "response" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL
);


COMMENT ON TABLE "public"."admin_billing_idempotency" IS 'Replay cache for admin customer billing PATCH (Idempotency-Key). Only terminal NO_CHANGE/UPDATED responses are stored.';



CREATE TABLE IF NOT EXISTS "public"."admin_booking_create_idempotency" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "route" "text" NOT NULL,
    "customer_user_id" "uuid" NOT NULL,
    "service_date" "text" NOT NULL,
    "service_time" "text" NOT NULL,
    "service_slug" "text" DEFAULT ''::"text" NOT NULL,
    "location_hash" "text" DEFAULT ''::"text" NOT NULL,
    "pending" boolean DEFAULT true NOT NULL,
    "status_code" smallint,
    "response_body" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL
);


COMMENT ON TABLE "public"."admin_booking_create_idempotency" IS 'Short-lived idempotency for admin booking create: key + route + customer + slot + service + location fingerprint.';



COMMENT ON COLUMN "public"."admin_booking_create_idempotency"."service_slug" IS 'Normalized service id from admin create (e.g. quick, standard). Part of idempotency fingerprint.';



COMMENT ON COLUMN "public"."admin_booking_create_idempotency"."location_hash" IS 'SHA-256 hex prefix of normalized first address line; fingerprint only (not reversible).';



CREATE TABLE IF NOT EXISTS "public"."cleaning_credit_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount_zar" numeric NOT NULL,
    "balance_after_zar" numeric NOT NULL,
    "type" "text" NOT NULL,
    "referral_id" "uuid",
    "booking_id" "uuid",
    "note" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cleaning_credit_transactions_balance_after_zar_check" CHECK (("balance_after_zar" >= (0)::numeric)),
    CONSTRAINT "cleaning_credit_transactions_type_check" CHECK (("type" = ANY (ARRAY['earn'::"text", 'spend'::"text", 'reverse'::"text", 'admin_adjust'::"text", 'expire'::"text"])))
);


CREATE TABLE IF NOT EXISTS "public"."referral_discount_redemptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "referral_code" "text" NOT NULL,
    "referrer_type" "text" NOT NULL,
    "referrer_id" "uuid" NOT NULL,
    "redeemed_by_user_id" "uuid",
    "redeemed_by_email" "text",
    "booking_id" "uuid" NOT NULL,
    "discount_zar" integer DEFAULT 50 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "checkout_fingerprint" "text",
    CONSTRAINT "referral_discount_redemptions_discount_zar_check" CHECK (("discount_zar" > 0)),
    CONSTRAINT "referral_discount_redemptions_email_lower_chk" CHECK ((("redeemed_by_email" IS NULL) OR ("redeemed_by_email" = "lower"("redeemed_by_email")))),
    CONSTRAINT "referral_discount_redemptions_referrer_type_check" CHECK (("referrer_type" = ANY (ARRAY['customer'::"text", 'cleaner'::"text"])))
);


COMMENT ON TABLE "public"."referral_discount_redemptions" IS 'One successful Paystack checkout discount per (code, user) or (code, guest email); booking_id is unique for idempotent verify.';



COMMENT ON COLUMN "public"."referral_discount_redemptions"."checkout_fingerprint" IS 'SHA-256 hex of client IP + User-Agent at Paystack initialize; optional unique with referral_code for guests.';



CREATE OR REPLACE VIEW "public"."admin_booking_promo_costs" AS
 SELECT "b"."id" AS "booking_id",
    "b"."date",
    "b"."city_id",
    (COALESCE("r"."discount_zar", 0))::bigint AS "referral_discount_zar",
    COALESCE("c"."credit_spend_zar", (0)::bigint) AS "cleaning_credit_spend_zar",
    (COALESCE("r"."discount_zar", 0) + COALESCE("c"."credit_spend_zar", (0)::bigint)) AS "total_promo_cost_zar"
   FROM (("public"."bookings" "b"
     LEFT JOIN "public"."referral_discount_redemptions" "r" ON (("r"."booking_id" = "b"."id")))
     LEFT JOIN ( SELECT "cleaning_credit_transactions"."booking_id",
            ("sum"("abs"("cleaning_credit_transactions"."amount_zar")))::bigint AS "credit_spend_zar"
           FROM "public"."cleaning_credit_transactions"
          WHERE (("cleaning_credit_transactions"."type" = 'spend'::"text") AND ("cleaning_credit_transactions"."booking_id" IS NOT NULL))
          GROUP BY "cleaning_credit_transactions"."booking_id") "c" ON (("c"."booking_id" = "b"."id")))
  WHERE ((COALESCE("r"."discount_zar", 0) > 0) OR (COALESCE("c"."credit_spend_zar", (0)::bigint) > 0));


COMMENT ON VIEW "public"."admin_booking_promo_costs" IS 'Referral checkout discounts and cleaning credit spend per booking (ZAR whole units).';



CREATE TABLE IF NOT EXISTS "public"."admin_earnings_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "admin_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "admin_earnings_actions_action_check" CHECK (("action" = ANY (ARRAY['fix'::"text", 'reset'::"text", 'dispute_review'::"text", 'dispute_resolve'::"text", 'dispute_reject'::"text", 'manual_adjust'::"text"])))
);


COMMENT ON TABLE "public"."admin_earnings_actions" IS 'Admin POST /fix-earnings and /reset-earnings; no booking mutation beyond logging.';



COMMENT ON CONSTRAINT "admin_earnings_actions_action_check" ON "public"."admin_earnings_actions" IS 'Action kinds including manual_adjust for per-visit payout edits before batch approval.';



CREATE TABLE IF NOT EXISTS "public"."referral_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_type" "text" NOT NULL,
    "booking_id" "uuid",
    "referral_redemption_id" "uuid",
    "referrer_id" "uuid",
    "referrer_type" "text",
    "referee_user_id" "uuid",
    "value_zar" integer,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "referral_id" "uuid",
    CONSTRAINT "referral_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['checkout_discount_applied'::"text", 'cleaner_checkout_attribution'::"text", 'referral_conversion_completed'::"text", 'referral_reward_credited'::"text"]))),
    CONSTRAINT "referral_events_referrer_type_check" CHECK ((("referrer_type" IS NULL) OR ("referrer_type" = ANY (ARRAY['customer'::"text", 'cleaner'::"text"]))))
);


COMMENT ON TABLE "public"."referral_events" IS 'Projections of confirmed referral facts (e.g. post-redemption); not a replacement for referral_discount_redemptions.';



COMMENT ON COLUMN "public"."referral_events"."referral_id" IS 'Optional FK to referrals row for lifecycle/reward projections (checkout rows typically null).';



COMMENT ON CONSTRAINT "referral_events_event_type_check" ON "public"."referral_events" IS 'Allowed analytics event names; extend via migration when adding new emitters.';



CREATE OR REPLACE VIEW "public"."admin_referrer_monthly_profitability_rollups" AS
 WITH "rev" AS (
         SELECT "date_trunc"('month'::"text", COALESCE("b"."payment_completed_at", "b"."created_at")) AS "month_bucket",
            "e"."referrer_type",
            "e"."referrer_id",
            "count"(DISTINCT "e"."booking_id") AS "profitable_booking_count",
            (COALESCE("sum"(GREATEST((0)::bigint,
                CASE
                    WHEN ("b"."total_paid_zar" IS NOT NULL) THEN ("b"."total_paid_zar")::bigint
                    ELSE ("round"(((COALESCE("b"."amount_paid_cents", 0))::numeric / (100)::numeric)))::bigint
                END)), (0)::numeric))::bigint AS "gross_referred_revenue_zar"
           FROM ("public"."referral_events" "e"
             JOIN "public"."bookings" "b" ON (("b"."id" = "e"."booking_id")))
          WHERE (("e"."event_type" = 'checkout_discount_applied'::"text") AND ("e"."booking_id" IS NOT NULL) AND (COALESCE("lower"(TRIM(BOTH FROM "b"."status")), ''::"text") <> ALL (ARRAY['pending_payment'::"text", 'payment_expired'::"text", 'cancelled'::"text", 'failed'::"text"])))
          GROUP BY ("date_trunc"('month'::"text", COALESCE("b"."payment_completed_at", "b"."created_at"))), "e"."referrer_type", "e"."referrer_id"
        ), "disc" AS (
         SELECT "date_trunc"('month'::"text", "r"."created_at") AS "month_bucket",
            "r"."referrer_type",
            "r"."referrer_id",
            COALESCE("sum"("r"."discount_zar"), (0)::bigint) AS "total_discount_cost_zar"
           FROM "public"."referral_discount_redemptions" "r"
          GROUP BY ("date_trunc"('month'::"text", "r"."created_at")), "r"."referrer_type", "r"."referrer_id"
        ), "rew" AS (
         SELECT "date_trunc"('month'::"text", "e"."created_at") AS "month_bucket",
            "e"."referrer_type",
            "e"."referrer_id",
            COALESCE("sum"("e"."value_zar"), (0)::bigint) AS "total_reward_cost_zar"
           FROM "public"."referral_events" "e"
          WHERE ("e"."event_type" = 'referral_reward_credited'::"text")
          GROUP BY ("date_trunc"('month'::"text", "e"."created_at")), "e"."referrer_type", "e"."referrer_id"
        ), "keys" AS (
         SELECT "rev"."month_bucket",
            "rev"."referrer_type",
            "rev"."referrer_id"
           FROM "rev"
        UNION
         SELECT "disc"."month_bucket",
            "disc"."referrer_type",
            "disc"."referrer_id"
           FROM "disc"
        UNION
         SELECT "rew"."month_bucket",
            "rew"."referrer_type",
            "rew"."referrer_id"
           FROM "rew"
        )
 SELECT "k"."month_bucket",
    "k"."referrer_type",
    "k"."referrer_id",
    COALESCE("v"."gross_referred_revenue_zar", (0)::bigint) AS "gross_referred_revenue_zar",
    COALESCE("d"."total_discount_cost_zar", (0)::bigint) AS "total_discount_cost_zar",
    COALESCE("w"."total_reward_cost_zar", (0)::bigint) AS "total_reward_cost_zar",
    ((COALESCE("v"."gross_referred_revenue_zar", (0)::bigint) - COALESCE("d"."total_discount_cost_zar", (0)::bigint)) - COALESCE("w"."total_reward_cost_zar", (0)::bigint)) AS "estimated_net_contribution_zar",
    COALESCE("v"."profitable_booking_count", (0)::bigint) AS "profitable_booking_count",
        CASE
            WHEN (COALESCE("v"."profitable_booking_count", (0)::bigint) > 0) THEN "round"(((COALESCE("v"."gross_referred_revenue_zar", (0)::bigint))::numeric / ("v"."profitable_booking_count")::numeric), 2)
            ELSE NULL::numeric
        END AS "avg_booking_value_zar"
   FROM ((("keys" "k"
     LEFT JOIN "rev" "v" ON ((("v"."month_bucket" = "k"."month_bucket") AND ("v"."referrer_type" = "k"."referrer_type") AND ("v"."referrer_id" = "k"."referrer_id"))))
     LEFT JOIN "disc" "d" ON ((("d"."month_bucket" = "k"."month_bucket") AND ("d"."referrer_type" = "k"."referrer_type") AND ("d"."referrer_id" = "k"."referrer_id"))))
     LEFT JOIN "rew" "w" ON ((("w"."month_bucket" = "k"."month_bucket") AND ("w"."referrer_type" = "k"."referrer_type") AND ("w"."referrer_id" = "k"."referrer_id"))));


COMMENT ON VIEW "public"."admin_referrer_monthly_profitability_rollups" IS 'Monthly slice of attribution-based referral economics per referrer (UTC month from row timestamps).';



CREATE OR REPLACE VIEW "public"."admin_global_monthly_referral_economics" AS
 SELECT "month_bucket",
    (COALESCE("sum"("gross_referred_revenue_zar"), (0)::numeric))::bigint AS "gross_referred_revenue_zar",
    (COALESCE("sum"("total_discount_cost_zar"), (0)::numeric))::bigint AS "total_discount_cost_zar",
    (COALESCE("sum"("total_reward_cost_zar"), (0)::numeric))::bigint AS "total_reward_cost_zar",
    (COALESCE("sum"("estimated_net_contribution_zar"), (0)::numeric))::bigint AS "estimated_net_contribution_zar",
    (COALESCE("sum"("profitable_booking_count"), (0)::numeric))::bigint AS "profitable_booking_count"
   FROM "public"."admin_referrer_monthly_profitability_rollups" "m"
  GROUP BY "month_bucket";


COMMENT ON VIEW "public"."admin_global_monthly_referral_economics" IS 'Platform-wide monthly referral economics rollup for trend dashboards.';



CREATE TABLE IF NOT EXISTS "public"."admin_money_action_proposals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "action_type" "text" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "proposed_by" "uuid" NOT NULL,
    "proposed_by_email" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "review_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval) NOT NULL,
    CONSTRAINT "admin_money_action_proposals_action_type_check" CHECK (("action_type" = ANY (ARRAY['adjust_payout_earnings'::"text", 'adjust_team_payout_earnings'::"text", 'reprice_booking_details'::"text"]))),
    CONSTRAINT "admin_money_action_proposals_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'expired'::"text"])))
);


COMMENT ON TABLE "public"."admin_money_action_proposals" IS 'Maker–checker proposals for earnings adjust and paid booking reprice when PAYOUT_MAKER_CHECKER / BOOKING_REPRICE_MAKER_CHECKER=true.';



CREATE OR REPLACE VIEW "public"."admin_referral_checkout_redemption_summary" AS
 SELECT "referral_code",
    "count"(*) AS "redemption_count",
    COALESCE("sum"("discount_zar"), (0)::bigint) AS "total_discount_zar"
   FROM "public"."referral_discount_redemptions"
  GROUP BY "referral_code";


COMMENT ON VIEW "public"."admin_referral_checkout_redemption_summary" IS 'Aggregated checkout referral discount cost per code (admin / ops).';



CREATE OR REPLACE VIEW "public"."admin_referral_reconciliation_queue" AS
 SELECT "id" AS "booking_id",
    "date",
    "customer_email",
    "customer_name",
    "total_paid_zar",
    "status",
    "paystack_reference",
    "referral_reconciliation_required",
    "created_at",
    "payment_completed_at"
   FROM "public"."bookings" "b"
  WHERE ("referral_reconciliation_required" = true)
  ORDER BY "created_at" DESC;


COMMENT ON VIEW "public"."admin_referral_reconciliation_queue" IS 'Bookings where Paystack succeeded but referral discount redemption could not be persisted.';



CREATE OR REPLACE VIEW "public"."admin_referrer_conversion_rollups" AS
 SELECT "referrer_type",
    "referrer_id",
    "count"(*) AS "conversions_completed",
    "count"(DISTINCT "referee_user_id") FILTER (WHERE ("referee_user_id" IS NOT NULL)) AS "distinct_referee_count",
    "max"("created_at") AS "latest_conversion_at",
    "count"(*) FILTER (WHERE ("referrer_type" = 'customer'::"text")) AS "customer_conversion_count",
    "count"(*) FILTER (WHERE ("referrer_type" = 'cleaner'::"text")) AS "cleaner_conversion_count"
   FROM "public"."referral_events" "e"
  WHERE ("event_type" = 'referral_conversion_completed'::"text")
  GROUP BY "referrer_type", "referrer_id";


COMMENT ON VIEW "public"."admin_referrer_conversion_rollups" IS 'Per-referrer aggregates for referral_conversion_completed (distinct_referee_count = unique referee user ids).';



CREATE OR REPLACE VIEW "public"."admin_referrer_event_rollups" AS
 SELECT "referrer_type",
    "referrer_id",
    "count"(*) FILTER (WHERE ("event_type" = 'checkout_discount_applied'::"text")) AS "checkout_discount_event_count",
    "count"(DISTINCT "booking_id") FILTER (WHERE (("event_type" = 'checkout_discount_applied'::"text") AND ("booking_id" IS NOT NULL))) AS "attributed_bookings",
    "count"(*) FILTER (WHERE ("event_type" = 'cleaner_checkout_attribution'::"text")) AS "cleaner_checkout_attribution_count"
   FROM "public"."referral_events" "e"
  GROUP BY "referrer_type", "referrer_id";


COMMENT ON VIEW "public"."admin_referrer_event_rollups" IS 'Per-referrer aggregates from referral_events (checkout + cleaner attribution counts).';



CREATE OR REPLACE VIEW "public"."admin_referrer_redemption_rollups" AS
 SELECT "referrer_type",
    "referrer_id",
    "count"(*) AS "redemption_count",
    COALESCE("sum"("discount_zar"), (0)::bigint) AS "total_discount_zar",
    "max"("created_at") AS "latest_redemption_at"
   FROM "public"."referral_discount_redemptions" "r"
  GROUP BY "referrer_type", "referrer_id";


COMMENT ON VIEW "public"."admin_referrer_redemption_rollups" IS 'Per-referrer aggregates from checkout discount redemptions (admin / analytics).';



CREATE OR REPLACE VIEW "public"."admin_referrer_reward_rollups" AS
 SELECT "referrer_type",
    "referrer_id",
    "count"(*) AS "rewards_credited_count",
    COALESCE("sum"("value_zar"), (0)::bigint) AS "total_rewards_zar",
        CASE
            WHEN ("count"(*) > 0) THEN "round"("avg"(("value_zar")::numeric), 2)
            ELSE NULL::numeric
        END AS "avg_reward_zar",
    "max"("created_at") AS "latest_reward_at",
    "count"(*) FILTER (WHERE ("referrer_type" = 'customer'::"text")) AS "customer_reward_count",
    "count"(*) FILTER (WHERE ("referrer_type" = 'cleaner'::"text")) AS "cleaner_reward_count"
   FROM "public"."referral_events" "e"
  WHERE ("event_type" = 'referral_reward_credited'::"text")
  GROUP BY "referrer_type", "referrer_id";


COMMENT ON VIEW "public"."admin_referrer_reward_rollups" IS 'Per-referrer aggregates for referral_reward_credited events.';



CREATE OR REPLACE VIEW "public"."admin_referrer_profitability_rollups" AS
 WITH "attributed" AS (
         SELECT "e"."referrer_type",
            "e"."referrer_id",
            "count"(DISTINCT "e"."booking_id") AS "profitable_booking_count",
            (COALESCE("sum"(GREATEST((0)::bigint,
                CASE
                    WHEN ("b"."total_paid_zar" IS NOT NULL) THEN ("b"."total_paid_zar")::bigint
                    ELSE ("round"(((COALESCE("b"."amount_paid_cents", 0))::numeric / (100)::numeric)))::bigint
                END)), (0)::numeric))::bigint AS "gross_referred_revenue_zar",
            "max"(COALESCE("b"."payment_completed_at", "b"."created_at")) AS "latest_profitable_booking_at"
           FROM ("public"."referral_events" "e"
             JOIN "public"."bookings" "b" ON (("b"."id" = "e"."booking_id")))
          WHERE (("e"."event_type" = 'checkout_discount_applied'::"text") AND ("e"."booking_id" IS NOT NULL) AND (COALESCE("lower"(TRIM(BOTH FROM "b"."status")), ''::"text") <> ALL (ARRAY['pending_payment'::"text", 'payment_expired'::"text", 'cancelled'::"text", 'failed'::"text"])))
          GROUP BY "e"."referrer_type", "e"."referrer_id"
        ), "discounts" AS (
         SELECT "r_1"."referrer_type",
            "r_1"."referrer_id",
            COALESCE("r_1"."total_discount_zar", (0)::bigint) AS "total_discount_cost_zar"
           FROM "public"."admin_referrer_redemption_rollups" "r_1"
        ), "rewards" AS (
         SELECT "w"."referrer_type",
            "w"."referrer_id",
            COALESCE("w"."total_rewards_zar", (0)::bigint) AS "total_reward_cost_zar"
           FROM "public"."admin_referrer_reward_rollups" "w"
        ), "keys" AS (
         SELECT "attributed"."referrer_type",
            "attributed"."referrer_id"
           FROM "attributed"
        UNION
         SELECT "discounts"."referrer_type",
            "discounts"."referrer_id"
           FROM "discounts"
        UNION
         SELECT "rewards"."referrer_type",
            "rewards"."referrer_id"
           FROM "rewards"
        )
 SELECT "k"."referrer_type",
    "k"."referrer_id",
    COALESCE("a"."gross_referred_revenue_zar", (0)::bigint) AS "gross_referred_revenue_zar",
    COALESCE("d"."total_discount_cost_zar", (0)::bigint) AS "total_discount_cost_zar",
    COALESCE("r"."total_reward_cost_zar", (0)::bigint) AS "total_reward_cost_zar",
    ((COALESCE("a"."gross_referred_revenue_zar", (0)::bigint) - COALESCE("d"."total_discount_cost_zar", (0)::bigint)) - COALESCE("r"."total_reward_cost_zar", (0)::bigint)) AS "estimated_net_contribution_zar",
    COALESCE("a"."profitable_booking_count", (0)::bigint) AS "profitable_booking_count",
        CASE
            WHEN (COALESCE("a"."profitable_booking_count", (0)::bigint) > 0) THEN "round"(((COALESCE("a"."gross_referred_revenue_zar", (0)::bigint))::numeric / ("a"."profitable_booking_count")::numeric), 2)
            ELSE NULL::numeric
        END AS "avg_booking_value_zar",
    "a"."latest_profitable_booking_at"
   FROM ((("keys" "k"
     LEFT JOIN "attributed" "a" ON ((("a"."referrer_type" = "k"."referrer_type") AND ("a"."referrer_id" = "k"."referrer_id"))))
     LEFT JOIN "discounts" "d" ON ((("d"."referrer_type" = "k"."referrer_type") AND ("d"."referrer_id" = "k"."referrer_id"))))
     LEFT JOIN "rewards" "r" ON ((("r"."referrer_type" = "k"."referrer_type") AND ("r"."referrer_id" = "k"."referrer_id"))));


COMMENT ON VIEW "public"."admin_referrer_profitability_rollups" IS 'Per-referrer economics: gross revenue from paid bookings with checkout_discount_applied, minus redemption discounts and referral_reward_credited totals; estimated_net_contribution_zar is not full profit.';



CREATE OR REPLACE VIEW "public"."admin_referrer_quality_signals" AS
 SELECT "c"."referrer_type",
    "c"."referrer_id",
        CASE
            WHEN (COALESCE("c"."conversions_completed", (0)::bigint) > 0) THEN "round"(((("c"."conversions_completed" - COALESCE("c"."distinct_referee_count", (0)::bigint)))::numeric / ("c"."conversions_completed")::numeric), 4)
            ELSE NULL::numeric
        END AS "repeat_referee_excess_ratio",
        CASE
            WHEN (COALESCE("p"."gross_referred_revenue_zar", (0)::bigint) > 0) THEN "round"((("p"."total_reward_cost_zar")::numeric / ("p"."gross_referred_revenue_zar")::numeric), 4)
            ELSE NULL::numeric
        END AS "reward_to_gross_revenue_ratio",
    "c"."conversions_completed",
    "c"."distinct_referee_count",
    COALESCE("e"."attributed_bookings", (0)::bigint) AS "attributed_bookings",
        CASE
            WHEN (COALESCE("e"."attributed_bookings", (0)::bigint) > 0) THEN "round"((("c"."conversions_completed")::numeric / ("e"."attributed_bookings")::numeric), 4)
            ELSE NULL::numeric
        END AS "conversion_to_attributed_booking_ratio",
    "p"."gross_referred_revenue_zar",
    "p"."total_reward_cost_zar",
    "p"."estimated_net_contribution_zar"
   FROM (("public"."admin_referrer_conversion_rollups" "c"
     LEFT JOIN "public"."admin_referrer_profitability_rollups" "p" ON ((("p"."referrer_type" = "c"."referrer_type") AND ("p"."referrer_id" = "c"."referrer_id"))))
     LEFT JOIN "public"."admin_referrer_event_rollups" "e" ON ((("e"."referrer_type" = "c"."referrer_type") AND ("e"."referrer_id" = "c"."referrer_id"))));


COMMENT ON VIEW "public"."admin_referrer_quality_signals" IS 'Analytical ratios for referral quality review; does not modify operational data.';



CREATE OR REPLACE VIEW "public"."admin_referrer_redemption_spike_flags" AS
 WITH "monthly" AS (
         SELECT "r"."referrer_type",
            "r"."referrer_id",
            "date_trunc"('month'::"text", "r"."created_at") AS "month_bucket",
            "count"(*) AS "redemption_count"
           FROM "public"."referral_discount_redemptions" "r"
          GROUP BY "r"."referrer_type", "r"."referrer_id", ("date_trunc"('month'::"text", "r"."created_at"))
        ), "anchor" AS (
         SELECT "date_trunc"('month'::"text", CURRENT_TIMESTAMP) AS "this_month_start"
        ), "with_avg" AS (
         SELECT "m"."referrer_type",
            "m"."referrer_id",
            "max"("m"."redemption_count") FILTER (WHERE ("m"."month_bucket" = ( SELECT "anchor"."this_month_start"
                   FROM "anchor"))) AS "current_month_redemptions",
            "avg"("m"."redemption_count") FILTER (WHERE (("m"."month_bucket" < ( SELECT "anchor"."this_month_start"
                   FROM "anchor")) AND ("m"."month_bucket" >= (( SELECT "anchor"."this_month_start"
                   FROM "anchor") - '3 mons'::interval)))) AS "avg_prior_3_months_redemptions"
           FROM "monthly" "m"
          GROUP BY "m"."referrer_type", "m"."referrer_id"
        )
 SELECT "referrer_type",
    "referrer_id",
    COALESCE("current_month_redemptions", (0)::bigint) AS "current_month_redemptions",
    "round"(COALESCE("avg_prior_3_months_redemptions", (0)::numeric), 2) AS "avg_prior_3_months_redemptions",
    ((COALESCE("current_month_redemptions", (0)::bigint) >= 5) AND ((COALESCE("current_month_redemptions", (0)::bigint))::numeric >= ((3)::numeric * GREATEST(COALESCE("avg_prior_3_months_redemptions", (0)::numeric), (1)::numeric)))) AS "spike_suspected"
   FROM "with_avg" "w"
  WHERE (COALESCE("current_month_redemptions", (0)::bigint) > 0);


COMMENT ON VIEW "public"."admin_referrer_redemption_spike_flags" IS 'Heuristic flag when current-month redemptions are high vs trailing 3-month average; review only.';



CREATE TABLE IF NOT EXISTS "public"."admin_request_dedupe" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scope" "text" NOT NULL,
    "dedupe_key" "text" NOT NULL,
    "booking_id" "uuid",
    "response" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'processing'::"text" NOT NULL,
    CONSTRAINT "admin_request_dedupe_status_check" CHECK (("status" = ANY (ARRAY['processing'::"text", 'done'::"text", 'failed'::"text"])))
);


COMMENT ON TABLE "public"."admin_request_dedupe" IS 'Short-lived idempotency claims for admin APIs; response cached on success. Prune old rows via cron if needed.';



COMMENT ON COLUMN "public"."admin_request_dedupe"."status" IS 'processing = claim held; done = response is final success; failed = terminal error payload for audit / reclaim.';



CREATE TABLE IF NOT EXISTS "public"."ai_decision_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "decision_type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "predicted_outcome" "jsonb",
    "actual_outcome" "jsonb",
    "confidence" double precision
);


COMMENT ON TABLE "public"."ai_decision_logs" IS 'Explainable AI layer: inputs, model outputs, chosen action, optional measured outcome for updateModelWeights.';



COMMENT ON COLUMN "public"."ai_decision_logs"."predicted_outcome" IS 'Structured model prediction (calibration / explain).';



COMMENT ON COLUMN "public"."ai_decision_logs"."actual_outcome" IS 'Observed outcome when available.';



COMMENT ON COLUMN "public"."ai_decision_logs"."confidence" IS '0–1 confidence score for the logged decision.';



CREATE TABLE IF NOT EXISTS "public"."ai_experiment_exposures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subject_id" "text" NOT NULL,
    "experiment_key" "text" NOT NULL,
    "variant" "text" NOT NULL,
    "rollout_percent" integer NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_experiment_exposures_rollout_percent_check" CHECK ((("rollout_percent" >= 0) AND ("rollout_percent" <= 100))),
    CONSTRAINT "ai_experiment_exposures_variant_check" CHECK (("variant" = ANY (ARRAY['control'::"text", 'variant'::"text", 'variant_a'::"text", 'variant_b'::"text"])))
);


COMMENT ON TABLE "public"."ai_experiment_exposures" IS 'Stable A/B assignment per subject+experiment; first exposure wins (unique index).';



CREATE TABLE IF NOT EXISTS "public"."ai_feature_store" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "feature_key" "text" NOT NULL,
    "feature_value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_feature_store_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['booking'::"text", 'cleaner'::"text", 'customer'::"text"])))
);


COMMENT ON TABLE "public"."ai_feature_store" IS 'Materialized features per entity (conversion, LTV, segment, acceptance, workload, booking context). Fed by app sync; optional for cold-start paths.';



CREATE TABLE IF NOT EXISTS "public"."ai_model_weights" (
    "decision_scope" "text" NOT NULL,
    "weights" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_model_weights_decision_scope_check" CHECK (("decision_scope" = ANY (ARRAY['pricing'::"text", 'assignment'::"text", 'growth'::"text"])))
);


COMMENT ON TABLE "public"."ai_model_weights" IS 'Lightweight tunable weights merged in TS with rule baselines; updated by updateModelWeights from outcomes.';



CREATE TABLE IF NOT EXISTS "public"."birthday_rewards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "promotion_id" "uuid",
    "reward_year" integer NOT NULL,
    "credit_zar" numeric NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'issued'::"text" NOT NULL,
    "credit_transaction_id" "uuid",
    "redeemed_booking_id" "uuid",
    "email_sent_at" timestamp with time zone,
    "sms_sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "birthday_rewards_credit_zar_check" CHECK (("credit_zar" >= (0)::numeric)),
    CONSTRAINT "birthday_rewards_status_check" CHECK (("status" = ANY (ARRAY['issued'::"text", 'redeemed'::"text", 'expired'::"text", 'revoked'::"text"])))
);


COMMENT ON TABLE "public"."birthday_rewards" IS 'One birthday cleaning credit per customer per calendar year.';



CREATE TABLE IF NOT EXISTS "public"."blog_authors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "bio" "text",
    "avatar_url" "text",
    "website_url" "text",
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."blog_authors" IS 'Blog bylines; optional link to auth.users for dashboard editors.';



CREATE TABLE IF NOT EXISTS "public"."blog_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."blog_categories" IS 'Blog taxonomy for URLs, hubs, and internal linking.';



CREATE TABLE IF NOT EXISTS "public"."blog_post_tags" (
    "post_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


CREATE TABLE IF NOT EXISTS "public"."blog_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "h1" "text",
    "excerpt" "text",
    "status" "public"."blog_post_status" DEFAULT 'draft'::"public"."blog_post_status" NOT NULL,
    "source" "public"."blog_post_source" DEFAULT 'editorial'::"public"."blog_post_source" NOT NULL,
    "content_json" "jsonb" DEFAULT '{"blocks": [], "schema_version": 1}'::"jsonb" NOT NULL,
    "meta_title" "text",
    "meta_description" "text",
    "canonical_url" "text",
    "featured_image_url" "text",
    "featured_image_alt" "text",
    "author_id" "uuid",
    "category_id" "uuid",
    "reading_time_minutes" integer,
    "published_at" timestamp with time zone,
    "noindex" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "primary_keyword" "text",
    "secondary_keywords" "text"[],
    "search_intent" "text",
    "seo_internal_link_context" "jsonb",
    "semantic_cluster" "text",
    "related_guide_override_slugs" "text"[],
    CONSTRAINT "blog_posts_reading_time_nonneg" CHECK ((("reading_time_minutes" IS NULL) OR ("reading_time_minutes" >= 0))),
    CONSTRAINT "blog_posts_scheduled_has_publish_at" CHECK ((("status" <> 'scheduled'::"public"."blog_post_status") OR ("published_at" IS NOT NULL))),
    CONSTRAINT "published_requires_date" CHECK ((("status" <> 'published'::"public"."blog_post_status") OR ("published_at" IS NOT NULL)))
);


COMMENT ON TABLE "public"."blog_posts" IS 'Hybrid blog: content_json is block tree (no raw HTML in DB).';



COMMENT ON COLUMN "public"."blog_posts"."h1" IS 'Optional display H1. App fallback: coalesce(h1, title).';



COMMENT ON COLUMN "public"."blog_posts"."excerpt" IS 'Optional card/listing excerpt. App fallback: first intro block in content_json, trimmed to ~160 characters.';



COMMENT ON COLUMN "public"."blog_posts"."content_json" IS 'Structured blocks: schema_version + blocks[]. See apps/web/lib/blog/content-json.ts';



COMMENT ON COLUMN "public"."blog_posts"."canonical_url" IS 'Optional absolute or site-relative canonical. App fallback: ''/blog/'' || slug (when column null).';



COMMENT ON COLUMN "public"."blog_posts"."reading_time_minutes" IS 'Derived field: compute from content_json (word count / blocks) at save or publish time in app code; not enforced in DB.';



COMMENT ON COLUMN "public"."blog_posts"."noindex" IS 'When true, emit robots noindex; does not affect RLS visibility of published rows.';



COMMENT ON COLUMN "public"."blog_posts"."primary_keyword" IS 'Primary SEO keyword phrase for the post.';



COMMENT ON COLUMN "public"."blog_posts"."secondary_keywords" IS 'Supporting keyword phrases.';



COMMENT ON COLUMN "public"."blog_posts"."search_intent" IS 'informational | transactional | commercial | navigational';



COMMENT ON COLUMN "public"."blog_posts"."seo_internal_link_context" IS 'Optional JSON matching InjectInternalLinksContext for injectInternalLinks() at render/publish.';



COMMENT ON COLUMN "public"."blog_posts"."semantic_cluster" IS 'Governance cluster key (e.g. service-selection, booking-confidence). Nullable during rollout; pair with taxonomy tags.';



COMMENT ON COLUMN "public"."blog_posts"."related_guide_override_slugs" IS 'Ordered blog post slugs to pin in the cluster related-guides footer; remaining slots filled from same-cluster peers.';


CREATE TABLE IF NOT EXISTS "public"."blog_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."blog_tags" IS 'Flat tags; join via blog_post_tags.';



CREATE TABLE IF NOT EXISTS "public"."booking_changes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "changed_by" "uuid" NOT NULL,
    "before" "jsonb" NOT NULL,
    "after" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "summary" "jsonb"
);


COMMENT ON TABLE "public"."booking_changes" IS 'Immutable before/after snapshots for admin-driven booking mutations (repricing, etc.).';



COMMENT ON COLUMN "public"."booking_changes"."summary" IS 'Optional compact diff: fields_changed[], delta_cents, etc.';



CREATE TABLE IF NOT EXISTS "public"."booking_cleaner_earnings_snapshot" (
    "booking_id" "uuid" NOT NULL,
    "cleaner_id" "uuid" NOT NULL,
    "eligible_subtotal_cents" integer NOT NULL,
    "display_earnings_cents" integer NOT NULL,
    "payout_earnings_cents" integer NOT NULL,
    "internal_earnings_cents" integer NOT NULL,
    "earnings_model_version" "text",
    "earnings_percentage_applied" numeric(6,5),
    "earnings_cap_cents_applied" integer,
    "earnings_tenure_months_at_assignment" integer,
    "model_version" "text" DEFAULT 'line_items_basis_v1'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "booking_cleaner_earnings_snapshot_display_earnings_cents_check" CHECK (("display_earnings_cents" >= 0)),
    CONSTRAINT "booking_cleaner_earnings_snapshot_internal_earnings_cents_check" CHECK (("internal_earnings_cents" >= 0)),
    CONSTRAINT "booking_cleaner_earnings_snapshot_payout_earnings_cents_check" CHECK (("payout_earnings_cents" >= 0))
);


COMMENT ON TABLE "public"."booking_cleaner_earnings_snapshot" IS 'Frozen cleaner earnings for a booking when computed from booking_line_items + same caps/tenure as computeBookingEarnings.';



CREATE TABLE IF NOT EXISTS "public"."booking_cleaner_earnings_snapshot_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "booking_line_item_id" "uuid" NOT NULL,
    "allocated_display_earnings_cents" integer NOT NULL
);


CREATE TABLE IF NOT EXISTS "public"."booking_cleaners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "cleaner_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payout_weight" numeric(10,6) DEFAULT 1 NOT NULL,
    "lead_bonus_cents" integer DEFAULT 0 NOT NULL,
    "source" "text" DEFAULT 'admin'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "booking_cleaners_lead_bonus_cents_check" CHECK (("lead_bonus_cents" >= 0)),
    CONSTRAINT "booking_cleaners_payout_weight_check" CHECK (("payout_weight" > (0)::numeric)),
    CONSTRAINT "booking_cleaners_role_check" CHECK (("role" = ANY (ARRAY['lead'::"text", 'member'::"text"])))
);


COMMENT ON TABLE "public"."booking_cleaners" IS 'Per-booking assigned cleaners (roster). Team template rows remain in team_members; this is the job snapshot.';



COMMENT ON COLUMN "public"."booking_cleaners"."completed_at" IS 'When this roster cleaner marked their visit complete (paired / dual-cleaner solo jobs).';



CREATE TABLE IF NOT EXISTS "public"."booking_demand_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_type" "text" NOT NULL,
    "suburb" "text",
    "city" "text",
    "postal_code" "text",
    "location_id" "uuid",
    "service_slug" "text",
    "service_label" "text",
    "requested_date" "text",
    "requested_time" "text",
    "fulfillment_mode" "text",
    "booking_id" "uuid",
    "user_id" "uuid",
    "source" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "booking_demand_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['slot_exhausted'::"text", 'ops_reserve_started'::"text", 'area_review_started'::"text", 'area_review_converted'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "booking_demand_events_fulfillment_mode_check" CHECK ((("fulfillment_mode" IS NULL) OR ("fulfillment_mode" = ANY (ARRAY['instant'::"text", 'ops_assignment'::"text", 'area_review'::"text"]))))
);


CREATE TABLE IF NOT EXISTS "public"."booking_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "text" NOT NULL,
    "step" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "analytics_session_id" "text"
);


COMMENT ON TABLE "public"."booking_events" IS 'Booking funnel: view/next/back/error/exit per session';



COMMENT ON COLUMN "public"."booking_events"."analytics_session_id" IS 'Cross-table analytics session id (browser-stable); pairs with user_events.payload.analytics_session_id';



CREATE TABLE IF NOT EXISTS "public"."booking_lifecycle_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "customer_email" "text" NOT NULL,
    "job_type" "text" NOT NULL,
    "sent_at" timestamp with time zone,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "scheduled_for" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "skipped_reason" "text",
    "processed_at" timestamp with time zone,
    CONSTRAINT "booking_lifecycle_jobs_job_type_check" CHECK (("job_type" = ANY (ARRAY['reminder_24h'::"text", 'review_request'::"text", 'rebook_offer'::"text", 'rebook_reminder'::"text"]))),
    CONSTRAINT "booking_lifecycle_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'sent'::"text", 'cancelled'::"text", 'skipped'::"text", 'failed_retryable'::"text", 'failed_terminal'::"text"])))
);


CREATE TABLE IF NOT EXISTS "public"."booking_line_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "item_type" "text" NOT NULL,
    "slug" "text",
    "name" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "unit_price_cents" integer NOT NULL,
    "total_price_cents" integer NOT NULL,
    "pricing_source" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "earns_cleaner" boolean DEFAULT true NOT NULL,
    "cleaner_earnings_cents" integer,
    CONSTRAINT "booking_line_items_item_type_check" CHECK (("item_type" = ANY (ARRAY['base'::"text", 'room'::"text", 'bathroom'::"text", 'extra'::"text", 'adjustment'::"text"]))),
    CONSTRAINT "booking_line_items_quantity_positive" CHECK (("quantity" >= 1))
);


COMMENT ON TABLE "public"."booking_line_items" IS 'Immutable snapshot of billable components at booking creation time (ZAR minor units = cents).';



COMMENT ON COLUMN "public"."booking_line_items"."pricing_source" IS 'e.g. home_widget_catalog_v1, monthly_bundled_zar_v1';



COMMENT ON COLUMN "public"."booking_line_items"."earns_cleaner" IS 'When true, this line contributes to cleaner share of customer line total (see cleaner_earnings_cents).';



COMMENT ON COLUMN "public"."booking_line_items"."cleaner_earnings_cents" IS 'Frozen cleaner share for this line in cents; set once when booking line earnings are finalized.';



CREATE TABLE IF NOT EXISTS "public"."booking_payment_recovery_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "customer_email" "text" NOT NULL,
    "job_type" "text" NOT NULL,
    "scheduled_for" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "sent_at" timestamp with time zone,
    "processed_at" timestamp with time zone,
    "last_error" "text",
    "skipped_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "booking_payment_recovery_jobs_job_type_check" CHECK (("job_type" = ANY (ARRAY['payment_reminder_1h'::"text", 'payment_reminder_24h'::"text", 'booking_payment_expired'::"text"]))),
    CONSTRAINT "booking_payment_recovery_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'sent'::"text", 'cancelled'::"text", 'skipped'::"text", 'failed_retryable'::"text", 'failed_terminal'::"text"])))
);


COMMENT ON TABLE "public"."booking_payment_recovery_jobs" IS 'Payment recovery emails for unpaid bookings (reminders + expiry notice). Separate from paid-booking lifecycle emails.';



CREATE TABLE IF NOT EXISTS "public"."booking_roster_member_payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "cleaner_id" "uuid" NOT NULL,
    "payout_cents" integer NOT NULL,
    "bonus_cents" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "cleaner_payout_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "booking_roster_member_payouts_bonus_cents_check" CHECK (("bonus_cents" >= 0)),
    CONSTRAINT "booking_roster_member_payouts_payout_cents_check" CHECK (("payout_cents" >= 0))
);


COMMENT ON TABLE "public"."booking_roster_member_payouts" IS 'Non-lead roster member payout basis for paired solo jobs (booking_cleaners, not formal team jobs).';



CREATE TABLE IF NOT EXISTS "public"."booking_service_checklists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "cleaner_id" "uuid" NOT NULL,
    "section_key" "text" NOT NULL,
    "completed" boolean DEFAULT false NOT NULL,
    "completed_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "booking_service_checklists_section_ok" CHECK (("length"(TRIM(BOTH FROM "section_key")) > 0))
);


COMMENT ON TABLE "public"."booking_service_checklists" IS 'MVP execution checklist rows per cleaner per booking section (deep/move premium QA).';



CREATE TABLE IF NOT EXISTS "public"."booking_service_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "cleaner_id" "uuid" NOT NULL,
    "section_key" "text" NOT NULL,
    "photo_type" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "booking_service_photos_path_ok" CHECK (("length"(TRIM(BOTH FROM "storage_path")) > 0)),
    CONSTRAINT "booking_service_photos_section_ok" CHECK (("length"(TRIM(BOTH FROM "section_key")) > 0)),
    CONSTRAINT "booking_service_photos_type_check" CHECK (("lower"(TRIM(BOTH FROM "photo_type")) = ANY (ARRAY['before'::"text", 'after'::"text"])))
);


COMMENT ON TABLE "public"."booking_service_photos" IS 'Optional before/after photo refs (storage bucket booking-service-photos); MVP metadata only.';



CREATE TABLE IF NOT EXISTS "public"."booking_team_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "status" "text",
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


CREATE TABLE IF NOT EXISTS "public"."booking_totals" (
    "booking_id" "uuid" NOT NULL,
    "subtotal_cents" integer,
    "cleaner_earnings_cents" integer,
    "platform_fee_cents" integer,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."booking_totals" IS 'Optional denormalized totals; populated later when reads move off JSON.';



CREATE SEQUENCE IF NOT EXISTS "public"."bookings_reference_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


CREATE TABLE IF NOT EXISTS "public"."business_health_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "score_date" "date" NOT NULL,
    "overall_score" integer NOT NULL,
    "status_label" "text" NOT NULL,
    "metrics" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "recommendations" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "weights" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "business_health_scores_overall_score_check" CHECK ((("overall_score" >= 0) AND ("overall_score" <= 100)))
);


CREATE TABLE IF NOT EXISTS "public"."campaign_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "promotion_id" "uuid" NOT NULL,
    "asset_type" "text" NOT NULL,
    "label" "text" NOT NULL,
    "width" integer,
    "height" integer,
    "image_url" "text",
    "template_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_assets_asset_type_check" CHECK (("asset_type" = ANY (ARRAY['facebook_feed'::"text", 'instagram_feed'::"text", 'instagram_portrait'::"text", 'instagram_story'::"text", 'facebook_story'::"text", 'whatsapp_status'::"text", 'linkedin_banner'::"text", 'twitter_image'::"text", 'pinterest_pin'::"text", 'google_business_cover'::"text", 'widescreen_banner'::"text", 'qr_code'::"text", 'hero'::"text", 'banner'::"text", 'logo'::"text", 'other'::"text"])))
);


CREATE TABLE IF NOT EXISTS "public"."campaign_content" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "promotion_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL,
    "title" "text",
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "hashtags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "cta" "text",
    "html_body" "text",
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "generated_by" "text" DEFAULT 'template'::"text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_content_channel_check" CHECK (("channel" = ANY (ARRAY['facebook'::"text", 'instagram'::"text", 'linkedin'::"text", 'twitter'::"text", 'whatsapp'::"text", 'google_business'::"text", 'email'::"text", 'sms'::"text", 'blog'::"text", 'landing'::"text", 'faq'::"text", 'meta_seo'::"text", 'pinterest'::"text"]))),
    CONSTRAINT "campaign_content_generated_by_check" CHECK (("generated_by" = ANY (ARRAY['template'::"text", 'ai'::"text", 'manual'::"text"]))),
    CONSTRAINT "campaign_content_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'ready'::"text", 'published'::"text", 'archived'::"text"])))
);


CREATE TABLE IF NOT EXISTS "public"."campaign_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text" DEFAULT 'seasonal'::"text" NOT NULL,
    "promotion_type" "text" DEFAULT 'seasonal'::"text" NOT NULL,
    "default_discount_type" "text" DEFAULT 'percent'::"text" NOT NULL,
    "default_discount_value" numeric DEFAULT 10 NOT NULL,
    "default_promo_code_prefix" "text",
    "default_display_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "default_eligibility" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "default_copy_hints" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_templates_category_check" CHECK (("category" = ANY (ARRAY['first_booking'::"text", 'referral'::"text", 'seasonal'::"text", 'birthday'::"text", 'membership'::"text", 'black_friday'::"text", 'christmas'::"text", 'womens_month'::"text", 'spring_cleaning'::"text", 'move_out'::"text", 'airbnb'::"text", 'custom'::"text"])))
);


CREATE TABLE IF NOT EXISTS "public"."cities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "country" "text" DEFAULT 'South Africa'::"text" NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


CREATE TABLE IF NOT EXISTS "public"."city_configs" (
    "city_id" "uuid" NOT NULL,
    "base_price_multiplier" numeric DEFAULT 1.0 NOT NULL,
    "surge_floor" numeric DEFAULT 1.0 NOT NULL,
    "surge_cap" numeric DEFAULT 2.0 NOT NULL,
    "default_availability_start" time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    "default_availability_end" time without time zone DEFAULT '18:00:00'::time without time zone NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


CREATE TABLE IF NOT EXISTS "public"."cleaner_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "location" "text" NOT NULL,
    "experience" "text",
    "availability" "jsonb" DEFAULT '[]'::"jsonb",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "city_id" "uuid",
    "working_areas" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "working_days" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "phone_normalized" "text",
    CONSTRAINT "cleaner_applications_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


COMMENT ON COLUMN "public"."cleaner_applications"."working_areas" IS 'Suburb/location names the applicant is willing to work in (json array of strings).';



COMMENT ON COLUMN "public"."cleaner_applications"."working_days" IS 'Weekdays the applicant can work: mon, tue, wed, thu, fri, sat, sun (json array).';



CREATE TABLE IF NOT EXISTS "public"."cleaner_availability" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cleaner_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "start_time" "text" NOT NULL,
    "end_time" "text" NOT NULL,
    "is_available" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "available_slots" smallint,
    "booked_slots" smallint,
    CONSTRAINT "cleaner_availability_time_fmt" CHECK ((("start_time" ~ '^\d{2}:\d{2}$'::"text") AND ("end_time" ~ '^\d{2}:\d{2}$'::"text")))
);


COMMENT ON COLUMN "public"."cleaner_availability"."available_slots" IS 'Optional cap of bookable slots in this window for marketplace scoring/pricing; NULL if unknown.';



COMMENT ON COLUMN "public"."cleaner_availability"."booked_slots" IS 'Optional count of slots already consumed in this window; NULL if maintained only in app layer.';



CREATE TABLE IF NOT EXISTS "public"."cleaner_booking_track_points" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cleaner_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "lat" numeric NOT NULL,
    "lng" numeric NOT NULL,
    "heading" numeric,
    "speed" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."cleaner_booking_track_points" IS 'Time-series GPS samples for a booking; written by service_role via POST /api/cleaner/location/update.';



CREATE TABLE IF NOT EXISTS "public"."cleaner_change_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cleaner_id" "uuid" NOT NULL,
    "requested_days" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "note" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "text",
    "requested_locations" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "cleaner_change_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


COMMENT ON TABLE "public"."cleaner_change_requests" IS 'Cleaner-submitted preferred service area and weekdays; ops applies to cleaners via approve flow.';



CREATE TABLE IF NOT EXISTS "public"."cleaner_earnings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cleaner_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "amount_cents" integer NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "disbursement_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    CONSTRAINT "cleaner_earnings_amount_cents_check" CHECK (("amount_cents" >= 0)),
    CONSTRAINT "cleaner_earnings_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'processing'::"text", 'paid'::"text"])))
);


COMMENT ON TABLE "public"."cleaner_earnings" IS 'Per-booking earnings ledger from frozen line-item totals; distinct from weekly cleaner_payouts batches.';



COMMENT ON COLUMN "public"."cleaner_earnings"."status" IS 'pending → approved (admin) → processing (claimed for Paystack) → paid (webhook)';



CREATE TABLE IF NOT EXISTS "public"."cleaner_earnings_adjustments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cleaner_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "amount_cents" integer NOT NULL,
    "reason" "text" NOT NULL,
    "dispute_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "created_by_email" "text",
    CONSTRAINT "cleaner_earnings_adjustments_amount_nonzero" CHECK (("amount_cents" <> 0)),
    CONSTRAINT "cleaner_earnings_adjustments_reason_len" CHECK (("char_length"(TRIM(BOTH FROM "reason")) >= 2))
);


COMMENT ON TABLE "public"."cleaner_earnings_adjustments" IS 'Manual earnings deltas (+/- cents) applied outside frozen line-item totals; optional link to dispute.';



COMMENT ON COLUMN "public"."cleaner_earnings_adjustments"."created_by" IS 'auth.users.id of the admin who posted this manual adjustment.';



COMMENT ON COLUMN "public"."cleaner_earnings_adjustments"."created_by_email" IS 'Email captured at insert time so the audit trail survives auth.users deletion.';



CREATE TABLE IF NOT EXISTS "public"."cleaner_earnings_disbursements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cleaner_id" "uuid" NOT NULL,
    "total_amount_cents" integer NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "paystack_transfer_code" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone,
    "paystack_reference" "text",
    "transfer_code" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cleaner_earnings_disbursements_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'paid'::"text", 'failed'::"text"]))),
    CONSTRAINT "cleaner_earnings_disbursements_total_amount_cents_check" CHECK (("total_amount_cents" >= 0))
);


COMMENT ON TABLE "public"."cleaner_earnings_disbursements" IS 'Batch of approved cleaner_earnings sent as one Paystack transfer; status follows transfer lifecycle.';



CREATE TABLE IF NOT EXISTS "public"."cleaner_earnings_disputes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cleaner_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "admin_response" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "reviewed_by_email" "text",
    "reviewed_at" timestamp with time zone,
    "resolved_by" "uuid",
    "resolved_by_email" "text",
    CONSTRAINT "cleaner_earnings_disputes_reason_len" CHECK (("char_length"(TRIM(BOTH FROM "reason")) >= 3)),
    CONSTRAINT "cleaner_earnings_disputes_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'reviewing'::"text", 'resolved'::"text", 'rejected'::"text"])))
);


COMMENT ON TABLE "public"."cleaner_earnings_disputes" IS 'Cleaner-reported earnings issues; does not mutate cleaner_earnings.';



COMMENT ON COLUMN "public"."cleaner_earnings_disputes"."reviewed_by" IS 'auth.users.id of the admin who first transitioned the dispute out of `open`. Stamped once.';



COMMENT ON COLUMN "public"."cleaner_earnings_disputes"."reviewed_by_email" IS 'Email captured at review time so the audit trail survives auth.users deletion.';



COMMENT ON COLUMN "public"."cleaner_earnings_disputes"."reviewed_at" IS 'Timestamp the dispute first transitioned out of `open`. Set once; preserved across re-edits.';



COMMENT ON COLUMN "public"."cleaner_earnings_disputes"."resolved_by" IS 'auth.users.id of the admin who resolved or rejected the dispute. Mirrors `resolved_at`.';



COMMENT ON COLUMN "public"."cleaner_earnings_disputes"."resolved_by_email" IS 'Email captured at resolve time so the audit trail survives auth.users deletion.';



CREATE TABLE IF NOT EXISTS "public"."cleaner_job_issue_report_idempotency" (
    "cleaner_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "key_hash" "text" NOT NULL,
    "report_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL
);


COMMENT ON TABLE "public"."cleaner_job_issue_report_idempotency" IS 'Short-lived mapping from Idempotency-Key to created report; service role only.';



CREATE TABLE IF NOT EXISTS "public"."cleaner_job_issue_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "cleaner_id" "uuid" NOT NULL,
    "reason_key" "text" NOT NULL,
    "detail" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reason_version" "text" DEFAULT 'v1'::"text" NOT NULL,
    "whatsapp_snapshot" "jsonb",
    "idempotency_key" "text",
    "resolved_at" timestamp with time zone,
    "resolved_by" "text",
    CONSTRAINT "cleaner_job_issue_reports_detail_len" CHECK ((("detail" IS NULL) OR ("char_length"("detail") <= 2000))),
    CONSTRAINT "cleaner_job_issue_reports_idempotency_key_len" CHECK ((("idempotency_key" IS NULL) OR ("char_length"("idempotency_key") <= 128))),
    CONSTRAINT "cleaner_job_issue_reports_reason_key_len" CHECK ((("char_length"("reason_key") >= 1) AND ("char_length"("reason_key") <= 64)))
);


COMMENT ON TABLE "public"."cleaner_job_issue_reports" IS 'Cleaner-submitted on-site issues; written via service role from Next API.';



COMMENT ON COLUMN "public"."cleaner_job_issue_reports"."reason_version" IS 'Taxonomy version for reason_key / labels (e.g. v1).';



COMMENT ON COLUMN "public"."cleaner_job_issue_reports"."whatsapp_snapshot" IS 'Ops WhatsApp prefill payload at submit time.';



COMMENT ON COLUMN "public"."cleaner_job_issue_reports"."resolved_at" IS 'When an admin marked the report resolved.';



CREATE TABLE IF NOT EXISTS "public"."cleaner_job_lifecycle_idempotency" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cleaner_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "action" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."cleaner_job_lifecycle_idempotency" IS 'Claims idempotency keys for POST /api/cleaner/jobs/:id lifecycle actions; unique key prevents double application.';



CREATE TABLE IF NOT EXISTS "public"."cleaner_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cleaner_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."cleaner_locations" IS 'Authoritative service areas for a cleaner; eligibility uses this instead of cleaner_preferences.preferred_areas.';



CREATE TABLE IF NOT EXISTS "public"."cleaner_payment_details" (
    "cleaner_id" "uuid" NOT NULL,
    "account_number" "text" NOT NULL,
    "bank_code" "text" NOT NULL,
    "recipient_code" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "account_name" "text" DEFAULT ''::"text" NOT NULL
);


COMMENT ON TABLE "public"."cleaner_payment_details" IS 'Cleaner bank details used by server-side payout transfer code. No client RLS policies by default.';



CREATE TABLE IF NOT EXISTS "public"."cleaner_payout_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "total_amount_cents" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "paystack_batch_ref" "text",
    CONSTRAINT "cleaner_payout_runs_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'approved'::"text", 'processing'::"text", 'paid'::"text"]))),
    CONSTRAINT "cleaner_payout_runs_total_amount_cents_check" CHECK (("total_amount_cents" >= 0))
);


COMMENT ON TABLE "public"."cleaner_payout_runs" IS 'Admin-controlled disbursement batch grouping multiple cleaner_payouts weekly rows before execution.';



COMMENT ON COLUMN "public"."cleaner_payout_runs"."paystack_batch_ref" IS 'Stable idempotency key / batch label for this disbursement run (not Paystack transfer_code).';



CREATE TABLE IF NOT EXISTS "public"."cleaner_payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cleaner_id" "uuid" NOT NULL,
    "total_amount_cents" integer NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone,
    "approved_at" timestamp with time zone,
    "approved_by" "uuid",
    "payment_reference" "text",
    "payment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payout_run_id" "uuid",
    "frozen_at" timestamp with time zone,
    "calculated_amount_cents" integer,
    "adjustment_note" "text",
    "amount_adjusted_at" timestamp with time zone,
    "amount_adjusted_by" "uuid",
    "created_by" "uuid",
    CONSTRAINT "cleaner_payouts_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'success'::"text", 'failed'::"text", 'partial_failed'::"text"]))),
    CONSTRAINT "cleaner_payouts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'frozen'::"text", 'approved'::"text", 'paid'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "cleaner_payouts_total_amount_cents_check" CHECK (("total_amount_cents" >= 0))
);


COMMENT ON TABLE "public"."cleaner_payouts" IS 'Weekly (or batched) cleaner pay runs; bookings link via payout_id.';



COMMENT ON COLUMN "public"."cleaner_payouts"."period_start" IS 'Inclusive start (UTC date) of the weekly batch window. Together with period_end and cleaner_id, forms the canonical batch identity enforced by cleaner_payouts_unique_active_period_idx.';



COMMENT ON COLUMN "public"."cleaner_payouts"."period_end" IS 'Inclusive end (UTC date) of the weekly batch window. Together with period_start and cleaner_id, forms the canonical batch identity enforced by cleaner_payouts_unique_active_period_idx.';



COMMENT ON COLUMN "public"."cleaner_payouts"."approved_at" IS 'Set when an admin approves this payout batch for payment.';



COMMENT ON COLUMN "public"."cleaner_payouts"."approved_by" IS 'Auth user id of the admin who approved this payout batch.';



COMMENT ON COLUMN "public"."cleaner_payouts"."payment_reference" IS 'Paystack transfer code/reference for the approved payout batch.';



COMMENT ON COLUMN "public"."cleaner_payouts"."payment_status" IS 'Paystack execution state; payout status remains the source of truth.';



COMMENT ON COLUMN "public"."cleaner_payouts"."payout_run_id" IS 'Disbursement batch run (`cleaner_payout_runs`); unrelated to `bookings.payout_run_id`.';



COMMENT ON COLUMN "public"."cleaner_payouts"."frozen_at" IS 'When this weekly payout row was frozen for batching; amount/cleaner/period must not change after this is set.';



COMMENT ON COLUMN "public"."cleaner_payouts"."calculated_amount_cents" IS 'Auto-sum from linked bookings at batch creation; immutable after insert.';



COMMENT ON COLUMN "public"."cleaner_payouts"."adjustment_note" IS 'Admin note when total_amount_cents was manually changed before approval.';



COMMENT ON COLUMN "public"."cleaner_payouts"."amount_adjusted_at" IS 'When an admin last edited total_amount_cents on a pending/frozen batch.';



COMMENT ON COLUMN "public"."cleaner_payouts"."amount_adjusted_by" IS 'Admin user who last edited total_amount_cents on a pending/frozen batch.';



COMMENT ON COLUMN "public"."cleaner_payouts"."created_by" IS 'Auth user id of admin who generated the batch (null for cron/system). Used for optional maker–checker.';



CREATE TABLE IF NOT EXISTS "public"."cleaner_preferences" (
    "cleaner_id" "uuid" NOT NULL,
    "preferred_areas" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "preferred_services" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "preferred_time_blocks" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_strict" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."cleaner_preferences" IS 'Optional dispatch tuning: preferred areas (location ids), services, weekly time blocks; strict mode excludes non-matching jobs.';



COMMENT ON COLUMN "public"."cleaner_preferences"."preferred_areas" IS 'Location UUID strings (matches public.locations.id) the cleaner prefers.';



COMMENT ON COLUMN "public"."cleaner_preferences"."preferred_services" IS 'Service slugs (e.g. standard, deep) aligned with bookings.service_slug.';



COMMENT ON COLUMN "public"."cleaner_preferences"."preferred_time_blocks" IS 'JSON array of { "day": 0-6 (Sun-Sat UTC), "start": "HH:MM", "end": "HH:MM" }.';



COMMENT ON COLUMN "public"."cleaner_preferences"."is_strict" IS 'When true, cleaners are excluded from dispatch if the job violates any configured preference dimension.';



CREATE TABLE IF NOT EXISTS "public"."cleaner_report_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_type" "text" NOT NULL,
    "cleaner_id" "uuid" NOT NULL,
    "subject" "text",
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "admin_response" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "reviewed_by_email" "text",
    "reviewed_at" timestamp with time zone,
    "resolved_by" "uuid",
    "resolved_by_email" "text",
    CONSTRAINT "cleaner_report_feedback_message_len" CHECK (("char_length"(TRIM(BOTH FROM "message")) >= 10)),
    CONSTRAINT "cleaner_report_feedback_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'reviewing'::"text", 'resolved'::"text", 'closed'::"text"]))),
    CONSTRAINT "cleaner_report_feedback_subject_len" CHECK ((("subject" IS NULL) OR ("char_length"(TRIM(BOTH FROM "subject")) <= 120))),
    CONSTRAINT "cleaner_report_feedback_submission_type_check" CHECK (("submission_type" = ANY (ARRAY['report'::"text", 'feedback'::"text"])))
);


COMMENT ON TABLE "public"."cleaner_report_feedback" IS 'Cleaner reports (anonymous to admins) and feedback (identity visible to admins). cleaner_id is stored for abuse prevention but must not be exposed for report rows in admin APIs.';



COMMENT ON COLUMN "public"."cleaner_report_feedback"."submission_type" IS 'report = anonymous to ops; feedback = cleaner identity shown to admins.';



CREATE TABLE IF NOT EXISTS "public"."cleaners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "auth_user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'offline'::"text",
    "rating" numeric DEFAULT 5,
    "jobs_completed" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "phone_number" "text",
    "home_lat" double precision,
    "home_lng" double precision,
    "latitude" double precision,
    "longitude" double precision,
    "location" "text",
    "is_available" boolean DEFAULT true,
    "availability_start" time without time zone,
    "availability_end" time without time zone,
    "acceptance_rate_recent" real DEFAULT 1.0,
    "tier" "text" DEFAULT 'bronze'::"text",
    "priority_score" double precision DEFAULT 0,
    "city_id" "uuid",
    "location_id" "uuid",
    "marketplace_outcome_ema" double precision,
    "marketplace_outcome_samples" integer DEFAULT 0 NOT NULL,
    "review_count" integer DEFAULT 0 NOT NULL,
    "needs_quality_review" boolean DEFAULT false NOT NULL,
    "availability_weekdays" "text"[] DEFAULT ARRAY['mon'::"text", 'tue'::"text", 'wed'::"text", 'thu'::"text", 'fri'::"text", 'sat'::"text", 'sun'::"text"] NOT NULL,
    "referral_code" "text",
    "bonus_payout_zar" numeric DEFAULT 0 NOT NULL,
    "referral_code_expires_at" timestamp with time zone,
    "referral_code_max_uses" integer,
    "last_active_at" timestamp with time zone,
    "can_do_deep_cleaning" boolean DEFAULT true NOT NULL,
    "can_do_move_cleaning" boolean DEFAULT true NOT NULL,
    "total_offers" integer DEFAULT 0 NOT NULL,
    "accepted_offers" integer DEFAULT 0 NOT NULL,
    "acceptance_rate" real DEFAULT 1.0 NOT NULL,
    "joined_at" timestamp with time zone,
    CONSTRAINT "cleaners_review_count_check" CHECK (("review_count" >= 0))
);


COMMENT ON TABLE "public"."cleaners" IS 'Cleaning professionals; link Supabase Auth via auth_user_id only.';



COMMENT ON COLUMN "public"."cleaners"."id" IS 'Surrogate row id; not tied to auth.users.';



COMMENT ON COLUMN "public"."cleaners"."auth_user_id" IS 'Supabase Auth user id for password login and admin APIs.';



COMMENT ON COLUMN "public"."cleaners"."jobs_completed" IS 'Count of completed jobs for this cleaner.';



COMMENT ON COLUMN "public"."cleaners"."is_active" IS 'When false, cleaner is excluded from auto-dispatch and roster marketing.';



COMMENT ON COLUMN "public"."cleaners"."phone_number" IS 'Canonical phone for lookups; mirrors phone when unset.';



COMMENT ON COLUMN "public"."cleaners"."home_lat" IS 'Approximate latitude for routing.';



COMMENT ON COLUMN "public"."cleaners"."home_lng" IS 'Approximate longitude for routing.';



COMMENT ON COLUMN "public"."cleaners"."marketplace_outcome_ema" IS 'Exponential moving average of assignment outcome scores (0–1); feeds marketplace scoring when set.';



COMMENT ON COLUMN "public"."cleaners"."marketplace_outcome_samples" IS 'Count of completed jobs used to build marketplace_outcome_ema.';



COMMENT ON COLUMN "public"."cleaners"."review_count" IS 'Number of reviews; kept in sync with reviews by refresh_cleaner_rating.';



COMMENT ON COLUMN "public"."cleaners"."needs_quality_review" IS 'When true (rating < 3.5 with review_count >= 5), dispatch score is further reduced; clear when metrics recover.';



COMMENT ON COLUMN "public"."cleaners"."availability_weekdays" IS 'Lowercase mon..sun; which weekdays ops may assign this cleaner. Cleaners cannot self-edit; use admin.';



COMMENT ON COLUMN "public"."cleaners"."last_active_at" IS 'Last meaningful cleaner-app activity (optional; used for dispatch ranking).';



COMMENT ON COLUMN "public"."cleaners"."can_do_deep_cleaning" IS 'When false, cleaner must not be offered deep-cleaning jobs (dispatch eligibility).';



COMMENT ON COLUMN "public"."cleaners"."can_do_move_cleaning" IS 'When false, cleaner must not be offered move-in/out jobs (dispatch eligibility).';



COMMENT ON COLUMN "public"."cleaners"."total_offers" IS 'Lifetime dispatch offers sent to this cleaner (atomic counter via dispatch_cleaner_offer_sent).';



COMMENT ON COLUMN "public"."cleaners"."accepted_offers" IS 'Lifetime dispatch offers accepted by this cleaner (atomic counter via dispatch_cleaner_offer_accepted).';



COMMENT ON COLUMN "public"."cleaners"."acceptance_rate" IS 'accepted_offers / total_offers; defaults to 1 until first offer.';



COMMENT ON COLUMN "public"."cleaners"."joined_at" IS 'Tenure anchor for canonical cleaner payout. App code reads (joined_at ?? created_at) in persistCleanerPayout, computeBookingEarnings, tenureBasedCleanerLineShare. Required before persistCleanerPayoutIfUnset can populate bookings.display_earnings_cents.';



CREATE TABLE IF NOT EXISTS "public"."conversion_deferred_payment_link_emails" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "run_at" timestamp with time zone NOT NULL,
    "email_payload" "jsonb" NOT NULL,
    "phone" "text",
    "wa_payload" "jsonb",
    "delivery_context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone,
    "last_error" "text"
);


COMMENT ON TABLE "public"."conversion_deferred_payment_link_emails" IS 'Queued payment-link emails (e.g. experiment delay); worker sends at run_at and may SMS-fallback on failure.';



CREATE TABLE IF NOT EXISTS "public"."conversion_experiment_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "experiment_key" "text" NOT NULL,
    "variant" "text" NOT NULL,
    "subject_id" "text" NOT NULL,
    "user_id" "uuid",
    "booking_id" "uuid",
    "converted" boolean DEFAULT false NOT NULL,
    "revenue_cents" bigint DEFAULT 0 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "conversion_experiment_results_revenue_cents_check" CHECK (("revenue_cents" >= 0))
);


COMMENT ON TABLE "public"."conversion_experiment_results" IS 'Post-payment (or funnel) outcomes attributed to conversion experiments; subject_id matches ai_experiment_exposures.subject_id.';



CREATE TABLE IF NOT EXISTS "public"."conversion_experiments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "variant" "text" NOT NULL,
    "rollout_percentage" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "conversion_experiments_rollout_percentage_check" CHECK ((("rollout_percentage" >= 0) AND ("rollout_percentage" <= 100))),
    CONSTRAINT "conversion_experiments_variant_check" CHECK (("variant" = ANY (ARRAY['control'::"text", 'variant_a'::"text", 'variant_b'::"text"])))
);


COMMENT ON TABLE "public"."conversion_experiments" IS 'Conversion optimization experiment arms; rollout_percentage is share of traffic for that arm (sum per key should be 100).';



CREATE TABLE IF NOT EXISTS "public"."cron_http_targets" (
    "singleton" boolean DEFAULT true NOT NULL,
    "app_base_url" "text" DEFAULT 'https://YOUR_DOMAIN'::"text" NOT NULL,
    "cron_secret" "text" DEFAULT 'YOUR_CRON_SECRET'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cron_http_targets_singleton_check" CHECK ("singleton")
);


COMMENT ON TABLE "public"."cron_http_targets" IS 'Production origin + CRON_SECRET for pg_net → Next.js /api/cron/* (service_role only).';



CREATE TABLE IF NOT EXISTS "public"."cron_run_leases" (
    "job_name" "text" NOT NULL,
    "holder_id" "uuid" NOT NULL,
    "acquired_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    CONSTRAINT "cron_run_leases_expiry_after_acquire" CHECK (("expires_at" > "acquired_at")),
    CONSTRAINT "cron_run_leases_job_name_nonempty" CHECK (("char_length"("btrim"("job_name")) > 0))
);


COMMENT ON TABLE "public"."cron_run_leases" IS 'H-15: per-cron-job advisory leases. One row per `job_name`; `holder_id` identifies the active runner; `expires_at` is the lease TTL. Used by withCronLock to prevent overlap between schedulers (Vercel + Supabase pg_cron).';



CREATE TABLE IF NOT EXISTS "public"."cron_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_name" "text" NOT NULL,
    "status" "text" NOT NULL,
    "message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cron_runs_status_check" CHECK (("status" = ANY (ARRAY['success'::"text", 'error'::"text"])))
);


COMMENT ON TABLE "public"."cron_runs" IS 'HTTP cron outcomes (recurring generator/charger and future jobs); written by API routes via service role.';



CREATE TABLE IF NOT EXISTS "public"."customer_contact_health" (
    "phone_key" "text" NOT NULL,
    "success_rate" double precision NOT NULL,
    "sample_size" integer NOT NULL,
    "last_updated" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "customer_contact_health_sample_size_check" CHECK ((("sample_size" >= 0) AND ("sample_size" <= 50))),
    CONSTRAINT "customer_contact_health_success_rate_check" CHECK ((("success_rate" >= (0)::double precision) AND ("success_rate" <= (1)::double precision)))
);


COMMENT ON TABLE "public"."customer_contact_health" IS 'Rolling customer outbound health by normalized phone_key (E.164 preferred, else digits:lastN).';



COMMENT ON COLUMN "public"."customer_contact_health"."phone_key" IS 'Canonical key: E.164 when known, else digits:<suffix> for legacy/local recipient strings.';



CREATE TABLE IF NOT EXISTS "public"."customer_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "current_period_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "current_period_end" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "pause_reason" "text",
    "savings_to_date_zar" numeric DEFAULT 0 NOT NULL,
    "preferred_cleaner_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "customer_memberships_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'cancelled'::"text", 'expired'::"text", 'past_due'::"text"])))
);


CREATE TABLE IF NOT EXISTS "public"."customer_saved_addresses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "line1" "text" NOT NULL,
    "suburb" "text" DEFAULT ''::"text" NOT NULL,
    "city" "text" DEFAULT 'Cape Town'::"text" NOT NULL,
    "postal_code" "text" DEFAULT ''::"text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text"
);


COMMENT ON TABLE "public"."customer_saved_addresses" IS 'Customer saved service addresses; RLS by user_id.';



COMMENT ON COLUMN "public"."customer_saved_addresses"."notes" IS 'Optional property-level instructions; distinct from per-booking notes.';



CREATE TABLE IF NOT EXISTS "public"."customer_segment" (
    "user_id" "uuid" NOT NULL,
    "segment" "text" NOT NULL,
    "city_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "customer_segment_segment_check" CHECK (("segment" = ANY (ARRAY['new'::"text", 'repeat'::"text", 'loyal'::"text", 'churned'::"text"])))
);


COMMENT ON TABLE "public"."customer_segment" IS 'Marketing/pricing segment per customer (Phase 4 growth engine).';



CREATE TABLE IF NOT EXISTS "public"."daily_booking_funnel_metrics" (
    "day" "date" NOT NULL,
    "quote_starts" integer DEFAULT 0 NOT NULL,
    "payment_reached" integer DEFAULT 0 NOT NULL,
    "booking_completed_signals" integer DEFAULT 0 NOT NULL,
    "paystack_opened" integer DEFAULT 0 NOT NULL,
    "paystack_completed" integer DEFAULT 0 NOT NULL,
    "unique_sessions" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."daily_booking_funnel_metrics" IS 'Pre-aggregated booking funnel KPIs; populate via cron from booking_events + user_events.';



CREATE TABLE IF NOT EXISTS "public"."daily_conversion_metrics" (
    "day" "date" NOT NULL,
    "booking_started" integer DEFAULT 0 NOT NULL,
    "booking_completed" integer DEFAULT 0 NOT NULL,
    "payment_initiated" integer DEFAULT 0 NOT NULL,
    "payment_completed" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."daily_conversion_metrics" IS 'Pre-aggregated conversion counts from user_events canonical types.';



CREATE TABLE IF NOT EXISTS "public"."daily_payment_metrics" (
    "day" "date" NOT NULL,
    "paystack_opened" integer DEFAULT 0 NOT NULL,
    "payment_failed_signals" integer DEFAULT 0 NOT NULL,
    "abandonment_pct" numeric,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."daily_payment_metrics" IS 'Payment funnel health snapshot per UTC day.';



CREATE TABLE IF NOT EXISTS "public"."daily_service_metrics" (
    "day" "date" NOT NULL,
    "service_slug" "text" DEFAULT ''::"text" NOT NULL,
    "booking_starts" integer DEFAULT 0 NOT NULL,
    "completions" integer DEFAULT 0 NOT NULL,
    "revenue_zar" numeric DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."daily_service_metrics" IS 'Per-service conversion/revenue rollup per day.';



CREATE TABLE IF NOT EXISTS "public"."dispatch_experiment_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "week_start" "date" NOT NULL,
    "ux_variant" "text" NOT NULL,
    "p95_time_to_accept_ms" double precision,
    "accept_rate" double precision,
    "offers_per_booking" double precision,
    "resolved_offers" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dispatch_experiment_snapshots_ux_variant_check" CHECK (("ux_variant" = ANY (ARRAY['control'::"text", 'sound_on'::"text", 'high_urgency'::"text", 'cta_v2'::"text"])))
);


COMMENT ON TABLE "public"."dispatch_experiment_snapshots" IS 'Point-in-time dispatch experiment KPIs by calendar week and ux_variant; optional trend store (writer: service role / cron).';



CREATE TABLE IF NOT EXISTS "public"."dispatch_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "level" "text" DEFAULT 'info'::"text" NOT NULL,
    "message" "text",
    "context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dispatch_logs_level_check" CHECK (("level" = ANY (ARRAY['debug'::"text", 'info'::"text", 'warn'::"text", 'error'::"text"])))
);


COMMENT ON TABLE "public"."dispatch_logs" IS 'Dispatch/cron diagnostics: written from SQL maintenance functions; safe to truncate.';



CREATE TABLE IF NOT EXISTS "public"."dispatch_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "cleaner_id" "uuid" NOT NULL,
    "time_to_accept_ms" integer NOT NULL,
    "offers_sent" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dispatch_metrics_offers_sent_check" CHECK (("offers_sent" >= 0)),
    CONSTRAINT "dispatch_metrics_time_to_accept_ms_check" CHECK (("time_to_accept_ms" >= 0))
);


COMMENT ON TABLE "public"."dispatch_metrics" IS 'Dispatch v2: one row per successful marketplace accept (KPI / fairness).';



CREATE TABLE IF NOT EXISTS "public"."dispatch_offer_exposure_dedupe" (
    "offer_id" "uuid" NOT NULL,
    "inserted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."dispatch_offer_exposure_dedupe" IS 'Insert-once row per offer for exposure metric dedupe (Postgres fallback when Redis is not configured).';



CREATE TABLE IF NOT EXISTS "public"."dispatch_offer_timeout_metric_emitted" (
    "offer_id" "uuid" NOT NULL,
    "emitted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."dispatch_offer_timeout_metric_emitted" IS 'At-most-once dispatch.offer.timeout per offer (poll deadline + SQL expire reconcile).';



CREATE TABLE IF NOT EXISTS "public"."dispatch_offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "cleaner_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "rank_index" smallint DEFAULT 0 NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responded_at" timestamp with time zone,
    "ux_variant" "text",
    "offer_whatsapp_message_id" "text",
    "whatsapp_sent_at" timestamp with time zone,
    "response_latency_ms" integer,
    "first_read_at" timestamp with time zone,
    "first_delivered_at" timestamp with time zone,
    "offer_token" "text",
    "sms_sent_at" timestamp with time zone,
    "dispatch_tier" "text",
    "dispatch_visible_at" timestamp with time zone,
    "dispatch_tier_window_end_at" timestamp with time zone,
    "offer_notification_deferred" boolean DEFAULT false NOT NULL,
    "batch_id" "uuid",
    "priority_score" numeric DEFAULT 0 NOT NULL,
    "sent_rank" integer,
    "attempts" integer DEFAULT 0 NOT NULL,
    "display_earnings_cents" integer,
    "earnings_snapshot_source" "text",
    "earnings_snapshot_at" timestamp with time zone,
    "offer_type" "text",
    "sent_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "declined_at" timestamp with time zone,
    "expired_at" timestamp with time zone,
    "reason" "text",
    CONSTRAINT "ck_dispatch_offers_ux_variant" CHECK ((("ux_variant" IS NULL) OR ("ux_variant" = ANY (ARRAY['control'::"text", 'sound_on'::"text", 'high_urgency'::"text", 'cta_v2'::"text"])))),
    CONSTRAINT "dispatch_offers_dispatch_tier_check" CHECK ((("dispatch_tier" IS NULL) OR ("dispatch_tier" = ANY (ARRAY['A'::"text", 'B'::"text", 'C'::"text"])))),
    CONSTRAINT "dispatch_offers_display_earnings_cents_check" CHECK ((("display_earnings_cents" IS NULL) OR ("display_earnings_cents" >= 0))),
    CONSTRAINT "dispatch_offers_offer_type_check" CHECK ((("offer_type" IS NULL) OR ("offer_type" = ANY (ARRAY['preferred'::"text", 'backup'::"text"])))),
    CONSTRAINT "dispatch_offers_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text", 'declined'::"text", 'expired'::"text", 'skipped'::"text"])))
);


COMMENT ON TABLE "public"."dispatch_offers" IS 'Soft assign: multiple pending offers per booking (race); unique pending per (booking, cleaner).';



COMMENT ON COLUMN "public"."dispatch_offers"."ux_variant" IS 'A/B UI cell assigned at offer creation (e.g. control, sound_on). Used for analytics and client rendering.';



COMMENT ON COLUMN "public"."dispatch_offers"."offer_whatsapp_message_id" IS 'Meta outbound message id (wamid) for the booking_offer template; matches inbound context.id when cleaner replies in-thread.';



COMMENT ON COLUMN "public"."dispatch_offers"."whatsapp_sent_at" IS 'When the offer WhatsApp was successfully sent to Meta (for response latency vs responded_at).';



COMMENT ON COLUMN "public"."dispatch_offers"."response_latency_ms" IS 'Cleaner reply latency from whatsapp_sent_at (fallback created_at) to accept/reject.';



COMMENT ON COLUMN "public"."dispatch_offers"."first_read_at" IS 'First time Meta reported read receipt for this offer outbound wamid (Phase 8D).';



COMMENT ON COLUMN "public"."dispatch_offers"."first_delivered_at" IS 'First Meta delivered webhook time for this offer wamid (Phase 8E escalation).';



COMMENT ON COLUMN "public"."dispatch_offers"."offer_token" IS 'Unguessable token for /offer/{token} SMS links; unique when set.';



COMMENT ON COLUMN "public"."dispatch_offers"."sms_sent_at" IS 'When the dispatch-offer SMS was accepted by Twilio; used as response latency anchor when WhatsApp is unused.';



COMMENT ON COLUMN "public"."dispatch_offers"."dispatch_tier" IS 'Smart dispatch wave: A (first exclusivity), B, C (broadcast). Null = legacy row.';



COMMENT ON COLUMN "public"."dispatch_offers"."dispatch_visible_at" IS 'Offer is hidden from cleaner APIs until this time (null = visible immediately).';



COMMENT ON COLUMN "public"."dispatch_offers"."dispatch_tier_window_end_at" IS 'End of exclusive window for this tier wave (analytics).';



COMMENT ON COLUMN "public"."dispatch_offers"."offer_notification_deferred" IS 'True when WhatsApp/SMS is deferred until dispatch_visible_at (cron flush).';



COMMENT ON COLUMN "public"."dispatch_offers"."batch_id" IS 'Shared id for one dispatch wave (parallel or ranked batch).';



COMMENT ON COLUMN "public"."dispatch_offers"."priority_score" IS 'Pre-offer composite ranking score (Dispatch v2).';



COMMENT ON COLUMN "public"."dispatch_offers"."sent_rank" IS '0-based order within batch when offers were sent.';



COMMENT ON COLUMN "public"."dispatch_offers"."attempts" IS 'Dispatch attempt / wave number when the row was created.';



COMMENT ON COLUMN "public"."dispatch_offers"."display_earnings_cents" IS 'Per-(booking, cleaner) cleaner share snapshot in ZAR cents, written at offer creation by createDispatchOfferRow. Read by /api/cleaner/offers before falling back to previewDisplayEarningsCentsForCleanerJob. Never overwritten by snapshot writes once non-null.';



COMMENT ON COLUMN "public"."dispatch_offers"."earnings_snapshot_source" IS 'Stable source code from computeCleanerOfferEarningsSnapshot (canonical | cleaner_tenure_unknown | missing_payment_basis | missing_appointment_instant). Diagnostics only — UI does not branch on this.';



COMMENT ON COLUMN "public"."dispatch_offers"."earnings_snapshot_at" IS 'When the snapshot was written. Null for offers created before this column existed; the repair script backfills these.';



COMMENT ON COLUMN "public"."dispatch_offers"."offer_type" IS 'preferred = customer pick; backup = auto-dispatch wave after preferred window.';



COMMENT ON COLUMN "public"."dispatch_offers"."sent_at" IS 'When the offer was sent (may differ from created_at when deferred).';



CREATE TABLE IF NOT EXISTS "public"."dispatch_retry_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "retries_done" smallint DEFAULT 0 NOT NULL,
    "next_retry_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "last_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dispatch_retry_queue_retries_done_check" CHECK ((("retries_done" >= 0) AND ("retries_done" <= 10))),
    CONSTRAINT "dispatch_retry_queue_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'done'::"text", 'abandoned'::"text"])))
);


COMMENT ON TABLE "public"."dispatch_retry_queue" IS 'Auto-assign backoff: 2m / 5m / 10m gaps; processed by service-role cron.';



CREATE TABLE IF NOT EXISTS "public"."earnings_disbursement_transfers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "disbursement_id" "uuid" NOT NULL,
    "cleaner_id" "uuid" NOT NULL,
    "amount_cents" integer NOT NULL,
    "recipient_code" "text",
    "transfer_code" "text",
    "reference" "text" NOT NULL,
    "status" "text" NOT NULL,
    "error" "text",
    "webhook_payload" "jsonb",
    "webhook_processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "earnings_disbursement_transfers_amount_cents_check" CHECK (("amount_cents" > 0)),
    CONSTRAINT "earnings_disbursement_transfers_status_check" CHECK (("status" = ANY (ARRAY['processing'::"text", 'success'::"text", 'failed'::"text"])))
);


COMMENT ON TABLE "public"."earnings_disbursement_transfers" IS 'Paystack transfer attempts for cleaner_earnings_disbursements; webhook matches transfer_code.';



CREATE TABLE IF NOT EXISTS "public"."email_campaign_sends" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "recipient_email" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "skip_reason" "text",
    "opened_at" timestamp with time zone,
    "clicked_at" timestamp with time zone,
    "bounced_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_campaign_sends_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text", 'bounced'::"text", 'skipped'::"text"])))
);


CREATE TABLE IF NOT EXISTS "public"."email_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_type" "text" DEFAULT 'referral_monthly'::"text" NOT NULL,
    "name" "text" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "schedule_cron" "text" DEFAULT '0 9 1 * *'::"text" NOT NULL,
    "subject_template" "text" DEFAULT 'Share Shalean & earn Cleaning Credit!'::"text" NOT NULL,
    "body_html_template" "text" NOT NULL,
    "audience_filter" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_campaigns_campaign_type_check" CHECK (("campaign_type" = ANY (ARRAY['referral_monthly'::"text", 'birthday'::"text", 'seasonal'::"text", 'review_request'::"text", 'booking_reminder'::"text", 'win_back'::"text"])))
);


CREATE TABLE IF NOT EXISTS "public"."expense_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "account_type" "text" DEFAULT 'bank'::"text" NOT NULL,
    "balance_cents" integer DEFAULT 0 NOT NULL,
    "external_accounting_id" "text",
    "sync_status" "text" DEFAULT 'not_synced'::"text" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "expense_accounts_account_type_check" CHECK (("account_type" = ANY (ARRAY['bank'::"text", 'petty_cash'::"text", 'card'::"text", 'paystack'::"text", 'other'::"text"]))),
    CONSTRAINT "expense_accounts_balance_cents_check" CHECK (("balance_cents" >= 0)),
    CONSTRAINT "expense_accounts_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['not_synced'::"text", 'pending'::"text", 'synced'::"text", 'failed'::"text"])))
);


COMMENT ON TABLE "public"."expense_accounts" IS 'Accounts expenses are paid from (business bank, petty cash, etc.).';



COMMENT ON COLUMN "public"."expense_accounts"."account_type" IS 'bank | petty_cash | card | paystack | other';



COMMENT ON COLUMN "public"."expense_accounts"."balance_cents" IS 'Current balance in cents (manually updated or reconciled).';



CREATE TABLE IF NOT EXISTS "public"."expense_approval_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "expense_id" "uuid" NOT NULL,
    "stage" "text" NOT NULL,
    "action" "text" NOT NULL,
    "actor_id" "uuid",
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "expense_approval_events_action_check" CHECK (("action" = ANY (ARRAY['approved'::"text", 'rejected'::"text", 'submitted'::"text"]))),
    CONSTRAINT "expense_approval_events_stage_check" CHECK (("stage" = ANY (ARRAY['finance'::"text", 'manager'::"text", 'owner'::"text"])))
);


CREATE TABLE IF NOT EXISTS "public"."expense_approval_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stage" "text" NOT NULL,
    "min_amount_cents" integer DEFAULT 0 NOT NULL,
    "max_amount_cents" integer,
    "label" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "expense_approval_limits_min_amount_cents_check" CHECK (("min_amount_cents" >= 0)),
    CONSTRAINT "expense_approval_limits_stage_check" CHECK (("stage" = ANY (ARRAY['finance'::"text", 'manager'::"text", 'owner'::"text"])))
);


COMMENT ON TABLE "public"."expense_approval_limits" IS 'Expense amount thresholds for multi-level approval. Manager required >= R5,000; Owner >= R50,000.';



CREATE TABLE IF NOT EXISTS "public"."expense_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_name" "text" NOT NULL,
    "name" "text" NOT NULL,
    "is_system" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."expense_categories" IS 'Operating expense categories grouped by department (Staff, Transport, etc.).';



CREATE TABLE IF NOT EXISTS "public"."expense_vendors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "contact_person" "text",
    "phone" "text",
    "email" "text",
    "address" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "external_accounting_id" "text",
    "sync_status" "text" DEFAULT 'not_synced'::"text" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "sync_errors" "text",
    CONSTRAINT "expense_vendors_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['not_synced'::"text", 'pending'::"text", 'synced'::"text", 'failed'::"text"])))
);


COMMENT ON TABLE "public"."expense_vendors" IS 'Vendors/suppliers for operating expenses.';



CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "expense_date" "date" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "amount_cents" integer NOT NULL,
    "payment_method" "text" NOT NULL,
    "paid_from_account_id" "uuid",
    "vendor_id" "uuid",
    "branch_id" "uuid" NOT NULL,
    "booking_id" "uuid",
    "receipt_path" "text",
    "receipt_mime" "text",
    "notes" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "rejection_reason" "text",
    "created_by" "uuid",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "external_accounting_id" "text",
    "sync_status" "text" DEFAULT 'not_synced'::"text" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approval_stage" "text" DEFAULT 'finance'::"text" NOT NULL,
    "recurring_expense_id" "uuid",
    "processing_fees_cents" integer DEFAULT 0 NOT NULL,
    "platform_fees_cents" integer DEFAULT 0 NOT NULL,
    "payment_transaction_id" "uuid",
    "sync_errors" "text",
    CONSTRAINT "expenses_amount_cents_check" CHECK (("amount_cents" > 0)),
    CONSTRAINT "expenses_approval_stage_check" CHECK (("approval_stage" = ANY (ARRAY['finance'::"text", 'manager'::"text", 'owner'::"text", 'complete'::"text", 'rejected'::"text"]))),
    CONSTRAINT "expenses_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['cash'::"text", 'card'::"text", 'bank_transfer'::"text", 'paystack'::"text", 'eft'::"text", 'other'::"text"]))),
    CONSTRAINT "expenses_platform_fees_cents_check" CHECK (("platform_fees_cents" >= 0)),
    CONSTRAINT "expenses_processing_fees_cents_check" CHECK (("processing_fees_cents" >= 0)),
    CONSTRAINT "expenses_rejection_reason_when_rejected" CHECK ((("status" <> 'rejected'::"text") OR (("rejection_reason" IS NOT NULL) AND ("length"(TRIM(BOTH FROM "rejection_reason")) > 0)))),
    CONSTRAINT "expenses_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "expenses_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['not_synced'::"text", 'pending'::"text", 'synced'::"text", 'failed'::"text"])))
);


COMMENT ON TABLE "public"."expenses" IS 'Operating expenses with approval workflow; only approved rows affect profit.';



COMMENT ON COLUMN "public"."expenses"."branch_id" IS 'Branch = city (multi-city operations).';



COMMENT ON COLUMN "public"."expenses"."external_accounting_id" IS 'Zoho Books expense ID when synced.';



CREATE TABLE IF NOT EXISTS "public"."failed_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


CREATE TABLE IF NOT EXISTS "public"."faqs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "question" "text" NOT NULL,
    "answer" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."faqs" IS 'Marketing FAQ content for homepage + JSON-LD FAQPage.';



CREATE TABLE IF NOT EXISTS "public"."finance_budget_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "budget_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "branch_id" "uuid",
    "vendor_id" "uuid",
    "amount_cents" integer NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "service_slug" "text",
    "is_total_line" boolean DEFAULT false NOT NULL,
    CONSTRAINT "finance_budget_lines_amount_cents_check" CHECK (("amount_cents" > 0)),
    CONSTRAINT "finance_budget_lines_target_check" CHECK ((("is_total_line" = true) OR ("category_id" IS NOT NULL) OR ("branch_id" IS NOT NULL) OR ("vendor_id" IS NOT NULL) OR ("service_slug" IS NOT NULL)))
);


CREATE TABLE IF NOT EXISTS "public"."finance_budgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "period_type" "text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "external_accounting_id" "text",
    "sync_status" "text" DEFAULT 'not_synced'::"text" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "budget_type" "text" DEFAULT 'expense'::"text" NOT NULL,
    CONSTRAINT "finance_budgets_budget_type_check" CHECK (("budget_type" = ANY (ARRAY['expense'::"text", 'income'::"text"]))),
    CONSTRAINT "finance_budgets_period_check" CHECK (("period_end" >= "period_start")),
    CONSTRAINT "finance_budgets_period_type_check" CHECK (("period_type" = ANY (ARRAY['month'::"text", 'year'::"text"]))),
    CONSTRAINT "finance_budgets_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['not_synced'::"text", 'pending'::"text", 'synced'::"text", 'failed'::"text"])))
);


CREATE TABLE IF NOT EXISTS "public"."finance_chart_of_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "account_class" "text" NOT NULL,
    "parent_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "external_accounting_id" "text",
    "sync_status" "text" DEFAULT 'not_synced'::"text" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "finance_chart_of_accounts_account_class_check" CHECK (("account_class" = ANY (ARRAY['asset'::"text", 'liability'::"text", 'equity'::"text", 'revenue'::"text", 'expense'::"text"]))),
    CONSTRAINT "finance_chart_of_accounts_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['not_synced'::"text", 'pending'::"text", 'synced'::"text", 'failed'::"text"])))
);


COMMENT ON TABLE "public"."finance_chart_of_accounts" IS 'Chart of accounts scaffold for future double-entry / Zoho Books sync. No journal entries yet.';



CREATE TABLE IF NOT EXISTS "public"."finance_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "link" "text",
    "entity_type" "text",
    "entity_id" "uuid",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


CREATE TABLE IF NOT EXISTS "public"."growth_action_outcomes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action_type" "text" NOT NULL,
    "channel" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "converted" boolean DEFAULT false NOT NULL,
    "conversion_time" timestamp with time zone,
    "revenue_generated" bigint DEFAULT 0 NOT NULL,
    "booking_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "growth_action_outcomes_channel_check" CHECK (("channel" = ANY (ARRAY['email'::"text", 'whatsapp'::"text", 'sms'::"text"]))),
    CONSTRAINT "growth_action_outcomes_revenue_generated_check" CHECK (("revenue_generated" >= 0))
);


COMMENT ON TABLE "public"."growth_action_outcomes" IS 'Growth send → conversion attribution for learnGrowthEffectiveness() (Phase 4 learning loop).';



CREATE TABLE IF NOT EXISTS "public"."growth_customer_touch" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "touch_type" "text" NOT NULL,
    "channel" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "growth_customer_touch_channel_check" CHECK (("channel" = ANY (ARRAY['whatsapp'::"text", 'email'::"text", 'sms'::"text"]))),
    CONSTRAINT "growth_customer_touch_touch_type_check" CHECK (("touch_type" = ANY (ARRAY['retention_reminder'::"text", 'win_back'::"text", 'ltv_discount'::"text", 'ltv_recurring'::"text", 'ltv_upsell'::"text"])))
);


COMMENT ON TABLE "public"."growth_customer_touch" IS 'Outbound growth touches for per-user cooldown (complements payment-link decision engine).';



CREATE TABLE IF NOT EXISTS "public"."invoice_adjustments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "reason" "text" NOT NULL,
    "month_applied" "text" NOT NULL,
    "applied_to_invoice_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "applied_at" timestamp with time zone,
    "category" "text" DEFAULT 'other'::"text" NOT NULL,
    "booking_id" "uuid",
    CONSTRAINT "invoice_adjustments_category_check" CHECK (("category" = ANY (ARRAY['missed_visit'::"text", 'extra_service'::"text", 'discount'::"text", 'late_fee'::"text", 'cleaning_detergents'::"text", 'other'::"text"]))),
    CONSTRAINT "invoice_adjustments_month_applied_check" CHECK (("month_applied" ~ '^\d{4}-\d{2}$'::"text"))
);


COMMENT ON TABLE "public"."invoice_adjustments" IS 'Credits/charges not tied to a single booking; summed into draft invoice for month_applied; stamped when invoice is sent.';



COMMENT ON COLUMN "public"."invoice_adjustments"."applied_at" IS 'When applied_to_invoice_id was set (draft finalize batch or immediate post-send apply).';



COMMENT ON COLUMN "public"."invoice_adjustments"."category" IS 'Preset classification: missed_visit, extra_service, discount, late_fee, cleaning_detergents, other.';



COMMENT ON COLUMN "public"."invoice_adjustments"."booking_id" IS 'Optional booking on the monthly invoice this adjustment relates to.';



CREATE OR REPLACE VIEW "public"."job_offers" WITH ("security_invoker"='true') AS
 SELECT "id",
    "booking_id",
    "cleaner_id",
        CASE
            WHEN ("status" = 'rejected'::"text") THEN 'declined'::"text"
            ELSE "status"
        END AS "status",
    "expires_at",
    "created_at"
   FROM "public"."dispatch_offers";


COMMENT ON VIEW "public"."job_offers" IS 'Compatibility alias for dispatch_offers; security_invoker applies base-table RLS (cleaners see own offers only).';



CREATE TABLE IF NOT EXISTS "public"."lifecycle_email_metrics" (
    "date" "date" NOT NULL,
    "job_type" "text" NOT NULL,
    "sent_count" integer DEFAULT 0 NOT NULL,
    "failed_count" integer DEFAULT 0 NOT NULL,
    "skipped_count" integer DEFAULT 0 NOT NULL
);


COMMENT ON TABLE "public"."lifecycle_email_metrics" IS 'Daily aggregated lifecycle email outcomes by job_type for admin analytics.';



CREATE TABLE IF NOT EXISTS "public"."lifecycle_email_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "emails_enabled" boolean DEFAULT true NOT NULL,
    "dry_run_enabled" boolean DEFAULT false NOT NULL,
    "frequency_limit_enabled" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


COMMENT ON TABLE "public"."lifecycle_email_settings" IS 'Singleton runtime controls for lifecycle email cron (pause, dry-run, frequency limits).';



CREATE TABLE IF NOT EXISTS "public"."location_gsc_metrics" (
    "slug" "text" NOT NULL,
    "page_url" "text" NOT NULL,
    "clicks" integer DEFAULT 0 NOT NULL,
    "impressions" integer DEFAULT 0 NOT NULL,
    "ctr" numeric DEFAULT 0 NOT NULL,
    "avg_position" numeric,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "prev_clicks" integer DEFAULT 0 NOT NULL,
    "prev_impressions" integer DEFAULT 0 NOT NULL,
    "prev_avg_position" numeric
);


COMMENT ON TABLE "public"."location_gsc_metrics" IS 'Latest Google Search Console page metrics per /locations/{slug} hub; synced daily from GSC API.';



CREATE TABLE IF NOT EXISTS "public"."location_gsc_queries" (
    "query" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "page_url" "text" NOT NULL,
    "clicks" integer DEFAULT 0 NOT NULL,
    "impressions" integer DEFAULT 0 NOT NULL,
    "ctr" numeric DEFAULT 0 NOT NULL,
    "avg_position" numeric,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "prev_clicks" integer DEFAULT 0 NOT NULL,
    "prev_impressions" integer DEFAULT 0 NOT NULL,
    "prev_avg_position" numeric
);


COMMENT ON TABLE "public"."location_gsc_queries" IS 'Latest GSC query performance per /locations/{slug} hub; refreshed on each GSC sync.';



CREATE TABLE IF NOT EXISTS "public"."location_gsc_sync_meta" (
    "id" "text" DEFAULT 'latest'::"text" NOT NULL,
    "current_start_date" "text" NOT NULL,
    "current_end_date" "text" NOT NULL,
    "previous_start_date" "text" NOT NULL,
    "previous_end_date" "text" NOT NULL,
    "current_clicks" integer DEFAULT 0 NOT NULL,
    "current_impressions" integer DEFAULT 0 NOT NULL,
    "previous_clicks" integer DEFAULT 0 NOT NULL,
    "previous_impressions" integer DEFAULT 0 NOT NULL,
    "clicks_trend_pct" numeric,
    "impressions_trend_pct" numeric,
    "clicks_chart" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."location_gsc_sync_meta" IS 'Latest GSC sync window totals and daily clicks chart for the SEO dashboard.';



CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "city" "text" DEFAULT 'Cape Town'::"text",
    "province" "text" DEFAULT 'Western Cape'::"text",
    "slug" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "latitude" double precision,
    "longitude" double precision,
    "city_id" "uuid"
);


COMMENT ON TABLE "public"."locations" IS 'Normalized service areas for cleaners, bookings, SEO routes, and dispatch matching.';



COMMENT ON COLUMN "public"."locations"."name" IS 'Display name and meta title base (title case).';



COMMENT ON COLUMN "public"."locations"."city" IS 'Municipal / metro label for filters and structured data.';



COMMENT ON COLUMN "public"."locations"."province" IS 'Province for regional SEO and compliance.';



COMMENT ON COLUMN "public"."locations"."slug" IS 'Unique kebab-case key for URLs and joins (stable id for SEO).';



COMMENT ON COLUMN "public"."locations"."latitude" IS 'Approximate centroid for dispatch distance (same area).';



COMMENT ON COLUMN "public"."locations"."longitude" IS 'Approximate centroid for dispatch distance (same area).';



CREATE TABLE IF NOT EXISTS "public"."marketing_automation_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "trigger_event" "text" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "channel" "text" DEFAULT 'email'::"text" NOT NULL,
    "delay_minutes" integer DEFAULT 0 NOT NULL,
    "subject_template" "text",
    "body_html_template" "text",
    "sms_template" "text",
    "promotion_id" "uuid",
    "audience_filter" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "marketing_automation_rules_channel_check" CHECK (("channel" = ANY (ARRAY['email'::"text", 'sms'::"text", 'push'::"text", 'email_sms'::"text"]))),
    CONSTRAINT "marketing_automation_rules_delay_minutes_check" CHECK (("delay_minutes" >= 0)),
    CONSTRAINT "marketing_automation_rules_trigger_event_check" CHECK (("trigger_event" = ANY (ARRAY['registration'::"text", 'first_booking'::"text", 'completed_booking'::"text", 'cancelled_booking'::"text", 'birthday'::"text", 'referral_completed'::"text", 'membership_renewal'::"text", 'inactive_30'::"text", 'inactive_60'::"text", 'inactive_90'::"text", 'seasonal_campaign_start'::"text"])))
);


CREATE TABLE IF NOT EXISTS "public"."marketing_spend" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "marketing_spend_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "marketing_spend_channel_check" CHECK (("channel" = ANY (ARRAY['google_ads'::"text", 'facebook_ads'::"text", 'organic_seo'::"text", 'direct'::"text"])))
);


CREATE TABLE IF NOT EXISTS "public"."membership_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "billing_frequency" "text" NOT NULL,
    "price_zar" numeric NOT NULL,
    "discount_percent" numeric DEFAULT 0 NOT NULL,
    "benefits" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "priority_booking" boolean DEFAULT true NOT NULL,
    "preferred_cleaner" boolean DEFAULT true NOT NULL,
    "birthday_bonus" boolean DEFAULT true NOT NULL,
    "member_only_offers" boolean DEFAULT true NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "membership_plans_billing_frequency_check" CHECK (("billing_frequency" = ANY (ARRAY['weekly'::"text", 'biweekly'::"text", 'monthly'::"text"]))),
    CONSTRAINT "membership_plans_discount_percent_check" CHECK ((("discount_percent" >= (0)::numeric) AND ("discount_percent" <= (100)::numeric))),
    CONSTRAINT "membership_plans_price_zar_check" CHECK (("price_zar" >= (0)::numeric))
);


COMMENT ON TABLE "public"."membership_plans" IS 'Recurring membership SKUs with discount and perk configuration.';



CREATE TABLE IF NOT EXISTS "public"."monthly_invoice_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."monthly_invoice_events" IS 'Append-only audit log for invoice lifecycle; snapshot_current.events keeps last 50 for fast reads.';



CREATE TABLE IF NOT EXISTS "public"."monthly_invoice_paystack_charge_dedup" (
    "charge_reference" "text" NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "monthly_invoice_paystack_charge_dedup_amount_cents_check" CHECK (("amount_cents" >= 0))
);


COMMENT ON TABLE "public"."monthly_invoice_paystack_charge_dedup" IS 'One row per successful Paystack transaction reference applied to an invoice; prevents double-counting amount_paid_cents.';



CREATE TABLE IF NOT EXISTS "public"."monthly_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "month" "text" NOT NULL,
    "total_bookings" integer DEFAULT 0 NOT NULL,
    "total_amount_cents" bigint DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "due_date" "date" NOT NULL,
    "paystack_reference" "text",
    "payment_link" "text",
    "sent_at" timestamp with time zone,
    "finalized_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closure_reason" "text",
    "amount_paid_cents" bigint DEFAULT 0 NOT NULL,
    "balance_cents" bigint GENERATED ALWAYS AS (("total_amount_cents" - "amount_paid_cents")) STORED,
    "snapshot_at_finalize" "jsonb",
    "snapshot_current" "jsonb",
    "snapshot_version" integer DEFAULT 0 NOT NULL,
    "is_overdue" boolean DEFAULT false NOT NULL,
    "is_closed" boolean DEFAULT false NOT NULL,
    "currency_code" "text" DEFAULT 'ZAR'::"text" NOT NULL,
    "reminder_count" integer DEFAULT 0 NOT NULL,
    "initial_invoice_email_dispatch_claimed" boolean DEFAULT false NOT NULL,
    "zoho_invoice_id" "text",
    "due_date_override" "date",
    "first_viewed_at" timestamp with time zone,
    "last_viewed_at" timestamp with time zone,
    "view_count" integer DEFAULT 0 NOT NULL,
    "refunded_at" timestamp with time zone,
    "refund_reference" "text",
    "zoho_invoice_number" "text",
    "invoice_date" "date",
    CONSTRAINT "monthly_invoices_amount_paid_cents_check" CHECK (("amount_paid_cents" >= 0)),
    CONSTRAINT "monthly_invoices_month_check" CHECK (("month" ~ '^\d{4}-\d{2}$'::"text")),
    CONSTRAINT "monthly_invoices_reminder_count_check" CHECK (("reminder_count" >= 0)),
    CONSTRAINT "monthly_invoices_snapshot_version_check" CHECK (("snapshot_version" >= 0)),
    CONSTRAINT "monthly_invoices_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'sent'::"text", 'partially_paid'::"text", 'paid'::"text", 'overdue'::"text", 'refunded'::"text"]))),
    CONSTRAINT "monthly_invoices_total_amount_cents_check" CHECK (("total_amount_cents" >= 0)),
    CONSTRAINT "monthly_invoices_total_bookings_check" CHECK (("total_bookings" >= 0)),
    CONSTRAINT "monthly_invoices_view_count_nonneg" CHECK (("view_count" >= 0))
);


COMMENT ON TABLE "public"."monthly_invoices" IS 'B2B-style monthly bill: draft accumulates bookings; last day of month finalizes, Paystack link, sent; paid closes bookings.';



COMMENT ON COLUMN "public"."monthly_invoices"."status" IS 'draft → sent (or zero → paid). partially_paid when Paystack received < balance. overdue = sent/partially_paid past due_date.';



COMMENT ON COLUMN "public"."monthly_invoices"."paystack_reference" IS 'Paystack transaction reference; UNIQUE when not null. Persisted before initialize call for crash-safe retries (see initializePaystackForMonthlyInvoice).';



COMMENT ON COLUMN "public"."monthly_invoices"."closure_reason" IS 'Why a terminal state was reached without Paystack (e.g. zero_amount).';



COMMENT ON COLUMN "public"."monthly_invoices"."amount_paid_cents" IS 'Cumulative customer payments (Paystack) toward this invoice; balance_cents = total_amount_cents - amount_paid_cents.';



COMMENT ON COLUMN "public"."monthly_invoices"."balance_cents" IS 'Generated: total_amount_cents - amount_paid_cents (remaining due; <=0 means over/fully paid).';



COMMENT ON COLUMN "public"."monthly_invoices"."snapshot_at_finalize" IS 'Immutable line-item snapshot taken when invoice first leaves draft (send or zero-close).';



COMMENT ON COLUMN "public"."monthly_invoices"."snapshot_current" IS 'Rolling audit view: starts as finalize copy + events[] for post-send adjustments and payments.';



COMMENT ON COLUMN "public"."monthly_invoices"."snapshot_version" IS 'Increments on each snapshot_current mutation (finalize=1 then +1 per payment/adj).';



COMMENT ON COLUMN "public"."monthly_invoices"."is_overdue" IS 'True when past due_date and still outstanding (coexists with status=partially_paid; do not use status=overdue for that).';



COMMENT ON COLUMN "public"."monthly_invoices"."is_closed" IS 'When true, no invoice_adjustments for this customer+month; use next month or reopen via admin. Auto-set when status becomes paid.';



COMMENT ON COLUMN "public"."monthly_invoices"."currency_code" IS 'ISO 4217; amounts on this row are in this currency minor units (cents). Default ZAR.';



COMMENT ON COLUMN "public"."monthly_invoices"."reminder_count" IS 'Number of reminder deliveries recorded by cron (email/whatsapp); unpaid lifecycle uses status sent/partially_paid/overdue + sent_at + balance_cents.';



COMMENT ON COLUMN "public"."monthly_invoices"."initial_invoice_email_dispatch_claimed" IS 'Finalize cron: claimed before Resend send; cleared on send failure. Prevents duplicate first emails under concurrent finalize.';



COMMENT ON COLUMN "public"."monthly_invoices"."zoho_invoice_id" IS 'Zoho Books invoice ID synced at finalization. NULL until synced.';



COMMENT ON COLUMN "public"."monthly_invoices"."due_date_override" IS 'When set on a draft invoice, replaces auto due_date from last visit in the billing month.';



COMMENT ON COLUMN "public"."monthly_invoices"."refunded_at" IS 'When this monthly invoice payment was refunded (Paystack or recorded manually in Office).';



COMMENT ON COLUMN "public"."monthly_invoices"."refund_reference" IS 'Paystack refund transaction reference when refund was processed online.';



COMMENT ON COLUMN "public"."monthly_invoices"."zoho_invoice_number" IS 'Zoho Books invoice_number (e.g. INV-000123) for the linked zoho_invoice_id.';



COMMENT ON COLUMN "public"."monthly_invoices"."invoice_date" IS 'Optional document/billing date shown on Zoho. When null, Zoho uses the 1st of month.';



CREATE MATERIALIZED VIEW "public"."mv_booking_funnel_daily" AS
 SELECT (("created_at" AT TIME ZONE 'UTC'::"text"))::"date" AS "day",
    "count"(*) FILTER (WHERE (("step" = 'quote'::"text") AND ("event_type" = 'view'::"text"))) AS "quote_views",
    "count"(*) FILTER (WHERE (("step" = 'payment'::"text") AND ("event_type" = ANY (ARRAY['view'::"text", 'next'::"text"])))) AS "payment_step_reached",
    "count"(*) FILTER (WHERE ("event_type" = 'exit'::"text")) AS "exits",
    "count"(*) FILTER (WHERE ("event_type" = 'error'::"text")) AS "errors",
    "count"(DISTINCT COALESCE("analytics_session_id", "session_id")) AS "distinct_sessions"
   FROM "public"."booking_events"
  GROUP BY ((("created_at" AT TIME ZONE 'UTC'::"text"))::"date")
  WITH NO DATA;


COMMENT ON MATERIALIZED VIEW "public"."mv_booking_funnel_daily" IS 'Admin analytics MV; service_role only. Refresh via refresh_analytics_materialized_views().';



CREATE TABLE IF NOT EXISTS "public"."user_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "event_type" "text" NOT NULL,
    "booking_id" "uuid",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['booking_created'::"text", 'booking_completed'::"text", 'slot_selected'::"text", 'extra_added'::"text", 'recommendation_clicked'::"text", 'flow_step_viewed'::"text", 'flow_drop_off'::"text", 'booking_agent_quote'::"text", 'booking_agent_confirm'::"text", 'page_view'::"text", 'start_booking'::"text", 'view_price'::"text", 'select_time'::"text", 'complete_booking'::"text", 'referral_created'::"text", 'referral_completed'::"text", 'referral_rewarded'::"text", 'checkout_discount_applied'::"text", 'cleaner_checkout_attribution'::"text", 'growth_retention_reminder'::"text", 'growth_win_back'::"text", 'growth_ltv_message'::"text", 'cleaners_loaded'::"text", 'times_loaded'::"text", 'price_calculated'::"text", 'booking_started'::"text", 'booking_upsell_interaction'::"text", 'homepage_continue_booking'::"text", 'homepage_cta_click'::"text", 'homepage_service_select'::"text", 'pricing_loaded'::"text", 'homepage_abandon'::"text", 'homepage_scroll'::"text", 'price_updated'::"text", 'booking_step_details_started'::"text", 'booking_service_selected'::"text", 'booking_addon_selected'::"text", 'booking_continue_schedule'::"text", 'booking_date_selected'::"text", 'booking_time_selected'::"text", 'booking_cleaner_selected'::"text", 'booking_cta_clicked'::"text", 'booking_validation_failed'::"text", 'booking_schedule_fetch_failed'::"text", 'booking_payment_started'::"text", 'booking_paystack_opened'::"text", 'booking_recovery_prompt_shown'::"text", 'booking_recovery_saved'::"text", 'booking_recovery_whatsapp_clicked'::"text", 'review_submitted'::"text", 'review_prompt_sent'::"text", 'review_prompt_clicked'::"text", 'payment_initiated'::"text", 'payment_completed'::"text", 'blog_scroll'::"text", 'blog_cta_click'::"text", 'blog_time_on_page'::"text", 'blog_toc_click'::"text", 'blog_toc_section_engagement'::"text", 'seo_location_scroll'::"text", 'seo_cta_click'::"text", 'seo_service_card_click'::"text", 'seo_faq_expand'::"text", 'seo_pricing_interaction'::"text"])))
);


COMMENT ON TABLE "public"."user_events" IS 'Analytics and lifecycle: booking_* from payment/cron; assistant_* from booking UX (optional booking_id).';



CREATE MATERIALIZED VIEW "public"."mv_payment_conversion_daily" AS
 SELECT (("created_at" AT TIME ZONE 'UTC'::"text"))::"date" AS "day",
    "count"(*) FILTER (WHERE ("event_type" = 'booking_paystack_opened'::"text")) AS "paystack_opened",
    "count"(*) FILTER (WHERE ("event_type" = 'booking_completed'::"text")) AS "booking_completed_events",
    "count"(*) FILTER (WHERE ("event_type" = 'payment_completed'::"text")) AS "payment_completed_events"
   FROM "public"."user_events"
  GROUP BY ((("created_at" AT TIME ZONE 'UTC'::"text"))::"date")
  WITH NO DATA;


COMMENT ON MATERIALIZED VIEW "public"."mv_payment_conversion_daily" IS 'Admin analytics MV; service_role only. Refresh via refresh_analytics_materialized_views().';



CREATE TABLE IF NOT EXISTS "public"."newsletter_subscribers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "source" "text" DEFAULT 'marketing_footer'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."newsletter_subscribers" IS 'Newsletter signups; public writes only via /api/newsletter/subscribe (service role).';



CREATE TABLE IF NOT EXISTS "public"."notification_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "fired_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "occurrence_count" integer DEFAULT 1 NOT NULL,
    "first_fired_at" timestamp with time zone,
    "is_flapping" boolean DEFAULT false NOT NULL,
    "flap_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "notification_alerts_severity_check" CHECK (("severity" = ANY (ARRAY['warn'::"text", 'error'::"text", 'critical'::"text"])))
);


COMMENT ON TABLE "public"."notification_alerts" IS 'Notification metric alerts (type = alert key). resolved_at set when ops marks cleared or metrics recover.';



COMMENT ON COLUMN "public"."notification_alerts"."occurrence_count" IS 'Increments when the same alert type fires again while still unresolved.';



COMMENT ON COLUMN "public"."notification_alerts"."first_fired_at" IS 'When this incident was first observed; fired_at updates on each grouped recurrence.';



COMMENT ON COLUMN "public"."notification_alerts"."is_flapping" IS 'True when this row opened shortly after a prior same-type alert was resolved (churn).';



COMMENT ON COLUMN "public"."notification_alerts"."flap_count" IS 'Increments on each grouped recurrence while the row was opened as flapping (is_flapping true).';



CREATE TABLE IF NOT EXISTS "public"."notification_idempotency_claims" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid",
    "event_type" "text" NOT NULL,
    "channel" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reference" "text",
    CONSTRAINT "notification_idempotency_claims_channel_check" CHECK (("channel" = ANY (ARRAY['email'::"text", 'sms'::"text", 'in_app'::"text"])))
);


COMMENT ON TABLE "public"."notification_idempotency_claims" IS 'Pre-send idempotency claims (Day 5). Insert before outbound send; unique violation = duplicate path.';



COMMENT ON COLUMN "public"."notification_idempotency_claims"."booking_id" IS 'Optional correlation to bookings; sales-document notifications omit this column.';



CREATE TABLE IF NOT EXISTS "public"."notification_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "text",
    "channel" "text" NOT NULL,
    "template_key" "text" NOT NULL,
    "recipient" "text" NOT NULL,
    "status" "text" NOT NULL,
    "error" "text",
    "provider" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role" "text",
    "event_type" "text",
    "decision" "text",
    CONSTRAINT "notification_logs_channel_check" CHECK (("channel" = ANY (ARRAY['email'::"text", 'whatsapp'::"text", 'sms'::"text"]))),
    CONSTRAINT "notification_logs_provider_check" CHECK (("provider" = ANY (ARRAY['resend'::"text", 'twilio'::"text", 'meta'::"text"]))),
    CONSTRAINT "notification_logs_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'failed'::"text"])))
);


COMMENT ON TABLE "public"."notification_logs" IS 'Outbound notification audit; written from Next.js via service role.';



COMMENT ON COLUMN "public"."notification_logs"."role" IS 'customer | cleaner | admin';



COMMENT ON COLUMN "public"."notification_logs"."event_type" IS 'Lifecycle / product step, e.g. payment_confirmed, assigned, reminder_2h, template_test_send';



COMMENT ON COLUMN "public"."notification_logs"."decision" IS 'Indexed copy of payload.decision for dashboard analytics and routing optimization.';



CREATE TABLE IF NOT EXISTS "public"."notification_runtime_flags" (
    "id" smallint DEFAULT 1 NOT NULL,
    "whatsapp_disabled_until" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "whatsapp_paused_at" timestamp with time zone,
    "customer_outbound_paused_until" timestamp with time zone,
    "customer_outbound_paused_at" timestamp with time zone,
    CONSTRAINT "notification_runtime_flags_id_check" CHECK (("id" = 1))
);


COMMENT ON TABLE "public"."notification_runtime_flags" IS 'Global outbound switches; written by cron/health checks (service role). Row id must stay 1.';



COMMENT ON COLUMN "public"."notification_runtime_flags"."whatsapp_paused_at" IS 'Wall time when outbound WhatsApp was last auto-paused; preserved while pause is extended. Cleared on resume.';



COMMENT ON COLUMN "public"."notification_runtime_flags"."customer_outbound_paused_until" IS 'When set and in the future, customer email/SMS outbound is skipped (cleaner/admin unaffected).';



COMMENT ON COLUMN "public"."notification_runtime_flags"."customer_outbound_paused_at" IS 'When the current customer outbound pause window started (ops audit).';



CREATE TABLE IF NOT EXISTS "public"."payment_link_delivery_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL,
    "status" "text" NOT NULL,
    "pass_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_link_delivery_events_channel_check" CHECK (("channel" = ANY (ARRAY['whatsapp'::"text", 'sms'::"text", 'email'::"text"]))),
    CONSTRAINT "payment_link_delivery_events_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'failed'::"text"])))
);


COMMENT ON TABLE "public"."payment_link_delivery_events" IS 'Per-channel send outcomes per wave (admin checkout, resend, reminders). Used for funnel + conversion_channel.';



CREATE TABLE IF NOT EXISTS "public"."payment_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gateway" "text" NOT NULL,
    "gateway_reference" "text" NOT NULL,
    "gateway_transaction_id" "text",
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "amount_cents" integer NOT NULL,
    "currency_code" "text" DEFAULT 'ZAR'::"text" NOT NULL,
    "processing_fee_cents" integer DEFAULT 0 NOT NULL,
    "processing_fee_vat_cents" integer,
    "net_settlement_cents" integer NOT NULL,
    "fee_calculation_method" "text" NOT NULL,
    "settlement_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "settlement_date" "date",
    "payment_channel" "text",
    "expense_id" "uuid",
    "booking_id" "uuid",
    "raw_gateway_payload" "jsonb",
    "paid_at" timestamp with time zone,
    "external_accounting_id" "text",
    "sync_status" "text" DEFAULT 'not_synced'::"text" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sync_errors" "text",
    CONSTRAINT "payment_transactions_amount_cents_check" CHECK (("amount_cents" >= 0)),
    CONSTRAINT "payment_transactions_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['booking'::"text", 'monthly_invoice'::"text", 'sales_document'::"text"]))),
    CONSTRAINT "payment_transactions_fee_calculation_method_check" CHECK (("fee_calculation_method" = ANY (ARRAY['paystack_reported'::"text", 'calculated_sa_local_card'::"text", 'calculated_sa_international_card'::"text", 'calculated_sa_eft'::"text", 'calculated_sa_default'::"text", 'manual'::"text"]))),
    CONSTRAINT "payment_transactions_gateway_check" CHECK (("gateway" = ANY (ARRAY['paystack'::"text", 'peach'::"text", 'stripe'::"text", 'other'::"text"]))),
    CONSTRAINT "payment_transactions_net_settlement_cents_check" CHECK (("net_settlement_cents" >= 0)),
    CONSTRAINT "payment_transactions_processing_fee_cents_check" CHECK (("processing_fee_cents" >= 0)),
    CONSTRAINT "payment_transactions_processing_fee_vat_cents_check" CHECK ((("processing_fee_vat_cents" IS NULL) OR ("processing_fee_vat_cents" >= 0))),
    CONSTRAINT "payment_transactions_settlement_status_check" CHECK (("settlement_status" = ANY (ARRAY['pending'::"text", 'settled'::"text", 'failed'::"text", 'reversed'::"text"]))),
    CONSTRAINT "payment_transactions_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['not_synced'::"text", 'pending'::"text", 'synced'::"text", 'failed'::"text"])))
);


COMMENT ON TABLE "public"."payment_transactions" IS 'Gateway payment ledger: gross amount, processing fee, net settlement. Multi-gateway (Paystack, Peach, Stripe).';



COMMENT ON COLUMN "public"."payment_transactions"."amount_cents" IS 'Gross amount in cents. Zero allowed for promo/credit fully-covered settlements (payment_channel=promo_credit_cover).';



CREATE TABLE IF NOT EXISTS "public"."payout_audit_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_type" "text" NOT NULL,
    "actor_user_id" "uuid",
    "actor_email" "text",
    "payout_id" "uuid",
    "disbursement_id" "uuid",
    "booking_ids" "uuid"[],
    "amount_cents" integer,
    "old_values" "jsonb",
    "new_values" "jsonb",
    "reference" "text",
    "ip" "text",
    "context" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."payout_audit_events" IS 'Append-only audit for payout generate/approve/pay/adjust/webhook/retry events.';



CREATE TABLE IF NOT EXISTS "public"."payout_transfer_outbox" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rail" "text" NOT NULL,
    "subject_id" "uuid" NOT NULL,
    "cleaner_id" "uuid" NOT NULL,
    "amount_cents" integer NOT NULL,
    "recipient_code" "text" NOT NULL,
    "reference" "text" NOT NULL,
    "transfer_row_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "transfer_code" "text",
    "paystack_response" "jsonb",
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payout_transfer_outbox_amount_cents_check" CHECK (("amount_cents" > 0)),
    CONSTRAINT "payout_transfer_outbox_rail_check" CHECK (("rail" = ANY (ARRAY['cleaner_payout'::"text", 'cleaner_earnings'::"text"]))),
    CONSTRAINT "payout_transfer_outbox_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'submitted'::"text", 'succeeded'::"text", 'failed'::"text", 'needs_reconcile'::"text"])))
);


COMMENT ON TABLE "public"."payout_transfer_outbox" IS 'Durable Paystack transfer intent. Inserted before calling Paystack; worker/reconcile resume without new references.';



CREATE TABLE IF NOT EXISTS "public"."payout_transfers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payout_id" "uuid" NOT NULL,
    "cleaner_id" "uuid" NOT NULL,
    "amount_cents" integer NOT NULL,
    "recipient_code" "text",
    "transfer_code" "text",
    "status" "text" NOT NULL,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "webhook_payload" "jsonb",
    "webhook_processed_at" timestamp with time zone,
    "reference" "text" NOT NULL,
    CONSTRAINT "payout_transfers_amount_cents_check" CHECK (("amount_cents" > 0)),
    CONSTRAINT "payout_transfers_status_check" CHECK (("status" = ANY (ARRAY['processing'::"text", 'success'::"text", 'failed'::"text"])))
);


COMMENT ON TABLE "public"."payout_transfers" IS 'Audit log of Paystack payout transfer attempts. No client RLS policies by default.';



COMMENT ON COLUMN "public"."payout_transfers"."webhook_payload" IS 'Last verified Paystack webhook payload received for this transfer.';



COMMENT ON COLUMN "public"."payout_transfers"."webhook_processed_at" IS 'Server timestamp when the last verified Paystack webhook was processed for this transfer.';



COMMENT ON COLUMN "public"."payout_transfers"."reference" IS 'Immutable Paystack client reference (e.g. shalean-cleaner-payout-{payout_id}). Never regenerated on retry.';



CREATE TABLE IF NOT EXISTS "public"."pricing_booking_config" (
    "id" "text" DEFAULT 'default'::"text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."pricing_booking_config" IS 'Booking-v2 platform fees, recurring discounts, and property-factor surcharge tables (ZAR integers / percents).';



CREATE TABLE IF NOT EXISTS "public"."pricing_catalog_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "table_name" "text" NOT NULL,
    "row_id" "text" NOT NULL,
    "action" "text" NOT NULL,
    "before_row" "jsonb",
    "after_row" "jsonb",
    "actor_user_id" "uuid",
    "actor_email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rollback_of" "uuid",
    CONSTRAINT "pricing_catalog_audit_action_check" CHECK (("action" = ANY (ARRAY['insert'::"text", 'update'::"text", 'delete'::"text", 'rollback'::"text"]))),
    CONSTRAINT "pricing_catalog_audit_table_name_check" CHECK (("table_name" = ANY (ARRAY['pricing_services'::"text", 'pricing_extras'::"text", 'pricing_booking_config'::"text"])))
);


COMMENT ON TABLE "public"."pricing_catalog_audit" IS 'Phase 3 audit log for admin catalog CRUD (services, extras, booking config).';



CREATE TABLE IF NOT EXISTS "public"."pricing_changes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pricing_rule_id" "uuid",
    "location" "text",
    "demand_level" "text",
    "old_multiplier" numeric,
    "new_multiplier" numeric NOT NULL,
    "reason" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "rejection_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "applied_at" timestamp with time zone,
    "rolled_back_at" timestamp with time zone,
    "created_by" "text",
    "metrics_before" "jsonb",
    "metrics_after" "jsonb",
    "metrics_checked_at" timestamp with time zone,
    "ai_payload" "jsonb",
    CONSTRAINT "pricing_changes_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'applied'::"text", 'rejected'::"text", 'rolled_back'::"text"])))
);


COMMENT ON TABLE "public"."pricing_changes" IS 'Audit log for pricing rule updates: pending approval, applied, rejected, or rolled back.';



COMMENT ON COLUMN "public"."pricing_changes"."metrics_before" IS 'Snapshot (jobs, revenue_cents, profit_cents, margin_ratio) for location before apply, for rollback heuristics.';



CREATE TABLE IF NOT EXISTS "public"."pricing_extra_bundles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bundle_id" "text" NOT NULL,
    "label" "text" NOT NULL,
    "blurb" "text" DEFAULT ''::"text" NOT NULL,
    "bundle_price" integer NOT NULL,
    "items" "text"[] NOT NULL,
    "service_scope" "text" DEFAULT 'light'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."pricing_extra_bundles" IS 'Discount bundles over pricing_extras; mirrored into pricing_versions.rules.bundles.';



CREATE TABLE IF NOT EXISTS "public"."pricing_extras" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "price" integer DEFAULT 0 NOT NULL,
    "service_type" "text" DEFAULT 'all'::"text" NOT NULL,
    "is_popular" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL
);


COMMENT ON TABLE "public"."pricing_extras" IS 'Add-on pricing; service_type: light | heavy | all';



CREATE TABLE IF NOT EXISTS "public"."pricing_metrics" (
    "slot_time" "text" NOT NULL,
    "conversion_rate" numeric DEFAULT 0.35 NOT NULL,
    "views_count" integer DEFAULT 0 NOT NULL,
    "bookings_count" integer DEFAULT 0 NOT NULL,
    "drop_offs" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pricing_metrics_bookings_count_check" CHECK (("bookings_count" >= 0)),
    CONSTRAINT "pricing_metrics_conversion_rate_check" CHECK ((("conversion_rate" >= (0)::numeric) AND ("conversion_rate" <= (1)::numeric))),
    CONSTRAINT "pricing_metrics_drop_offs_check" CHECK (("drop_offs" >= 0)),
    CONSTRAINT "pricing_metrics_slot_time_check" CHECK (("slot_time" ~ '^\d{2}:\d{2}$'::"text")),
    CONSTRAINT "pricing_metrics_views_count_check" CHECK (("views_count" >= 0))
);


COMMENT ON TABLE "public"."pricing_metrics" IS 'Per–time-slot funnel metrics for dynamic pricing AI (cron reads/writes).';



CREATE TABLE IF NOT EXISTS "public"."pricing_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location" "text",
    "demand_level" "text",
    "base_multiplier" numeric DEFAULT 1 NOT NULL,
    "service_fee_cents" integer DEFAULT 3000 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pricing_rules_base_multiplier_check" CHECK ((("base_multiplier" > (0)::numeric) AND ("base_multiplier" <= (3)::numeric))),
    CONSTRAINT "pricing_rules_demand_level_check" CHECK ((("demand_level" IS NULL) OR ("demand_level" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text"])))),
    CONSTRAINT "pricing_rules_service_fee_cents_check" CHECK (("service_fee_cents" >= 0))
);


COMMENT ON TABLE "public"."pricing_rules" IS 'Optional multipliers/fees by location label and demand band; app merges with static maps.';



CREATE TABLE IF NOT EXISTS "public"."pricing_services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "base_price" integer DEFAULT 0 NOT NULL,
    "price_per_bedroom" integer DEFAULT 0 NOT NULL,
    "price_per_bathroom" integer DEFAULT 0 NOT NULL,
    "min_hours" numeric(5,2) DEFAULT 2 NOT NULL,
    "max_hours" numeric(5,2) DEFAULT 8 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "price_per_extra_room" integer DEFAULT 30 NOT NULL,
    "duration_base" numeric(6,3) DEFAULT 3.5 NOT NULL,
    "duration_per_bedroom" numeric(6,3) DEFAULT 0.5 NOT NULL,
    "duration_per_bathroom" numeric(6,3) DEFAULT 0.5 NOT NULL,
    "duration_per_extra_room" numeric(6,3) DEFAULT 0.3 NOT NULL
);


COMMENT ON TABLE "public"."pricing_services" IS 'Service line pricing (ZAR integers); admin UI source of truth.';



COMMENT ON COLUMN "public"."pricing_services"."price_per_extra_room" IS 'ZAR per billable extra room (beyond standard room lines).';



CREATE TABLE IF NOT EXISTS "public"."pricing_slot_adjustments" (
    "slot_time" "text" NOT NULL,
    "multiplier" numeric DEFAULT 1.0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pricing_slot_adjustments_multiplier_check" CHECK ((("multiplier" >= 0.8) AND ("multiplier" <= 1.2)))
);


CREATE TABLE IF NOT EXISTS "public"."pricing_tiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "price" integer,
    "cadence" "text",
    "features" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."pricing_tiers" IS 'CMS rows for marketing pricing cards; anon may read active tiers only.';



CREATE TABLE IF NOT EXISTS "public"."pricing_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "code_version" integer NOT NULL,
    "services" "jsonb" NOT NULL,
    "extras" "jsonb" NOT NULL,
    "rules" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "config_hash" "text" NOT NULL
);


COMMENT ON TABLE "public"."pricing_versions" IS 'Immutable ZAR catalog snapshots; checkout recomputes from this row, not live code.';



COMMENT ON COLUMN "public"."pricing_versions"."code_version" IS 'Engine tariff marker (PRICING_CONFIG.version) at snapshot time.';



COMMENT ON COLUMN "public"."pricing_versions"."rules" IS 'e.g. { "bundles": [...] } — must match extras bundle engine.';



CREATE TABLE IF NOT EXISTS "public"."promotion_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "promotion_id" "uuid",
    "action" "text" NOT NULL,
    "actor" "text",
    "before_state" "jsonb",
    "after_state" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


CREATE TABLE IF NOT EXISTS "public"."promotion_bundles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "promotion_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "required_service_slugs" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "required_extra_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "min_services" integer DEFAULT 2 NOT NULL,
    "discount_type" "text" DEFAULT 'percent'::"text" NOT NULL,
    "discount_value" numeric NOT NULL,
    "max_discount_zar" numeric,
    "stackable" boolean DEFAULT false NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "promotion_bundles_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percent'::"text", 'fixed'::"text"]))),
    CONSTRAINT "promotion_bundles_discount_value_check" CHECK (("discount_value" >= (0)::numeric)),
    CONSTRAINT "promotion_bundles_min_services_check" CHECK (("min_services" >= 2))
);


CREATE TABLE IF NOT EXISTS "public"."promotion_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "promotion_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "user_id" "uuid",
    "booking_id" "uuid",
    "session_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "promotion_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['view'::"text", 'click'::"text", 'booking_started'::"text", 'booking_completed'::"text", 'code_applied'::"text", 'code_rejected'::"text", 'credit_issued'::"text", 'email_sent'::"text", 'sms_sent'::"text", 'landing_visit'::"text", 'qr_scan'::"text", 'popup_view'::"text", 'popup_dismiss'::"text", 'content_generated'::"text"])))
);


CREATE TABLE IF NOT EXISTS "public"."promotion_redemptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "promotion_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "booking_id" "uuid",
    "customer_email" "text",
    "discount_zar" numeric DEFAULT 0 NOT NULL,
    "credit_issued_zar" numeric DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'applied'::"text" NOT NULL,
    "idempotency_key" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "promotion_redemptions_credit_issued_zar_check" CHECK (("credit_issued_zar" >= (0)::numeric)),
    CONSTRAINT "promotion_redemptions_discount_zar_check" CHECK (("discount_zar" >= (0)::numeric)),
    CONSTRAINT "promotion_redemptions_status_check" CHECK (("status" = ANY (ARRAY['applied'::"text", 'reversed'::"text", 'pending'::"text"])))
);


COMMENT ON TABLE "public"."promotion_redemptions" IS 'Immutable-ish redemption ledger for promotions; supports reverse and idempotency.';



CREATE TABLE IF NOT EXISTS "public"."promotions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "promotion_type" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "banner_image_url" "text",
    "landing_page_path" "text",
    "promo_code" "text",
    "auto_apply" boolean DEFAULT false NOT NULL,
    "discount_type" "text" DEFAULT 'percent'::"text" NOT NULL,
    "discount_value" numeric DEFAULT 0 NOT NULL,
    "max_discount_zar" numeric,
    "min_booking_amount_zar" numeric DEFAULT 0 NOT NULL,
    "customer_eligibility" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "booking_eligibility" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "usage_limit_total" integer,
    "usage_limit_per_customer" integer,
    "budget_zar" numeric,
    "budget_spent_zar" numeric DEFAULT 0 NOT NULL,
    "stackable" boolean DEFAULT false NOT NULL,
    "stack_priority" integer DEFAULT 100 NOT NULL,
    "show_on_homepage" boolean DEFAULT false NOT NULL,
    "show_on_booking" boolean DEFAULT false NOT NULL,
    "show_on_pricing" boolean DEFAULT false NOT NULL,
    "show_announcement_bar" boolean DEFAULT false NOT NULL,
    "display_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "views_count" bigint DEFAULT 0 NOT NULL,
    "clicks_count" bigint DEFAULT 0 NOT NULL,
    "bookings_started_count" bigint DEFAULT 0 NOT NULL,
    "bookings_completed_count" bigint DEFAULT 0 NOT NULL,
    "revenue_generated_zar" numeric DEFAULT 0 NOT NULL,
    "redemptions_count" bigint DEFAULT 0 NOT NULL,
    "created_by" "text",
    "updated_by" "text",
    "duplicated_from_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hero_image_url" "text",
    "logo_url" "text",
    "cta_label" "text",
    "terms_html" "text",
    "show_popup" boolean DEFAULT false NOT NULL,
    "show_featured_card" boolean DEFAULT false NOT NULL,
    "show_dashboard_card" boolean DEFAULT false NOT NULL,
    "show_booking_banner" boolean DEFAULT false NOT NULL,
    "qr_code_data_url" "text",
    "content_generated_at" timestamp with time zone,
    "template_key" "text",
    CONSTRAINT "promotions_budget_spent_zar_check" CHECK (("budget_spent_zar" >= (0)::numeric)),
    CONSTRAINT "promotions_budget_zar_check" CHECK ((("budget_zar" IS NULL) OR ("budget_zar" >= (0)::numeric))),
    CONSTRAINT "promotions_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percent'::"text", 'fixed'::"text", 'credit'::"text"]))),
    CONSTRAINT "promotions_discount_value_check" CHECK (("discount_value" >= (0)::numeric)),
    CONSTRAINT "promotions_max_discount_zar_check" CHECK ((("max_discount_zar" IS NULL) OR ("max_discount_zar" >= (0)::numeric))),
    CONSTRAINT "promotions_min_booking_amount_zar_check" CHECK (("min_booking_amount_zar" >= (0)::numeric)),
    CONSTRAINT "promotions_promotion_type_check" CHECK (("promotion_type" = ANY (ARRAY['first_booking'::"text", 'referral'::"text", 'membership'::"text", 'bundle'::"text", 'birthday'::"text", 'seasonal'::"text", 'promo_code'::"text", 'custom'::"text"]))),
    CONSTRAINT "promotions_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'scheduled'::"text", 'active'::"text", 'paused'::"text", 'expired'::"text", 'ended'::"text"]))),
    CONSTRAINT "promotions_usage_limit_per_customer_check" CHECK ((("usage_limit_per_customer" IS NULL) OR ("usage_limit_per_customer" > 0))),
    CONSTRAINT "promotions_usage_limit_total_check" CHECK ((("usage_limit_total" IS NULL) OR ("usage_limit_total" > 0)))
);


COMMENT ON TABLE "public"."promotions" IS 'Admin-configurable promotions and seasonal campaigns. Evaluated server-side at checkout.';



COMMENT ON COLUMN "public"."promotions"."hero_image_url" IS 'Campaign landing / hero creative URL';



COMMENT ON COLUMN "public"."promotions"."qr_code_data_url" IS 'Cached QR code (data URL) pointing at campaign landing page';



COMMENT ON COLUMN "public"."promotions"."template_key" IS 'Optional reusable campaign template key used at creation';



CREATE TABLE IF NOT EXISTS "public"."recurring_bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "address_id" "uuid",
    "frequency" "text" NOT NULL,
    "days_of_week" integer[] NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "price" numeric NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "next_run_date" "date" NOT NULL,
    "last_generated_at" timestamp with time zone,
    "paystack_authorization_code" "text",
    "booking_snapshot_template" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "skip_next_occurrence_date" "date",
    "monthly_pattern" "text" DEFAULT 'mirror_start_date'::"text" NOT NULL,
    "monthly_nth" smallint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "preferred_cleaner_id" "uuid",
    CONSTRAINT "recurring_bookings_days_of_week_elems_chk" CHECK (((("cardinality"("days_of_week") >= 1) AND ("cardinality"("days_of_week") <= 7)) AND ("days_of_week" <@ ARRAY[1, 2, 3, 4, 5, 6, 7]))),
    CONSTRAINT "recurring_bookings_frequency_check" CHECK (("frequency" = ANY (ARRAY['weekly'::"text", 'biweekly'::"text", 'monthly'::"text"]))),
    CONSTRAINT "recurring_bookings_monthly_nth_check" CHECK ((("monthly_nth" IS NULL) OR (("monthly_nth" >= 1) AND ("monthly_nth" <= 4)))),
    CONSTRAINT "recurring_bookings_monthly_pattern_check" CHECK (("monthly_pattern" = ANY (ARRAY['mirror_start_date'::"text", 'nth_weekday'::"text", 'last_weekday'::"text"]))),
    CONSTRAINT "recurring_bookings_price_check" CHECK (("price" >= (0)::numeric)),
    CONSTRAINT "recurring_bookings_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'cancelled'::"text"])))
);


COMMENT ON TABLE "public"."recurring_bookings" IS 'Customer recurring schedule; cron generates pending_payment bookings and charges saved Paystack authorizations.';



COMMENT ON COLUMN "public"."recurring_bookings"."monthly_pattern" IS 'Monthly mode: mirror start_date week-ordinal, Nth weekday in month (monthly_nth), or last weekday in month.';



COMMENT ON COLUMN "public"."recurring_bookings"."monthly_nth" IS 'When monthly_pattern=nth_weekday: 1=first … 4=fourth occurrence of primary weekday (smallest days_of_week) in each month.';



COMMENT ON COLUMN "public"."recurring_bookings"."preferred_cleaner_id" IS 'M-6: customer/admin preferred cleaner for spawned occurrences. The recurring generator copies this onto the new bookings row as selected_cleaner_id (assignment_type=user_selected). Mutable independently of booking_snapshot_template so changing the pick does not require a snapshot rebuild. NULL falls back to template.locked.cleaner_id then template.cleaner_id; if all three are NULL the occurrence dispatches without a customer-picked cleaner. ON DELETE SET NULL: removing a cleaner never breaks recurring generation, it merely reverts the plan to auto-dispatch.';



CREATE TABLE IF NOT EXISTS "public"."recurring_expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "description" "text" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "vendor_id" "uuid",
    "branch_id" "uuid" NOT NULL,
    "amount_cents" integer NOT NULL,
    "payment_method" "text" NOT NULL,
    "paid_from_account_id" "uuid",
    "frequency" "text" NOT NULL,
    "next_run_date" "date" NOT NULL,
    "last_generated_at" timestamp with time zone,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "auto_approve" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "external_accounting_id" "text",
    "sync_status" "text" DEFAULT 'not_synced'::"text" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "recurring_expenses_amount_cents_check" CHECK (("amount_cents" > 0)),
    CONSTRAINT "recurring_expenses_frequency_check" CHECK (("frequency" = ANY (ARRAY['daily'::"text", 'weekly'::"text", 'monthly'::"text", 'quarterly'::"text", 'yearly'::"text"]))),
    CONSTRAINT "recurring_expenses_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['cash'::"text", 'card'::"text", 'bank_transfer'::"text", 'paystack'::"text", 'eft'::"text", 'other'::"text"]))),
    CONSTRAINT "recurring_expenses_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "recurring_expenses_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['not_synced'::"text", 'pending'::"text", 'synced'::"text", 'failed'::"text"])))
);


CREATE TABLE IF NOT EXISTS "public"."referral_program_settings" (
    "id" "text" DEFAULT 'default'::"text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "reward_amount_zar" numeric DEFAULT 50 NOT NULL,
    "checkout_discount_zar" numeric DEFAULT 50 NOT NULL,
    "min_booking_value_zar" numeric DEFAULT 0 NOT NULL,
    "reward_on" "text" DEFAULT 'first_paid_booking'::"text" NOT NULL,
    "reward_expiry_days" integer,
    "max_rewards_per_customer" integer,
    "allow_multiple_referrals" boolean DEFAULT true NOT NULL,
    "eligible_service_categories" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "hero_headline" "text" DEFAULT 'Love Our Cleaning? Get Rewarded for Sharing Shalean!'::"text" NOT NULL,
    "hero_subheading" "text" DEFAULT 'Refer your friends, neighbours, family members, or colleagues. When they complete their first cleaning with Shalean, you''ll earn Cleaning Credit towards your next booking.'::"text" NOT NULL,
    "promotional_text" "text",
    "terms_and_conditions" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "referral_program_settings_checkout_discount_zar_check" CHECK (("checkout_discount_zar" >= (0)::numeric)),
    CONSTRAINT "referral_program_settings_id_check" CHECK (("id" = 'default'::"text")),
    CONSTRAINT "referral_program_settings_max_rewards_per_customer_check" CHECK ((("max_rewards_per_customer" IS NULL) OR ("max_rewards_per_customer" > 0))),
    CONSTRAINT "referral_program_settings_min_booking_value_zar_check" CHECK (("min_booking_value_zar" >= (0)::numeric)),
    CONSTRAINT "referral_program_settings_reward_amount_zar_check" CHECK (("reward_amount_zar" >= (0)::numeric)),
    CONSTRAINT "referral_program_settings_reward_expiry_days_check" CHECK ((("reward_expiry_days" IS NULL) OR ("reward_expiry_days" > 0))),
    CONSTRAINT "referral_program_settings_reward_on_check" CHECK (("reward_on" = ANY (ARRAY['first_paid_booking'::"text", 'first_completed_booking'::"text"])))
);


CREATE TABLE IF NOT EXISTS "public"."referral_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "referrer_name" "text" NOT NULL,
    "referrer_phone" "text" NOT NULL,
    "referrer_email" "text" NOT NULL,
    "friend_name" "text" NOT NULL,
    "friend_phone" "text" NOT NULL,
    "friend_email" "text",
    "message" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "referrer_user_id" "uuid",
    "referral_id" "uuid",
    "admin_notes" "text",
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "referral_submissions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'expired'::"text", 'cancelled'::"text"])))
);


CREATE TABLE IF NOT EXISTS "public"."referrals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "referrer_id" "uuid" NOT NULL,
    "referrer_type" "text" NOT NULL,
    "referred_email_or_phone" "text" NOT NULL,
    "referred_user_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reward_amount" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "code" "text",
    "rewarded_at" timestamp with time zone,
    "admin_notes" "text",
    "submission_id" "uuid",
    "credit_expires_at" timestamp with time zone,
    "rejected_at" timestamp with time zone,
    "rejected_by" "text",
    CONSTRAINT "referrals_referrer_type_check" CHECK (("referrer_type" = ANY (ARRAY['customer'::"text", 'cleaner'::"text"]))),
    CONSTRAINT "referrals_reward_amount_check" CHECK (("reward_amount" >= (0)::numeric)),
    CONSTRAINT "referrals_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'rewarded'::"text", 'expired'::"text", 'cancelled'::"text"])))
);


CREATE TABLE IF NOT EXISTS "public"."review_sms_prompt_queue" (
    "booking_id" "uuid" NOT NULL,
    "first_due_at" timestamp with time zone NOT NULL,
    "reminder_due_at" timestamp with time zone NOT NULL,
    "first_sent_at" timestamp with time zone,
    "reminder_sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."review_sms_prompt_queue" IS 'Deferred review SMS: app cron sends first after first_due_at, optional reminder after reminder_due_at.';



CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "cleaner_id" "uuid" NOT NULL,
    "rating" smallint NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_hidden" boolean DEFAULT false NOT NULL,
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


COMMENT ON COLUMN "public"."reviews"."is_hidden" IS 'When true, review is excluded from public aggregates and customer-facing snippets; admin-only.';



CREATE TABLE IF NOT EXISTS "public"."sales_document_paystack_charge_dedup" (
    "charge_reference" "text" NOT NULL,
    "document_id" "uuid" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sales_document_paystack_charge_dedup_amount_cents_check" CHECK (("amount_cents" >= 0))
);


CREATE TABLE IF NOT EXISTS "public"."sales_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_type" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "customer_id" "uuid",
    "customer_name" "text" NOT NULL,
    "customer_email" "text" NOT NULL,
    "customer_phone" "text",
    "line_items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "subtotal_cents" bigint DEFAULT 0 NOT NULL,
    "total_cents" bigint DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'ZAR'::"text" NOT NULL,
    "due_date" "date",
    "notes" "text",
    "sent_at" timestamp with time zone,
    "converted_from_id" "uuid",
    "public_token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(32), 'hex'::"text") NOT NULL,
    "paystack_reference" "text",
    "payment_link" "text",
    "payment_link_expires_at" timestamp with time zone,
    "amount_paid_cents" bigint DEFAULT 0 NOT NULL,
    "balance_cents" bigint DEFAULT 0 NOT NULL,
    "zoho_estimate_id" "text",
    "zoho_invoice_id" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" DEFAULT 'admin'::"text" NOT NULL,
    "request_details" "jsonb",
    "first_viewed_at" timestamp with time zone,
    "last_viewed_at" timestamp with time zone,
    "view_count" integer DEFAULT 0 NOT NULL,
    "refunded_at" timestamp with time zone,
    "refund_reference" "text",
    "zoho_invoice_number" "text",
    "zoho_estimate_number" "text",
    CONSTRAINT "sales_documents_amount_paid_cents_check" CHECK (("amount_paid_cents" >= 0)),
    CONSTRAINT "sales_documents_balance_cents_check" CHECK (("balance_cents" >= 0)),
    CONSTRAINT "sales_documents_document_type_check" CHECK (("document_type" = ANY (ARRAY['quote'::"text", 'invoice'::"text"]))),
    CONSTRAINT "sales_documents_source_check" CHECK (("source" = ANY (ARRAY['admin'::"text", 'customer_request'::"text"]))),
    CONSTRAINT "sales_documents_status_check" CHECK (("status" = ANY (ARRAY['requested'::"text", 'draft'::"text", 'sent'::"text", 'accepted'::"text", 'paid'::"text", 'refunded'::"text", 'void'::"text", 'expired'::"text"]))),
    CONSTRAINT "sales_documents_subtotal_cents_check" CHECK (("subtotal_cents" >= 0)),
    CONSTRAINT "sales_documents_total_cents_check" CHECK (("total_cents" >= 0)),
    CONSTRAINT "sales_documents_view_count_nonneg" CHECK (("view_count" >= 0))
);


COMMENT ON TABLE "public"."sales_documents" IS 'Admin-created ad-hoc quotes and invoices; guest access via public_token on server routes.';



COMMENT ON COLUMN "public"."sales_documents"."source" IS 'admin = created in Office; customer_request = submitted via public /quote form.';



COMMENT ON COLUMN "public"."sales_documents"."request_details" IS 'Structured payload from public quote request form (service, rooms, suburb, etc.).';



COMMENT ON COLUMN "public"."sales_documents"."refunded_at" IS 'When this invoice payment was refunded (Paystack or recorded manually in Office).';



COMMENT ON COLUMN "public"."sales_documents"."refund_reference" IS 'Paystack refund transaction reference when refund was processed online.';



COMMENT ON COLUMN "public"."sales_documents"."zoho_invoice_number" IS 'Zoho Books invoice_number for sales invoices (document_type = invoice).';



COMMENT ON COLUMN "public"."sales_documents"."zoho_estimate_number" IS 'Zoho Books estimate_number for quotes (document_type = quote).';



CREATE TABLE IF NOT EXISTS "public"."seo_auto_hub_ui_patch" (
    "slug" "text" NOT NULL,
    "swap_hero_book_ctas" boolean DEFAULT false NOT NULL,
    "reason" "text",
    "confidence" numeric DEFAULT 0 NOT NULL,
    "source" "text" DEFAULT 'optimizer'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "seo_auto_hub_ui_patch_confidence_check" CHECK ((("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric)))
);


COMMENT ON TABLE "public"."seo_auto_hub_ui_patch" IS 'When swap_hero_book_ctas is true, hub renders hero booking CTAs in promoted order with styles swapped (growth optimizer).';



CREATE TABLE IF NOT EXISTS "public"."seo_auto_title_variant" (
    "slug" "text" NOT NULL,
    "variant" "text" NOT NULL,
    "reason" "text",
    "confidence" numeric DEFAULT 0 NOT NULL,
    "source" "text" DEFAULT 'optimizer'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "seo_auto_title_variant_confidence_check" CHECK ((("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric))),
    CONSTRAINT "seo_auto_title_variant_variant_check" CHECK (("variant" = ANY (ARRAY['A'::"text", 'B'::"text", 'C'::"text"])))
);


COMMENT ON TABLE "public"."seo_auto_title_variant" IS 'Winning A/B/C template id per hub slug when auto-apply runs; merged in resolveLocationTitleVariant after env titleVariant.';



CREATE TABLE IF NOT EXISTS "public"."seo_insights_recommendations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text",
    "kind" "text" NOT NULL,
    "severity" "text" DEFAULT 'info'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "detail" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "confidence" numeric DEFAULT 0 NOT NULL,
    "applied_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "seo_insights_recommendations_confidence_check" CHECK ((("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric))),
    CONSTRAINT "seo_insights_recommendations_severity_check" CHECK (("severity" = ANY (ARRAY['info'::"text", 'warn'::"text", 'critical'::"text"])))
);


COMMENT ON TABLE "public"."seo_insights_recommendations" IS 'Automated SEO UX recommendations from GSC + user_events (scroll, CTA).';



CREATE TABLE IF NOT EXISTS "public"."service_earning_caps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_id" "text" NOT NULL,
    "cap_cents" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "effective_from" timestamp with time zone,
    "effective_to" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "starting_price" integer,
    "badge" "text",
    "image_url" "text",
    "features" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."services" IS 'Marketing homepage service lines for structured data; not the checkout pricing_services catalog.';



CREATE TABLE IF NOT EXISTS "public"."social_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "account_name" "text",
    "account_id" "text",
    "location_name" "text",
    "location_id" "text",
    "access_token" "text",
    "refresh_token" "text",
    "expires_at" timestamp with time zone,
    "connected_by" "text",
    "connected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_sync" timestamp with time zone,
    "last_publish_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending_location'::"text" NOT NULL,
    "health" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_accounts_health_check" CHECK (("health" = ANY (ARRAY['healthy'::"text", 'degraded'::"text", 'error'::"text", 'unknown'::"text"]))),
    CONSTRAINT "social_accounts_provider_check" CHECK (("provider" = ANY (ARRAY['google_business'::"text", 'facebook'::"text", 'instagram'::"text", 'linkedin'::"text", 'pinterest'::"text", 'twitter'::"text"]))),
    CONSTRAINT "social_accounts_status_check" CHECK (("status" = ANY (ARRAY['connected'::"text", 'pending_location'::"text", 'error'::"text", 'disconnected'::"text"])))
);


COMMENT ON TABLE "public"."social_accounts" IS 'Admin social publishing connections. Refresh tokens must be stored encrypted at rest.';



COMMENT ON COLUMN "public"."social_accounts"."access_token" IS 'Encrypted short-lived access token; refreshed automatically when expired.';



COMMENT ON COLUMN "public"."social_accounts"."refresh_token" IS 'Encrypted OAuth refresh token (AES-256-GCM). Never expose to clients.';



COMMENT ON COLUMN "public"."social_accounts"."metadata" IS 'Provider-specific JSON (available locations, last error, Google account resource names, etc.).';



CREATE TABLE IF NOT EXISTS "public"."social_publish_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "promotion_id" "uuid",
    "campaign_name" "text",
    "status" "text" NOT NULL,
    "response_id" "text",
    "api_response" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error_message" "text",
    "published_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_publish_history_status_check" CHECK (("status" = ANY (ARRAY['published'::"text", 'failed'::"text"])))
);


COMMENT ON TABLE "public"."social_publish_history" IS 'Audit trail for one-click social publishes (Google Business, Facebook, etc.).';



CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "service_type" "text" NOT NULL,
    "frequency" "text" NOT NULL,
    "day_of_week" smallint NOT NULL,
    "time_slot" "text" NOT NULL,
    "address" "text" NOT NULL,
    "price_per_visit" numeric NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "next_booking_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paystack_customer_code" "text",
    "authorization_code" "text",
    "last_payment_date" "date",
    "payment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "retry_count" integer DEFAULT 0 NOT NULL,
    "last_payment_error" "text",
    "last_charge_reference" "text",
    "last_reminder_date" "date",
    "city_id" "uuid",
    CONSTRAINT "subscriptions_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6))),
    CONSTRAINT "subscriptions_frequency_check" CHECK (("frequency" = ANY (ARRAY['weekly'::"text", 'biweekly'::"text", 'monthly'::"text"]))),
    CONSTRAINT "subscriptions_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'success'::"text", 'failed'::"text"]))),
    CONSTRAINT "subscriptions_price_per_visit_check" CHECK (("price_per_visit" >= (0)::numeric)),
    CONSTRAINT "subscriptions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'cancelled'::"text"])))
);


CREATE TABLE IF NOT EXISTS "public"."system_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "level" "text" NOT NULL,
    "source" "text" NOT NULL,
    "message" "text" NOT NULL,
    "context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "system_logs_level_check" CHECK (("level" = ANY (ARRAY['error'::"text", 'warn'::"text", 'info'::"text"])))
);


CREATE TABLE IF NOT EXISTS "public"."system_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "metric" "text" NOT NULL,
    "value" numeric DEFAULT 1 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."system_metrics" IS 'Optional numeric counters / audit points (Day 7 observability).';



CREATE TABLE IF NOT EXISTS "public"."team_daily_capacity_usage" (
    "team_id" "uuid" NOT NULL,
    "booking_date" "date" NOT NULL,
    "used_slots" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


CREATE TABLE IF NOT EXISTS "public"."team_job_member_payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "cleaner_id" "uuid",
    "payout_cents" integer NOT NULL,
    "status" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


CREATE TABLE IF NOT EXISTS "public"."team_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid",
    "cleaner_id" "uuid" NOT NULL,
    "active_from" timestamp with time zone,
    "active_to" timestamp with time zone
);


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "service_type" "text" NOT NULL,
    "capacity_per_day" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lead_cleaner_id" "uuid"
);


COMMENT ON COLUMN "public"."teams"."lead_cleaner_id" IS 'Admin-appointed team lead. Must be an active team_members.cleaner_id. Drives payout_owner on new team assignments.';



CREATE TABLE IF NOT EXISTS "public"."templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "channel" "text" NOT NULL,
    "subject" "text",
    "content" "text" NOT NULL,
    "variables" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "templates_channel_check" CHECK (("channel" = ANY (ARRAY['email'::"text", 'whatsapp'::"text", 'sms'::"text"])))
);


COMMENT ON TABLE "public"."templates" IS 'Notification copy catalog (email / SMS / WhatsApp). booking_confirmed email+SMS are read at send-time when active; other rows are ops-editable reference unless wired in app code.';



CREATE TABLE IF NOT EXISTS "public"."travel_route_cache" (
    "origin_location_id" "uuid" NOT NULL,
    "dest_location_id" "uuid" NOT NULL,
    "minutes" real NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "travel_route_cache_minutes_check" CHECK (("minutes" >= (0)::double precision))
);


COMMENT ON TABLE "public"."travel_route_cache" IS 'Dispatch: cached drive-time minutes between area centroids; TTL 10–30m.';



CREATE TABLE IF NOT EXISTS "public"."user_behavior" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "session_id" "text",
    "signal_type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."user_behavior" IS 'Optional learning signals; complements user_events.';



CREATE TABLE IF NOT EXISTS "public"."user_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "type" "text" DEFAULT 'system'::"text" NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "booking_id" "uuid",
    CONSTRAINT "user_notifications_type_check" CHECK (("type" = ANY (ARRAY['confirmed'::"text", 'assigned'::"text", 'reminder'::"text", 'system'::"text", 'cancelled'::"text"])))
);


COMMENT ON TABLE "public"."user_notifications" IS 'Customer notifications; inserts typically via service role / backend jobs.';



COMMENT ON COLUMN "public"."user_notifications"."booking_id" IS 'Optional FK for booking-scoped notifications and dashboard deep links.';



CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "booking_count" integer DEFAULT 0 NOT NULL,
    "total_spent_cents" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tier" "text" DEFAULT 'regular'::"text" NOT NULL,
    "referral_code" "text",
    "credit_balance_zar" numeric DEFAULT 0 NOT NULL,
    "preferred_notification_channel" "text",
    "primary_city_id" "uuid",
    "last_ai_timing_applied_at" timestamp with time zone,
    "full_name" "text",
    "billing_type" "text" DEFAULT 'per_booking'::"text" NOT NULL,
    "schedule_type" "text" DEFAULT 'on_demand'::"text" NOT NULL,
    "account_billing_risk" "text" DEFAULT 'ok'::"text" NOT NULL,
    "referral_code_expires_at" timestamp with time zone,
    "referral_code_max_uses" integer,
    "role" "text",
    "marketing_emails_unsubscribed_at" timestamp with time zone,
    "billing_email" "text",
    "phone" "text",
    "phone_e164" "text",
    "finance_access" boolean DEFAULT false NOT NULL,
    "finance_manager_access" boolean DEFAULT false NOT NULL,
    "finance_owner_access" boolean DEFAULT false NOT NULL,
    "date_of_birth" "date",
    CONSTRAINT "user_profiles_account_billing_risk_check" CHECK (("account_billing_risk" = ANY (ARRAY['ok'::"text", 'at_risk'::"text"]))),
    CONSTRAINT "user_profiles_billing_type_check" CHECK (("billing_type" = ANY (ARRAY['per_booking'::"text", 'monthly'::"text"]))),
    CONSTRAINT "user_profiles_booking_count_check" CHECK (("booking_count" >= 0)),
    CONSTRAINT "user_profiles_monthly_requires_on_demand" CHECK ((("billing_type" <> 'monthly'::"text") OR ("schedule_type" = 'on_demand'::"text"))),
    CONSTRAINT "user_profiles_preferred_notification_channel_check" CHECK ((("preferred_notification_channel" IS NULL) OR ("preferred_notification_channel" = ANY (ARRAY['whatsapp'::"text", 'sms'::"text", 'email'::"text"])))),
    CONSTRAINT "user_profiles_role_check" CHECK ((("role" IS NULL) OR ("role" = ANY (ARRAY['admin'::"text", 'cleaner'::"text", 'customer'::"text"])))),
    CONSTRAINT "user_profiles_schedule_type_check" CHECK (("schedule_type" = ANY (ARRAY['fixed_schedule'::"text", 'on_demand'::"text"]))),
    CONSTRAINT "user_profiles_tier_check" CHECK (("tier" = ANY (ARRAY['regular'::"text", 'silver'::"text", 'gold'::"text", 'platinum'::"text"]))),
    CONSTRAINT "user_profiles_total_spent_cents_check" CHECK (("total_spent_cents" >= 0))
);


COMMENT ON COLUMN "public"."user_profiles"."tier" IS 'Loyalty band: regular | silver | gold | platinum — from booking_count and total_spent_cents.';



COMMENT ON COLUMN "public"."user_profiles"."preferred_notification_channel" IS 'Outbound preference for booking comms: whatsapp | sms | email | null (null = default: try WhatsApp then SMS fallback where applicable).';



COMMENT ON COLUMN "public"."user_profiles"."last_ai_timing_applied_at" IS 'Set when a non-zero AI send delay is applied; suppresses re-optimization for 24h.';



COMMENT ON COLUMN "public"."user_profiles"."billing_type" IS 'per_booking: Paystack per checkout (default). monthly: jobs roll into MonthlyInvoice; settled at month-end.';



COMMENT ON COLUMN "public"."user_profiles"."schedule_type" IS 'fixed_schedule: recurring_bookings cron may spawn visits. on_demand: no auto-generated visits.';



COMMENT ON COLUMN "public"."user_profiles"."account_billing_risk" IS 'at_risk when customer has an open overdue monthly invoice (is_overdue + balance); ops may gate booking UX.';



COMMENT ON COLUMN "public"."user_profiles"."referral_code_expires_at" IS 'When set, checkout discounts using this customer referral code are rejected after this instant.';



COMMENT ON COLUMN "public"."user_profiles"."referral_code_max_uses" IS 'When set, max successful checkout redemptions for this code (global count).';



COMMENT ON COLUMN "public"."user_profiles"."role" IS 'Primary app role: admin → /office, cleaner → /jobs, customer → /account. New profiles default to customer.';



COMMENT ON COLUMN "public"."user_profiles"."marketing_emails_unsubscribed_at" IS 'When set, customer opted out of marketing lifecycle emails (rebook_offer, rebook_reminder). Does not block reminder_24h or review_request.';



COMMENT ON COLUMN "public"."user_profiles"."billing_email" IS 'Real customer email for invoices, Zoho, and lifecycle mail — never @cleaner.shalean.com / @walkin.shalean.com.';



COMMENT ON COLUMN "public"."user_profiles"."phone" IS 'Display/normalized phone for ops and billing contact resolution.';



COMMENT ON COLUMN "public"."user_profiles"."phone_e164" IS 'Canonical SA mobile (+27…) when parseable; used for dedupe and contact lookup.';



COMMENT ON COLUMN "public"."user_profiles"."finance_access" IS 'When true, user can access expense management (in addition to admin email allowlist).';



COMMENT ON COLUMN "public"."user_profiles"."finance_manager_access" IS 'Can approve expenses at manager stage (large amounts).';



COMMENT ON COLUMN "public"."user_profiles"."finance_owner_access" IS 'Can approve expenses at owner stage (very large amounts).';



COMMENT ON COLUMN "public"."user_profiles"."date_of_birth" IS 'Customer birthday (date only). Used for birthday cleaning credit automation.';



COMMENT ON CONSTRAINT "user_profiles_monthly_requires_on_demand" ON "public"."user_profiles" IS 'Monthly invoicing is only valid with on_demand schedule (no fixed-schedule auto-spawn drift).';



CREATE TABLE IF NOT EXISTS "public"."user_push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text",
    "app" "text" DEFAULT 'customer'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_push_tokens_app_check" CHECK (("app" = ANY (ARRAY['customer'::"text", 'cleaner'::"text"]))),
    CONSTRAINT "user_push_tokens_token_len" CHECK ((("char_length"("token") >= 16) AND ("char_length"("token") <= 512)))
);


COMMENT ON TABLE "public"."user_push_tokens" IS 'Expo push tokens for mobile apps; register via /api/customer/devices (service role + JWT ownership).';



CREATE TABLE IF NOT EXISTS "public"."whatsapp_cleaner_unmatched_intent_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inbound_message_id" "text",
    "cleaner_id" "uuid" NOT NULL,
    "phone" "text",
    "intent" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whatsapp_cleaner_unmatched_intent_log_intent_check" CHECK (("intent" = ANY (ARRAY['accept'::"text", 'decline'::"text"]))),
    CONSTRAINT "whatsapp_cleaner_unmatched_intent_log_reason_check" CHECK (("reason" = ANY (ARRAY['no_match'::"text", 'ambiguous'::"text"])))
);


COMMENT ON TABLE "public"."whatsapp_cleaner_unmatched_intent_log" IS 'Cleaner WhatsApp reply looked like accept/decline but did not resolve to one assigned booking (no_match or ambiguous).';



CREATE TABLE IF NOT EXISTS "public"."whatsapp_delivery_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "text" NOT NULL,
    "status" "text" NOT NULL,
    "event_at" timestamp with time zone NOT NULL,
    "booking_id" "uuid",
    "cleaner_id" "uuid",
    "failure_category" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whatsapp_delivery_events_failure_category_check" CHECK ((("failure_category" IS NULL) OR ("failure_category" = ANY (ARRAY['invalid_number'::"text", 'blocked'::"text", 'template_rejected'::"text", 'rate_limited'::"text", 'unknown'::"text"])))),
    CONSTRAINT "whatsapp_delivery_events_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'delivered'::"text", 'read'::"text", 'failed'::"text"])))
);


COMMENT ON TABLE "public"."whatsapp_delivery_events" IS 'Idempotent Meta message status webhooks (sent/delivered/read/failed) for WhatsApp channel analytics.';



CREATE TABLE IF NOT EXISTS "public"."whatsapp_inbound_feedback_dedupe" (
    "meta_message_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


COMMENT ON TABLE "public"."whatsapp_inbound_feedback_dedupe" IS 'One row per inbound wamid that already received the unmatched-reply WhatsApp hint; prevents duplicate hints on Meta retries.';



CREATE TABLE IF NOT EXISTS "public"."whatsapp_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "phone" "text" NOT NULL,
    "message_type" "text" NOT NULL,
    "status" "text" NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "meta_message_id" "text",
    "webhook_payload" "jsonb",
    "meta_receipt_status" "text",
    "first_read_at" timestamp with time zone,
    "failure_category" "text",
    CONSTRAINT "whatsapp_logs_message_type_check" CHECK (("message_type" = ANY (ARRAY['text'::"text", 'template'::"text"]))),
    CONSTRAINT "whatsapp_logs_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'failed'::"text", 'failed_delivery'::"text"])))
);


COMMENT ON TABLE "public"."whatsapp_logs" IS 'One row per Meta WhatsApp API attempt (text or template); inserted from Next.js via service role.';



COMMENT ON COLUMN "public"."whatsapp_logs"."meta_message_id" IS 'Meta Graph message id (wamid.*) from send response; matched on inbound status webhooks.';



COMMENT ON COLUMN "public"."whatsapp_logs"."webhook_payload" IS 'Last Meta status object received for this message (delivery receipts).';



COMMENT ON COLUMN "public"."whatsapp_logs"."meta_receipt_status" IS 'Latest Meta lifecycle status from webhooks: sent | delivered | read | failed (does not replace legacy status column).';



COMMENT ON COLUMN "public"."whatsapp_logs"."failure_category" IS 'Normalized failure bucket when Meta reports failed (Phase 8D taxonomy).';



CREATE TABLE IF NOT EXISTS "public"."zoho_integration_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "singleton_key" "text" DEFAULT 'default'::"text" NOT NULL,
    "expense_category_mappings" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "default_paystack_vendor_id" "uuid",
    "default_paystack_category_id" "uuid",
    "sync_frequency_minutes" integer DEFAULT 15 NOT NULL,
    "max_retry_attempts" integer DEFAULT 5 NOT NULL,
    "retry_base_delay_seconds" integer DEFAULT 60 NOT NULL,
    "auto_sync_enabled" boolean DEFAULT true NOT NULL,
    "last_sync_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "zoho_integration_settings_max_retry_attempts_check" CHECK ((("max_retry_attempts" >= 1) AND ("max_retry_attempts" <= 20))),
    CONSTRAINT "zoho_integration_settings_retry_base_delay_seconds_check" CHECK ((("retry_base_delay_seconds" >= 10) AND ("retry_base_delay_seconds" <= 3600))),
    CONSTRAINT "zoho_integration_settings_sync_frequency_minutes_check" CHECK ((("sync_frequency_minutes" >= 5) AND ("sync_frequency_minutes" <= 1440)))
);


COMMENT ON TABLE "public"."zoho_integration_settings" IS 'Admin-configurable Zoho Books integration settings. OAuth credentials remain in env vars.';



ALTER TABLE ONLY "public"."accounting_invoice_sync"
    ADD CONSTRAINT "accounting_invoice_sync_entity_type_entity_id_key" UNIQUE ("entity_type", "entity_id");



ALTER TABLE ONLY "public"."accounting_invoice_sync"
    ADD CONSTRAINT "accounting_invoice_sync_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accounting_sync_records"
    ADD CONSTRAINT "accounting_sync_records_entity_type_entity_id_key" UNIQUE ("entity_type", "entity_id");



ALTER TABLE ONLY "public"."accounting_sync_records"
    ADD CONSTRAINT "accounting_sync_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_api_idempotency"
    ADD CONSTRAINT "admin_api_idempotency_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_api_idempotency"
    ADD CONSTRAINT "admin_api_idempotency_uid" UNIQUE ("idempotency_key", "route", "invoice_id", "action");



ALTER TABLE ONLY "public"."admin_billing_idempotency"
    ADD CONSTRAINT "admin_billing_idempotency_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_booking_create_idempotency"
    ADD CONSTRAINT "admin_booking_create_idempotency_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_booking_create_idempotency"
    ADD CONSTRAINT "admin_booking_create_idempotency_uid" UNIQUE ("idempotency_key", "route", "customer_user_id", "service_date", "service_time", "service_slug", "location_hash");



ALTER TABLE ONLY "public"."admin_earnings_actions"
    ADD CONSTRAINT "admin_earnings_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_money_action_proposals"
    ADD CONSTRAINT "admin_money_action_proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_request_dedupe"
    ADD CONSTRAINT "admin_request_dedupe_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_request_dedupe"
    ADD CONSTRAINT "admin_request_dedupe_scope_key" UNIQUE ("scope", "dedupe_key");



ALTER TABLE ONLY "public"."ai_decision_logs"
    ADD CONSTRAINT "ai_decision_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_experiment_exposures"
    ADD CONSTRAINT "ai_experiment_exposures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_feature_store"
    ADD CONSTRAINT "ai_feature_store_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_model_weights"
    ADD CONSTRAINT "ai_model_weights_pkey" PRIMARY KEY ("decision_scope");



ALTER TABLE ONLY "public"."birthday_rewards"
    ADD CONSTRAINT "birthday_rewards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blog_authors"
    ADD CONSTRAINT "blog_authors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blog_authors"
    ADD CONSTRAINT "blog_authors_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."blog_categories"
    ADD CONSTRAINT "blog_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blog_categories"
    ADD CONSTRAINT "blog_categories_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."blog_post_tags"
    ADD CONSTRAINT "blog_post_tags_pkey" PRIMARY KEY ("post_id", "tag_id");



ALTER TABLE ONLY "public"."blog_posts"
    ADD CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blog_posts"
    ADD CONSTRAINT "blog_posts_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."blog_tags"
    ADD CONSTRAINT "blog_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blog_tags"
    ADD CONSTRAINT "blog_tags_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."booking_changes"
    ADD CONSTRAINT "booking_changes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_cleaner_earnings_snapshot_lines"
    ADD CONSTRAINT "booking_cleaner_earnings_snapshot_line_booking_line_item_id_key" UNIQUE ("booking_line_item_id");



ALTER TABLE ONLY "public"."booking_cleaner_earnings_snapshot_lines"
    ADD CONSTRAINT "booking_cleaner_earnings_snapshot_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_cleaner_earnings_snapshot"
    ADD CONSTRAINT "booking_cleaner_earnings_snapshot_pkey" PRIMARY KEY ("booking_id");



ALTER TABLE ONLY "public"."booking_cleaners"
    ADD CONSTRAINT "booking_cleaners_booking_id_cleaner_id_key" UNIQUE ("booking_id", "cleaner_id");



ALTER TABLE ONLY "public"."booking_cleaners"
    ADD CONSTRAINT "booking_cleaners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_demand_events"
    ADD CONSTRAINT "booking_demand_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_events"
    ADD CONSTRAINT "booking_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_lifecycle_jobs"
    ADD CONSTRAINT "booking_lifecycle_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_line_items"
    ADD CONSTRAINT "booking_line_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_payment_recovery_jobs"
    ADD CONSTRAINT "booking_payment_recovery_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_roster_member_payouts"
    ADD CONSTRAINT "booking_roster_member_payouts_booking_id_cleaner_id_key" UNIQUE ("booking_id", "cleaner_id");



ALTER TABLE ONLY "public"."booking_roster_member_payouts"
    ADD CONSTRAINT "booking_roster_member_payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_service_checklists"
    ADD CONSTRAINT "booking_service_checklists_booking_cleaner_section_uidx" UNIQUE ("booking_id", "cleaner_id", "section_key");



ALTER TABLE ONLY "public"."booking_service_checklists"
    ADD CONSTRAINT "booking_service_checklists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_service_photos"
    ADD CONSTRAINT "booking_service_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_team_assignments"
    ADD CONSTRAINT "booking_team_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_totals"
    ADD CONSTRAINT "booking_totals_pkey" PRIMARY KEY ("booking_id");



ALTER TABLE "public"."bookings"
    ADD CONSTRAINT "bookings_cleaner_bonus_cents_nonnegative" CHECK ((("cleaner_bonus_cents" IS NULL) OR ("cleaner_bonus_cents" >= 0))) NOT VALID;



ALTER TABLE "public"."bookings"
    ADD CONSTRAINT "bookings_cleaner_payout_cents_nonnegative" CHECK ((("cleaner_payout_cents" IS NULL) OR ("cleaner_payout_cents" >= 0))) NOT VALID;



ALTER TABLE "public"."bookings"
    ADD CONSTRAINT "bookings_company_revenue_cents_nonnegative" CHECK ((("company_revenue_cents" IS NULL) OR ("company_revenue_cents" >= 0))) NOT VALID;



ALTER TABLE "public"."bookings"
    ADD CONSTRAINT "bookings_display_earnings_non_negative" CHECK ((("display_earnings_cents" IS NULL) OR ("display_earnings_cents" >= 0))) NOT VALID;



ALTER TABLE "public"."bookings"
    ADD CONSTRAINT "bookings_extras_amount_cents_nonnegative" CHECK ((("extras_amount_cents" IS NULL) OR ("extras_amount_cents" >= 0))) NOT VALID;



ALTER TABLE "public"."bookings"
    ADD CONSTRAINT "bookings_internal_earnings_non_negative" CHECK ((("internal_earnings_cents" IS NULL) OR ("internal_earnings_cents" >= 0))) NOT VALID;



ALTER TABLE "public"."bookings"
    ADD CONSTRAINT "bookings_payout_earnings_non_negative" CHECK ((("payout_earnings_cents" IS NULL) OR ("payout_earnings_cents" >= 0))) NOT VALID;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_paystack_reference_key" UNIQUE ("paystack_reference");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."bookings"
    ADD CONSTRAINT "bookings_price_snapshot_required_check" CHECK (("price_snapshot" IS NOT NULL)) NOT VALID;



COMMENT ON CONSTRAINT "bookings_price_snapshot_required_check" ON "public"."bookings" IS 'NOT VALID: optional future enforcement that price_snapshot is set. Run ALTER TABLE ... VALIDATE CONSTRAINT when ready.';



ALTER TABLE "public"."bookings"
    ADD CONSTRAINT "bookings_total_paid_cents_nonnegative" CHECK ((("total_paid_cents" IS NULL) OR ("total_paid_cents" >= 0))) NOT VALID;



ALTER TABLE ONLY "public"."business_health_scores"
    ADD CONSTRAINT "business_health_scores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_health_scores"
    ADD CONSTRAINT "business_health_scores_score_date_key" UNIQUE ("score_date");



ALTER TABLE ONLY "public"."campaign_assets"
    ADD CONSTRAINT "campaign_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_content"
    ADD CONSTRAINT "campaign_content_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_content"
    ADD CONSTRAINT "campaign_content_promotion_id_channel_key" UNIQUE ("promotion_id", "channel");



ALTER TABLE ONLY "public"."campaign_templates"
    ADD CONSTRAINT "campaign_templates_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."campaign_templates"
    ADD CONSTRAINT "campaign_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cities"
    ADD CONSTRAINT "cities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cities"
    ADD CONSTRAINT "cities_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."city_configs"
    ADD CONSTRAINT "city_configs_pkey" PRIMARY KEY ("city_id");



ALTER TABLE ONLY "public"."cleaner_applications"
    ADD CONSTRAINT "cleaner_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cleaner_availability"
    ADD CONSTRAINT "cleaner_availability_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cleaner_booking_track_points"
    ADD CONSTRAINT "cleaner_booking_track_points_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cleaner_change_requests"
    ADD CONSTRAINT "cleaner_change_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cleaner_earnings_adjustments"
    ADD CONSTRAINT "cleaner_earnings_adjustments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cleaner_earnings_disbursements"
    ADD CONSTRAINT "cleaner_earnings_disbursements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cleaner_earnings_disputes"
    ADD CONSTRAINT "cleaner_earnings_disputes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cleaner_earnings"
    ADD CONSTRAINT "cleaner_earnings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cleaner_job_issue_report_idempotency"
    ADD CONSTRAINT "cleaner_job_issue_report_idempotency_pkey" PRIMARY KEY ("cleaner_id", "booking_id", "key_hash");



ALTER TABLE ONLY "public"."cleaner_job_issue_reports"
    ADD CONSTRAINT "cleaner_job_issue_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cleaner_job_lifecycle_idempotency"
    ADD CONSTRAINT "cleaner_job_lifecycle_idempotency_key_uidx" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."cleaner_job_lifecycle_idempotency"
    ADD CONSTRAINT "cleaner_job_lifecycle_idempotency_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cleaner_locations"
    ADD CONSTRAINT "cleaner_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cleaner_locations"
    ADD CONSTRAINT "cleaner_locations_unique_pair" UNIQUE ("cleaner_id", "location_id");



ALTER TABLE ONLY "public"."cleaner_payment_details"
    ADD CONSTRAINT "cleaner_payment_details_pkey" PRIMARY KEY ("cleaner_id");



ALTER TABLE ONLY "public"."cleaner_payout_runs"
    ADD CONSTRAINT "cleaner_payout_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cleaner_payouts"
    ADD CONSTRAINT "cleaner_payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cleaner_preferences"
    ADD CONSTRAINT "cleaner_preferences_pkey" PRIMARY KEY ("cleaner_id");



ALTER TABLE ONLY "public"."cleaner_report_feedback"
    ADD CONSTRAINT "cleaner_report_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cleaners"
    ADD CONSTRAINT "cleaners_auth_user_id_key" UNIQUE ("auth_user_id");



ALTER TABLE ONLY "public"."cleaners"
    ADD CONSTRAINT "cleaners_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."cleaners"
    ADD CONSTRAINT "cleaners_phone_key" UNIQUE ("phone");



ALTER TABLE ONLY "public"."cleaners"
    ADD CONSTRAINT "cleaners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cleaners"
    ADD CONSTRAINT "cleaners_referral_code_key" UNIQUE ("referral_code");



ALTER TABLE ONLY "public"."cleaning_credit_transactions"
    ADD CONSTRAINT "cleaning_credit_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversion_deferred_payment_link_emails"
    ADD CONSTRAINT "conversion_deferred_payment_link_emails_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversion_experiment_results"
    ADD CONSTRAINT "conversion_experiment_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversion_experiments"
    ADD CONSTRAINT "conversion_experiments_key_variant_key" UNIQUE ("key", "variant");



ALTER TABLE ONLY "public"."conversion_experiments"
    ADD CONSTRAINT "conversion_experiments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cron_http_targets"
    ADD CONSTRAINT "cron_http_targets_pkey" PRIMARY KEY ("singleton");



ALTER TABLE ONLY "public"."cron_run_leases"
    ADD CONSTRAINT "cron_run_leases_pkey" PRIMARY KEY ("job_name");



ALTER TABLE ONLY "public"."cron_runs"
    ADD CONSTRAINT "cron_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_contact_health"
    ADD CONSTRAINT "customer_contact_health_pkey" PRIMARY KEY ("phone_key");



ALTER TABLE ONLY "public"."customer_memberships"
    ADD CONSTRAINT "customer_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_saved_addresses"
    ADD CONSTRAINT "customer_saved_addresses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_segment"
    ADD CONSTRAINT "customer_segment_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."daily_booking_funnel_metrics"
    ADD CONSTRAINT "daily_booking_funnel_metrics_pkey" PRIMARY KEY ("day");



ALTER TABLE ONLY "public"."daily_conversion_metrics"
    ADD CONSTRAINT "daily_conversion_metrics_pkey" PRIMARY KEY ("day");



ALTER TABLE ONLY "public"."daily_payment_metrics"
    ADD CONSTRAINT "daily_payment_metrics_pkey" PRIMARY KEY ("day");



ALTER TABLE ONLY "public"."daily_service_metrics"
    ADD CONSTRAINT "daily_service_metrics_pkey" PRIMARY KEY ("day", "service_slug");



ALTER TABLE ONLY "public"."dispatch_experiment_snapshots"
    ADD CONSTRAINT "dispatch_experiment_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dispatch_experiment_snapshots"
    ADD CONSTRAINT "dispatch_experiment_snapshots_week_start_ux_variant_key" UNIQUE ("week_start", "ux_variant");



ALTER TABLE ONLY "public"."dispatch_logs"
    ADD CONSTRAINT "dispatch_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dispatch_metrics"
    ADD CONSTRAINT "dispatch_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dispatch_offer_exposure_dedupe"
    ADD CONSTRAINT "dispatch_offer_exposure_dedupe_pkey" PRIMARY KEY ("offer_id");



ALTER TABLE ONLY "public"."dispatch_offer_timeout_metric_emitted"
    ADD CONSTRAINT "dispatch_offer_timeout_metric_emitted_pkey" PRIMARY KEY ("offer_id");



ALTER TABLE ONLY "public"."dispatch_offers"
    ADD CONSTRAINT "dispatch_offers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dispatch_retry_queue"
    ADD CONSTRAINT "dispatch_retry_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."earnings_disbursement_transfers"
    ADD CONSTRAINT "earnings_disbursement_transfers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_campaign_sends"
    ADD CONSTRAINT "email_campaign_sends_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_campaigns"
    ADD CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_accounts"
    ADD CONSTRAINT "expense_accounts_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."expense_accounts"
    ADD CONSTRAINT "expense_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_approval_events"
    ADD CONSTRAINT "expense_approval_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_approval_limits"
    ADD CONSTRAINT "expense_approval_limits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_approval_limits"
    ADD CONSTRAINT "expense_approval_limits_stage_key" UNIQUE ("stage");



ALTER TABLE ONLY "public"."expense_categories"
    ADD CONSTRAINT "expense_categories_group_name_name_key" UNIQUE ("group_name", "name");



ALTER TABLE ONLY "public"."expense_categories"
    ADD CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_vendors"
    ADD CONSTRAINT "expense_vendors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."failed_jobs"
    ADD CONSTRAINT "failed_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."faqs"
    ADD CONSTRAINT "faqs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."faqs"
    ADD CONSTRAINT "faqs_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."finance_budget_lines"
    ADD CONSTRAINT "finance_budget_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_budgets"
    ADD CONSTRAINT "finance_budgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_chart_of_accounts"
    ADD CONSTRAINT "finance_chart_of_accounts_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."finance_chart_of_accounts"
    ADD CONSTRAINT "finance_chart_of_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_notifications"
    ADD CONSTRAINT "finance_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."growth_action_outcomes"
    ADD CONSTRAINT "growth_action_outcomes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."growth_customer_touch"
    ADD CONSTRAINT "growth_customer_touch_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_adjustments"
    ADD CONSTRAINT "invoice_adjustments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lifecycle_email_metrics"
    ADD CONSTRAINT "lifecycle_email_metrics_pkey" PRIMARY KEY ("date", "job_type");



ALTER TABLE ONLY "public"."lifecycle_email_settings"
    ADD CONSTRAINT "lifecycle_email_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location_gsc_metrics"
    ADD CONSTRAINT "location_gsc_metrics_pkey" PRIMARY KEY ("slug");



ALTER TABLE ONLY "public"."location_gsc_queries"
    ADD CONSTRAINT "location_gsc_queries_pkey" PRIMARY KEY ("query", "slug");



ALTER TABLE ONLY "public"."location_gsc_sync_meta"
    ADD CONSTRAINT "location_gsc_sync_meta_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."marketing_automation_rules"
    ADD CONSTRAINT "marketing_automation_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marketing_spend"
    ADD CONSTRAINT "marketing_spend_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."membership_plans"
    ADD CONSTRAINT "membership_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."membership_plans"
    ADD CONSTRAINT "membership_plans_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."monthly_invoice_events"
    ADD CONSTRAINT "monthly_invoice_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monthly_invoice_paystack_charge_dedup"
    ADD CONSTRAINT "monthly_invoice_paystack_charge_dedup_pkey" PRIMARY KEY ("charge_reference");



ALTER TABLE ONLY "public"."monthly_invoices"
    ADD CONSTRAINT "monthly_invoices_customer_month_uid" UNIQUE ("customer_id", "month");



ALTER TABLE ONLY "public"."monthly_invoices"
    ADD CONSTRAINT "monthly_invoices_paystack_reference_key" UNIQUE ("paystack_reference");



ALTER TABLE ONLY "public"."monthly_invoices"
    ADD CONSTRAINT "monthly_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."newsletter_subscribers"
    ADD CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_alerts"
    ADD CONSTRAINT "notification_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_idempotency_claims"
    ADD CONSTRAINT "notification_idempotency_clai_booking_id_event_type_channel_key" UNIQUE ("booking_id", "event_type", "channel");



ALTER TABLE ONLY "public"."notification_idempotency_claims"
    ADD CONSTRAINT "notification_idempotency_claims_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_idempotency_claims"
    ADD CONSTRAINT "notification_idempotency_claims_reference_event_type_channel_ke" UNIQUE ("reference", "event_type", "channel");



ALTER TABLE ONLY "public"."notification_logs"
    ADD CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_runtime_flags"
    ADD CONSTRAINT "notification_runtime_flags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_link_delivery_events"
    ADD CONSTRAINT "payment_link_delivery_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_gateway_gateway_reference_key" UNIQUE ("gateway", "gateway_reference");



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payout_audit_events"
    ADD CONSTRAINT "payout_audit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payout_transfer_outbox"
    ADD CONSTRAINT "payout_transfer_outbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payout_transfer_outbox"
    ADD CONSTRAINT "payout_transfer_outbox_reference_unique" UNIQUE ("reference");



ALTER TABLE ONLY "public"."payout_transfers"
    ADD CONSTRAINT "payout_transfers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricing_booking_config"
    ADD CONSTRAINT "pricing_booking_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricing_catalog_audit"
    ADD CONSTRAINT "pricing_catalog_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricing_changes"
    ADD CONSTRAINT "pricing_changes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricing_extra_bundles"
    ADD CONSTRAINT "pricing_extra_bundles_bundle_id_key" UNIQUE ("bundle_id");



ALTER TABLE ONLY "public"."pricing_extra_bundles"
    ADD CONSTRAINT "pricing_extra_bundles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricing_extras"
    ADD CONSTRAINT "pricing_extras_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricing_extras"
    ADD CONSTRAINT "pricing_extras_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."pricing_metrics"
    ADD CONSTRAINT "pricing_metrics_pkey" PRIMARY KEY ("slot_time");



ALTER TABLE ONLY "public"."pricing_rules"
    ADD CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricing_services"
    ADD CONSTRAINT "pricing_services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricing_services"
    ADD CONSTRAINT "pricing_services_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."pricing_slot_adjustments"
    ADD CONSTRAINT "pricing_slot_adjustments_pkey" PRIMARY KEY ("slot_time");



ALTER TABLE ONLY "public"."pricing_tiers"
    ADD CONSTRAINT "pricing_tiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricing_tiers"
    ADD CONSTRAINT "pricing_tiers_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."pricing_versions"
    ADD CONSTRAINT "pricing_versions_config_hash_key" UNIQUE ("config_hash");



ALTER TABLE ONLY "public"."pricing_versions"
    ADD CONSTRAINT "pricing_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promotion_audit_log"
    ADD CONSTRAINT "promotion_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promotion_bundles"
    ADD CONSTRAINT "promotion_bundles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promotion_events"
    ADD CONSTRAINT "promotion_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promotion_redemptions"
    ADD CONSTRAINT "promotion_redemptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promotions"
    ADD CONSTRAINT "promotions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promotions"
    ADD CONSTRAINT "promotions_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."recurring_bookings"
    ADD CONSTRAINT "recurring_bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurring_expenses"
    ADD CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_discount_redemptions"
    ADD CONSTRAINT "referral_discount_redemptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_events"
    ADD CONSTRAINT "referral_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_program_settings"
    ADD CONSTRAINT "referral_program_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_submissions"
    ADD CONSTRAINT "referral_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."review_sms_prompt_queue"
    ADD CONSTRAINT "review_sms_prompt_queue_pkey" PRIMARY KEY ("booking_id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_one_per_booking" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_document_paystack_charge_dedup"
    ADD CONSTRAINT "sales_document_paystack_charge_dedup_pkey" PRIMARY KEY ("charge_reference");



ALTER TABLE ONLY "public"."sales_documents"
    ADD CONSTRAINT "sales_documents_paystack_reference_key" UNIQUE ("paystack_reference");



ALTER TABLE ONLY "public"."sales_documents"
    ADD CONSTRAINT "sales_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_documents"
    ADD CONSTRAINT "sales_documents_public_token_key" UNIQUE ("public_token");



ALTER TABLE ONLY "public"."seo_auto_hub_ui_patch"
    ADD CONSTRAINT "seo_auto_hub_ui_patch_pkey" PRIMARY KEY ("slug");



ALTER TABLE ONLY "public"."seo_auto_title_variant"
    ADD CONSTRAINT "seo_auto_title_variant_pkey" PRIMARY KEY ("slug");



ALTER TABLE ONLY "public"."seo_insights_recommendations"
    ADD CONSTRAINT "seo_insights_recommendations_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."service_earning_caps"
    ADD CONSTRAINT "service_earning_caps_cap_cents_non_negative" CHECK (("cap_cents" >= 0)) NOT VALID;



ALTER TABLE ONLY "public"."service_earning_caps"
    ADD CONSTRAINT "service_earning_caps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."social_accounts"
    ADD CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_accounts"
    ADD CONSTRAINT "social_accounts_provider_key" UNIQUE ("provider");



ALTER TABLE ONLY "public"."social_publish_history"
    ADD CONSTRAINT "social_publish_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_logs"
    ADD CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_metrics"
    ADD CONSTRAINT "system_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_daily_capacity_usage"
    ADD CONSTRAINT "team_daily_capacity_usage_pkey" PRIMARY KEY ("team_id", "booking_date");



ALTER TABLE "public"."team_job_member_payouts"
    ADD CONSTRAINT "team_job_member_payouts_non_negative" CHECK (("payout_cents" >= 0)) NOT VALID;



ALTER TABLE ONLY "public"."team_job_member_payouts"
    ADD CONSTRAINT "team_job_member_payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_team_id_cleaner_id_key" UNIQUE ("team_id", "cleaner_id");



ALTER TABLE "public"."teams"
    ADD CONSTRAINT "teams_capacity_per_day_positive" CHECK (("capacity_per_day" > 0)) NOT VALID;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."templates"
    ADD CONSTRAINT "templates_key_channel_key" UNIQUE ("key", "channel");



ALTER TABLE ONLY "public"."templates"
    ADD CONSTRAINT "templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."travel_route_cache"
    ADD CONSTRAINT "travel_route_cache_pkey" PRIMARY KEY ("origin_location_id", "dest_location_id");



ALTER TABLE ONLY "public"."user_behavior"
    ADD CONSTRAINT "user_behavior_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_events"
    ADD CONSTRAINT "user_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_notifications"
    ADD CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_referral_code_key" UNIQUE ("referral_code");



ALTER TABLE ONLY "public"."user_push_tokens"
    ADD CONSTRAINT "user_push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_cleaner_unmatched_intent_log"
    ADD CONSTRAINT "whatsapp_cleaner_unmatched_intent_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_delivery_events"
    ADD CONSTRAINT "whatsapp_delivery_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_inbound_feedback_dedupe"
    ADD CONSTRAINT "whatsapp_inbound_feedback_dedupe_pkey" PRIMARY KEY ("meta_message_id");



ALTER TABLE ONLY "public"."whatsapp_logs"
    ADD CONSTRAINT "whatsapp_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_queue"
    ADD CONSTRAINT "whatsapp_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zoho_integration_settings"
    ADD CONSTRAINT "zoho_integration_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."zoho_integration_settings"
    ADD CONSTRAINT "zoho_integration_settings_singleton_key_key" UNIQUE ("singleton_key");



CREATE INDEX "accounting_invoice_sync_status_idx" ON "public"."accounting_invoice_sync" USING "btree" ("sync_status") WHERE ("sync_status" = ANY (ARRAY['pending'::"text", 'failed'::"text"]));



CREATE INDEX "accounting_invoice_sync_zoho_idx" ON "public"."accounting_invoice_sync" USING "btree" ("zoho_invoice_id") WHERE ("zoho_invoice_id" IS NOT NULL);



CREATE INDEX "accounting_sync_records_next_retry_idx" ON "public"."accounting_sync_records" USING "btree" ("next_retry_at") WHERE (("sync_status" = 'failed'::"text") AND ("next_retry_at" IS NOT NULL));



CREATE INDEX "accounting_sync_records_status_idx" ON "public"."accounting_sync_records" USING "btree" ("sync_status") WHERE ("sync_status" = ANY (ARRAY['pending'::"text", 'failed'::"text"]));



CREATE INDEX "admin_api_idempotency_expires_idx" ON "public"."admin_api_idempotency" USING "btree" ("expires_at");



CREATE INDEX "admin_billing_idempotency_user_expires_idx" ON "public"."admin_billing_idempotency" USING "btree" ("user_id", "expires_at" DESC);



CREATE INDEX "admin_booking_create_idempotency_expires_idx" ON "public"."admin_booking_create_idempotency" USING "btree" ("expires_at");



CREATE INDEX "admin_earnings_actions_admin_idx" ON "public"."admin_earnings_actions" USING "btree" ("admin_user_id", "created_at" DESC);



CREATE INDEX "admin_earnings_actions_booking_idx" ON "public"."admin_earnings_actions" USING "btree" ("booking_id", "created_at" DESC);



CREATE INDEX "admin_money_action_proposals_pending_idx" ON "public"."admin_money_action_proposals" USING "btree" ("booking_id", "status") WHERE ("status" = 'pending'::"text");



CREATE INDEX "admin_request_dedupe_created_idx" ON "public"."admin_request_dedupe" USING "btree" ("created_at" DESC);



CREATE INDEX "ai_decision_logs_type_created_idx" ON "public"."ai_decision_logs" USING "btree" ("decision_type", "created_at" DESC);



CREATE UNIQUE INDEX "ai_experiment_exposures_dedupe_once_idx" ON "public"."ai_experiment_exposures" USING "btree" ("subject_id", "experiment_key");



CREATE INDEX "ai_experiment_exposures_subject_exp_idx" ON "public"."ai_experiment_exposures" USING "btree" ("subject_id", "experiment_key", "created_at" DESC);



CREATE INDEX "ai_feature_store_entity_idx" ON "public"."ai_feature_store" USING "btree" ("entity_type", "entity_id", "feature_key", "created_at" DESC);



CREATE INDEX "ai_feature_store_key_created_idx" ON "public"."ai_feature_store" USING "btree" ("feature_key", "created_at" DESC);



CREATE INDEX "birthday_rewards_status_expires_idx" ON "public"."birthday_rewards" USING "btree" ("status", "expires_at");



CREATE UNIQUE INDEX "birthday_rewards_user_year_uidx" ON "public"."birthday_rewards" USING "btree" ("user_id", "reward_year");



CREATE INDEX "blog_authors_user_id_idx" ON "public"."blog_authors" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "blog_categories_active_sort_idx" ON "public"."blog_categories" USING "btree" ("is_active", "sort_order");



CREATE INDEX "blog_post_tags_tag_id_idx" ON "public"."blog_post_tags" USING "btree" ("tag_id");



CREATE INDEX "blog_posts_category_id_idx" ON "public"."blog_posts" USING "btree" ("category_id") WHERE ("category_id" IS NOT NULL);



CREATE INDEX "blog_posts_primary_keyword_idx" ON "public"."blog_posts" USING "btree" ("primary_keyword") WHERE ("primary_keyword" IS NOT NULL);



CREATE INDEX "blog_posts_public_list_idx" ON "public"."blog_posts" USING "btree" ("status", "published_at" DESC NULLS LAST) WHERE ("status" = 'published'::"public"."blog_post_status");



CREATE INDEX "blog_posts_published_at_idx" ON "public"."blog_posts" USING "btree" ("published_at" DESC NULLS LAST);



CREATE INDEX "blog_posts_search_intent_idx" ON "public"."blog_posts" USING "btree" ("search_intent") WHERE ("search_intent" IS NOT NULL);



CREATE INDEX "blog_posts_semantic_cluster_idx" ON "public"."blog_posts" USING "btree" ("semantic_cluster") WHERE ("semantic_cluster" IS NOT NULL);



CREATE INDEX "blog_posts_status_idx" ON "public"."blog_posts" USING "btree" ("status");



CREATE INDEX "booking_changes_booking_id_created_idx" ON "public"."booking_changes" USING "btree" ("booking_id", "created_at" DESC);



CREATE INDEX "booking_cleaners_booking_id_idx" ON "public"."booking_cleaners" USING "btree" ("booking_id");



CREATE INDEX "booking_cleaners_cleaner_completed_at_idx" ON "public"."booking_cleaners" USING "btree" ("cleaner_id", "completed_at" DESC NULLS LAST) WHERE ("completed_at" IS NOT NULL);



CREATE INDEX "booking_cleaners_cleaner_id_idx" ON "public"."booking_cleaners" USING "btree" ("cleaner_id");



CREATE UNIQUE INDEX "booking_cleaners_one_lead_per_booking_uidx" ON "public"."booking_cleaners" USING "btree" ("booking_id") WHERE ("role" = 'lead'::"text");



CREATE INDEX "booking_demand_events_created_at_idx" ON "public"."booking_demand_events" USING "btree" ("created_at" DESC);



CREATE INDEX "booking_demand_events_location_date_idx" ON "public"."booking_demand_events" USING "btree" ("location_id", "requested_date");



CREATE INDEX "booking_demand_events_mode_created_idx" ON "public"."booking_demand_events" USING "btree" ("fulfillment_mode", "created_at" DESC);



CREATE INDEX "booking_demand_events_service_idx" ON "public"."booking_demand_events" USING "btree" ("service_slug");



CREATE INDEX "booking_demand_events_suburb_idx" ON "public"."booking_demand_events" USING "btree" ("suburb");



CREATE INDEX "booking_events_analytics_session_id_idx" ON "public"."booking_events" USING "btree" ("analytics_session_id");



CREATE INDEX "booking_events_created_at_idx" ON "public"."booking_events" USING "btree" ("created_at" DESC);



CREATE INDEX "booking_events_session_id_idx" ON "public"."booking_events" USING "btree" ("session_id");



CREATE INDEX "booking_events_step_event_idx" ON "public"."booking_events" USING "btree" ("step", "event_type");



CREATE INDEX "booking_lifecycle_jobs_customer_sent_idx" ON "public"."booking_lifecycle_jobs" USING "btree" ("customer_email", "sent_at" DESC) WHERE ("status" = 'sent'::"text");



CREATE INDEX "booking_lifecycle_jobs_failed_retry_idx" ON "public"."booking_lifecycle_jobs" USING "btree" ("attempts") WHERE ("status" = 'failed_retryable'::"text");



CREATE INDEX "booking_lifecycle_jobs_pending_due_idx" ON "public"."booking_lifecycle_jobs" USING "btree" ("scheduled_for") WHERE ("status" = ANY (ARRAY['pending'::"text", 'failed_retryable'::"text"]));



CREATE INDEX "booking_lifecycle_jobs_status_scheduled_idx" ON "public"."booking_lifecycle_jobs" USING "btree" ("status", "scheduled_for");



CREATE UNIQUE INDEX "booking_lifecycle_jobs_unique_booking_type_idx" ON "public"."booking_lifecycle_jobs" USING "btree" ("booking_id", "job_type");



CREATE INDEX "booking_line_items_booking_id_idx" ON "public"."booking_line_items" USING "btree" ("booking_id");



CREATE INDEX "booking_payment_recovery_jobs_customer_sent_idx" ON "public"."booking_payment_recovery_jobs" USING "btree" ("customer_email", "sent_at" DESC) WHERE ("status" = 'sent'::"text");



CREATE INDEX "booking_payment_recovery_jobs_failed_retry_idx" ON "public"."booking_payment_recovery_jobs" USING "btree" ("attempts") WHERE ("status" = 'failed_retryable'::"text");



CREATE INDEX "booking_payment_recovery_jobs_pending_due_idx" ON "public"."booking_payment_recovery_jobs" USING "btree" ("scheduled_for") WHERE ("status" = ANY (ARRAY['pending'::"text", 'failed_retryable'::"text"]));



CREATE UNIQUE INDEX "booking_payment_recovery_jobs_unique_booking_type_idx" ON "public"."booking_payment_recovery_jobs" USING "btree" ("booking_id", "job_type");



CREATE INDEX "booking_roster_member_payouts_booking_id_idx" ON "public"."booking_roster_member_payouts" USING "btree" ("booking_id");



CREATE INDEX "booking_roster_member_payouts_cleaner_id_idx" ON "public"."booking_roster_member_payouts" USING "btree" ("cleaner_id");



CREATE INDEX "booking_roster_member_payouts_cleaner_payout_id_idx" ON "public"."booking_roster_member_payouts" USING "btree" ("cleaner_payout_id") WHERE ("cleaner_payout_id" IS NOT NULL);



CREATE INDEX "booking_service_checklists_booking_idx" ON "public"."booking_service_checklists" USING "btree" ("booking_id");



CREATE INDEX "booking_service_checklists_cleaner_idx" ON "public"."booking_service_checklists" USING "btree" ("cleaner_id");



CREATE INDEX "booking_service_photos_booking_idx" ON "public"."booking_service_photos" USING "btree" ("booking_id");



CREATE INDEX "booking_team_assignments_booking_id_idx" ON "public"."booking_team_assignments" USING "btree" ("booking_id");



CREATE INDEX "booking_team_assignments_team_id_idx" ON "public"."booking_team_assignments" USING "btree" ("team_id");



CREATE INDEX "bookings_assignment_type_idx" ON "public"."bookings" USING "btree" ("assignment_type") WHERE ("assignment_type" IS NOT NULL);



CREATE UNIQUE INDEX "bookings_booking_reference_uidx" ON "public"."bookings" USING "btree" ("booking_reference") WHERE ("booking_reference" IS NOT NULL);



CREATE INDEX "bookings_booking_source_idx" ON "public"."bookings" USING "btree" ("booking_source");



CREATE INDEX "bookings_cancelled_by_idx" ON "public"."bookings" USING "btree" ("cancelled_by") WHERE (("status" = 'cancelled'::"text") AND ("cancelled_by" IS NOT NULL));



CREATE UNIQUE INDEX "bookings_cleaner_active_slot_uidx" ON "public"."bookings" USING "btree" ("cleaner_id", "date", "time") WHERE (("cleaner_id" IS NOT NULL) AND ("status" = ANY (ARRAY['assigned'::"text", 'in_progress'::"text"])) AND (COALESCE("is_team_job", false) = false));



CREATE INDEX "bookings_cleaner_id_idx" ON "public"."bookings" USING "btree" ("cleaner_id");



CREATE INDEX "bookings_completed_cleaner_id_idx" ON "public"."bookings" USING "btree" ("cleaner_id") WHERE ("lower"("status") = 'completed'::"text");



CREATE INDEX "bookings_completed_created_at_idx" ON "public"."bookings" USING "btree" ("created_at" DESC) WHERE ("lower"("status") = 'completed'::"text");



CREATE INDEX "bookings_completed_location_idx" ON "public"."bookings" USING "btree" ("location") WHERE (("lower"("status") = 'completed'::"text") AND ("location" IS NOT NULL) AND ("length"(TRIM(BOTH FROM "location")) > 0));



CREATE INDEX "bookings_created_at_idx" ON "public"."bookings" USING "btree" ("created_at" DESC);



CREATE INDEX "bookings_created_by_admin_id_idx" ON "public"."bookings" USING "btree" ("created_by_admin_id") WHERE ("created_by_admin_id" IS NOT NULL);



CREATE INDEX "bookings_customer_id_created_at_idx" ON "public"."bookings" USING "btree" ("customer_id", "created_at" DESC) WHERE ("customer_id" IS NOT NULL);



CREATE INDEX "bookings_customer_id_idx" ON "public"."bookings" USING "btree" ("customer_id") WHERE ("customer_id" IS NOT NULL);



CREATE UNIQUE INDEX "bookings_customer_idempotency_uidx" ON "public"."bookings" USING "btree" ("customer_id", (("metadata" ->> 'idempotency_key'::"text"))) WHERE (("metadata" ? 'idempotency_key'::"text") AND ("char_length"(TRIM(BOTH FROM ("metadata" ->> 'idempotency_key'::"text"))) >= 8));



COMMENT ON INDEX "public"."bookings_customer_idempotency_uidx" IS 'One draft booking per customer per idempotency_key when key is present; supports replay without duplicate contracts.';



CREATE INDEX "bookings_dispatch_attempt_pending_idx" ON "public"."bookings" USING "btree" ("dispatch_attempt_count") WHERE (("status" = 'pending'::"text") AND ("cleaner_id" IS NULL) AND ("assignment_type" = 'user_selected'::"text"));



CREATE INDEX "bookings_dispatch_next_recovery_at_idx" ON "public"."bookings" USING "btree" ("dispatch_next_recovery_at" NULLS FIRST) WHERE (("status" = 'pending'::"text") AND ("cleaner_id" IS NULL) AND ("assignment_type" = 'user_selected'::"text"));



CREATE INDEX "bookings_fallback_reason_idx" ON "public"."bookings" USING "btree" ("fallback_reason") WHERE ("fallback_reason" IS NOT NULL);



CREATE INDEX "bookings_fulfillment_mode_status_idx" ON "public"."bookings" USING "btree" ("fulfillment_mode", "status") WHERE ("fulfillment_mode" IS NOT NULL);



CREATE INDEX "bookings_ignore_cleaner_conflict_idx" ON "public"."bookings" USING "btree" ("ignore_cleaner_conflict") WHERE ("ignore_cleaner_conflict" = true);



CREATE INDEX "bookings_last_declined_at_idx" ON "public"."bookings" USING "btree" ("last_declined_at" DESC) WHERE ("last_declined_by_cleaner_id" IS NOT NULL);



CREATE INDEX "bookings_lifecycle_issue_idx" ON "public"."bookings" USING "btree" ("lifecycle_issue") WHERE ("lifecycle_issue" = true);



CREATE INDEX "bookings_location_id_idx" ON "public"."bookings" USING "btree" ("location_id");



CREATE INDEX "bookings_monthly_invoice_id_idx" ON "public"."bookings" USING "btree" ("monthly_invoice_id") WHERE ("monthly_invoice_id" IS NOT NULL);



CREATE INDEX "bookings_payment_state_idx" ON "public"."bookings" USING "btree" ("payment_state") WHERE ("payment_state" IS NOT NULL);



CREATE INDEX "bookings_payment_transaction_idx" ON "public"."bookings" USING "btree" ("payment_transaction_id") WHERE ("payment_transaction_id" IS NOT NULL);



CREATE INDEX "bookings_payout_id_idx" ON "public"."bookings" USING "btree" ("payout_id") WHERE ("payout_id" IS NOT NULL);



CREATE INDEX "bookings_payout_owner_cleaner_id_idx" ON "public"."bookings" USING "btree" ("payout_owner_cleaner_id") WHERE ("payout_owner_cleaner_id" IS NOT NULL);



CREATE INDEX "bookings_payout_status_idx" ON "public"."bookings" USING "btree" ("payout_status") WHERE ("payout_status" = 'eligible'::"text");



CREATE UNIQUE INDEX "bookings_paystack_reference_uidx" ON "public"."bookings" USING "btree" ("paystack_reference");



CREATE INDEX "bookings_pricing_version_id_idx" ON "public"."bookings" USING "btree" ("pricing_version_id");



CREATE INDEX "bookings_recurring_charge_due_idx" ON "public"."bookings" USING "btree" ("recurring_next_charge_attempt_at", "status", "is_recurring_generated") WHERE (("status" = 'pending_payment'::"text") AND ("is_recurring_generated" = true) AND ("recurring_fallback_at" IS NULL));



CREATE UNIQUE INDEX "bookings_recurring_service_date_uidx" ON "public"."bookings" USING "btree" ("recurring_id", "date") WHERE (("recurring_id" IS NOT NULL) AND ("date" IS NOT NULL));



CREATE INDEX "bookings_sales_document_id_lookup_idx" ON "public"."bookings" USING "btree" ("sales_document_id") WHERE ("sales_document_id" IS NOT NULL);



CREATE UNIQUE INDEX "bookings_sales_document_id_unique_idx" ON "public"."bookings" USING "btree" ("sales_document_id") WHERE ("sales_document_id" IS NOT NULL);



CREATE INDEX "bookings_service_slug_idx" ON "public"."bookings" USING "btree" ("service_slug") WHERE ("service_slug" IS NOT NULL);



CREATE INDEX "bookings_status_date_idx" ON "public"."bookings" USING "btree" ("status", "date");



CREATE INDEX "bookings_status_date_time_desc_idx" ON "public"."bookings" USING "btree" ("status", "date" DESC, "time" DESC);



COMMENT ON INDEX "public"."bookings_status_date_time_desc_idx" IS 'H-14: status-filtered chronological lists ordered by (date desc, time desc). Complements bookings_status_date_idx which only covers (status, date asc) with no time tie-break.';



CREATE UNIQUE INDEX "bookings_team_active_slot_uidx" ON "public"."bookings" USING "btree" ("team_id", "date", "time") WHERE (("team_id" IS NOT NULL) AND (COALESCE("is_team_job", false) = true) AND ("status" = ANY (ARRAY['assigned'::"text", 'in_progress'::"text"])));



COMMENT ON INDEX "public"."bookings_team_active_slot_uidx" IS 'One active team job per team per date/time slot.';



CREATE INDEX "bookings_user_id_created_at_idx" ON "public"."bookings" USING "btree" ("customer_id", "created_at" DESC) WHERE ("customer_id" IS NOT NULL);



COMMENT ON INDEX "public"."bookings_user_id_created_at_idx" IS 'H-14: customer dashboard `WHERE user_id = ? ORDER BY created_at DESC` queries (loadCustomerBookingRowsForUser, /api/dashboard/summary, Step4Payment past-booking hints, referral checks). Partial WHERE user_id IS NOT NULL matches bookings_user_id_idx so this is a behavioural superset.';



CREATE INDEX "bookings_user_id_idx" ON "public"."bookings" USING "btree" ("customer_id") WHERE ("customer_id" IS NOT NULL);



CREATE INDEX "business_health_scores_date_idx" ON "public"."business_health_scores" USING "btree" ("score_date" DESC);



CREATE INDEX "campaign_assets_promo_idx" ON "public"."campaign_assets" USING "btree" ("promotion_id", "asset_type");



CREATE INDEX "campaign_content_promo_idx" ON "public"."campaign_content" USING "btree" ("promotion_id", "channel");



CREATE UNIQUE INDEX "cities_name_country_idx" ON "public"."cities" USING "btree" ("lower"("name"), "lower"("country"));



CREATE UNIQUE INDEX "cleaner_applications_phone_active_uidx" ON "public"."cleaner_applications" USING "btree" ("phone_normalized") WHERE (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text"])) AND ("phone_normalized" IS NOT NULL) AND ("phone_normalized" <> ''::"text"));



CREATE INDEX "cleaner_applications_phone_normalized_idx" ON "public"."cleaner_applications" USING "btree" ("phone_normalized");



CREATE INDEX "cleaner_applications_status_idx" ON "public"."cleaner_applications" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "cleaner_availability_cleaner_date_idx" ON "public"."cleaner_availability" USING "btree" ("cleaner_id", "date");



CREATE INDEX "cleaner_availability_date_idx" ON "public"."cleaner_availability" USING "btree" ("date");



CREATE INDEX "cleaner_booking_track_points_booking_created_idx" ON "public"."cleaner_booking_track_points" USING "btree" ("booking_id", "created_at" DESC);



CREATE INDEX "cleaner_booking_track_points_cleaner_booking_idx" ON "public"."cleaner_booking_track_points" USING "btree" ("cleaner_id", "booking_id");



CREATE INDEX "cleaner_change_requests_cleaner_status_idx" ON "public"."cleaner_change_requests" USING "btree" ("cleaner_id", "status", "created_at" DESC);



CREATE UNIQUE INDEX "cleaner_change_requests_one_pending_per_cleaner_uidx" ON "public"."cleaner_change_requests" USING "btree" ("cleaner_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "cleaner_change_requests_pending_created_idx" ON "public"."cleaner_change_requests" USING "btree" ("status", "created_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "cleaner_earnings_adjustments_cleaner_booking_idx" ON "public"."cleaner_earnings_adjustments" USING "btree" ("cleaner_id", "booking_id");



CREATE UNIQUE INDEX "cleaner_earnings_booking_id_uidx" ON "public"."cleaner_earnings" USING "btree" ("booking_id");



CREATE INDEX "cleaner_earnings_cleaner_status_idx" ON "public"."cleaner_earnings" USING "btree" ("cleaner_id", "status");



CREATE INDEX "cleaner_earnings_disbursements_cleaner_idx" ON "public"."cleaner_earnings_disbursements" USING "btree" ("cleaner_id", "created_at" DESC);



CREATE UNIQUE INDEX "cleaner_earnings_disputes_active_uidx" ON "public"."cleaner_earnings_disputes" USING "btree" ("cleaner_id", "booking_id") WHERE ("status" = ANY (ARRAY['open'::"text", 'reviewing'::"text"]));



CREATE INDEX "cleaner_earnings_disputes_booking_idx" ON "public"."cleaner_earnings_disputes" USING "btree" ("booking_id");



CREATE INDEX "cleaner_earnings_disputes_cleaner_created_idx" ON "public"."cleaner_earnings_disputes" USING "btree" ("cleaner_id", "created_at" DESC);



CREATE INDEX "cleaner_earnings_disputes_status_created_idx" ON "public"."cleaner_earnings_disputes" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "cleaner_job_issue_report_idem_expires_idx" ON "public"."cleaner_job_issue_report_idempotency" USING "btree" ("expires_at");



CREATE INDEX "cleaner_job_issue_reports_booking_created_idx" ON "public"."cleaner_job_issue_reports" USING "btree" ("booking_id", "created_at" DESC);



CREATE INDEX "cleaner_job_issue_reports_cleaner_created_idx" ON "public"."cleaner_job_issue_reports" USING "btree" ("cleaner_id", "created_at" DESC);



CREATE INDEX "cleaner_job_lifecycle_idempotency_booking_idx" ON "public"."cleaner_job_lifecycle_idempotency" USING "btree" ("booking_id", "created_at" DESC);



CREATE INDEX "cleaner_job_lifecycle_idempotency_cleaner_idx" ON "public"."cleaner_job_lifecycle_idempotency" USING "btree" ("cleaner_id", "created_at" DESC);



CREATE INDEX "cleaner_locations_cleaner_id_idx" ON "public"."cleaner_locations" USING "btree" ("cleaner_id");



CREATE INDEX "cleaner_locations_location_id_idx" ON "public"."cleaner_locations" USING "btree" ("location_id");



CREATE INDEX "cleaner_payout_runs_created_at_idx" ON "public"."cleaner_payout_runs" USING "btree" ("created_at" DESC);



CREATE INDEX "cleaner_payout_runs_status_idx" ON "public"."cleaner_payout_runs" USING "btree" ("status");



CREATE INDEX "cleaner_payouts_cleaner_id_idx" ON "public"."cleaner_payouts" USING "btree" ("cleaner_id");



CREATE INDEX "cleaner_payouts_payout_run_id_idx" ON "public"."cleaner_payouts" USING "btree" ("payout_run_id") WHERE ("payout_run_id" IS NOT NULL);



CREATE INDEX "cleaner_payouts_period_idx" ON "public"."cleaner_payouts" USING "btree" ("period_start", "period_end");



CREATE INDEX "cleaner_payouts_status_idx" ON "public"."cleaner_payouts" USING "btree" ("status");



CREATE UNIQUE INDEX "cleaner_payouts_unique_active_period_idx" ON "public"."cleaner_payouts" USING "btree" ("cleaner_id", "period_start", "period_end") WHERE ("status" <> 'cancelled'::"text");



COMMENT ON INDEX "public"."cleaner_payouts_unique_active_period_idx" IS 'M-18: defense-in-depth uniqueness invariant for weekly cleaner payout batches. Prevents duplicate payout rows for the same (cleaner_id, period_start, period_end) under H-15 lock failure, admin manual trigger races, or retry storms. Cancelled rows are excluded so cancel-and-recreate flows still work. Application catches the resulting 23505 idempotently in apps/web/lib/payout/generateWeeklyPayouts.ts.';



CREATE INDEX "cleaner_preferences_updated_at_idx" ON "public"."cleaner_preferences" USING "btree" ("updated_at" DESC);



CREATE INDEX "cleaner_report_feedback_cleaner_created_idx" ON "public"."cleaner_report_feedback" USING "btree" ("cleaner_id", "created_at" DESC);



CREATE INDEX "cleaner_report_feedback_type_status_created_idx" ON "public"."cleaner_report_feedback" USING "btree" ("submission_type", "status", "created_at" DESC);



CREATE INDEX "cleaners_city_id_idx" ON "public"."cleaners" USING "btree" ("city_id");



CREATE INDEX "cleaners_location_id_idx" ON "public"."cleaners" USING "btree" ("location_id");



CREATE INDEX "cleaners_needs_quality_review_idx" ON "public"."cleaners" USING "btree" ("needs_quality_review") WHERE ("needs_quality_review" = true);



CREATE INDEX "cleaners_phone_number_idx" ON "public"."cleaners" USING "btree" ("phone_number");



CREATE UNIQUE INDEX "cleaners_phone_number_unique_idx" ON "public"."cleaners" USING "btree" ("phone_number");



CREATE UNIQUE INDEX "cleaning_credit_transactions_unique_earn_referral_uidx" ON "public"."cleaning_credit_transactions" USING "btree" ("referral_id") WHERE (("type" = 'earn'::"text") AND ("referral_id" IS NOT NULL));



CREATE INDEX "cleaning_credit_tx_user_idx" ON "public"."cleaning_credit_transactions" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "conversion_deferred_payment_link_emails_due_idx" ON "public"."conversion_deferred_payment_link_emails" USING "btree" ("run_at") WHERE ("sent_at" IS NULL);



CREATE UNIQUE INDEX "conversion_deferred_payment_link_emails_pending_booking_uidx" ON "public"."conversion_deferred_payment_link_emails" USING "btree" ("booking_id") WHERE ("sent_at" IS NULL);



CREATE UNIQUE INDEX "conversion_experiment_results_booking_exp_unique" ON "public"."conversion_experiment_results" USING "btree" ("booking_id", "experiment_key") WHERE ("booking_id" IS NOT NULL);



CREATE INDEX "conversion_experiment_results_booking_idx" ON "public"."conversion_experiment_results" USING "btree" ("booking_id") WHERE ("booking_id" IS NOT NULL);



CREATE INDEX "conversion_experiment_results_key_variant_idx" ON "public"."conversion_experiment_results" USING "btree" ("experiment_key", "variant", "created_at" DESC);



CREATE INDEX "conversion_experiments_key_active_idx" ON "public"."conversion_experiments" USING "btree" ("key", "is_active");



CREATE INDEX "cron_run_leases_expires_at_idx" ON "public"."cron_run_leases" USING "btree" ("expires_at");



CREATE INDEX "cron_runs_created_idx" ON "public"."cron_runs" USING "btree" ("created_at" DESC);



CREATE INDEX "cron_runs_job_created_idx" ON "public"."cron_runs" USING "btree" ("job_name", "created_at" DESC);



CREATE INDEX "customer_contact_health_last_updated_idx" ON "public"."customer_contact_health" USING "btree" ("last_updated" DESC);



CREATE UNIQUE INDEX "customer_memberships_active_user_uidx" ON "public"."customer_memberships" USING "btree" ("user_id") WHERE ("status" = 'active'::"text");



CREATE INDEX "customer_memberships_plan_status_idx" ON "public"."customer_memberships" USING "btree" ("plan_id", "status");



CREATE INDEX "customer_saved_addresses_user_idx" ON "public"."customer_saved_addresses" USING "btree" ("user_id");



CREATE INDEX "customer_segment_city_idx" ON "public"."customer_segment" USING "btree" ("city_id") WHERE ("city_id" IS NOT NULL);



CREATE INDEX "customer_segment_segment_idx" ON "public"."customer_segment" USING "btree" ("segment", "updated_at" DESC);



CREATE INDEX "dispatch_experiment_snapshots_week_start_desc_idx" ON "public"."dispatch_experiment_snapshots" USING "btree" ("week_start" DESC);



CREATE INDEX "dispatch_logs_created_at_idx" ON "public"."dispatch_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "dispatch_metrics_booking_idx" ON "public"."dispatch_metrics" USING "btree" ("booking_id");



CREATE INDEX "dispatch_metrics_cleaner_idx" ON "public"."dispatch_metrics" USING "btree" ("cleaner_id");



CREATE INDEX "dispatch_offer_exposure_dedupe_inserted_at_idx" ON "public"."dispatch_offer_exposure_dedupe" USING "btree" ("inserted_at");



COMMENT ON INDEX "public"."dispatch_offer_exposure_dedupe_inserted_at_idx" IS 'Supports prune: DELETE … WHERE inserted_at < (now() - interval) uses btree range scan on inserted_at.';



CREATE INDEX "dispatch_offers_batch_pending_idx" ON "public"."dispatch_offers" USING "btree" ("batch_id", "status") WHERE (("batch_id" IS NOT NULL) AND ("status" = 'pending'::"text"));



CREATE UNIQUE INDEX "dispatch_offers_booking_cleaner_pending_uidx" ON "public"."dispatch_offers" USING "btree" ("booking_id", "cleaner_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "dispatch_offers_booking_cleaner_status_idx" ON "public"."dispatch_offers" USING "btree" ("booking_id", "cleaner_id", "status");



COMMENT ON INDEX "public"."dispatch_offers_booking_cleaner_status_idx" IS 'M-19: (booking, cleaner) → status probes for any status value. Complements the partial dispatch_offers_booking_cleaner_pending_uidx (WHERE status=''pending'') which cannot serve queries that filter by accepted/rejected/expired or read all statuses.';



CREATE INDEX "dispatch_offers_booking_status_idx" ON "public"."dispatch_offers" USING "btree" ("booking_id", "status");



CREATE INDEX "dispatch_offers_cleaner_pending_expires_idx" ON "public"."dispatch_offers" USING "btree" ("cleaner_id", "status", "expires_at" DESC) WHERE ("status" = 'pending'::"text");



CREATE INDEX "dispatch_offers_expired_responded_at_idx" ON "public"."dispatch_offers" USING "btree" ("responded_at") WHERE ("status" = 'expired'::"text");



CREATE UNIQUE INDEX "dispatch_offers_offer_token_uidx" ON "public"."dispatch_offers" USING "btree" ("offer_token") WHERE ("offer_token" IS NOT NULL);



CREATE INDEX "dispatch_offers_pending_missing_earnings_idx" ON "public"."dispatch_offers" USING "btree" ("booking_id", "cleaner_id") WHERE (("status" = 'pending'::"text") AND ("display_earnings_cents" IS NULL));



CREATE INDEX "dispatch_offers_pending_visible_notify_idx" ON "public"."dispatch_offers" USING "btree" ("status", "offer_notification_deferred", "dispatch_visible_at") WHERE (("status" = 'pending'::"text") AND ("offer_notification_deferred" = true));



CREATE UNIQUE INDEX "dispatch_offers_whatsapp_message_id_uidx" ON "public"."dispatch_offers" USING "btree" ("offer_whatsapp_message_id") WHERE ("offer_whatsapp_message_id" IS NOT NULL);



CREATE INDEX "dispatch_retry_queue_pending_next_idx" ON "public"."dispatch_retry_queue" USING "btree" ("next_retry_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "earnings_disbursement_transfers_cleaner_id_idx" ON "public"."earnings_disbursement_transfers" USING "btree" ("cleaner_id");



CREATE INDEX "earnings_disbursement_transfers_disbursement_id_idx" ON "public"."earnings_disbursement_transfers" USING "btree" ("disbursement_id");



CREATE UNIQUE INDEX "earnings_disbursement_transfers_success_once_uidx" ON "public"."earnings_disbursement_transfers" USING "btree" ("disbursement_id") WHERE ("status" = 'success'::"text");



CREATE UNIQUE INDEX "earnings_disbursement_transfers_transfer_code_uidx" ON "public"."earnings_disbursement_transfers" USING "btree" ("transfer_code") WHERE ("transfer_code" IS NOT NULL);



CREATE INDEX "email_campaign_sends_campaign_idx" ON "public"."email_campaign_sends" USING "btree" ("campaign_id", "created_at" DESC);



CREATE UNIQUE INDEX "email_campaign_sends_monthly_unique_idx" ON "public"."email_campaign_sends" USING "btree" ("campaign_id", "recipient_email", "date_trunc"('month'::"text", ("created_at" AT TIME ZONE 'UTC'::"text")));



CREATE INDEX "expense_approval_events_expense_idx" ON "public"."expense_approval_events" USING "btree" ("expense_id", "created_at" DESC);



CREATE INDEX "expense_categories_active_idx" ON "public"."expense_categories" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "expense_categories_group_idx" ON "public"."expense_categories" USING "btree" ("group_name");



CREATE INDEX "expense_vendors_name_idx" ON "public"."expense_vendors" USING "btree" ("lower"("name"));



CREATE INDEX "expense_vendors_sync_status_idx" ON "public"."expense_vendors" USING "btree" ("sync_status") WHERE ("sync_status" = ANY (ARRAY['pending'::"text", 'failed'::"text"]));



CREATE INDEX "expenses_approval_stage_idx" ON "public"."expenses" USING "btree" ("approval_stage") WHERE ("status" = 'pending'::"text");



CREATE INDEX "expenses_approved_date_idx" ON "public"."expenses" USING "btree" ("expense_date") WHERE ("status" = 'approved'::"text");



CREATE INDEX "expenses_booking_idx" ON "public"."expenses" USING "btree" ("booking_id") WHERE ("booking_id" IS NOT NULL);



CREATE INDEX "expenses_branch_idx" ON "public"."expenses" USING "btree" ("branch_id");



CREATE INDEX "expenses_category_idx" ON "public"."expenses" USING "btree" ("category_id");



CREATE INDEX "expenses_date_idx" ON "public"."expenses" USING "btree" ("expense_date" DESC);



CREATE UNIQUE INDEX "expenses_payment_transaction_uidx" ON "public"."expenses" USING "btree" ("payment_transaction_id") WHERE ("payment_transaction_id" IS NOT NULL);



CREATE INDEX "expenses_recurring_idx" ON "public"."expenses" USING "btree" ("recurring_expense_id") WHERE ("recurring_expense_id" IS NOT NULL);



CREATE INDEX "expenses_status_idx" ON "public"."expenses" USING "btree" ("status");



CREATE INDEX "expenses_vendor_idx" ON "public"."expenses" USING "btree" ("vendor_id") WHERE ("vendor_id" IS NOT NULL);



CREATE INDEX "failed_jobs_type_created_idx" ON "public"."failed_jobs" USING "btree" ("type", "created_at");



CREATE INDEX "faqs_active_sort_idx" ON "public"."faqs" USING "btree" ("is_active", "sort_order");



CREATE INDEX "finance_budget_lines_budget_idx" ON "public"."finance_budget_lines" USING "btree" ("budget_id");



CREATE INDEX "finance_budgets_period_idx" ON "public"."finance_budgets" USING "btree" ("period_start", "period_end") WHERE ("is_active" = true);



CREATE INDEX "finance_budgets_type_idx" ON "public"."finance_budgets" USING "btree" ("budget_type", "period_start", "period_end") WHERE ("is_active" = true);



CREATE INDEX "finance_notifications_user_unread_idx" ON "public"."finance_notifications" USING "btree" ("user_id", "created_at" DESC) WHERE ("read_at" IS NULL);



CREATE INDEX "growth_action_outcomes_action_converted_idx" ON "public"."growth_action_outcomes" USING "btree" ("action_type", "channel", "converted");



CREATE INDEX "growth_action_outcomes_booking_idx" ON "public"."growth_action_outcomes" USING "btree" ("booking_id") WHERE ("booking_id" IS NOT NULL);



CREATE INDEX "growth_action_outcomes_user_sent_idx" ON "public"."growth_action_outcomes" USING "btree" ("user_id", "sent_at" DESC);



CREATE INDEX "growth_customer_touch_user_created_idx" ON "public"."growth_customer_touch" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "growth_customer_touch_user_type_idx" ON "public"."growth_customer_touch" USING "btree" ("user_id", "touch_type", "created_at" DESC);



CREATE INDEX "idx_bces_cleaner" ON "public"."booking_cleaner_earnings_snapshot" USING "btree" ("cleaner_id");



CREATE INDEX "idx_bcesl_booking" ON "public"."booking_cleaner_earnings_snapshot_lines" USING "btree" ("booking_id");



CREATE INDEX "idx_bli_type" ON "public"."booking_line_items" USING "btree" ("item_type");



CREATE INDEX "idx_bookings_active_dup" ON "public"."bookings" USING "btree" ("customer_id", "date", "time", "service_slug") WHERE ("status" <> ALL (ARRAY['cancelled'::"text", 'failed'::"text", 'payment_expired'::"text"]));



COMMENT ON INDEX "public"."idx_bookings_active_dup" IS 'Active-slot duplicate probe. WHERE status NOT IN must match TERMINAL_BOOKING_STATUSES_FOR_DUPLICATE_GUARD in apps/web/lib/booking/bookingTerminalStatuses.ts: cancelled, failed, payment_expired. Ops: under heavy UPDATE churn consider rebuilding this partial index with fillfactor=90; schedule periodic VACUUM (ANALYZE) on public.bookings.';



CREATE INDEX "idx_bookings_date_time" ON "public"."bookings" USING "btree" ("date", "time");



COMMENT ON INDEX "public"."idx_bookings_date_time" IS 'Speeds cleaner dashboard list ordering after OR filters (cleaner_id / team / roster / payout owner).';



CREATE UNIQUE INDEX "idx_bookings_external_payment_ref" ON "public"."bookings" USING "btree" ("payment_method", "payment_reference_external") WHERE (("payment_reference_external" IS NOT NULL) AND (TRIM(BOTH FROM "payment_reference_external") <> ''::"text"));



COMMENT ON INDEX "public"."idx_bookings_external_payment_ref" IS 'Prevents duplicate use of the same external payment reference per method (Zoho invoice id, etc.).';



CREATE INDEX "idx_bookings_normalized_phone" ON "public"."bookings" USING "btree" ("normalized_phone") WHERE (("normalized_phone" IS NOT NULL) AND ("length"("normalized_phone") >= 10));



CREATE INDEX "idx_bookings_pending_payment_created" ON "public"."bookings" USING "btree" ("created_at") WHERE ("status" = 'pending_payment'::"text");



COMMENT ON INDEX "public"."idx_bookings_pending_payment_created" IS 'Supports purge_stale_pending_payment_bookings() time-range delete.';



CREATE INDEX "idx_bookings_pending_payment_expires" ON "public"."bookings" USING "btree" ("payment_link_expires_at") WHERE ("status" = 'pending_payment'::"text");



CREATE INDEX "idx_bookings_pending_sla" ON "public"."bookings" USING "btree" ("became_pending_at") WHERE (("status" = 'pending'::"text") AND ("cleaner_id" IS NULL) AND ("dispatch_status" = ANY (ARRAY['searching'::"text", 'offered'::"text"])));



COMMENT ON INDEX "public"."idx_bookings_pending_sla" IS 'SLA watchdog: pending unassigned funnel rows ordered by became_pending_at.';



CREATE INDEX "idx_bookings_team_status_team_job" ON "public"."bookings" USING "btree" ("team_id", "status") WHERE ("is_team_job" = true);



CREATE UNIQUE INDEX "idx_bookings_unique_active_customer_slot" ON "public"."bookings" USING "btree" ("customer_id", "date", "time", "service_slug") WHERE (("customer_id" IS NOT NULL) AND (COALESCE("slot_duplicate_exempt", false) = false) AND ("status" <> ALL (ARRAY['cancelled'::"text", 'failed'::"text", 'payment_expired'::"text"])));



COMMENT ON INDEX "public"."idx_bookings_unique_active_customer_slot" IS 'Hard backstop: at most one non-exempt active booking per (customer_id, date, time, service_slug).';



CREATE INDEX "idx_bookings_user_date_time_service" ON "public"."bookings" USING "btree" ("customer_id", "date", "time", "service_slug");



CREATE INDEX "idx_bookings_zoho_invoice_id" ON "public"."bookings" USING "btree" ("zoho_invoice_id") WHERE ("zoho_invoice_id" IS NOT NULL);



CREATE INDEX "idx_bookings_zoho_invoice_number" ON "public"."bookings" USING "btree" ("zoho_invoice_number") WHERE ("zoho_invoice_number" IS NOT NULL);



CREATE INDEX "idx_dispatch_offers_booking_created" ON "public"."dispatch_offers" USING "btree" ("booking_id", "created_at" DESC) INCLUDE ("status", "cleaner_id", "rank_index", "expires_at", "responded_at", "ux_variant");



COMMENT ON INDEX "public"."idx_dispatch_offers_booking_created" IS 'Admin dispatch-offers card: booking_id filter + created_at desc with hot columns INCLUDE.';



CREATE INDEX "idx_dispatch_offers_booking_offer_type_status" ON "public"."dispatch_offers" USING "btree" ("booking_id", "offer_type", "status");



CREATE INDEX "idx_dispatch_offers_variant_created" ON "public"."dispatch_offers" USING "btree" ("ux_variant", "created_at" DESC) WHERE ("ux_variant" IS NOT NULL);



CREATE INDEX "idx_issue_reports_dup_window" ON "public"."cleaner_job_issue_reports" USING "btree" ("booking_id", "cleaner_id", "reason_key", "created_at" DESC);



CREATE INDEX "idx_mi_last_event_invoice_id_created_at" ON "public"."monthly_invoice_events" USING "btree" ("invoice_id", "created_at" DESC);



CREATE UNIQUE INDEX "idx_monthly_invoices_paystack_reference_unique" ON "public"."monthly_invoices" USING "btree" ("paystack_reference") WHERE ("paystack_reference" IS NOT NULL);



CREATE INDEX "idx_monthly_invoices_zoho_invoice_id" ON "public"."monthly_invoices" USING "btree" ("zoho_invoice_id") WHERE ("zoho_invoice_id" IS NOT NULL);



CREATE INDEX "idx_monthly_invoices_zoho_invoice_number" ON "public"."monthly_invoices" USING "btree" ("zoho_invoice_number") WHERE ("zoho_invoice_number" IS NOT NULL);



CREATE UNIQUE INDEX "idx_notification_dedupe" ON "public"."system_logs" USING "btree" ("source", (("context" ->> 'bookingId'::"text")), COALESCE(("context" ->> 'cleanerId'::"text"), ''::"text")) WHERE ("source" = ANY (ARRAY['reminder_2h_sent'::"text", 'assigned_sent'::"text", 'completed_sent'::"text", 'cancelled_sent'::"text", 'sla_breach_sent'::"text", 'review_prompt_sms_sent'::"text", 'review_prompt_sms_reminder_sent'::"text", 'abandon_checkout_reminder_sent'::"text", 'daily_ops_summary'::"text", 'dispatch_admin_mark_paid'::"text", 'dispatch_edit_details'::"text"]));



COMMENT ON INDEX "public"."idx_notification_dedupe" IS 'At most one system_logs claim per (source, bookingId, cleaner-or-empty) for outbound notification / dispatch idempotency.';



CREATE INDEX "idx_payment_events_booking_sent" ON "public"."payment_link_delivery_events" USING "btree" ("booking_id", "created_at" DESC) WHERE ("status" = 'sent'::"text");



COMMENT ON INDEX "public"."idx_payment_events_booking_sent" IS 'Partial index for attribution queries (sent events only, newest first per booking).';



CREATE INDEX "idx_payment_link_delivery_events_booking_created" ON "public"."payment_link_delivery_events" USING "btree" ("booking_id", "created_at" DESC);



CREATE INDEX "idx_sales_documents_zoho_estimate_number" ON "public"."sales_documents" USING "btree" ("zoho_estimate_number") WHERE ("zoho_estimate_number" IS NOT NULL);



CREATE INDEX "idx_sales_documents_zoho_invoice_number" ON "public"."sales_documents" USING "btree" ("zoho_invoice_number") WHERE ("zoho_invoice_number" IS NOT NULL);



CREATE INDEX "idx_system_logs_source_created_idx" ON "public"."system_logs" USING "btree" ("source", "created_at" DESC);



COMMENT ON INDEX "public"."idx_system_logs_source_created_idx" IS 'Speeds source + time-window scans (notification delivery dashboards, ops queries).';



CREATE INDEX "idx_system_logs_source_time" ON "public"."system_logs" USING "btree" ("source", "created_at" DESC);



COMMENT ON INDEX "public"."idx_system_logs_source_time" IS 'Speeds source + time-window scans (notification delivery dashboards, ops queries).';



CREATE INDEX "idx_team_members_team_id" ON "public"."team_members" USING "btree" ("team_id") WHERE ("cleaner_id" IS NOT NULL);



CREATE INDEX "idx_user_notifications_recent" ON "public"."user_notifications" USING "btree" ("user_id", "created_at" DESC);



COMMENT ON INDEX "public"."idx_user_notifications_recent" IS 'Speeds notification list (user_id + created_at desc) and recent-window dedupe queries.';



CREATE INDEX "invoice_adjustments_booking_id_idx" ON "public"."invoice_adjustments" USING "btree" ("booking_id") WHERE ("booking_id" IS NOT NULL);



CREATE INDEX "invoice_adjustments_pending_idx" ON "public"."invoice_adjustments" USING "btree" ("customer_id", "month_applied") WHERE ("applied_to_invoice_id" IS NULL);



CREATE INDEX "location_gsc_metrics_impressions_idx" ON "public"."location_gsc_metrics" USING "btree" ("impressions" DESC);



CREATE INDEX "location_gsc_metrics_synced_at_idx" ON "public"."location_gsc_metrics" USING "btree" ("synced_at" DESC);



CREATE INDEX "location_gsc_queries_clicks_idx" ON "public"."location_gsc_queries" USING "btree" ("clicks" DESC);



CREATE INDEX "location_gsc_queries_impressions_idx" ON "public"."location_gsc_queries" USING "btree" ("impressions" DESC);



CREATE INDEX "location_gsc_queries_synced_at_idx" ON "public"."location_gsc_queries" USING "btree" ("synced_at" DESC);



CREATE UNIQUE INDEX "locations_city_slug_idx" ON "public"."locations" USING "btree" ("city_id", "slug");



CREATE INDEX "marketing_automation_rules_trigger_idx" ON "public"."marketing_automation_rules" USING "btree" ("trigger_event", "enabled");



CREATE INDEX "marketing_spend_date_channel_idx" ON "public"."marketing_spend" USING "btree" ("date" DESC, "channel");



CREATE INDEX "monthly_invoice_paystack_dedup_invoice_idx" ON "public"."monthly_invoice_paystack_charge_dedup" USING "btree" ("invoice_id");



CREATE INDEX "monthly_invoices_customer_idx" ON "public"."monthly_invoices" USING "btree" ("customer_id");



CREATE INDEX "monthly_invoices_refunded_at_idx" ON "public"."monthly_invoices" USING "btree" ("refunded_at" DESC) WHERE ("refunded_at" IS NOT NULL);



CREATE INDEX "monthly_invoices_status_month_idx" ON "public"."monthly_invoices" USING "btree" ("status", "month");



CREATE UNIQUE INDEX "mv_booking_funnel_daily_day_uidx" ON "public"."mv_booking_funnel_daily" USING "btree" ("day");



CREATE UNIQUE INDEX "mv_payment_conversion_daily_day_uidx" ON "public"."mv_payment_conversion_daily" USING "btree" ("day");



CREATE UNIQUE INDEX "newsletter_subscribers_email_normalized_uidx" ON "public"."newsletter_subscribers" USING "btree" ("lower"(TRIM(BOTH FROM "email")));



CREATE INDEX "notification_alerts_fired_idx" ON "public"."notification_alerts" USING "btree" ("fired_at" DESC);



CREATE INDEX "notification_alerts_flapping_type_resolved_idx" ON "public"."notification_alerts" USING "btree" ("type", "resolved_at" DESC) WHERE ("is_flapping" = true);



CREATE INDEX "notification_alerts_open_type_idx" ON "public"."notification_alerts" USING "btree" ("type", "fired_at" DESC) WHERE ("resolved_at" IS NULL);



CREATE INDEX "notification_alerts_type_resolved_at_idx" ON "public"."notification_alerts" USING "btree" ("type", "resolved_at" DESC) WHERE ("resolved_at" IS NOT NULL);



CREATE INDEX "notification_idempotency_claims_booking_id_idx" ON "public"."notification_idempotency_claims" USING "btree" ("booking_id");



CREATE INDEX "notification_logs_booking_id_idx" ON "public"."notification_logs" USING "btree" ("booking_id") WHERE ("booking_id" IS NOT NULL);



CREATE INDEX "notification_logs_booking_template_created_idx" ON "public"."notification_logs" USING "btree" ("booking_id", "template_key", "created_at" DESC) WHERE ("booking_id" IS NOT NULL);



COMMENT ON INDEX "public"."notification_logs_booking_template_created_idx" IS 'M-19: per-(booking, template_key) recency probes used by SMS cooldown checks (notifyCleanerBookingPaid.cleanerPaidSmsRecentlySent) and any future "did we already send X for booking Y?" lookup. Partial WHERE booking_id IS NOT NULL matches notification_logs_booking_id_idx.';



CREATE INDEX "notification_logs_channel_status_idx" ON "public"."notification_logs" USING "btree" ("channel", "status");



CREATE INDEX "notification_logs_created_at_idx" ON "public"."notification_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "notification_logs_decision_created_at_idx" ON "public"."notification_logs" USING "btree" ("decision", "created_at" DESC) WHERE ("decision" IS NOT NULL);



CREATE INDEX "notification_logs_event_type_created_idx" ON "public"."notification_logs" USING "btree" ("event_type", "created_at" DESC);



CREATE INDEX "notification_logs_role_created_idx" ON "public"."notification_logs" USING "btree" ("role", "created_at" DESC);



CREATE INDEX "notification_logs_template_key_idx" ON "public"."notification_logs" USING "btree" ("template_key");



CREATE INDEX "payment_transactions_booking_idx" ON "public"."payment_transactions" USING "btree" ("booking_id") WHERE ("booking_id" IS NOT NULL);



CREATE INDEX "payment_transactions_entity_idx" ON "public"."payment_transactions" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "payment_transactions_paid_at_idx" ON "public"."payment_transactions" USING "btree" ("paid_at" DESC NULLS LAST);



CREATE INDEX "payment_transactions_settlement_idx" ON "public"."payment_transactions" USING "btree" ("settlement_status", "settlement_date");



CREATE INDEX "payout_audit_events_created_idx" ON "public"."payout_audit_events" USING "btree" ("created_at" DESC);



CREATE INDEX "payout_audit_events_payout_id_idx" ON "public"."payout_audit_events" USING "btree" ("payout_id") WHERE ("payout_id" IS NOT NULL);



CREATE INDEX "payout_audit_events_type_idx" ON "public"."payout_audit_events" USING "btree" ("event_type");



CREATE UNIQUE INDEX "payout_transfer_outbox_active_subject_uidx" ON "public"."payout_transfer_outbox" USING "btree" ("rail", "subject_id") WHERE ("status" = ANY (ARRAY['pending'::"text", 'submitted'::"text", 'needs_reconcile'::"text", 'succeeded'::"text"]));



CREATE INDEX "payout_transfer_outbox_status_created_idx" ON "public"."payout_transfer_outbox" USING "btree" ("status", "created_at") WHERE ("status" = ANY (ARRAY['pending'::"text", 'needs_reconcile'::"text"]));



CREATE INDEX "payout_transfers_cleaner_id_idx" ON "public"."payout_transfers" USING "btree" ("cleaner_id");



CREATE INDEX "payout_transfers_payout_id_idx" ON "public"."payout_transfers" USING "btree" ("payout_id");



CREATE UNIQUE INDEX "payout_transfers_reference_uidx" ON "public"."payout_transfers" USING "btree" ("reference");



CREATE UNIQUE INDEX "payout_transfers_success_once_idx" ON "public"."payout_transfers" USING "btree" ("payout_id") WHERE ("status" = 'success'::"text");



CREATE UNIQUE INDEX "payout_transfers_transfer_code_idx" ON "public"."payout_transfers" USING "btree" ("transfer_code") WHERE ("transfer_code" IS NOT NULL);



CREATE INDEX "pricing_catalog_audit_row_idx" ON "public"."pricing_catalog_audit" USING "btree" ("table_name", "row_id", "created_at" DESC);



CREATE INDEX "pricing_catalog_audit_table_created_idx" ON "public"."pricing_catalog_audit" USING "btree" ("table_name", "created_at" DESC);



CREATE INDEX "pricing_changes_created_at_idx" ON "public"."pricing_changes" USING "btree" ("created_at" DESC);



CREATE INDEX "pricing_changes_rule_idx" ON "public"."pricing_changes" USING "btree" ("pricing_rule_id");



CREATE INDEX "pricing_changes_status_idx" ON "public"."pricing_changes" USING "btree" ("status");



CREATE INDEX "pricing_extra_bundles_active_idx" ON "public"."pricing_extra_bundles" USING "btree" ("is_active", "sort_order");



CREATE INDEX "pricing_extras_active_idx" ON "public"."pricing_extras" USING "btree" ("is_active", "sort_order");



CREATE INDEX "pricing_rules_location_idx" ON "public"."pricing_rules" USING "btree" ("location");



CREATE INDEX "pricing_services_active_idx" ON "public"."pricing_services" USING "btree" ("is_active", "sort_order");



CREATE INDEX "pricing_tiers_active_sort_idx" ON "public"."pricing_tiers" USING "btree" ("is_active", "sort_order");



CREATE INDEX "pricing_versions_created_at_idx" ON "public"."pricing_versions" USING "btree" ("created_at" DESC);



CREATE INDEX "promotion_audit_log_promo_idx" ON "public"."promotion_audit_log" USING "btree" ("promotion_id", "created_at" DESC);



CREATE INDEX "promotion_bundles_promo_idx" ON "public"."promotion_bundles" USING "btree" ("promotion_id", "enabled");



CREATE INDEX "promotion_events_created_idx" ON "public"."promotion_events" USING "btree" ("created_at" DESC);



CREATE INDEX "promotion_events_promo_type_idx" ON "public"."promotion_events" USING "btree" ("promotion_id", "event_type", "created_at" DESC);



CREATE INDEX "promotion_redemptions_booking_idx" ON "public"."promotion_redemptions" USING "btree" ("booking_id") WHERE ("booking_id" IS NOT NULL);



CREATE UNIQUE INDEX "promotion_redemptions_idempotency_uidx" ON "public"."promotion_redemptions" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "promotion_redemptions_promo_user_idx" ON "public"."promotion_redemptions" USING "btree" ("promotion_id", "user_id", "created_at" DESC);



CREATE UNIQUE INDEX "promotions_promo_code_uidx" ON "public"."promotions" USING "btree" ("upper"("promo_code")) WHERE (("promo_code" IS NOT NULL) AND ("btrim"("promo_code") <> ''::"text"));



CREATE INDEX "promotions_status_dates_idx" ON "public"."promotions" USING "btree" ("status", "starts_at", "ends_at");



CREATE INDEX "promotions_type_status_idx" ON "public"."promotions" USING "btree" ("promotion_type", "status");



CREATE INDEX "recurring_bookings_active_next_run_idx" ON "public"."recurring_bookings" USING "btree" ("status", "next_run_date");



CREATE INDEX "recurring_bookings_customer_idx" ON "public"."recurring_bookings" USING "btree" ("customer_id");



CREATE INDEX "recurring_bookings_preferred_cleaner_id_idx" ON "public"."recurring_bookings" USING "btree" ("preferred_cleaner_id") WHERE ("preferred_cleaner_id" IS NOT NULL);



COMMENT ON INDEX "public"."recurring_bookings_preferred_cleaner_id_idx" IS 'Partial index — only plans with a preferred cleaner; supports admin "all plans for cleaner X" lookup and the cleaner-removal repair sweep that nulls preferred_cleaner_id when a cleaner is offboarded.';



CREATE INDEX "recurring_expenses_next_run_idx" ON "public"."recurring_expenses" USING "btree" ("next_run_date") WHERE ("status" = 'active'::"text");



CREATE UNIQUE INDEX "referral_discount_redemptions_booking_id_uidx" ON "public"."referral_discount_redemptions" USING "btree" ("booking_id");



CREATE UNIQUE INDEX "referral_discount_redemptions_code_email_uidx" ON "public"."referral_discount_redemptions" USING "btree" ("referral_code", "redeemed_by_email") WHERE ("redeemed_by_email" IS NOT NULL);



CREATE UNIQUE INDEX "referral_discount_redemptions_code_fingerprint_uidx" ON "public"."referral_discount_redemptions" USING "btree" ("referral_code", "checkout_fingerprint") WHERE (("checkout_fingerprint" IS NOT NULL) AND ("length"(TRIM(BOTH FROM "checkout_fingerprint")) > 0));



CREATE UNIQUE INDEX "referral_discount_redemptions_code_user_uidx" ON "public"."referral_discount_redemptions" USING "btree" ("referral_code", "redeemed_by_user_id") WHERE ("redeemed_by_user_id" IS NOT NULL);



CREATE INDEX "referral_discount_redemptions_fingerprint_lookup_idx" ON "public"."referral_discount_redemptions" USING "btree" ("referral_code", "checkout_fingerprint", "created_at" DESC) WHERE (("checkout_fingerprint" IS NOT NULL) AND ("length"(TRIM(BOTH FROM "checkout_fingerprint")) > 0));



COMMENT ON INDEX "public"."referral_discount_redemptions_fingerprint_lookup_idx" IS 'Supports duplicate device fingerprint abuse queries on referral checkout redemptions.';



CREATE INDEX "referral_discount_redemptions_referrer_idx" ON "public"."referral_discount_redemptions" USING "btree" ("referrer_type", "referrer_id", "created_at" DESC);



CREATE INDEX "referral_events_booking_idx" ON "public"."referral_events" USING "btree" ("booking_id", "created_at" DESC);



CREATE INDEX "referral_events_referral_idx" ON "public"."referral_events" USING "btree" ("referral_id", "created_at" DESC) WHERE ("referral_id" IS NOT NULL);



CREATE INDEX "referral_events_referrer_idx" ON "public"."referral_events" USING "btree" ("referrer_type", "referrer_id", "created_at" DESC);



CREATE INDEX "referral_events_type_created_idx" ON "public"."referral_events" USING "btree" ("event_type", "created_at" DESC);



CREATE UNIQUE INDEX "referral_events_unique_event_booking_uidx" ON "public"."referral_events" USING "btree" ("event_type", "booking_id") WHERE ("booking_id" IS NOT NULL);



CREATE UNIQUE INDEX "referral_events_unique_lifecycle_event_referral_uidx" ON "public"."referral_events" USING "btree" ("event_type", "referral_id") WHERE ("referral_id" IS NOT NULL);



CREATE INDEX "referral_submissions_referrer_email_idx" ON "public"."referral_submissions" USING "btree" ("lower"("referrer_email"));



CREATE INDEX "referral_submissions_status_idx" ON "public"."referral_submissions" USING "btree" ("status", "created_at" DESC);



CREATE UNIQUE INDEX "referrals_completed_once_per_referred_type_idx" ON "public"."referrals" USING "btree" ("referrer_type", "referred_email_or_phone") WHERE ("status" = 'completed'::"text");



CREATE INDEX "referrals_contact_idx" ON "public"."referrals" USING "btree" ("referred_email_or_phone", "status");



CREATE UNIQUE INDEX "referrals_finalized_once_per_referred_idx" ON "public"."referrals" USING "btree" ("referrer_type", "referred_email_or_phone") WHERE ("status" = ANY (ARRAY['completed'::"text", 'rewarded'::"text"]));



CREATE INDEX "referrals_referred_user_idx" ON "public"."referrals" USING "btree" ("referred_user_id", "status");



CREATE INDEX "referrals_referrer_idx" ON "public"."referrals" USING "btree" ("referrer_type", "referrer_id", "created_at" DESC);



CREATE INDEX "review_sms_prompt_queue_first_due_idx" ON "public"."review_sms_prompt_queue" USING "btree" ("first_due_at") WHERE ("first_sent_at" IS NULL);



CREATE INDEX "review_sms_prompt_queue_reminder_due_idx" ON "public"."review_sms_prompt_queue" USING "btree" ("reminder_due_at") WHERE (("first_sent_at" IS NOT NULL) AND ("reminder_sent_at" IS NULL));



CREATE INDEX "reviews_cleaner_idx" ON "public"."reviews" USING "btree" ("cleaner_id", "created_at" DESC);



CREATE INDEX "reviews_cleaner_public_idx" ON "public"."reviews" USING "btree" ("cleaner_id", "created_at" DESC) WHERE (COALESCE("is_hidden", false) = false);



CREATE INDEX "sales_documents_customer_id_idx" ON "public"."sales_documents" USING "btree" ("customer_id") WHERE ("customer_id" IS NOT NULL);



CREATE INDEX "sales_documents_document_type_idx" ON "public"."sales_documents" USING "btree" ("document_type");



CREATE INDEX "sales_documents_public_token_idx" ON "public"."sales_documents" USING "btree" ("public_token");



CREATE INDEX "sales_documents_quote_requests_idx" ON "public"."sales_documents" USING "btree" ("created_at" DESC) WHERE (("status" = 'requested'::"text") AND ("document_type" = 'quote'::"text"));



CREATE INDEX "sales_documents_refunded_at_idx" ON "public"."sales_documents" USING "btree" ("refunded_at" DESC) WHERE ("refunded_at" IS NOT NULL);



CREATE INDEX "sales_documents_status_idx" ON "public"."sales_documents" USING "btree" ("status");



CREATE INDEX "sales_documents_zoho_estimate_id_idx" ON "public"."sales_documents" USING "btree" ("zoho_estimate_id") WHERE ("zoho_estimate_id" IS NOT NULL);



CREATE INDEX "sales_documents_zoho_invoice_id_idx" ON "public"."sales_documents" USING "btree" ("zoho_invoice_id") WHERE ("zoho_invoice_id" IS NOT NULL);



CREATE INDEX "seo_auto_hub_ui_patch_updated_idx" ON "public"."seo_auto_hub_ui_patch" USING "btree" ("updated_at" DESC);



CREATE INDEX "seo_auto_title_variant_updated_idx" ON "public"."seo_auto_title_variant" USING "btree" ("updated_at" DESC);



CREATE INDEX "seo_insights_recommendations_created_idx" ON "public"."seo_insights_recommendations" USING "btree" ("created_at" DESC);



CREATE INDEX "seo_insights_recommendations_slug_created_idx" ON "public"."seo_insights_recommendations" USING "btree" ("slug", "created_at" DESC);



CREATE INDEX "service_earning_caps_service_id_idx" ON "public"."service_earning_caps" USING "btree" ("service_id");



CREATE INDEX "services_active_sort_idx" ON "public"."services" USING "btree" ("is_active", "sort_order");



CREATE INDEX "social_accounts_provider_status_idx" ON "public"."social_accounts" USING "btree" ("provider", "status");



CREATE INDEX "social_publish_history_promotion_idx" ON "public"."social_publish_history" USING "btree" ("promotion_id");



CREATE INDEX "social_publish_history_provider_created_idx" ON "public"."social_publish_history" USING "btree" ("provider", "created_at" DESC);



CREATE INDEX "subscriptions_autopay_idx" ON "public"."subscriptions" USING "btree" ("status", "next_booking_date", "retry_count");



CREATE INDEX "subscriptions_due_idx" ON "public"."subscriptions" USING "btree" ("status", "next_booking_date");



CREATE INDEX "subscriptions_user_status_idx" ON "public"."subscriptions" USING "btree" ("user_id", "status", "next_booking_date");



CREATE INDEX "system_logs_created_idx" ON "public"."system_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "system_logs_source_created_idx" ON "public"."system_logs" USING "btree" ("source", "created_at" DESC);



CREATE INDEX "system_metrics_metric_created_idx" ON "public"."system_metrics" USING "btree" ("metric", "created_at" DESC);



CREATE INDEX "team_job_member_payouts_booking_id_idx" ON "public"."team_job_member_payouts" USING "btree" ("booking_id");



CREATE INDEX "team_job_member_payouts_cleaner_id_idx" ON "public"."team_job_member_payouts" USING "btree" ("cleaner_id");



CREATE INDEX "team_job_member_payouts_team_id_idx" ON "public"."team_job_member_payouts" USING "btree" ("team_id");



CREATE INDEX "team_members_cleaner_id_idx" ON "public"."team_members" USING "btree" ("cleaner_id");



CREATE INDEX "team_members_team_id_idx" ON "public"."team_members" USING "btree" ("team_id");



CREATE INDEX "teams_lead_cleaner_id_idx" ON "public"."teams" USING "btree" ("lead_cleaner_id");



CREATE INDEX "templates_key_active_idx" ON "public"."templates" USING "btree" ("key") WHERE "is_active";



CREATE INDEX "travel_route_cache_expires_idx" ON "public"."travel_route_cache" USING "btree" ("expires_at");



CREATE UNIQUE INDEX "uniq_active_retry_per_booking" ON "public"."dispatch_retry_queue" USING "btree" ("booking_id") WHERE ("status" = 'pending'::"text");



COMMENT ON INDEX "public"."uniq_active_retry_per_booking" IS 'At most one pending dispatch_retry_queue row per booking (concurrent enqueue safety).';



CREATE UNIQUE INDEX "uniq_admin_billing_idem_user_id_id" ON "public"."admin_billing_idempotency" USING "btree" ("user_id", "id");



COMMENT ON INDEX "public"."uniq_admin_billing_idem_user_id_id" IS 'Ensures one idempotency row per customer + id (id embeds Idempotency-Key).';



CREATE UNIQUE INDEX "uniq_cleaners_auth_user_id" ON "public"."cleaners" USING "btree" ("auth_user_id");



COMMENT ON INDEX "public"."uniq_cleaners_auth_user_id" IS 'One auth user per cleaner row (Phase 2); replaces partial cleaners_auth_user_id_unique_idx.';



CREATE INDEX "user_behavior_signal_idx" ON "public"."user_behavior" USING "btree" ("signal_type", "created_at" DESC);



CREATE INDEX "user_behavior_user_created_idx" ON "public"."user_behavior" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "user_events_booking_idx" ON "public"."user_events" USING "btree" ("booking_id");



CREATE UNIQUE INDEX "user_events_one_booking_created_per_booking" ON "public"."user_events" USING "btree" ("booking_id") WHERE (("event_type" = 'booking_created'::"text") AND ("booking_id" IS NOT NULL));



CREATE UNIQUE INDEX "user_events_referral_checkout_booking_uidx" ON "public"."user_events" USING "btree" ("event_type", "booking_id") WHERE (("booking_id" IS NOT NULL) AND ("event_type" = ANY (ARRAY['checkout_discount_applied'::"text", 'cleaner_checkout_attribution'::"text"])));



CREATE INDEX "user_events_type_idx" ON "public"."user_events" USING "btree" ("event_type", "created_at" DESC);



CREATE INDEX "user_events_user_created_idx" ON "public"."user_events" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "user_notifications_booking_type_created_idx" ON "public"."user_notifications" USING "btree" ("booking_id", "type", "created_at" DESC);



CREATE UNIQUE INDEX "user_notifications_idempotency_user_booking_type_key" ON "public"."user_notifications" USING "btree" ("user_id", "booking_id", "type") WHERE (("booking_id" IS NOT NULL) AND ("type" = ANY (ARRAY['confirmed'::"text", 'assigned'::"text", 'reminder'::"text", 'cancelled'::"text"])));



COMMENT ON INDEX "public"."user_notifications_idempotency_user_booking_type_key" IS 'One lifecycle row per (user_id, booking_id, type); system may repeat; optional future idempotency_key column for multi-step / external workflows.';



CREATE INDEX "user_notifications_user_booking_idx" ON "public"."user_notifications" USING "btree" ("user_id", "booking_id");



CREATE INDEX "user_notifications_user_created_idx" ON "public"."user_notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "user_profiles_billing_email_idx" ON "public"."user_profiles" USING "btree" ("lower"("billing_email")) WHERE ("billing_email" IS NOT NULL);



CREATE INDEX "user_profiles_billing_schedule_idx" ON "public"."user_profiles" USING "btree" ("billing_type", "schedule_type");



CREATE INDEX "user_profiles_last_ai_timing_idx" ON "public"."user_profiles" USING "btree" ("last_ai_timing_applied_at" DESC NULLS LAST) WHERE ("last_ai_timing_applied_at" IS NOT NULL);



CREATE INDEX "user_profiles_phone_e164_idx" ON "public"."user_profiles" USING "btree" ("phone_e164") WHERE ("phone_e164" IS NOT NULL);



CREATE INDEX "user_profiles_primary_city_idx" ON "public"."user_profiles" USING "btree" ("primary_city_id") WHERE ("primary_city_id" IS NOT NULL);



CREATE INDEX "user_profiles_role_idx" ON "public"."user_profiles" USING "btree" ("role");



CREATE INDEX "user_profiles_updated_idx" ON "public"."user_profiles" USING "btree" ("updated_at" DESC);



CREATE INDEX "user_push_tokens_token_idx" ON "public"."user_push_tokens" USING "btree" ("token");



CREATE INDEX "user_push_tokens_user_app_idx" ON "public"."user_push_tokens" USING "btree" ("user_id", "app");



CREATE UNIQUE INDEX "user_push_tokens_user_token_uidx" ON "public"."user_push_tokens" USING "btree" ("user_id", "token");



CREATE INDEX "whatsapp_cleaner_unmatched_intent_log_cleaner_id_idx" ON "public"."whatsapp_cleaner_unmatched_intent_log" USING "btree" ("cleaner_id", "created_at" DESC);



CREATE INDEX "whatsapp_cleaner_unmatched_intent_log_created_at_idx" ON "public"."whatsapp_cleaner_unmatched_intent_log" USING "btree" ("created_at" DESC);



CREATE INDEX "whatsapp_delivery_events_booking_event_at_idx" ON "public"."whatsapp_delivery_events" USING "btree" ("booking_id", "event_at" DESC) WHERE ("booking_id" IS NOT NULL);



CREATE INDEX "whatsapp_delivery_events_event_at_idx" ON "public"."whatsapp_delivery_events" USING "btree" ("event_at" DESC);



CREATE UNIQUE INDEX "whatsapp_delivery_events_message_status_uidx" ON "public"."whatsapp_delivery_events" USING "btree" ("message_id", "status");



CREATE INDEX "whatsapp_inbound_feedback_dedupe_created_at_idx" ON "public"."whatsapp_inbound_feedback_dedupe" USING "btree" ("created_at" DESC);



CREATE INDEX "whatsapp_logs_booking_id_idx" ON "public"."whatsapp_logs" USING "btree" ("booking_id");



CREATE INDEX "whatsapp_logs_created_at_idx" ON "public"."whatsapp_logs" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "whatsapp_logs_meta_message_id_uidx" ON "public"."whatsapp_logs" USING "btree" ("meta_message_id") WHERE ("meta_message_id" IS NOT NULL);



CREATE INDEX "whatsapp_logs_status_idx" ON "public"."whatsapp_logs" USING "btree" ("status");



CREATE UNIQUE INDEX "whatsapp_queue_idempotency_active_uidx" ON "public"."whatsapp_queue" USING "btree" ("idempotency_key") WHERE (("idempotency_key" IS NOT NULL) AND ("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'sent'::"text"])));



CREATE INDEX "whatsapp_queue_meta_message_id_idx" ON "public"."whatsapp_queue" USING "btree" ("meta_message_id") WHERE ("meta_message_id" IS NOT NULL);



CREATE INDEX "whatsapp_queue_pending_created_idx" ON "public"."whatsapp_queue" USING "btree" ("created_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "whatsapp_queue_worker_pick_idx" ON "public"."whatsapp_queue" USING "btree" ("priority" DESC, "next_attempt_at" NULLS FIRST, "created_at") WHERE ("status" = 'pending'::"text");



CREATE OR REPLACE TRIGGER "auto_link_booking_user" BEFORE INSERT ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."link_booking_to_user"();



CREATE OR REPLACE TRIGGER "bookings_assign_reference" BEFORE INSERT ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."assign_booking_reference"();



CREATE OR REPLACE TRIGGER "bookings_touch_became_pending_at_trg" BEFORE INSERT OR UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."bookings_touch_became_pending_at"();



CREATE OR REPLACE TRIGGER "referral_discount_redemptions_enforce_limits_trg" BEFORE INSERT ON "public"."referral_discount_redemptions" FOR EACH ROW EXECUTE FUNCTION "public"."referral_discount_redemptions_enforce_limits"();



CREATE OR REPLACE TRIGGER "reviews_refresh_cleaner_rating" AFTER INSERT OR DELETE OR UPDATE OF "rating", "is_hidden" ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."trg_reviews_refresh_cleaner"();



CREATE OR REPLACE TRIGGER "trg_blog_authors_updated_at" BEFORE UPDATE ON "public"."blog_authors" FOR EACH ROW EXECUTE FUNCTION "public"."blog_touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_blog_categories_updated_at" BEFORE UPDATE ON "public"."blog_categories" FOR EACH ROW EXECUTE FUNCTION "public"."blog_touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_blog_posts_updated_at" BEFORE UPDATE ON "public"."blog_posts" FOR EACH ROW EXECUTE FUNCTION "public"."blog_touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_bookings_default_price_snapshot_bi" BEFORE INSERT ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."bookings_default_price_snapshot_if_missing"();



CREATE OR REPLACE TRIGGER "trg_bookings_ensure_payout_owner_in_team" BEFORE INSERT OR UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."bookings_trg_ensure_payout_owner_in_team"();



CREATE OR REPLACE TRIGGER "trg_bookings_lock_finalized_invoice" BEFORE UPDATE OF "total_paid_zar", "amount_paid_cents", "monthly_invoice_id", "customer_id", "payment_status", "status" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."bookings_lock_under_finalized_monthly_invoice"();



CREATE OR REPLACE TRIGGER "trg_bookings_monthly_invoice_del" BEFORE DELETE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."bookings_before_delete_monthly_invoice"();



CREATE OR REPLACE TRIGGER "trg_bookings_monthly_invoice_ins" BEFORE INSERT ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."bookings_after_write_monthly_invoice"();



CREATE OR REPLACE TRIGGER "trg_bookings_monthly_invoice_upd" BEFORE UPDATE OF "customer_id", "date", "total_paid_zar", "amount_paid_cents", "status", "created_at" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."bookings_after_write_monthly_invoice"();



CREATE OR REPLACE TRIGGER "trg_bookings_normalize_billing_type" BEFORE INSERT OR UPDATE OF "is_monthly_billing_booking", "payment_status", "monthly_invoice_id", "billing_type" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."bookings_normalize_billing_type"();



CREATE OR REPLACE TRIGGER "trg_bookings_normalized_phone" BEFORE INSERT OR UPDATE OF "customer_phone" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."bookings_set_normalized_phone"();



CREATE OR REPLACE TRIGGER "trg_bookings_payout_frozen_immutable_after_eligible" BEFORE UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."bookings_trg_payout_frozen_immutable_after_eligible"();



CREATE OR REPLACE TRIGGER "trg_bookings_touch_updated_at" BEFORE UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."touch_bookings_updated_at"();



CREATE OR REPLACE TRIGGER "trg_cleaner_payouts_block_mutate_when_frozen" BEFORE UPDATE ON "public"."cleaner_payouts" FOR EACH ROW EXECUTE FUNCTION "public"."cleaner_payouts_block_mutate_when_frozen"();



CREATE OR REPLACE TRIGGER "trg_invoice_adjustments_after_ins" AFTER INSERT ON "public"."invoice_adjustments" FOR EACH ROW EXECUTE FUNCTION "public"."invoice_adjustments_after_insert_route"();



CREATE OR REPLACE TRIGGER "trg_invoice_adjustments_block_closed" BEFORE INSERT ON "public"."invoice_adjustments" FOR EACH ROW EXECUTE FUNCTION "public"."invoice_adjustments_block_if_month_closed"();



CREATE OR REPLACE TRIGGER "trg_monthly_invoices_apply_adjustments" AFTER UPDATE OF "status" ON "public"."monthly_invoices" FOR EACH ROW EXECUTE FUNCTION "public"."monthly_invoices_stamp_adjustments_applied_at"();



CREATE OR REPLACE TRIGGER "trg_monthly_invoices_auto_close" BEFORE UPDATE OF "status" ON "public"."monthly_invoices" FOR EACH ROW EXECUTE FUNCTION "public"."monthly_invoices_before_write_auto_close"();



CREATE OR REPLACE TRIGGER "trg_monthly_invoices_invoice_closed_event" AFTER UPDATE OF "status" ON "public"."monthly_invoices" FOR EACH ROW EXECUTE FUNCTION "public"."monthly_invoices_after_status_paid_append_closed"();



CREATE OR REPLACE TRIGGER "trg_monthly_invoices_updated_at" BEFORE UPDATE ON "public"."monthly_invoices" FOR EACH ROW EXECUTE FUNCTION "public"."monthly_invoices_touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_recurring_bookings_updated_at" BEFORE UPDATE ON "public"."recurring_bookings" FOR EACH ROW EXECUTE FUNCTION "public"."recurring_bookings_touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sales_documents_updated_at" BEFORE UPDATE ON "public"."sales_documents" FOR EACH ROW EXECUTE FUNCTION "public"."sales_documents_touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_user_profiles_billing_model_lock" BEFORE UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."user_profiles_prevent_customer_billing_change"();



CREATE OR REPLACE TRIGGER "update_user_tier_trigger" AFTER UPDATE OF "status" ON "public"."bookings" FOR EACH ROW WHEN ((("new"."status" = 'completed'::"text") AND ("old"."status" IS DISTINCT FROM 'completed'::"text"))) EXECUTE FUNCTION "public"."trg_bookings_completed_refresh_tier"();



ALTER TABLE ONLY "public"."accounting_invoice_sync"
    ADD CONSTRAINT "accounting_invoice_sync_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_api_idempotency"
    ADD CONSTRAINT "admin_api_idempotency_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."monthly_invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_billing_idempotency"
    ADD CONSTRAINT "admin_billing_idempotency_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_earnings_actions"
    ADD CONSTRAINT "admin_earnings_actions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_money_action_proposals"
    ADD CONSTRAINT "admin_money_action_proposals_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_request_dedupe"
    ADD CONSTRAINT "admin_request_dedupe_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."birthday_rewards"
    ADD CONSTRAINT "birthday_rewards_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."birthday_rewards"
    ADD CONSTRAINT "birthday_rewards_redeemed_booking_id_fkey" FOREIGN KEY ("redeemed_booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."birthday_rewards"
    ADD CONSTRAINT "birthday_rewards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blog_authors"
    ADD CONSTRAINT "blog_authors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."blog_post_tags"
    ADD CONSTRAINT "blog_post_tags_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blog_post_tags"
    ADD CONSTRAINT "blog_post_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."blog_tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blog_posts"
    ADD CONSTRAINT "blog_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."blog_authors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."blog_posts"
    ADD CONSTRAINT "blog_posts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."blog_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."booking_changes"
    ADD CONSTRAINT "booking_changes_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_cleaner_earnings_snapshot"
    ADD CONSTRAINT "booking_cleaner_earnings_snapshot_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_cleaner_earnings_snapshot"
    ADD CONSTRAINT "booking_cleaner_earnings_snapshot_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."booking_cleaner_earnings_snapshot_lines"
    ADD CONSTRAINT "booking_cleaner_earnings_snapshot_lin_booking_line_item_id_fkey" FOREIGN KEY ("booking_line_item_id") REFERENCES "public"."booking_line_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_cleaner_earnings_snapshot_lines"
    ADD CONSTRAINT "booking_cleaner_earnings_snapshot_lines_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_cleaners"
    ADD CONSTRAINT "booking_cleaners_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_cleaners"
    ADD CONSTRAINT "booking_cleaners_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."booking_demand_events"
    ADD CONSTRAINT "booking_demand_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."booking_lifecycle_jobs"
    ADD CONSTRAINT "booking_lifecycle_jobs_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_lifecycle_jobs"
    ADD CONSTRAINT "booking_lifecycle_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."booking_line_items"
    ADD CONSTRAINT "booking_line_items_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_payment_recovery_jobs"
    ADD CONSTRAINT "booking_payment_recovery_jobs_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_roster_member_payouts"
    ADD CONSTRAINT "booking_roster_member_payouts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_roster_member_payouts"
    ADD CONSTRAINT "booking_roster_member_payouts_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."booking_roster_member_payouts"
    ADD CONSTRAINT "booking_roster_member_payouts_cleaner_payout_id_fkey" FOREIGN KEY ("cleaner_payout_id") REFERENCES "public"."cleaner_payouts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."booking_service_checklists"
    ADD CONSTRAINT "booking_service_checklists_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_service_checklists"
    ADD CONSTRAINT "booking_service_checklists_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_service_photos"
    ADD CONSTRAINT "booking_service_photos_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_service_photos"
    ADD CONSTRAINT "booking_service_photos_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_team_assignments"
    ADD CONSTRAINT "booking_team_assignments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_team_assignments"
    ADD CONSTRAINT "booking_team_assignments_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."booking_totals"
    ADD CONSTRAINT "booking_totals_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_last_declined_by_cleaner_id_fkey" FOREIGN KEY ("last_declined_by_cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_monthly_invoice_id_fkey" FOREIGN KEY ("monthly_invoice_id") REFERENCES "public"."monthly_invoices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_payment_transaction_id_fkey" FOREIGN KEY ("payment_transaction_id") REFERENCES "public"."payment_transactions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "public"."cleaner_payouts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_payout_owner_cleaner_id_fkey" FOREIGN KEY ("payout_owner_cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pricing_version_id_fkey" FOREIGN KEY ("pricing_version_id") REFERENCES "public"."pricing_versions"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_recurring_id_fkey" FOREIGN KEY ("recurring_id") REFERENCES "public"."recurring_bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_sales_document_id_fkey" FOREIGN KEY ("sales_document_id") REFERENCES "public"."sales_documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_selected_cleaner_id_fkey" FOREIGN KEY ("selected_cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_assets"
    ADD CONSTRAINT "campaign_assets_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_content"
    ADD CONSTRAINT "campaign_content_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."city_configs"
    ADD CONSTRAINT "city_configs_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cleaner_applications"
    ADD CONSTRAINT "cleaner_applications_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cleaner_booking_track_points"
    ADD CONSTRAINT "cleaner_booking_track_points_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cleaner_booking_track_points"
    ADD CONSTRAINT "cleaner_booking_track_points_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cleaner_change_requests"
    ADD CONSTRAINT "cleaner_change_requests_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cleaner_earnings_adjustments"
    ADD CONSTRAINT "cleaner_earnings_adjustments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cleaner_earnings_adjustments"
    ADD CONSTRAINT "cleaner_earnings_adjustments_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cleaner_earnings_adjustments"
    ADD CONSTRAINT "cleaner_earnings_adjustments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cleaner_earnings_adjustments"
    ADD CONSTRAINT "cleaner_earnings_adjustments_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "public"."cleaner_earnings_disputes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cleaner_earnings"
    ADD CONSTRAINT "cleaner_earnings_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cleaner_earnings"
    ADD CONSTRAINT "cleaner_earnings_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cleaner_earnings"
    ADD CONSTRAINT "cleaner_earnings_disbursement_id_fkey" FOREIGN KEY ("disbursement_id") REFERENCES "public"."cleaner_earnings_disbursements"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cleaner_earnings_disbursements"
    ADD CONSTRAINT "cleaner_earnings_disbursements_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cleaner_earnings_disputes"
    ADD CONSTRAINT "cleaner_earnings_disputes_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cleaner_earnings_disputes"
    ADD CONSTRAINT "cleaner_earnings_disputes_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cleaner_earnings_disputes"
    ADD CONSTRAINT "cleaner_earnings_disputes_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cleaner_earnings_disputes"
    ADD CONSTRAINT "cleaner_earnings_disputes_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cleaner_job_issue_report_idempotency"
    ADD CONSTRAINT "cleaner_job_issue_report_idempotency_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cleaner_job_issue_report_idempotency"
    ADD CONSTRAINT "cleaner_job_issue_report_idempotency_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cleaner_job_issue_report_idempotency"
    ADD CONSTRAINT "cleaner_job_issue_report_idempotency_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."cleaner_job_issue_reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cleaner_job_issue_reports"
    ADD CONSTRAINT "cleaner_job_issue_reports_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cleaner_job_issue_reports"
    ADD CONSTRAINT "cleaner_job_issue_reports_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cleaner_job_lifecycle_idempotency"
    ADD CONSTRAINT "cleaner_job_lifecycle_idempotency_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cleaner_job_lifecycle_idempotency"
    ADD CONSTRAINT "cleaner_job_lifecycle_idempotency_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cleaner_locations"
    ADD CONSTRAINT "cleaner_locations_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cleaner_locations"
    ADD CONSTRAINT "cleaner_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cleaner_payment_details"
    ADD CONSTRAINT "cleaner_payment_details_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cleaner_payouts"
    ADD CONSTRAINT "cleaner_payouts_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cleaner_payouts"
    ADD CONSTRAINT "cleaner_payouts_payout_run_id_fkey" FOREIGN KEY ("payout_run_id") REFERENCES "public"."cleaner_payout_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cleaner_preferences"
    ADD CONSTRAINT "cleaner_preferences_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cleaner_report_feedback"
    ADD CONSTRAINT "cleaner_report_feedback_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cleaners"
    ADD CONSTRAINT "cleaners_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cleaning_credit_transactions"
    ADD CONSTRAINT "cleaning_credit_transactions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cleaning_credit_transactions"
    ADD CONSTRAINT "cleaning_credit_transactions_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cleaning_credit_transactions"
    ADD CONSTRAINT "cleaning_credit_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversion_deferred_payment_link_emails"
    ADD CONSTRAINT "conversion_deferred_payment_link_emails_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversion_experiment_results"
    ADD CONSTRAINT "conversion_experiment_results_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversion_experiment_results"
    ADD CONSTRAINT "conversion_experiment_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_memberships"
    ADD CONSTRAINT "customer_memberships_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plans"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."customer_memberships"
    ADD CONSTRAINT "customer_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_saved_addresses"
    ADD CONSTRAINT "customer_saved_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_segment"
    ADD CONSTRAINT "customer_segment_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_segment"
    ADD CONSTRAINT "customer_segment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dispatch_metrics"
    ADD CONSTRAINT "dispatch_metrics_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dispatch_metrics"
    ADD CONSTRAINT "dispatch_metrics_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."dispatch_offer_exposure_dedupe"
    ADD CONSTRAINT "dispatch_offer_exposure_dedupe_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "public"."dispatch_offers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dispatch_offer_timeout_metric_emitted"
    ADD CONSTRAINT "dispatch_offer_timeout_metric_emitted_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "public"."dispatch_offers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dispatch_offers"
    ADD CONSTRAINT "dispatch_offers_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dispatch_retry_queue"
    ADD CONSTRAINT "dispatch_retry_queue_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."earnings_disbursement_transfers"
    ADD CONSTRAINT "earnings_disbursement_transfers_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."earnings_disbursement_transfers"
    ADD CONSTRAINT "earnings_disbursement_transfers_disbursement_id_fkey" FOREIGN KEY ("disbursement_id") REFERENCES "public"."cleaner_earnings_disbursements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_campaign_sends"
    ADD CONSTRAINT "email_campaign_sends_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."email_campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_campaign_sends"
    ADD CONSTRAINT "email_campaign_sends_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expense_approval_events"
    ADD CONSTRAINT "expense_approval_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expense_approval_events"
    ADD CONSTRAINT "expense_approval_events_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."cities"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_paid_from_account_id_fkey" FOREIGN KEY ("paid_from_account_id") REFERENCES "public"."expense_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_payment_transaction_id_fkey" FOREIGN KEY ("payment_transaction_id") REFERENCES "public"."payment_transactions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_recurring_expense_fk" FOREIGN KEY ("recurring_expense_id") REFERENCES "public"."recurring_expenses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."expense_vendors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_budget_lines"
    ADD CONSTRAINT "finance_budget_lines_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."cities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_budget_lines"
    ADD CONSTRAINT "finance_budget_lines_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "public"."finance_budgets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_budget_lines"
    ADD CONSTRAINT "finance_budget_lines_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_budget_lines"
    ADD CONSTRAINT "finance_budget_lines_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."expense_vendors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_budgets"
    ADD CONSTRAINT "finance_budgets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_chart_of_accounts"
    ADD CONSTRAINT "finance_chart_of_accounts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."finance_chart_of_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."finance_notifications"
    ADD CONSTRAINT "finance_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."growth_action_outcomes"
    ADD CONSTRAINT "growth_action_outcomes_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."growth_action_outcomes"
    ADD CONSTRAINT "growth_action_outcomes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."growth_customer_touch"
    ADD CONSTRAINT "growth_customer_touch_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_adjustments"
    ADD CONSTRAINT "invoice_adjustments_applied_to_invoice_id_fkey" FOREIGN KEY ("applied_to_invoice_id") REFERENCES "public"."monthly_invoices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoice_adjustments"
    ADD CONSTRAINT "invoice_adjustments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoice_adjustments"
    ADD CONSTRAINT "invoice_adjustments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoice_adjustments"
    ADD CONSTRAINT "invoice_adjustments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lifecycle_email_settings"
    ADD CONSTRAINT "lifecycle_email_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."marketing_automation_rules"
    ADD CONSTRAINT "marketing_automation_rules_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."monthly_invoice_events"
    ADD CONSTRAINT "monthly_invoice_events_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."monthly_invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."monthly_invoice_paystack_charge_dedup"
    ADD CONSTRAINT "monthly_invoice_paystack_charge_dedup_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."monthly_invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."monthly_invoices"
    ADD CONSTRAINT "monthly_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_idempotency_claims"
    ADD CONSTRAINT "notification_idempotency_claims_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_link_delivery_events"
    ADD CONSTRAINT "payment_link_delivery_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payout_transfer_outbox"
    ADD CONSTRAINT "payout_transfer_outbox_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payout_transfers"
    ADD CONSTRAINT "payout_transfers_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payout_transfers"
    ADD CONSTRAINT "payout_transfers_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "public"."cleaner_payouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pricing_catalog_audit"
    ADD CONSTRAINT "pricing_catalog_audit_rollback_of_fkey" FOREIGN KEY ("rollback_of") REFERENCES "public"."pricing_catalog_audit"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pricing_changes"
    ADD CONSTRAINT "pricing_changes_pricing_rule_id_fkey" FOREIGN KEY ("pricing_rule_id") REFERENCES "public"."pricing_rules"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pricing_slot_adjustments"
    ADD CONSTRAINT "pricing_slot_adjustments_slot_time_fkey" FOREIGN KEY ("slot_time") REFERENCES "public"."pricing_metrics"("slot_time") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotion_audit_log"
    ADD CONSTRAINT "promotion_audit_log_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."promotion_bundles"
    ADD CONSTRAINT "promotion_bundles_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotion_events"
    ADD CONSTRAINT "promotion_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."promotion_events"
    ADD CONSTRAINT "promotion_events_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotion_events"
    ADD CONSTRAINT "promotion_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."promotion_redemptions"
    ADD CONSTRAINT "promotion_redemptions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."promotion_redemptions"
    ADD CONSTRAINT "promotion_redemptions_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotion_redemptions"
    ADD CONSTRAINT "promotion_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."promotions"
    ADD CONSTRAINT "promotions_duplicated_from_id_fkey" FOREIGN KEY ("duplicated_from_id") REFERENCES "public"."promotions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recurring_bookings"
    ADD CONSTRAINT "recurring_bookings_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "public"."customer_saved_addresses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recurring_bookings"
    ADD CONSTRAINT "recurring_bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_bookings"
    ADD CONSTRAINT "recurring_bookings_preferred_cleaner_id_fkey" FOREIGN KEY ("preferred_cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recurring_expenses"
    ADD CONSTRAINT "recurring_expenses_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."cities"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."recurring_expenses"
    ADD CONSTRAINT "recurring_expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."recurring_expenses"
    ADD CONSTRAINT "recurring_expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recurring_expenses"
    ADD CONSTRAINT "recurring_expenses_paid_from_account_id_fkey" FOREIGN KEY ("paid_from_account_id") REFERENCES "public"."expense_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recurring_expenses"
    ADD CONSTRAINT "recurring_expenses_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."expense_vendors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."referral_discount_redemptions"
    ADD CONSTRAINT "referral_discount_redemptions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_discount_redemptions"
    ADD CONSTRAINT "referral_discount_redemptions_redeemed_by_user_id_fkey" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."referral_events"
    ADD CONSTRAINT "referral_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_events"
    ADD CONSTRAINT "referral_events_referee_user_id_fkey" FOREIGN KEY ("referee_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."referral_events"
    ADD CONSTRAINT "referral_events_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."referral_events"
    ADD CONSTRAINT "referral_events_referral_redemption_id_fkey" FOREIGN KEY ("referral_redemption_id") REFERENCES "public"."referral_discount_redemptions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."referral_submissions"
    ADD CONSTRAINT "referral_submissions_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."referral_submissions"
    ADD CONSTRAINT "referral_submissions_referrer_user_id_fkey" FOREIGN KEY ("referrer_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_referred_user_id_fkey" FOREIGN KEY ("referred_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."referrals"
    ADD CONSTRAINT "referrals_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."referral_submissions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."review_sms_prompt_queue"
    ADD CONSTRAINT "review_sms_prompt_queue_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_document_paystack_charge_dedup"
    ADD CONSTRAINT "sales_document_paystack_charge_dedup_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."sales_documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales_documents"
    ADD CONSTRAINT "sales_documents_converted_from_id_fkey" FOREIGN KEY ("converted_from_id") REFERENCES "public"."sales_documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_documents"
    ADD CONSTRAINT "sales_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_documents"
    ADD CONSTRAINT "sales_documents_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."social_publish_history"
    ADD CONSTRAINT "social_publish_history_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_daily_capacity_usage"
    ADD CONSTRAINT "team_daily_capacity_usage_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_job_member_payouts"
    ADD CONSTRAINT "team_job_member_payouts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_job_member_payouts"
    ADD CONSTRAINT "team_job_member_payouts_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."team_job_member_payouts"
    ADD CONSTRAINT "team_job_member_payouts_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_lead_cleaner_id_fkey" FOREIGN KEY ("lead_cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."travel_route_cache"
    ADD CONSTRAINT "travel_route_cache_dest_location_id_fkey" FOREIGN KEY ("dest_location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."travel_route_cache"
    ADD CONSTRAINT "travel_route_cache_origin_location_id_fkey" FOREIGN KEY ("origin_location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_behavior"
    ADD CONSTRAINT "user_behavior_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_events"
    ADD CONSTRAINT "user_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_events"
    ADD CONSTRAINT "user_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_notifications"
    ADD CONSTRAINT "user_notifications_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_notifications"
    ADD CONSTRAINT "user_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_primary_city_id_fkey" FOREIGN KEY ("primary_city_id") REFERENCES "public"."cities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_push_tokens"
    ADD CONSTRAINT "user_push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_cleaner_unmatched_intent_log"
    ADD CONSTRAINT "whatsapp_cleaner_unmatched_intent_log_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_delivery_events"
    ADD CONSTRAINT "whatsapp_delivery_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_delivery_events"
    ADD CONSTRAINT "whatsapp_delivery_events_cleaner_id_fkey" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_logs"
    ADD CONSTRAINT "whatsapp_logs_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zoho_integration_settings"
    ADD CONSTRAINT "zoho_integration_settings_default_paystack_category_id_fkey" FOREIGN KEY ("default_paystack_category_id") REFERENCES "public"."expense_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."zoho_integration_settings"
    ADD CONSTRAINT "zoho_integration_settings_default_paystack_vendor_id_fkey" FOREIGN KEY ("default_paystack_vendor_id") REFERENCES "public"."expense_vendors"("id") ON DELETE SET NULL;



ALTER TABLE "public"."accounting_invoice_sync" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "accounting_invoice_sync_deny" ON "public"."accounting_invoice_sync" TO "authenticated" USING (false);



ALTER TABLE "public"."accounting_sync_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "accounting_sync_records_deny" ON "public"."accounting_sync_records" TO "authenticated" USING (false);



ALTER TABLE "public"."admin_api_idempotency" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_billing_idempotency" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_booking_create_idempotency" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_earnings_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_money_action_proposals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_request_dedupe" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_decision_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_experiment_exposures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_feature_store" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_model_weights" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bces_cleaner_select" ON "public"."booking_cleaner_earnings_snapshot" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cleaners" "c"
  WHERE (("c"."id" = "booking_cleaner_earnings_snapshot"."cleaner_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"()))))));



CREATE POLICY "bces_user_select" ON "public"."booking_cleaner_earnings_snapshot" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "booking_cleaner_earnings_snapshot"."booking_id") AND ("b"."customer_id" = "auth"."uid"())))));



CREATE POLICY "bcesl_cleaner_select" ON "public"."booking_cleaner_earnings_snapshot_lines" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."bookings" "b"
     JOIN "public"."cleaners" "c" ON (("c"."id" = "b"."cleaner_id")))
  WHERE (("b"."id" = "booking_cleaner_earnings_snapshot_lines"."booking_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"()))))));



CREATE POLICY "bcesl_user_select" ON "public"."booking_cleaner_earnings_snapshot_lines" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "booking_cleaner_earnings_snapshot_lines"."booking_id") AND ("b"."customer_id" = "auth"."uid"())))));



ALTER TABLE "public"."birthday_rewards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "birthday_rewards_own_read" ON "public"."birthday_rewards" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."blog_authors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "blog_authors_all_admin" ON "public"."blog_authors" USING ("public"."blog_is_admin"()) WITH CHECK ("public"."blog_is_admin"());



CREATE POLICY "blog_authors_select_public" ON "public"."blog_authors" FOR SELECT USING (true);



ALTER TABLE "public"."blog_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "blog_categories_all_admin" ON "public"."blog_categories" USING ("public"."blog_is_admin"()) WITH CHECK ("public"."blog_is_admin"());



CREATE POLICY "blog_categories_select_public" ON "public"."blog_categories" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."blog_post_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "blog_post_tags_all_admin" ON "public"."blog_post_tags" USING ("public"."blog_is_admin"()) WITH CHECK ("public"."blog_is_admin"());



CREATE POLICY "blog_post_tags_select_public" ON "public"."blog_post_tags" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."blog_posts" "p"
  WHERE (("p"."id" = "blog_post_tags"."post_id") AND ("p"."status" = 'published'::"public"."blog_post_status") AND ("p"."published_at" IS NOT NULL) AND ("p"."published_at" <= "now"())))));



ALTER TABLE "public"."blog_posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "blog_posts_all_admin" ON "public"."blog_posts" USING ("public"."blog_is_admin"()) WITH CHECK ("public"."blog_is_admin"());


CREATE POLICY "blog_posts_select_public" ON "public"."blog_posts" FOR SELECT USING ((("status" = 'published'::"public"."blog_post_status") AND ("published_at" IS NOT NULL) AND ("published_at" <= "now"())));



ALTER TABLE "public"."blog_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "blog_tags_all_admin" ON "public"."blog_tags" USING ("public"."blog_is_admin"()) WITH CHECK ("public"."blog_is_admin"());



CREATE POLICY "blog_tags_select_public" ON "public"."blog_tags" FOR SELECT USING (true);



ALTER TABLE "public"."booking_changes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_cleaner_earnings_snapshot" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_cleaner_earnings_snapshot_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_cleaners" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "booking_cleaners_cleaner_select_roster" ON "public"."booking_cleaners" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cleaners" "c"
  WHERE (("c"."id" = "booking_cleaners"."cleaner_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"()))))));



CREATE POLICY "booking_cleaners_user_select_own" ON "public"."booking_cleaners" FOR SELECT TO "authenticated" USING ("public"."user_owns_booking"("booking_id"));



COMMENT ON POLICY "booking_cleaners_user_select_own" ON "public"."booking_cleaners" IS 'Customer sees roster rows for their booking; uses user_owns_booking() to avoid RLS re-entry into bookings.';



ALTER TABLE "public"."booking_demand_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_lifecycle_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_line_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "booking_line_items_cleaner_select_assigned" ON "public"."booking_line_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "booking_line_items"."booking_id") AND ((("b"."cleaner_id" IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM "public"."cleaners" "c"
          WHERE (("c"."id" = "b"."cleaner_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"())))))) OR (("b"."payout_owner_cleaner_id" IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM "public"."cleaners" "c"
          WHERE (("c"."id" = "b"."payout_owner_cleaner_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"())))))) OR (EXISTS ( SELECT 1
           FROM ("public"."booking_cleaners" "bc"
             JOIN "public"."cleaners" "c" ON (("c"."id" = "bc"."cleaner_id")))
          WHERE (("bc"."booking_id" = "b"."id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"()))))))))));



CREATE POLICY "booking_line_items_user_select_own" ON "public"."booking_line_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "booking_line_items"."booking_id") AND ("b"."customer_id" = "auth"."uid"())))));



ALTER TABLE "public"."booking_payment_recovery_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_roster_member_payouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_service_checklists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_service_photos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_team_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_totals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "booking_totals_cleaner_select_assigned" ON "public"."booking_totals" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."bookings" "b"
     JOIN "public"."cleaners" "c" ON (("c"."id" = "b"."cleaner_id")))
  WHERE (("b"."id" = "booking_totals"."booking_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"()))))));



CREATE POLICY "booking_totals_user_select_own" ON "public"."booking_totals" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "booking_totals"."booking_id") AND ("b"."customer_id" = "auth"."uid"())))));



ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bookings_cleaner_select_assigned" ON "public"."bookings" FOR SELECT TO "authenticated" USING (((("cleaner_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."cleaners" "c"
  WHERE (("c"."id" = "bookings"."cleaner_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"())))))) OR (("payout_owner_cleaner_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."cleaners" "c"
  WHERE (("c"."id" = "bookings"."payout_owner_cleaner_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"())))))) OR (EXISTS ( SELECT 1
   FROM ("public"."booking_cleaners" "bc"
     JOIN "public"."cleaners" "c" ON (("c"."id" = "bc"."cleaner_id")))
  WHERE (("bc"."booking_id" = "bookings"."id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"())))))));



CREATE POLICY "bookings_user_select_own" ON "public"."bookings" FOR SELECT TO "authenticated" USING (("customer_id" = "auth"."uid"()));



ALTER TABLE "public"."business_health_scores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "business_health_scores_deny" ON "public"."business_health_scores" TO "authenticated" USING (false);



ALTER TABLE "public"."campaign_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_assets_public_read" ON "public"."campaign_assets" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."promotions" "p"
  WHERE (("p"."id" = "campaign_assets"."promotion_id") AND ("p"."status" = 'active'::"text")))));



ALTER TABLE "public"."campaign_content" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_content_public_read" ON "public"."campaign_content" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."promotions" "p"
  WHERE (("p"."id" = "campaign_content"."promotion_id") AND ("p"."status" = 'active'::"text")))));



ALTER TABLE "public"."campaign_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_templates_public_read" ON "public"."campaign_templates" FOR SELECT USING (("enabled" = true));



ALTER TABLE "public"."cities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."city_configs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cleaner_applications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cleaner_availability" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cleaner_availability_all_own" ON "public"."cleaner_availability" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cleaners" "c"
  WHERE (("c"."id" = "cleaner_availability"."cleaner_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."cleaners" "c"
  WHERE (("c"."id" = "cleaner_availability"."cleaner_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"()))))));



CREATE POLICY "cleaner_availability_select_own" ON "public"."cleaner_availability" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cleaners" "c"
  WHERE (("c"."id" = "cleaner_availability"."cleaner_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"()))))));



ALTER TABLE "public"."cleaner_booking_track_points" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cleaner_booking_track_points_select_assigned_cleaner" ON "public"."cleaner_booking_track_points" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cleaners" "c"
  WHERE (("c"."id" = "cleaner_booking_track_points"."cleaner_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"()))))));



CREATE POLICY "cleaner_booking_track_points_select_booking_owner" ON "public"."cleaner_booking_track_points" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "cleaner_booking_track_points"."booking_id") AND ("b"."customer_id" = "auth"."uid"())))));



ALTER TABLE "public"."cleaner_change_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cleaner_change_requests_insert_own" ON "public"."cleaner_change_requests" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."cleaners" "c"
  WHERE (("c"."id" = "cleaner_change_requests"."cleaner_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"()))))));



CREATE POLICY "cleaner_change_requests_select_own" ON "public"."cleaner_change_requests" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cleaners" "c"
  WHERE (("c"."id" = "cleaner_change_requests"."cleaner_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"()))))));



ALTER TABLE "public"."cleaner_earnings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cleaner_earnings_adjustments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cleaner_earnings_adjustments_select_own" ON "public"."cleaner_earnings_adjustments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cleaners" "c"
  WHERE (("c"."id" = "cleaner_earnings_adjustments"."cleaner_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"()))))));



ALTER TABLE "public"."cleaner_earnings_disbursements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cleaner_earnings_disbursements_select_own" ON "public"."cleaner_earnings_disbursements" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cleaners" "c"
  WHERE (("c"."id" = "cleaner_earnings_disbursements"."cleaner_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"()))))));



ALTER TABLE "public"."cleaner_earnings_disputes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cleaner_earnings_disputes_select_own" ON "public"."cleaner_earnings_disputes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cleaners" "c"
  WHERE (("c"."id" = "cleaner_earnings_disputes"."cleaner_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"()))))));



CREATE POLICY "cleaner_earnings_select_assigned" ON "public"."cleaner_earnings" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."bookings" "b"
     JOIN "public"."cleaners" "c" ON (("c"."id" = "b"."cleaner_id")))
  WHERE (("b"."id" = "cleaner_earnings"."booking_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"()))))));



ALTER TABLE "public"."cleaner_job_issue_report_idempotency" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cleaner_job_issue_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cleaner_job_lifecycle_idempotency" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cleaner_locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cleaner_locations_select_own" ON "public"."cleaner_locations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cleaners" "c"
  WHERE (("c"."id" = "cleaner_locations"."cleaner_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"()))))));



ALTER TABLE "public"."cleaner_payment_details" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cleaner_payment_details_insert_own" ON "public"."cleaner_payment_details" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."cleaners" "c"
  WHERE (("c"."id" = "cleaner_payment_details"."cleaner_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"()))))));



CREATE POLICY "cleaner_payment_details_select_own" ON "public"."cleaner_payment_details" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cleaners" "c"
  WHERE (("c"."id" = "cleaner_payment_details"."cleaner_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"()))))));



CREATE POLICY "cleaner_payment_details_update_own" ON "public"."cleaner_payment_details" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cleaners" "c"
  WHERE (("c"."id" = "cleaner_payment_details"."cleaner_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."cleaners" "c"
  WHERE (("c"."id" = "cleaner_payment_details"."cleaner_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"()))))));



ALTER TABLE "public"."cleaner_payout_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cleaner_payouts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cleaner_payouts_select_own" ON "public"."cleaner_payouts" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cleaners" "c"
  WHERE (("c"."id" = "cleaner_payouts"."cleaner_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"()))))));



ALTER TABLE "public"."cleaner_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cleaner_preferences_no_anon" ON "public"."cleaner_preferences" USING (false) WITH CHECK (false);



ALTER TABLE "public"."cleaner_report_feedback" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cleaner_report_feedback_select_own" ON "public"."cleaner_report_feedback" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cleaners" "c"
  WHERE (("c"."id" = "cleaner_report_feedback"."cleaner_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"()))))));



ALTER TABLE "public"."cleaners" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cleaners_select_for_customer_booking" ON "public"."cleaners" FOR SELECT TO "authenticated" USING ("public"."user_has_booking_with_cleaner"("id"));



CREATE POLICY "cleaners_select_own" ON "public"."cleaners" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "auth_user_id") OR ("auth"."uid"() = "id")));



CREATE POLICY "cleaners_update_own" ON "public"."cleaners" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "auth_user_id") OR ("auth"."uid"() = "id"))) WITH CHECK ((("auth"."uid"() = "auth_user_id") OR ("auth"."uid"() = "id")));



ALTER TABLE "public"."cleaning_credit_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversion_deferred_payment_link_emails" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversion_experiment_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversion_experiments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cron_http_targets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cron_run_leases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cron_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_contact_health" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_memberships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_memberships_own_read" ON "public"."customer_memberships" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."customer_saved_addresses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_saved_addresses_delete_own" ON "public"."customer_saved_addresses" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "customer_saved_addresses_insert_own" ON "public"."customer_saved_addresses" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "customer_saved_addresses_select_own" ON "public"."customer_saved_addresses" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "customer_saved_addresses_update_own" ON "public"."customer_saved_addresses" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."customer_segment" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_booking_funnel_metrics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_booking_funnel_metrics_admin_select" ON "public"."daily_booking_funnel_metrics" FOR SELECT TO "authenticated" USING ("public"."blog_is_admin"());



ALTER TABLE "public"."daily_conversion_metrics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_conversion_metrics_admin_select" ON "public"."daily_conversion_metrics" FOR SELECT TO "authenticated" USING ("public"."blog_is_admin"());



ALTER TABLE "public"."daily_payment_metrics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_payment_metrics_admin_select" ON "public"."daily_payment_metrics" FOR SELECT TO "authenticated" USING ("public"."blog_is_admin"());



ALTER TABLE "public"."daily_service_metrics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_service_metrics_admin_select" ON "public"."daily_service_metrics" FOR SELECT TO "authenticated" USING ("public"."blog_is_admin"());



ALTER TABLE "public"."dispatch_experiment_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dispatch_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dispatch_metrics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dispatch_metrics_service_only" ON "public"."dispatch_metrics" TO "authenticated" USING (false) WITH CHECK (false);



ALTER TABLE "public"."dispatch_offer_exposure_dedupe" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dispatch_offer_timeout_metric_emitted" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dispatch_offers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dispatch_offers_cleaner_select" ON "public"."dispatch_offers" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cleaners" "c"
  WHERE (("c"."id" = "dispatch_offers"."cleaner_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"()))))));



CREATE POLICY "dispatch_offers_cleaner_update_own" ON "public"."dispatch_offers" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."cleaners" "c"
  WHERE (("c"."id" = "dispatch_offers"."cleaner_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"()))))) AND ("status" = 'pending'::"text"))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."cleaners" "c"
  WHERE (("c"."id" = "dispatch_offers"."cleaner_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"()))))));



ALTER TABLE "public"."dispatch_retry_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."earnings_disbursement_transfers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_campaign_sends" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expense_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expense_accounts_admin" ON "public"."expense_accounts" TO "authenticated" USING (false);



ALTER TABLE "public"."expense_approval_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expense_approval_events_deny" ON "public"."expense_approval_events" TO "authenticated" USING (false);



ALTER TABLE "public"."expense_approval_limits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expense_approval_limits_deny" ON "public"."expense_approval_limits" TO "authenticated" USING (false);



ALTER TABLE "public"."expense_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expense_categories_admin" ON "public"."expense_categories" TO "authenticated" USING (false);



ALTER TABLE "public"."expense_vendors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expense_vendors_admin" ON "public"."expense_vendors" TO "authenticated" USING (false);



ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expenses_admin" ON "public"."expenses" TO "authenticated" USING (false);



ALTER TABLE "public"."failed_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."faqs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "faqs_select_public" ON "public"."faqs" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."finance_budget_lines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "finance_budget_lines_deny" ON "public"."finance_budget_lines" TO "authenticated" USING (false);



ALTER TABLE "public"."finance_budgets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "finance_budgets_deny" ON "public"."finance_budgets" TO "authenticated" USING (false);



ALTER TABLE "public"."finance_chart_of_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "finance_chart_of_accounts_deny" ON "public"."finance_chart_of_accounts" TO "authenticated" USING (false);



ALTER TABLE "public"."finance_notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "finance_notifications_deny" ON "public"."finance_notifications" TO "authenticated" USING (false);



ALTER TABLE "public"."growth_action_outcomes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."growth_customer_touch" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoice_adjustments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoice_adjustments_select_own" ON "public"."invoice_adjustments" FOR SELECT TO "authenticated" USING (("customer_id" = "auth"."uid"()));



ALTER TABLE "public"."lifecycle_email_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lifecycle_email_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."location_gsc_metrics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "location_gsc_metrics_service_role" ON "public"."location_gsc_metrics" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."location_gsc_queries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "location_gsc_queries_service_role" ON "public"."location_gsc_queries" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."location_gsc_sync_meta" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "location_gsc_sync_meta_service_role" ON "public"."location_gsc_sync_meta" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "locations_select_public" ON "public"."locations" FOR SELECT USING (true);



ALTER TABLE "public"."marketing_automation_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."marketing_spend" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."membership_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "membership_plans_public_read" ON "public"."membership_plans" FOR SELECT USING (("enabled" = true));



ALTER TABLE "public"."monthly_invoice_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."monthly_invoice_paystack_charge_dedup" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."monthly_invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "monthly_invoices_select_own" ON "public"."monthly_invoices" FOR SELECT TO "authenticated" USING (("customer_id" = "auth"."uid"()));



ALTER TABLE "public"."newsletter_subscribers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_alerts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_idempotency_claims" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_runtime_flags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_link_delivery_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_transactions_deny" ON "public"."payment_transactions" TO "authenticated" USING (false);



ALTER TABLE "public"."payout_audit_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payout_transfer_outbox" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payout_transfers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pricing_booking_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pricing_catalog_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pricing_changes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pricing_extra_bundles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pricing_extra_bundles_select_active" ON "public"."pricing_extra_bundles" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



ALTER TABLE "public"."pricing_extras" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pricing_extras_select_active" ON "public"."pricing_extras" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



ALTER TABLE "public"."pricing_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pricing_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pricing_services" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pricing_services_select_active" ON "public"."pricing_services" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



ALTER TABLE "public"."pricing_slot_adjustments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pricing_tiers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pricing_tiers_select_public" ON "public"."pricing_tiers" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."pricing_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promotion_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promotion_bundles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "promotion_bundles_public_read" ON "public"."promotion_bundles" FOR SELECT USING ((("enabled" = true) AND (EXISTS ( SELECT 1
   FROM "public"."promotions" "p"
  WHERE (("p"."id" = "promotion_bundles"."promotion_id") AND ("p"."status" = 'active'::"text"))))));



ALTER TABLE "public"."promotion_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promotion_redemptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promotions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "promotions_public_read_active" ON "public"."promotions" FOR SELECT USING (("status" = 'active'::"text"));



ALTER TABLE "public"."recurring_bookings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recurring_bookings_customer_select_own" ON "public"."recurring_bookings" FOR SELECT TO "authenticated" USING (("customer_id" = "auth"."uid"()));



COMMENT ON POLICY "recurring_bookings_customer_select_own" ON "public"."recurring_bookings" IS 'Customers read their own recurring rows for dashboard + Supabase Realtime (RLS filters events).';



ALTER TABLE "public"."recurring_expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recurring_expenses_deny" ON "public"."recurring_expenses" TO "authenticated" USING (false);



ALTER TABLE "public"."referral_discount_redemptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "referral_discount_redemptions_select_own" ON "public"."referral_discount_redemptions" FOR SELECT TO "authenticated" USING (("redeemed_by_user_id" = "auth"."uid"()));



ALTER TABLE "public"."referral_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "referral_events_select_cleaner_referrer" ON "public"."referral_events" FOR SELECT TO "authenticated" USING ((("referrer_type" = 'cleaner'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."cleaners" "c"
  WHERE (("c"."id" = "referral_events"."referrer_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"())))))));



CREATE POLICY "referral_events_select_customer_referrer" ON "public"."referral_events" FOR SELECT TO "authenticated" USING ((("referrer_type" = 'customer'::"text") AND ("referrer_id" = "auth"."uid"())));



ALTER TABLE "public"."referral_program_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."referral_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."referrals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "referrals_select_cleaner_own" ON "public"."referrals" FOR SELECT TO "authenticated" USING ((("referrer_type" = 'cleaner'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."cleaners" "c"
  WHERE (("c"."id" = "referrals"."referrer_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"())))))));



CREATE POLICY "referrals_select_customer_own" ON "public"."referrals" FOR SELECT TO "authenticated" USING ((("referrer_type" = 'customer'::"text") AND ("referrer_id" = "auth"."uid"())));



ALTER TABLE "public"."review_sms_prompt_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reviews_insert_booking_owner" ON "public"."reviews" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "reviews"."booking_id") AND ("b"."customer_id" = "auth"."uid"()) AND ("b"."status" = 'completed'::"text"))))));



CREATE POLICY "reviews_select_owner_or_cleaner" ON "public"."reviews" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."cleaners" "c"
  WHERE (("c"."id" = "reviews"."cleaner_id") AND (("c"."auth_user_id" = "auth"."uid"()) OR ("c"."id" = "auth"."uid"())))))));



ALTER TABLE "public"."sales_document_paystack_charge_dedup" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sales_documents_admin_all" ON "public"."sales_documents" TO "authenticated" USING ("public"."blog_is_admin"()) WITH CHECK ("public"."blog_is_admin"());



CREATE POLICY "sales_documents_select_own" ON "public"."sales_documents" FOR SELECT TO "authenticated" USING ((("customer_id" = "auth"."uid"()) OR ("lower"("customer_email") = "lower"((COALESCE(( SELECT "users"."email"
   FROM "auth"."users"
  WHERE ("users"."id" = "auth"."uid"())), ''::character varying))::"text"))));



ALTER TABLE "public"."seo_auto_hub_ui_patch" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "seo_auto_hub_ui_patch_service_role" ON "public"."seo_auto_hub_ui_patch" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."seo_auto_title_variant" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "seo_auto_title_variant_service_role" ON "public"."seo_auto_title_variant" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."seo_insights_recommendations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "seo_insights_recommendations_service_role" ON "public"."seo_insights_recommendations" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."service_earning_caps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "services_select_public" ON "public"."services" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."social_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "social_accounts_service_role" ON "public"."social_accounts" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."social_publish_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "social_publish_history_service_role" ON "public"."social_publish_history" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_daily_capacity_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_job_member_payouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."travel_route_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_behavior" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_notifications_select_own" ON "public"."user_notifications" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_notifications_update_own" ON "public"."user_notifications" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_profiles_insert_own" ON "public"."user_profiles" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "user_profiles_select_own" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "user_profiles_update_own" ON "public"."user_profiles" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



ALTER TABLE "public"."user_push_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_push_tokens_delete_own" ON "public"."user_push_tokens" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_push_tokens_insert_own" ON "public"."user_push_tokens" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "user_push_tokens_select_own" ON "public"."user_push_tokens" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_push_tokens_update_own" ON "public"."user_push_tokens" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."whatsapp_cleaner_unmatched_intent_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_delivery_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_inbound_feedback_dedupe" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."zoho_integration_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zoho_integration_settings_deny" ON "public"."zoho_integration_settings" TO "authenticated" USING (false);






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."bookings";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cleaner_booking_track_points";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."dispatch_offers";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."recurring_bookings";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."team_members";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































REVOKE ALL ON FUNCTION "public"."accept_dispatch_offer_atomic"("p_offer_id" "uuid", "p_cleaner_id" "uuid", "p_response_latency_ms" integer, "p_assign_meta" "jsonb", "p_truth_patch" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_dispatch_offer_atomic"("p_offer_id" "uuid", "p_cleaner_id" "uuid", "p_response_latency_ms" integer, "p_assign_meta" "jsonb", "p_truth_patch" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_dispatch_offer_atomic"("p_offer_id" "uuid", "p_cleaner_id" "uuid", "p_response_latency_ms" integer, "p_assign_meta" "jsonb", "p_truth_patch" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_dispatch_offer_atomic"("p_offer_id" "uuid", "p_cleaner_id" "uuid", "p_response_latency_ms" integer, "p_assign_meta" "jsonb", "p_truth_patch" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."add_team_members_guarded"("p_team_id" "uuid", "p_cleaner_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."add_team_members_guarded"("p_team_id" "uuid", "p_cleaner_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_team_members_guarded"("p_team_id" "uuid", "p_cleaner_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_billing_switch_finalize"("p_customer_id" "uuid", "p_billing_type" "text", "p_target_schedule_type" "text", "p_schedule_enforced" boolean, "p_confirm" boolean, "p_confirm_strict" boolean, "p_strict_flip_enabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_billing_switch_finalize"("p_customer_id" "uuid", "p_billing_type" "text", "p_target_schedule_type" "text", "p_schedule_enforced" boolean, "p_confirm" boolean, "p_confirm_strict" boolean, "p_strict_flip_enabled" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_billing_switch_finalize"("p_customer_id" "uuid", "p_billing_type" "text", "p_target_schedule_type" "text", "p_schedule_enforced" boolean, "p_confirm" boolean, "p_confirm_strict" boolean, "p_strict_flip_enabled" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_billing_switch_finalize"("p_customer_id" "uuid", "p_billing_type" "text", "p_target_schedule_type" "text", "p_schedule_enforced" boolean, "p_confirm" boolean, "p_confirm_strict" boolean, "p_strict_flip_enabled" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_mark_payout_paid"("p_cleaner_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_mark_payout_paid"("p_cleaner_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_mark_payout_paid"("p_cleaner_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_mark_payout_paid"("p_cleaner_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_whatsapp_reliability_metrics"("p_since" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_whatsapp_reliability_metrics"("p_since" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_whatsapp_reliability_metrics"("p_since" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_whatsapp_reliability_metrics"("p_since" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_whatsapp_reliability_metrics"("p_since" timestamp with time zone, "p_until" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_whatsapp_reliability_metrics"("p_since" timestamp with time zone, "p_until" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_whatsapp_reliability_metrics"("p_since" timestamp with time zone, "p_until" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_whatsapp_reliability_metrics"("p_since" timestamp with time zone, "p_until" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."append_booking_conversion_analytics"("p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."append_booking_conversion_analytics"("p_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."append_booking_conversion_analytics"("p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."append_booking_conversion_analytics"("p_payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_cleaning_credit_transaction"("p_user_id" "uuid", "p_amount_zar" numeric, "p_type" "text", "p_referral_id" "uuid", "p_booking_id" "uuid", "p_note" "text", "p_created_by" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_cleaning_credit_transaction"("p_user_id" "uuid", "p_amount_zar" numeric, "p_type" "text", "p_referral_id" "uuid", "p_booking_id" "uuid", "p_note" "text", "p_created_by" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_cleaning_credit_transaction"("p_user_id" "uuid", "p_amount_zar" numeric, "p_type" "text", "p_referral_id" "uuid", "p_booking_id" "uuid", "p_note" "text", "p_created_by" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_cleaning_credit_transaction"("p_user_id" "uuid", "p_amount_zar" numeric, "p_type" "text", "p_referral_id" "uuid", "p_booking_id" "uuid", "p_note" "text", "p_created_by" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."approve_cleaner_change_request"("p_request_id" "uuid", "p_reviewer" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_cleaner_change_request"("p_request_id" "uuid", "p_reviewer" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_cleaner_change_request"("p_request_id" "uuid", "p_reviewer" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_cleaner_change_request"("p_request_id" "uuid", "p_reviewer" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_booking_reference"() TO "anon";
GRANT ALL ON FUNCTION "public"."assign_booking_reference"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_booking_reference"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."assign_team_and_sync_roster"("p_booking_id" "uuid", "p_team_id" "uuid", "p_payout_owner_cleaner_id" "uuid", "p_team_member_count_snapshot" integer, "p_variant" "text", "p_source" "text", "p_assigned_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_team_and_sync_roster"("p_booking_id" "uuid", "p_team_id" "uuid", "p_payout_owner_cleaner_id" "uuid", "p_team_member_count_snapshot" integer, "p_variant" "text", "p_source" "text", "p_assigned_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."assign_team_and_sync_roster"("p_booking_id" "uuid", "p_team_id" "uuid", "p_payout_owner_cleaner_id" "uuid", "p_team_member_count_snapshot" integer, "p_variant" "text", "p_source" "text", "p_assigned_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_team_and_sync_roster"("p_booking_id" "uuid", "p_team_id" "uuid", "p_payout_owner_cleaner_id" "uuid", "p_team_member_count_snapshot" integer, "p_variant" "text", "p_source" "text", "p_assigned_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."blog_is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."blog_is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."blog_is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."blog_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."blog_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."blog_touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."booking_line_amount_cents"("p_total_paid_zar" integer, "p_amount_paid_cents" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."booking_line_amount_cents"("p_total_paid_zar" integer, "p_amount_paid_cents" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."booking_line_amount_cents"("p_total_paid_zar" integer, "p_amount_paid_cents" integer) TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



REVOKE ALL ON FUNCTION "public"."booking_matches_active_admin_slot"("b" "public"."bookings", "p_user_id" "uuid", "p_date" "text", "p_time" "text", "p_service_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."booking_matches_active_admin_slot"("b" "public"."bookings", "p_user_id" "uuid", "p_date" "text", "p_time" "text", "p_service_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."booking_matches_active_admin_slot"("b" "public"."bookings", "p_user_id" "uuid", "p_date" "text", "p_time" "text", "p_service_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."booking_matches_active_admin_slot"("b" "public"."bookings", "p_user_id" "uuid", "p_date" "text", "p_time" "text", "p_service_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."bookings_after_write_monthly_invoice"() TO "anon";
GRANT ALL ON FUNCTION "public"."bookings_after_write_monthly_invoice"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bookings_after_write_monthly_invoice"() TO "service_role";



GRANT ALL ON FUNCTION "public"."bookings_before_delete_monthly_invoice"() TO "anon";
GRANT ALL ON FUNCTION "public"."bookings_before_delete_monthly_invoice"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bookings_before_delete_monthly_invoice"() TO "service_role";



GRANT ALL ON FUNCTION "public"."bookings_default_price_snapshot_if_missing"() TO "anon";
GRANT ALL ON FUNCTION "public"."bookings_default_price_snapshot_if_missing"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bookings_default_price_snapshot_if_missing"() TO "service_role";



GRANT ALL ON FUNCTION "public"."bookings_lock_under_finalized_monthly_invoice"() TO "anon";
GRANT ALL ON FUNCTION "public"."bookings_lock_under_finalized_monthly_invoice"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bookings_lock_under_finalized_monthly_invoice"() TO "service_role";



GRANT ALL ON FUNCTION "public"."bookings_normalize_billing_type"() TO "anon";
GRANT ALL ON FUNCTION "public"."bookings_normalize_billing_type"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bookings_normalize_billing_type"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."bookings_record_payment_link_delivery"("p_booking_id" "uuid", "p_payment_link_delivery" "jsonb", "p_touch_last_sent_at" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bookings_record_payment_link_delivery"("p_booking_id" "uuid", "p_payment_link_delivery" "jsonb", "p_touch_last_sent_at" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."bookings_record_payment_link_delivery"("p_booking_id" "uuid", "p_payment_link_delivery" "jsonb", "p_touch_last_sent_at" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."bookings_record_payment_link_delivery"("p_booking_id" "uuid", "p_payment_link_delivery" "jsonb", "p_touch_last_sent_at" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."bookings_set_normalized_phone"() TO "anon";
GRANT ALL ON FUNCTION "public"."bookings_set_normalized_phone"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bookings_set_normalized_phone"() TO "service_role";



GRANT ALL ON FUNCTION "public"."bookings_touch_became_pending_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."bookings_touch_became_pending_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bookings_touch_became_pending_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."bookings_trg_ensure_payout_owner_in_team"() TO "anon";
GRANT ALL ON FUNCTION "public"."bookings_trg_ensure_payout_owner_in_team"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bookings_trg_ensure_payout_owner_in_team"() TO "service_role";



GRANT ALL ON FUNCTION "public"."bookings_trg_payout_frozen_immutable_after_eligible"() TO "anon";
GRANT ALL ON FUNCTION "public"."bookings_trg_payout_frozen_immutable_after_eligible"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bookings_trg_payout_frozen_immutable_after_eligible"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_booking_dispatch_recovery_lease"("p_booking_id" "uuid", "p_lease_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_booking_dispatch_recovery_lease"("p_booking_id" "uuid", "p_lease_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."claim_booking_dispatch_recovery_lease"("p_booking_id" "uuid", "p_lease_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_booking_dispatch_recovery_lease"("p_booking_id" "uuid", "p_lease_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_booking_earnings_recompute"("p_booking_id" "uuid", "p_cooldown_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_booking_earnings_recompute"("p_booking_id" "uuid", "p_cooldown_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."claim_booking_earnings_recompute"("p_booking_id" "uuid", "p_cooldown_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_booking_earnings_recompute"("p_booking_id" "uuid", "p_cooldown_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_cleaner_earnings_for_paystack"("p_cleaner_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_cleaner_earnings_for_paystack"("p_cleaner_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_cleaner_earnings_for_paystack"("p_cleaner_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_cleaner_earnings_for_paystack"("p_cleaner_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_team_capacity_slot"("p_team_id" "uuid", "p_booking_date" "date", "p_capacity_per_day" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."claim_team_capacity_slot"("p_team_id" "uuid", "p_booking_date" "date", "p_capacity_per_day" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_team_capacity_slot"("p_team_id" "uuid", "p_booking_date" "date", "p_capacity_per_day" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."cleaner_payouts_block_mutate_when_frozen"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleaner_payouts_block_mutate_when_frozen"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleaner_payouts_block_mutate_when_frozen"() TO "service_role";



GRANT ALL ON FUNCTION "public"."dispatch_cleaner_offer_accepted"("p_cleaner_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."dispatch_cleaner_offer_accepted"("p_cleaner_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dispatch_cleaner_offer_accepted"("p_cleaner_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."dispatch_cleaner_offer_sent"("p_cleaner_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."dispatch_cleaner_offer_sent"("p_cleaner_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dispatch_cleaner_offer_sent"("p_cleaner_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."dispatch_expire_peer_offers"("p_booking_id" "uuid", "p_winner_offer_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."dispatch_expire_peer_offers"("p_booking_id" "uuid", "p_winner_offer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dispatch_expire_peer_offers"("p_booking_id" "uuid", "p_winner_offer_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."dispatch_record_offer_response"("p_cleaner_id" "uuid", "p_latency_ms" double precision, "p_accepted" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."dispatch_record_offer_response"("p_cleaner_id" "uuid", "p_latency_ms" double precision, "p_accepted" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dispatch_record_offer_response"("p_cleaner_id" "uuid", "p_latency_ms" double precision, "p_accepted" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."draft_monthly_invoice_due_date"("p_invoice_id" "uuid", "p_month" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."draft_monthly_invoice_due_date"("p_invoice_id" "uuid", "p_month" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."draft_monthly_invoice_due_date"("p_invoice_id" "uuid", "p_month" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."enqueue_stranded_pending_bookings"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enqueue_stranded_pending_bookings"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."enqueue_stranded_pending_bookings"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."enqueue_stranded_pending_bookings"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."expire_old_offers"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expire_old_offers"() TO "anon";
GRANT ALL ON FUNCTION "public"."expire_old_offers"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_old_offers"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."expire_pending_dispatch_offers"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expire_pending_dispatch_offers"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."expire_pending_dispatch_offers"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_pending_dispatch_offers"("p_limit" integer) TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_queue" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_queue" TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_pending_whatsapp_jobs"("limit_count" integer, "max_delivery_attempts" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_pending_whatsapp_jobs"("limit_count" integer, "max_delivery_attempts" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_pending_whatsapp_jobs"("limit_count" integer, "max_delivery_attempts" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pending_whatsapp_jobs"("limit_count" integer, "max_delivery_attempts" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_whatsapp_queue_status_metrics"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_whatsapp_queue_status_metrics"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_whatsapp_queue_status_metrics"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_whatsapp_queue_status_metrics"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_monthly_invoice_reminder_count"("p_invoice_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_monthly_invoice_reminder_count"("p_invoice_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_monthly_invoice_reminder_count"("p_invoice_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_promotion_redemption_counters"("p_promotion_id" "uuid", "p_discount_zar" numeric, "p_revenue_zar" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_promotion_redemption_counters"("p_promotion_id" "uuid", "p_discount_zar" numeric, "p_revenue_zar" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_promotion_redemption_counters"("p_promotion_id" "uuid", "p_discount_zar" numeric, "p_revenue_zar" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_promotion_redemption_counters"("p_promotion_id" "uuid", "p_discount_zar" numeric, "p_revenue_zar" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_user_profile_stats"("p_user_id" "uuid", "p_amount" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_user_profile_stats"("p_user_id" "uuid", "p_amount" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_user_profile_stats"("p_user_id" "uuid", "p_amount" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."initialize_customer_draft_booking"("p_scheduled_start" timestamp with time zone, "p_scheduled_end" timestamp with time zone, "p_service_timezone" "text", "p_address_line1" "text", "p_locality" "text", "p_region" "text", "p_postal_code" "text", "p_country_code" "text", "p_service_notes" "text", "p_currency" "text", "p_subtotal_cents" bigint, "p_fees_cents" bigint, "p_tax_cents" bigint, "p_total_cents" bigint, "p_metadata" "jsonb", "p_service_slug" "text", "p_estimate_status" "text", "p_estimated_at" timestamp with time zone, "p_quote_id" "uuid", "p_pricing_engine_version" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."initialize_customer_draft_booking"("p_scheduled_start" timestamp with time zone, "p_scheduled_end" timestamp with time zone, "p_service_timezone" "text", "p_address_line1" "text", "p_locality" "text", "p_region" "text", "p_postal_code" "text", "p_country_code" "text", "p_service_notes" "text", "p_currency" "text", "p_subtotal_cents" bigint, "p_fees_cents" bigint, "p_tax_cents" bigint, "p_total_cents" bigint, "p_metadata" "jsonb", "p_service_slug" "text", "p_estimate_status" "text", "p_estimated_at" timestamp with time zone, "p_quote_id" "uuid", "p_pricing_engine_version" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."initialize_customer_draft_booking"("p_scheduled_start" timestamp with time zone, "p_scheduled_end" timestamp with time zone, "p_service_timezone" "text", "p_address_line1" "text", "p_locality" "text", "p_region" "text", "p_postal_code" "text", "p_country_code" "text", "p_service_notes" "text", "p_currency" "text", "p_subtotal_cents" bigint, "p_fees_cents" bigint, "p_tax_cents" bigint, "p_total_cents" bigint, "p_metadata" "jsonb", "p_service_slug" "text", "p_estimate_status" "text", "p_estimated_at" timestamp with time zone, "p_quote_id" "uuid", "p_pricing_engine_version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."initialize_customer_draft_booking"("p_scheduled_start" timestamp with time zone, "p_scheduled_end" timestamp with time zone, "p_service_timezone" "text", "p_address_line1" "text", "p_locality" "text", "p_region" "text", "p_postal_code" "text", "p_country_code" "text", "p_service_notes" "text", "p_currency" "text", "p_subtotal_cents" bigint, "p_fees_cents" bigint, "p_tax_cents" bigint, "p_total_cents" bigint, "p_metadata" "jsonb", "p_service_slug" "text", "p_estimate_status" "text", "p_estimated_at" timestamp with time zone, "p_quote_id" "uuid", "p_pricing_engine_version" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."invoice_adjustments_after_insert_route"() TO "anon";
GRANT ALL ON FUNCTION "public"."invoice_adjustments_after_insert_route"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoice_adjustments_after_insert_route"() TO "service_role";



GRANT ALL ON FUNCTION "public"."invoice_adjustments_block_if_month_closed"() TO "anon";
GRANT ALL ON FUNCTION "public"."invoice_adjustments_block_if_month_closed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoice_adjustments_block_if_month_closed"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."invoke_nextjs_cron"("cron_path" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."invoke_nextjs_cron"("cron_path" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."invoke_nextjs_cron"("cron_path" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoke_nextjs_cron"("cron_path" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."jsonb_array_tail"("p_arr" "jsonb", "p_max" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."jsonb_array_tail"("p_arr" "jsonb", "p_max" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."jsonb_array_tail"("p_arr" "jsonb", "p_max" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."link_booking_to_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."link_booking_to_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_booking_to_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_bookings_due_user_selected_recovery"("p_max_attempts" integer, "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_bookings_due_user_selected_recovery"("p_max_attempts" integer, "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."list_bookings_due_user_selected_recovery"("p_max_attempts" integer, "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_bookings_due_user_selected_recovery"("p_max_attempts" integer, "p_limit" integer, "p_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_bookings_paid_for_cleaner_payout"("p_payout_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_bookings_paid_for_cleaner_payout"("p_payout_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_bookings_paid_for_cleaner_payout"("p_payout_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_bookings_paid_for_cleaner_payout"("p_payout_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_bookings_paid_for_earnings_disbursement"("p_disbursement_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_bookings_paid_for_earnings_disbursement"("p_disbursement_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_bookings_paid_for_earnings_disbursement"("p_disbursement_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_bookings_paid_for_earnings_disbursement"("p_disbursement_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_monthly_invoice_overdue_flags"("p_today" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_monthly_invoice_overdue_flags"("p_today" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_monthly_invoice_overdue_flags"("p_today" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."monthly_invoice_append_snapshot_event"("p_invoice_id" "uuid", "p_event" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."monthly_invoice_append_snapshot_event"("p_invoice_id" "uuid", "p_event" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."monthly_invoice_append_snapshot_event"("p_invoice_id" "uuid", "p_event" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."monthly_invoice_bucket_month"("p_created_at" timestamp with time zone, "p_service_date" "text", "p_cutoff_hour" smallint) TO "anon";
GRANT ALL ON FUNCTION "public"."monthly_invoice_bucket_month"("p_created_at" timestamp with time zone, "p_service_date" "text", "p_cutoff_hour" smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."monthly_invoice_bucket_month"("p_created_at" timestamp with time zone, "p_service_date" "text", "p_cutoff_hour" smallint) TO "service_role";



GRANT ALL ON FUNCTION "public"."monthly_invoice_due_date"("p_month" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."monthly_invoice_due_date"("p_month" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."monthly_invoice_due_date"("p_month" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."monthly_invoice_hard_close"("p_invoice_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."monthly_invoice_hard_close"("p_invoice_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."monthly_invoice_hard_close"("p_invoice_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."monthly_invoice_last_event_times"("p_invoice_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."monthly_invoice_last_event_times"("p_invoice_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."monthly_invoice_last_event_times"("p_invoice_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."monthly_invoice_last_event_times"("p_invoice_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."monthly_invoices_after_status_paid_append_closed"() TO "anon";
GRANT ALL ON FUNCTION "public"."monthly_invoices_after_status_paid_append_closed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."monthly_invoices_after_status_paid_append_closed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."monthly_invoices_append_invoice_closed_event"() TO "anon";
GRANT ALL ON FUNCTION "public"."monthly_invoices_append_invoice_closed_event"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."monthly_invoices_append_invoice_closed_event"() TO "service_role";



GRANT ALL ON FUNCTION "public"."monthly_invoices_before_write_auto_close"() TO "anon";
GRANT ALL ON FUNCTION "public"."monthly_invoices_before_write_auto_close"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."monthly_invoices_before_write_auto_close"() TO "service_role";



GRANT ALL ON FUNCTION "public"."monthly_invoices_stamp_adjustments_applied_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."monthly_invoices_stamp_adjustments_applied_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."monthly_invoices_stamp_adjustments_applied_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."monthly_invoices_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."monthly_invoices_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."monthly_invoices_touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notification_system_logs_daily"("p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."notification_system_logs_daily"("p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."notification_system_logs_daily"("p_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."notification_system_logs_summary"("p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."notification_system_logs_summary"("p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."notification_system_logs_summary"("p_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."payout_period_is_canonical_jhb_month"("p_start" "date", "p_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."payout_period_is_canonical_jhb_month"("p_start" "date", "p_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."payout_period_is_canonical_jhb_month"("p_start" "date", "p_end" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."populate_daily_analytics_rollups"("p_day" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."populate_daily_analytics_rollups"("p_day" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."populate_daily_analytics_rollups"("p_day" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."populate_daily_analytics_rollups"("p_day" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."prune_cleaner_job_lifecycle_idempotency"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_cleaner_job_lifecycle_idempotency"() TO "anon";
GRANT ALL ON FUNCTION "public"."prune_cleaner_job_lifecycle_idempotency"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prune_cleaner_job_lifecycle_idempotency"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prune_dispatch_offer_exposure_dedupe"("p_retention_days" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_dispatch_offer_exposure_dedupe"("p_retention_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."prune_dispatch_offer_exposure_dedupe"("p_retention_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."prune_dispatch_offer_exposure_dedupe"("p_retention_days" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."prune_short_lived_notification_idempotency_claims"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_short_lived_notification_idempotency_claims"() TO "anon";
GRANT ALL ON FUNCTION "public"."prune_short_lived_notification_idempotency_claims"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prune_short_lived_notification_idempotency_claims"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prune_system_logs"("p_retention_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."prune_system_logs"("p_retention_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."prune_system_logs"("p_retention_days" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."public_marketing_reviews_for_area"("p_area" "text", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."public_marketing_reviews_for_area"("p_area" "text", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."public_marketing_reviews_for_area"("p_area" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."public_marketing_reviews_for_area"("p_area" "text", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."public_review_banner_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."public_review_banner_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."public_review_banner_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."public_review_banner_stats"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."purge_stale_pending_payment_bookings"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_stale_pending_payment_bookings"() TO "anon";
GRANT ALL ON FUNCTION "public"."purge_stale_pending_payment_bookings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."purge_stale_pending_payment_bookings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recalculate_user_tier"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_user_tier"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_user_tier"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_monthly_invoice_totals"("p_invoice_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_monthly_invoice_totals"("p_invoice_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_monthly_invoice_totals"("p_invoice_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_monthly_invoice_view"("invoice_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_monthly_invoice_view"("invoice_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."record_monthly_invoice_view"("invoice_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_monthly_invoice_view"("invoice_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_sales_document_view"("doc_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_sales_document_view"("doc_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."record_sales_document_view"("doc_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_sales_document_view"("doc_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recurring_bookings_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."recurring_bookings_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recurring_bookings_touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."referral_discount_redemptions_enforce_limits"() TO "anon";
GRANT ALL ON FUNCTION "public"."referral_discount_redemptions_enforce_limits"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."referral_discount_redemptions_enforce_limits"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_analytics_materialized_views"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_analytics_materialized_views"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_analytics_materialized_views"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_analytics_materialized_views"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_cleaner_rating"("p_cleaner_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_cleaner_rating"("p_cleaner_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_cleaner_rating"("p_cleaner_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_dispatch_experiment_snapshots"("p_week_start" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_dispatch_experiment_snapshots"("p_week_start" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_dispatch_experiment_snapshots"("p_week_start" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_dispatch_experiment_snapshots"("p_week_start" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."release_cron_lock"("p_job_name" "text", "p_holder_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_cron_lock"("p_job_name" "text", "p_holder_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."release_cron_lock"("p_job_name" "text", "p_holder_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."release_team_capacity_slot"("p_team_id" "uuid", "p_booking_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."release_team_capacity_slot"("p_team_id" "uuid", "p_booking_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_team_capacity_slot"("p_team_id" "uuid", "p_booking_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."repair_empty_team_booking_rosters"("p_batch" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."repair_empty_team_booking_rosters"("p_batch" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."repair_empty_team_booking_rosters"("p_batch" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."repair_empty_team_booking_rosters"("p_batch" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."replace_booking_cleaners_admin_atomic"("p_booking_id" "uuid", "p_rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."replace_booking_cleaners_admin_atomic"("p_booking_id" "uuid", "p_rows" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."replace_booking_cleaners_admin_atomic"("p_booking_id" "uuid", "p_rows" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."replace_booking_line_items_atomic"("p_booking_id" "uuid", "p_rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."replace_booking_line_items_atomic"("p_booking_id" "uuid", "p_rows" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."replace_booking_line_items_atomic"("p_booking_id" "uuid", "p_rows" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_admin_monthly_booking_race"("p_our_id" "uuid", "p_user_id" "uuid", "p_date" "text", "p_time" "text", "p_service_slug" "text", "p_force" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_admin_monthly_booking_race"("p_our_id" "uuid", "p_user_id" "uuid", "p_date" "text", "p_time" "text", "p_service_slug" "text", "p_force" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_admin_monthly_booking_race"("p_our_id" "uuid", "p_user_id" "uuid", "p_date" "text", "p_time" "text", "p_service_slug" "text", "p_force" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_admin_monthly_booking_race"("p_our_id" "uuid", "p_user_id" "uuid", "p_date" "text", "p_time" "text", "p_service_slug" "text", "p_force" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_auth_user_id_by_email"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_auth_user_id_by_email"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_auth_user_id_by_email"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_auth_user_id_by_email"("p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."retry_unassigned_jobs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."retry_unassigned_jobs"() TO "anon";
GRANT ALL ON FUNCTION "public"."retry_unassigned_jobs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."retry_unassigned_jobs"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."run_analytics_warehouse_nightly"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."run_analytics_warehouse_nightly"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_analytics_warehouse_nightly"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_analytics_warehouse_nightly"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."run_dispatch_cycle"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."run_dispatch_cycle"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_dispatch_cycle"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_dispatch_cycle"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sales_documents_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."sales_documents_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sales_documents_touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_booking_cleaners_for_team_booking"("p_booking_id" "uuid", "p_source" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_booking_cleaners_for_team_booking"("p_booking_id" "uuid", "p_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_booking_cleaners_for_team_booking"("p_booking_id" "uuid", "p_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_booking_cleaners_for_team_booking"("p_booking_id" "uuid", "p_source" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_promotion_statuses"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_promotion_statuses"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_promotion_statuses"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_bookings_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_bookings_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_bookings_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."touch_payout_integrity_first_seen"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_payout_integrity_first_seen"("p_booking_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."touch_payout_integrity_first_seen"("p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_payout_integrity_first_seen"("p_booking_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_bookings_completed_refresh_tier"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_bookings_completed_refresh_tier"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_bookings_completed_refresh_tier"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_reviews_refresh_cleaner"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_reviews_refresh_cleaner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_reviews_refresh_cleaner"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."try_acquire_cron_lock"("p_job_name" "text", "p_holder_id" "uuid", "p_lease_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."try_acquire_cron_lock"("p_job_name" "text", "p_holder_id" "uuid", "p_lease_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."try_acquire_cron_lock"("p_job_name" "text", "p_holder_id" "uuid", "p_lease_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."user_has_booking_with_cleaner"("p_cleaner_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_has_booking_with_cleaner"("p_cleaner_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_has_booking_with_cleaner"("p_cleaner_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_booking_with_cleaner"("p_cleaner_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."user_owns_booking"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_owns_booking"("p_booking_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_owns_booking"("p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_owns_booking"("p_booking_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_profiles_prevent_customer_billing_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."user_profiles_prevent_customer_billing_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_profiles_prevent_customer_billing_change"() TO "service_role";
























GRANT ALL ON TABLE "public"."accounting_invoice_sync" TO "anon";
GRANT ALL ON TABLE "public"."accounting_invoice_sync" TO "authenticated";
GRANT ALL ON TABLE "public"."accounting_invoice_sync" TO "service_role";



GRANT ALL ON TABLE "public"."accounting_sync_records" TO "anon";
GRANT ALL ON TABLE "public"."accounting_sync_records" TO "authenticated";
GRANT ALL ON TABLE "public"."accounting_sync_records" TO "service_role";



GRANT ALL ON TABLE "public"."admin_api_idempotency" TO "anon";
GRANT ALL ON TABLE "public"."admin_api_idempotency" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_api_idempotency" TO "service_role";



GRANT ALL ON TABLE "public"."admin_billing_idempotency" TO "anon";
GRANT ALL ON TABLE "public"."admin_billing_idempotency" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_billing_idempotency" TO "service_role";



GRANT ALL ON TABLE "public"."admin_booking_create_idempotency" TO "anon";
GRANT ALL ON TABLE "public"."admin_booking_create_idempotency" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_booking_create_idempotency" TO "service_role";



GRANT ALL ON TABLE "public"."cleaning_credit_transactions" TO "anon";
GRANT ALL ON TABLE "public"."cleaning_credit_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."cleaning_credit_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."referral_discount_redemptions" TO "anon";
GRANT ALL ON TABLE "public"."referral_discount_redemptions" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_discount_redemptions" TO "service_role";



GRANT ALL ON TABLE "public"."admin_booking_promo_costs" TO "service_role";



GRANT ALL ON TABLE "public"."admin_earnings_actions" TO "anon";
GRANT ALL ON TABLE "public"."admin_earnings_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_earnings_actions" TO "service_role";



GRANT ALL ON TABLE "public"."referral_events" TO "anon";
GRANT ALL ON TABLE "public"."referral_events" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_events" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."admin_referrer_monthly_profitability_rollups" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."admin_referrer_monthly_profitability_rollups" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_referrer_monthly_profitability_rollups" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."admin_global_monthly_referral_economics" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."admin_global_monthly_referral_economics" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_global_monthly_referral_economics" TO "service_role";



GRANT ALL ON TABLE "public"."admin_money_action_proposals" TO "anon";
GRANT ALL ON TABLE "public"."admin_money_action_proposals" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_money_action_proposals" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."admin_referral_checkout_redemption_summary" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."admin_referral_checkout_redemption_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_referral_checkout_redemption_summary" TO "service_role";



GRANT ALL ON TABLE "public"."admin_referral_reconciliation_queue" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."admin_referrer_conversion_rollups" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."admin_referrer_conversion_rollups" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_referrer_conversion_rollups" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."admin_referrer_event_rollups" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."admin_referrer_event_rollups" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_referrer_event_rollups" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."admin_referrer_redemption_rollups" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."admin_referrer_redemption_rollups" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_referrer_redemption_rollups" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."admin_referrer_reward_rollups" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."admin_referrer_reward_rollups" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_referrer_reward_rollups" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."admin_referrer_profitability_rollups" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."admin_referrer_profitability_rollups" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_referrer_profitability_rollups" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."admin_referrer_quality_signals" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."admin_referrer_quality_signals" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_referrer_quality_signals" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."admin_referrer_redemption_spike_flags" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."admin_referrer_redemption_spike_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_referrer_redemption_spike_flags" TO "service_role";



GRANT ALL ON TABLE "public"."admin_request_dedupe" TO "anon";
GRANT ALL ON TABLE "public"."admin_request_dedupe" TO "service_role";



GRANT ALL ON TABLE "public"."ai_decision_logs" TO "anon";
GRANT ALL ON TABLE "public"."ai_decision_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_decision_logs" TO "service_role";



GRANT ALL ON TABLE "public"."ai_experiment_exposures" TO "anon";
GRANT ALL ON TABLE "public"."ai_experiment_exposures" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_experiment_exposures" TO "service_role";



GRANT ALL ON TABLE "public"."ai_feature_store" TO "anon";
GRANT ALL ON TABLE "public"."ai_feature_store" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_feature_store" TO "service_role";



GRANT ALL ON TABLE "public"."ai_model_weights" TO "anon";
GRANT ALL ON TABLE "public"."ai_model_weights" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_model_weights" TO "service_role";



GRANT ALL ON TABLE "public"."birthday_rewards" TO "anon";
GRANT ALL ON TABLE "public"."birthday_rewards" TO "authenticated";
GRANT ALL ON TABLE "public"."birthday_rewards" TO "service_role";



GRANT ALL ON TABLE "public"."blog_authors" TO "anon";
GRANT ALL ON TABLE "public"."blog_authors" TO "authenticated";
GRANT ALL ON TABLE "public"."blog_authors" TO "service_role";



GRANT ALL ON TABLE "public"."blog_categories" TO "anon";
GRANT ALL ON TABLE "public"."blog_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."blog_categories" TO "service_role";



GRANT ALL ON TABLE "public"."blog_post_tags" TO "anon";
GRANT ALL ON TABLE "public"."blog_post_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."blog_post_tags" TO "service_role";



GRANT ALL ON TABLE "public"."blog_posts" TO "anon";
GRANT ALL ON TABLE "public"."blog_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."blog_posts" TO "service_role";



GRANT ALL ON TABLE "public"."blog_tags" TO "anon";
GRANT ALL ON TABLE "public"."blog_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."blog_tags" TO "service_role";



GRANT ALL ON TABLE "public"."booking_changes" TO "anon";
GRANT ALL ON TABLE "public"."booking_changes" TO "service_role";



GRANT ALL ON TABLE "public"."booking_cleaner_earnings_snapshot" TO "anon";
GRANT ALL ON TABLE "public"."booking_cleaner_earnings_snapshot" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_cleaner_earnings_snapshot" TO "service_role";



GRANT ALL ON TABLE "public"."booking_cleaner_earnings_snapshot_lines" TO "anon";
GRANT ALL ON TABLE "public"."booking_cleaner_earnings_snapshot_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_cleaner_earnings_snapshot_lines" TO "service_role";



GRANT ALL ON TABLE "public"."booking_cleaners" TO "anon";
GRANT ALL ON TABLE "public"."booking_cleaners" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_cleaners" TO "service_role";



GRANT ALL ON TABLE "public"."booking_demand_events" TO "anon";
GRANT ALL ON TABLE "public"."booking_demand_events" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_demand_events" TO "service_role";



GRANT ALL ON TABLE "public"."booking_events" TO "anon";
GRANT ALL ON TABLE "public"."booking_events" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_events" TO "service_role";



GRANT ALL ON TABLE "public"."booking_lifecycle_jobs" TO "anon";
GRANT ALL ON TABLE "public"."booking_lifecycle_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_lifecycle_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."booking_line_items" TO "anon";
GRANT ALL ON TABLE "public"."booking_line_items" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_line_items" TO "service_role";



GRANT ALL ON TABLE "public"."booking_payment_recovery_jobs" TO "anon";
GRANT ALL ON TABLE "public"."booking_payment_recovery_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_payment_recovery_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."booking_roster_member_payouts" TO "anon";
GRANT ALL ON TABLE "public"."booking_roster_member_payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_roster_member_payouts" TO "service_role";



GRANT ALL ON TABLE "public"."booking_service_checklists" TO "anon";
GRANT ALL ON TABLE "public"."booking_service_checklists" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_service_checklists" TO "service_role";



GRANT ALL ON TABLE "public"."booking_service_photos" TO "anon";
GRANT ALL ON TABLE "public"."booking_service_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_service_photos" TO "service_role";



GRANT ALL ON TABLE "public"."booking_team_assignments" TO "anon";
GRANT ALL ON TABLE "public"."booking_team_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_team_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."booking_totals" TO "anon";
GRANT ALL ON TABLE "public"."booking_totals" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_totals" TO "service_role";



GRANT ALL ON SEQUENCE "public"."bookings_reference_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."bookings_reference_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."bookings_reference_seq" TO "service_role";



GRANT ALL ON TABLE "public"."business_health_scores" TO "anon";
GRANT ALL ON TABLE "public"."business_health_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."business_health_scores" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_assets" TO "anon";
GRANT ALL ON TABLE "public"."campaign_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_assets" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_content" TO "anon";
GRANT ALL ON TABLE "public"."campaign_content" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_content" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_templates" TO "anon";
GRANT ALL ON TABLE "public"."campaign_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_templates" TO "service_role";



GRANT ALL ON TABLE "public"."cities" TO "anon";
GRANT ALL ON TABLE "public"."cities" TO "authenticated";
GRANT ALL ON TABLE "public"."cities" TO "service_role";



GRANT ALL ON TABLE "public"."city_configs" TO "anon";
GRANT ALL ON TABLE "public"."city_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."city_configs" TO "service_role";



GRANT ALL ON TABLE "public"."cleaner_applications" TO "anon";
GRANT ALL ON TABLE "public"."cleaner_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."cleaner_applications" TO "service_role";



GRANT ALL ON TABLE "public"."cleaner_availability" TO "anon";
GRANT ALL ON TABLE "public"."cleaner_availability" TO "authenticated";
GRANT ALL ON TABLE "public"."cleaner_availability" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cleaner_booking_track_points" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cleaner_booking_track_points" TO "authenticated";
GRANT ALL ON TABLE "public"."cleaner_booking_track_points" TO "service_role";



GRANT ALL ON TABLE "public"."cleaner_change_requests" TO "anon";
GRANT ALL ON TABLE "public"."cleaner_change_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."cleaner_change_requests" TO "service_role";



GRANT ALL ON TABLE "public"."cleaner_earnings" TO "anon";
GRANT ALL ON TABLE "public"."cleaner_earnings" TO "authenticated";
GRANT ALL ON TABLE "public"."cleaner_earnings" TO "service_role";



GRANT ALL ON TABLE "public"."cleaner_earnings_adjustments" TO "anon";
GRANT ALL ON TABLE "public"."cleaner_earnings_adjustments" TO "authenticated";
GRANT ALL ON TABLE "public"."cleaner_earnings_adjustments" TO "service_role";



GRANT ALL ON TABLE "public"."cleaner_earnings_disbursements" TO "anon";
GRANT ALL ON TABLE "public"."cleaner_earnings_disbursements" TO "authenticated";
GRANT ALL ON TABLE "public"."cleaner_earnings_disbursements" TO "service_role";



GRANT ALL ON TABLE "public"."cleaner_earnings_disputes" TO "anon";
GRANT ALL ON TABLE "public"."cleaner_earnings_disputes" TO "authenticated";
GRANT ALL ON TABLE "public"."cleaner_earnings_disputes" TO "service_role";



GRANT ALL ON TABLE "public"."cleaner_job_issue_report_idempotency" TO "anon";
GRANT ALL ON TABLE "public"."cleaner_job_issue_report_idempotency" TO "authenticated";
GRANT ALL ON TABLE "public"."cleaner_job_issue_report_idempotency" TO "service_role";



GRANT ALL ON TABLE "public"."cleaner_job_issue_reports" TO "anon";
GRANT ALL ON TABLE "public"."cleaner_job_issue_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."cleaner_job_issue_reports" TO "service_role";



GRANT ALL ON TABLE "public"."cleaner_job_lifecycle_idempotency" TO "anon";
GRANT ALL ON TABLE "public"."cleaner_job_lifecycle_idempotency" TO "authenticated";
GRANT ALL ON TABLE "public"."cleaner_job_lifecycle_idempotency" TO "service_role";



GRANT ALL ON TABLE "public"."cleaner_locations" TO "anon";
GRANT ALL ON TABLE "public"."cleaner_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."cleaner_locations" TO "service_role";



GRANT ALL ON TABLE "public"."cleaner_payment_details" TO "anon";
GRANT ALL ON TABLE "public"."cleaner_payment_details" TO "authenticated";
GRANT ALL ON TABLE "public"."cleaner_payment_details" TO "service_role";



GRANT ALL ON TABLE "public"."cleaner_payout_runs" TO "anon";
GRANT ALL ON TABLE "public"."cleaner_payout_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."cleaner_payout_runs" TO "service_role";



GRANT ALL ON TABLE "public"."cleaner_payouts" TO "anon";
GRANT ALL ON TABLE "public"."cleaner_payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."cleaner_payouts" TO "service_role";



GRANT ALL ON TABLE "public"."cleaner_preferences" TO "anon";
GRANT ALL ON TABLE "public"."cleaner_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."cleaner_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."cleaner_report_feedback" TO "anon";
GRANT ALL ON TABLE "public"."cleaner_report_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."cleaner_report_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."cleaners" TO "anon";
GRANT ALL ON TABLE "public"."cleaners" TO "authenticated";
GRANT ALL ON TABLE "public"."cleaners" TO "service_role";



GRANT ALL ON TABLE "public"."conversion_deferred_payment_link_emails" TO "service_role";



GRANT ALL ON TABLE "public"."conversion_experiment_results" TO "service_role";



GRANT ALL ON TABLE "public"."conversion_experiments" TO "service_role";



GRANT ALL ON TABLE "public"."cron_http_targets" TO "anon";
GRANT ALL ON TABLE "public"."cron_http_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."cron_http_targets" TO "service_role";



GRANT ALL ON TABLE "public"."cron_run_leases" TO "anon";
GRANT ALL ON TABLE "public"."cron_run_leases" TO "service_role";



GRANT ALL ON TABLE "public"."cron_runs" TO "anon";
GRANT ALL ON TABLE "public"."cron_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."cron_runs" TO "service_role";



GRANT ALL ON TABLE "public"."customer_contact_health" TO "anon";
GRANT ALL ON TABLE "public"."customer_contact_health" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_contact_health" TO "service_role";



GRANT ALL ON TABLE "public"."customer_memberships" TO "anon";
GRANT ALL ON TABLE "public"."customer_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."customer_saved_addresses" TO "anon";
GRANT ALL ON TABLE "public"."customer_saved_addresses" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_saved_addresses" TO "service_role";



GRANT ALL ON TABLE "public"."customer_segment" TO "anon";
GRANT ALL ON TABLE "public"."customer_segment" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_segment" TO "service_role";



GRANT ALL ON TABLE "public"."daily_booking_funnel_metrics" TO "service_role";
GRANT SELECT ON TABLE "public"."daily_booking_funnel_metrics" TO "authenticated";



GRANT ALL ON TABLE "public"."daily_conversion_metrics" TO "service_role";
GRANT SELECT ON TABLE "public"."daily_conversion_metrics" TO "authenticated";



GRANT ALL ON TABLE "public"."daily_payment_metrics" TO "service_role";
GRANT SELECT ON TABLE "public"."daily_payment_metrics" TO "authenticated";



GRANT ALL ON TABLE "public"."daily_service_metrics" TO "service_role";
GRANT SELECT ON TABLE "public"."daily_service_metrics" TO "authenticated";



GRANT ALL ON TABLE "public"."dispatch_experiment_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."dispatch_logs" TO "anon";
GRANT ALL ON TABLE "public"."dispatch_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."dispatch_logs" TO "service_role";



GRANT ALL ON TABLE "public"."dispatch_metrics" TO "anon";
GRANT ALL ON TABLE "public"."dispatch_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."dispatch_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."dispatch_offer_exposure_dedupe" TO "service_role";



GRANT ALL ON TABLE "public"."dispatch_offer_timeout_metric_emitted" TO "anon";
GRANT ALL ON TABLE "public"."dispatch_offer_timeout_metric_emitted" TO "authenticated";
GRANT ALL ON TABLE "public"."dispatch_offer_timeout_metric_emitted" TO "service_role";



GRANT ALL ON TABLE "public"."dispatch_offers" TO "anon";
GRANT ALL ON TABLE "public"."dispatch_offers" TO "authenticated";
GRANT ALL ON TABLE "public"."dispatch_offers" TO "service_role";



GRANT ALL ON TABLE "public"."dispatch_retry_queue" TO "anon";
GRANT ALL ON TABLE "public"."dispatch_retry_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."dispatch_retry_queue" TO "service_role";



GRANT ALL ON TABLE "public"."earnings_disbursement_transfers" TO "anon";
GRANT ALL ON TABLE "public"."earnings_disbursement_transfers" TO "authenticated";
GRANT ALL ON TABLE "public"."earnings_disbursement_transfers" TO "service_role";



GRANT ALL ON TABLE "public"."email_campaign_sends" TO "anon";
GRANT ALL ON TABLE "public"."email_campaign_sends" TO "authenticated";
GRANT ALL ON TABLE "public"."email_campaign_sends" TO "service_role";



GRANT ALL ON TABLE "public"."email_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."email_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."email_campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."expense_accounts" TO "anon";
GRANT ALL ON TABLE "public"."expense_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."expense_approval_events" TO "anon";
GRANT ALL ON TABLE "public"."expense_approval_events" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_approval_events" TO "service_role";



GRANT ALL ON TABLE "public"."expense_approval_limits" TO "anon";
GRANT ALL ON TABLE "public"."expense_approval_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_approval_limits" TO "service_role";



GRANT ALL ON TABLE "public"."expense_categories" TO "anon";
GRANT ALL ON TABLE "public"."expense_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_categories" TO "service_role";



GRANT ALL ON TABLE "public"."expense_vendors" TO "anon";
GRANT ALL ON TABLE "public"."expense_vendors" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_vendors" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."failed_jobs" TO "anon";
GRANT ALL ON TABLE "public"."failed_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."failed_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."faqs" TO "anon";
GRANT ALL ON TABLE "public"."faqs" TO "authenticated";
GRANT ALL ON TABLE "public"."faqs" TO "service_role";



GRANT ALL ON TABLE "public"."finance_budget_lines" TO "anon";
GRANT ALL ON TABLE "public"."finance_budget_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_budget_lines" TO "service_role";



GRANT ALL ON TABLE "public"."finance_budgets" TO "anon";
GRANT ALL ON TABLE "public"."finance_budgets" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_budgets" TO "service_role";



GRANT ALL ON TABLE "public"."finance_chart_of_accounts" TO "anon";
GRANT ALL ON TABLE "public"."finance_chart_of_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_chart_of_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."finance_notifications" TO "anon";
GRANT ALL ON TABLE "public"."finance_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."growth_action_outcomes" TO "anon";
GRANT ALL ON TABLE "public"."growth_action_outcomes" TO "authenticated";
GRANT ALL ON TABLE "public"."growth_action_outcomes" TO "service_role";



GRANT ALL ON TABLE "public"."growth_customer_touch" TO "anon";
GRANT ALL ON TABLE "public"."growth_customer_touch" TO "authenticated";
GRANT ALL ON TABLE "public"."growth_customer_touch" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_adjustments" TO "anon";
GRANT ALL ON TABLE "public"."invoice_adjustments" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_adjustments" TO "service_role";



GRANT ALL ON TABLE "public"."job_offers" TO "authenticated";
GRANT ALL ON TABLE "public"."job_offers" TO "service_role";



GRANT ALL ON TABLE "public"."lifecycle_email_metrics" TO "anon";
GRANT ALL ON TABLE "public"."lifecycle_email_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."lifecycle_email_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."lifecycle_email_settings" TO "anon";
GRANT ALL ON TABLE "public"."lifecycle_email_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."lifecycle_email_settings" TO "service_role";



GRANT ALL ON TABLE "public"."location_gsc_metrics" TO "anon";
GRANT ALL ON TABLE "public"."location_gsc_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."location_gsc_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."location_gsc_queries" TO "anon";
GRANT ALL ON TABLE "public"."location_gsc_queries" TO "authenticated";
GRANT ALL ON TABLE "public"."location_gsc_queries" TO "service_role";



GRANT ALL ON TABLE "public"."location_gsc_sync_meta" TO "anon";
GRANT ALL ON TABLE "public"."location_gsc_sync_meta" TO "authenticated";
GRANT ALL ON TABLE "public"."location_gsc_sync_meta" TO "service_role";



GRANT ALL ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT ALL ON TABLE "public"."marketing_automation_rules" TO "anon";
GRANT ALL ON TABLE "public"."marketing_automation_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."marketing_automation_rules" TO "service_role";



GRANT ALL ON TABLE "public"."marketing_spend" TO "anon";
GRANT ALL ON TABLE "public"."marketing_spend" TO "authenticated";
GRANT ALL ON TABLE "public"."marketing_spend" TO "service_role";



GRANT ALL ON TABLE "public"."membership_plans" TO "anon";
GRANT ALL ON TABLE "public"."membership_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."membership_plans" TO "service_role";



GRANT ALL ON TABLE "public"."monthly_invoice_events" TO "anon";
GRANT ALL ON TABLE "public"."monthly_invoice_events" TO "authenticated";
GRANT ALL ON TABLE "public"."monthly_invoice_events" TO "service_role";



GRANT ALL ON TABLE "public"."monthly_invoice_paystack_charge_dedup" TO "anon";
GRANT ALL ON TABLE "public"."monthly_invoice_paystack_charge_dedup" TO "authenticated";
GRANT ALL ON TABLE "public"."monthly_invoice_paystack_charge_dedup" TO "service_role";



GRANT ALL ON TABLE "public"."monthly_invoices" TO "anon";
GRANT ALL ON TABLE "public"."monthly_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."monthly_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."mv_booking_funnel_daily" TO "service_role";



GRANT ALL ON TABLE "public"."user_events" TO "anon";
GRANT ALL ON TABLE "public"."user_events" TO "authenticated";
GRANT ALL ON TABLE "public"."user_events" TO "service_role";



GRANT ALL ON TABLE "public"."mv_payment_conversion_daily" TO "service_role";



GRANT ALL ON TABLE "public"."newsletter_subscribers" TO "anon";
GRANT ALL ON TABLE "public"."newsletter_subscribers" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletter_subscribers" TO "service_role";



GRANT ALL ON TABLE "public"."notification_alerts" TO "anon";
GRANT ALL ON TABLE "public"."notification_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."notification_idempotency_claims" TO "anon";
GRANT ALL ON TABLE "public"."notification_idempotency_claims" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_idempotency_claims" TO "service_role";



GRANT ALL ON TABLE "public"."notification_logs" TO "anon";
GRANT ALL ON TABLE "public"."notification_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_logs" TO "service_role";



GRANT ALL ON TABLE "public"."notification_runtime_flags" TO "anon";
GRANT ALL ON TABLE "public"."notification_runtime_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_runtime_flags" TO "service_role";



GRANT ALL ON TABLE "public"."payment_link_delivery_events" TO "anon";
GRANT ALL ON TABLE "public"."payment_link_delivery_events" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_link_delivery_events" TO "service_role";



GRANT ALL ON TABLE "public"."payment_transactions" TO "anon";
GRANT ALL ON TABLE "public"."payment_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."payout_audit_events" TO "anon";
GRANT ALL ON TABLE "public"."payout_audit_events" TO "authenticated";
GRANT ALL ON TABLE "public"."payout_audit_events" TO "service_role";



GRANT ALL ON TABLE "public"."payout_transfer_outbox" TO "anon";
GRANT ALL ON TABLE "public"."payout_transfer_outbox" TO "authenticated";
GRANT ALL ON TABLE "public"."payout_transfer_outbox" TO "service_role";



GRANT ALL ON TABLE "public"."payout_transfers" TO "anon";
GRANT ALL ON TABLE "public"."payout_transfers" TO "authenticated";
GRANT ALL ON TABLE "public"."payout_transfers" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_booking_config" TO "anon";
GRANT ALL ON TABLE "public"."pricing_booking_config" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_booking_config" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_catalog_audit" TO "anon";
GRANT ALL ON TABLE "public"."pricing_catalog_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_catalog_audit" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_changes" TO "anon";
GRANT ALL ON TABLE "public"."pricing_changes" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_changes" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_extra_bundles" TO "anon";
GRANT ALL ON TABLE "public"."pricing_extra_bundles" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_extra_bundles" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_extras" TO "anon";
GRANT ALL ON TABLE "public"."pricing_extras" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_extras" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_metrics" TO "anon";
GRANT ALL ON TABLE "public"."pricing_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_rules" TO "anon";
GRANT ALL ON TABLE "public"."pricing_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_rules" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_services" TO "anon";
GRANT ALL ON TABLE "public"."pricing_services" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_services" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_slot_adjustments" TO "anon";
GRANT ALL ON TABLE "public"."pricing_slot_adjustments" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_slot_adjustments" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_tiers" TO "anon";
GRANT ALL ON TABLE "public"."pricing_tiers" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_tiers" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_versions" TO "anon";
GRANT ALL ON TABLE "public"."pricing_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_versions" TO "service_role";



GRANT ALL ON TABLE "public"."promotion_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."promotion_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."promotion_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."promotion_bundles" TO "anon";
GRANT ALL ON TABLE "public"."promotion_bundles" TO "authenticated";
GRANT ALL ON TABLE "public"."promotion_bundles" TO "service_role";



GRANT ALL ON TABLE "public"."promotion_events" TO "anon";
GRANT ALL ON TABLE "public"."promotion_events" TO "authenticated";
GRANT ALL ON TABLE "public"."promotion_events" TO "service_role";



GRANT ALL ON TABLE "public"."promotion_redemptions" TO "anon";
GRANT ALL ON TABLE "public"."promotion_redemptions" TO "authenticated";
GRANT ALL ON TABLE "public"."promotion_redemptions" TO "service_role";



GRANT ALL ON TABLE "public"."promotions" TO "anon";
GRANT ALL ON TABLE "public"."promotions" TO "authenticated";
GRANT ALL ON TABLE "public"."promotions" TO "service_role";



GRANT ALL ON TABLE "public"."recurring_bookings" TO "anon";
GRANT ALL ON TABLE "public"."recurring_bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."recurring_bookings" TO "service_role";



GRANT ALL ON TABLE "public"."recurring_expenses" TO "anon";
GRANT ALL ON TABLE "public"."recurring_expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."recurring_expenses" TO "service_role";



GRANT ALL ON TABLE "public"."referral_program_settings" TO "anon";
GRANT ALL ON TABLE "public"."referral_program_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_program_settings" TO "service_role";



GRANT ALL ON TABLE "public"."referral_submissions" TO "anon";
GRANT ALL ON TABLE "public"."referral_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."referrals" TO "anon";
GRANT ALL ON TABLE "public"."referrals" TO "authenticated";
GRANT ALL ON TABLE "public"."referrals" TO "service_role";



GRANT ALL ON TABLE "public"."review_sms_prompt_queue" TO "anon";
GRANT ALL ON TABLE "public"."review_sms_prompt_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."review_sms_prompt_queue" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."sales_document_paystack_charge_dedup" TO "anon";
GRANT ALL ON TABLE "public"."sales_document_paystack_charge_dedup" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_document_paystack_charge_dedup" TO "service_role";



GRANT ALL ON TABLE "public"."sales_documents" TO "anon";
GRANT ALL ON TABLE "public"."sales_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_documents" TO "service_role";



GRANT ALL ON TABLE "public"."seo_auto_hub_ui_patch" TO "anon";
GRANT ALL ON TABLE "public"."seo_auto_hub_ui_patch" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_auto_hub_ui_patch" TO "service_role";



GRANT ALL ON TABLE "public"."seo_auto_title_variant" TO "anon";
GRANT ALL ON TABLE "public"."seo_auto_title_variant" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_auto_title_variant" TO "service_role";



GRANT ALL ON TABLE "public"."seo_insights_recommendations" TO "anon";
GRANT ALL ON TABLE "public"."seo_insights_recommendations" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_insights_recommendations" TO "service_role";



GRANT ALL ON TABLE "public"."service_earning_caps" TO "anon";
GRANT ALL ON TABLE "public"."service_earning_caps" TO "authenticated";
GRANT ALL ON TABLE "public"."service_earning_caps" TO "service_role";



GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";



GRANT ALL ON TABLE "public"."social_accounts" TO "anon";
GRANT ALL ON TABLE "public"."social_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."social_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."social_publish_history" TO "anon";
GRANT ALL ON TABLE "public"."social_publish_history" TO "authenticated";
GRANT ALL ON TABLE "public"."social_publish_history" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."system_logs" TO "anon";
GRANT ALL ON TABLE "public"."system_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."system_logs" TO "service_role";



GRANT ALL ON TABLE "public"."system_metrics" TO "anon";
GRANT ALL ON TABLE "public"."system_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."system_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."team_daily_capacity_usage" TO "anon";
GRANT ALL ON TABLE "public"."team_daily_capacity_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."team_daily_capacity_usage" TO "service_role";



GRANT ALL ON TABLE "public"."team_job_member_payouts" TO "anon";
GRANT ALL ON TABLE "public"."team_job_member_payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."team_job_member_payouts" TO "service_role";



GRANT ALL ON TABLE "public"."team_members" TO "anon";
GRANT ALL ON TABLE "public"."team_members" TO "authenticated";
GRANT ALL ON TABLE "public"."team_members" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."templates" TO "anon";
GRANT ALL ON TABLE "public"."templates" TO "authenticated";
GRANT ALL ON TABLE "public"."templates" TO "service_role";



GRANT ALL ON TABLE "public"."travel_route_cache" TO "anon";
GRANT ALL ON TABLE "public"."travel_route_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."travel_route_cache" TO "service_role";



GRANT ALL ON TABLE "public"."user_behavior" TO "anon";
GRANT ALL ON TABLE "public"."user_behavior" TO "authenticated";
GRANT ALL ON TABLE "public"."user_behavior" TO "service_role";



GRANT ALL ON TABLE "public"."user_notifications" TO "anon";
GRANT ALL ON TABLE "public"."user_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."user_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."user_push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."user_push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."user_push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_cleaner_unmatched_intent_log" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_cleaner_unmatched_intent_log" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_cleaner_unmatched_intent_log" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_delivery_events" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_delivery_events" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_delivery_events" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_inbound_feedback_dedupe" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_inbound_feedback_dedupe" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_inbound_feedback_dedupe" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_logs" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_logs" TO "service_role";



GRANT ALL ON TABLE "public"."zoho_integration_settings" TO "anon";
GRANT ALL ON TABLE "public"."zoho_integration_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."zoho_integration_settings" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";