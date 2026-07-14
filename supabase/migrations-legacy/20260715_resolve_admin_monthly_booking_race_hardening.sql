-- Hardening: idempotent retries, stable JSON payload, cluster bounds + metadata.
-- Clustering uses min(created_at) on active rows; keep bookings.created_at DB-owned (default now(), not sent from clients).

comment on column public.bookings.created_at is
  'Set by the database (default now()). Do not send created_at from clients so concurrent-slot clustering stays deterministic.';

create or replace function public.resolve_admin_monthly_booking_race(
  p_our_id uuid,
  p_user_id uuid,
  p_date text,
  p_time text,
  p_service_slug text,
  p_force boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
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
  where b.user_id = p_user_id
    and b.date = p_date
    and b.time = p_time
    and b.service_slug = v_slug
    and b.status not in ('cancelled', 'failed', 'payment_expired')
  for update;

  select exists(select 1 from public.bookings b where b.id = p_our_id) into v_our_exists;

  select count(*)::int into v_active_count
  from public.bookings b
  where b.user_id = p_user_id
    and b.date = p_date
    and b.time = p_time
    and b.service_slug = v_slug
    and b.status not in ('cancelled', 'failed', 'payment_expired');

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

  -- Requester's row already removed (e.g. prior RPC completion): reject with surviving winner, no further deletes.
  if not v_our_exists then
    select min(b.created_at) into v_t0
    from public.bookings b
    where b.user_id = p_user_id
      and b.date = p_date
      and b.time = p_time
      and b.service_slug = v_slug
      and b.status not in ('cancelled', 'failed', 'payment_expired');

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
    where b.user_id = p_user_id
      and b.date = p_date
      and b.time = p_time
      and b.service_slug = v_slug
      and b.status not in ('cancelled', 'failed', 'payment_expired')
      and b.created_at >= v_t0
      and b.created_at <= v_t1;

    select b.id, b.created_at into v_winner, v_winner_created
    from public.bookings b
    where b.user_id = p_user_id
      and b.date = p_date
      and b.time = p_time
      and b.service_slug = v_slug
      and b.status not in ('cancelled', 'failed', 'payment_expired')
      and b.created_at >= v_t0
      and b.created_at <= v_t1
      and b.monthly_invoice_id is not null
      and exists (
        select 1 from public.monthly_invoices mi
        where mi.id = b.monthly_invoice_id and lower(mi.status) is distinct from 'draft'
      )
    order by b.created_at asc
    limit 1;

    if v_winner is null then
      select b.id, b.created_at into v_winner, v_winner_created
      from public.bookings b
      where b.user_id = p_user_id
        and b.date = p_date
        and b.time = p_time
        and b.service_slug = v_slug
        and b.status not in ('cancelled', 'failed', 'payment_expired')
        and b.created_at >= v_t0
        and b.created_at <= v_t1
      order by b.created_at asc
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

  -- Only our row (or retry after cleanup): no-op proceed.
  if v_active_count = 1 then
    select b.id, b.created_at into v_winner, v_winner_created
    from public.bookings b
    where b.user_id = p_user_id
      and b.date = p_date
      and b.time = p_time
      and b.service_slug = v_slug
      and b.status not in ('cancelled', 'failed', 'payment_expired')
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
  where b.user_id = p_user_id
    and b.date = p_date
    and b.time = p_time
    and b.service_slug = v_slug
    and b.status not in ('cancelled', 'failed', 'payment_expired');

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
  where b.user_id = p_user_id
    and b.date = p_date
    and b.time = p_time
    and b.service_slug = v_slug
    and b.status not in ('cancelled', 'failed', 'payment_expired')
    and b.created_at >= v_t0
    and b.created_at <= v_t1;

  select b.id, b.created_at into v_winner, v_winner_created
  from public.bookings b
  where b.user_id = p_user_id
    and b.date = p_date
    and b.time = p_time
    and b.service_slug = v_slug
    and b.status not in ('cancelled', 'failed', 'payment_expired')
    and b.created_at >= v_t0
    and b.created_at <= v_t1
    and b.monthly_invoice_id is not null
    and exists (
      select 1 from public.monthly_invoices mi
      where mi.id = b.monthly_invoice_id and lower(mi.status) is distinct from 'draft'
    )
  order by b.created_at asc
  limit 1;

  if v_winner is null then
    select b.id, b.created_at into v_winner, v_winner_created
    from public.bookings b
    where b.user_id = p_user_id
      and b.date = p_date
      and b.time = p_time
      and b.service_slug = v_slug
      and b.status not in ('cancelled', 'failed', 'payment_expired')
      and b.created_at >= v_t0
      and b.created_at <= v_t1
    order by b.created_at asc
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
    where b.user_id = p_user_id
      and b.date = p_date
      and b.time = p_time
      and b.service_slug = v_slug
      and b.status not in ('cancelled', 'failed', 'payment_expired')
      and b.created_at >= v_t0
      and b.created_at <= v_t1
      and b.id <> v_winner
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
$fn$;

comment on function public.resolve_admin_monthly_booking_race(uuid, uuid, text, text, text, boolean) is
  'Retry-safe monthly duplicate resolver: FOR UPDATE on slot; if requester row missing → reject+winner (no re-delete); if single active row → proceed no-op; else cluster [min(created_at), min+2s], invoice-safe deletes. Payload includes action, cluster_start/end, cluster_size, winner_created_at.';

comment on index public.idx_bookings_active_dup is
  'Active-slot duplicate probe. WHERE status NOT IN must match TERMINAL_BOOKING_STATUSES_FOR_DUPLICATE_GUARD in apps/web/lib/booking/bookingTerminalStatuses.ts: cancelled, failed, payment_expired. Ops: under heavy UPDATE churn consider rebuilding this partial index with fillfactor=90; schedule periodic VACUUM (ANALYZE) on public.bookings.';
