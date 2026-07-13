-- Single definition of "same active admin slot" for RPC + docs; TS uses lib/booking/activeAdminBookingSlot.ts.
-- Deterministic winner: ORDER BY created_at ASC, id ASC everywhere.
-- Partial unique index (non-exempt rows only) + slot_duplicate_exempt for intentional duplicates (force).

alter table public.bookings
  add column if not exists slot_duplicate_exempt boolean not null default false;

alter table public.bookings
  add column if not exists admin_force_slot_override boolean not null default false;

comment on column public.bookings.slot_duplicate_exempt is
  'When true, row is excluded from partial unique index idx_bookings_unique_active_customer_slot (intentional duplicate slot, e.g. admin force).';

comment on column public.bookings.admin_force_slot_override is
  'True when an admin explicitly bypassed duplicate-slot guard for this booking (audit / UI flag).';

create or replace function public.booking_matches_active_admin_slot(
  b public.bookings,
  p_user_id uuid,
  p_date text,
  p_time text,
  p_service_slug text
)
returns boolean
language sql
stable
as $f$
  select b.user_id is not distinct from p_user_id
    and b.date is not distinct from p_date
    and b.time is not distinct from p_time
    and lower(trim(b.service_slug)) is not distinct from lower(trim(p_service_slug))
    and b.status not in ('cancelled', 'failed', 'payment_expired');
$f$;

comment on function public.booking_matches_active_admin_slot(public.bookings, uuid, text, text, text) is
  'Predicate: booking row is same customer slot as duplicate probe / race resolver. Must match apps/web/lib/booking/activeAdminBookingSlot.ts and TERMINAL_BOOKING_STATUSES_FOR_DUPLICATE_GUARD.';

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
$fn$;

comment on function public.resolve_admin_monthly_booking_race(uuid, uuid, text, text, text, boolean) is
  'Uses booking_matches_active_admin_slot; winners ordered by created_at ASC, id ASC.';

do $precheck$
declare
  dup_groups int;
begin
  select count(*)::int into dup_groups
  from (
    select user_id, date, time, service_slug
    from public.bookings
    where user_id is not null
      and coalesce(slot_duplicate_exempt, false) = false
      and status not in ('cancelled', 'failed', 'payment_expired')
    group by user_id, date, time, service_slug
    having count(*) > 1
  ) s;

  if dup_groups > 0 then
    raise exception using
      message = format(
        'Cannot create idx_bookings_unique_active_customer_slot: found %s duplicate active slot group(s). Reconcile rows first.',
        dup_groups
      );
  end if;
end
$precheck$;

create unique index if not exists idx_bookings_unique_active_customer_slot
  on public.bookings (user_id, date, time, service_slug)
  where user_id is not null
    and coalesce(slot_duplicate_exempt, false) = false
    and status not in ('cancelled', 'failed', 'payment_expired');

comment on index public.idx_bookings_unique_active_customer_slot is
  'Hard backstop: at most one non-exempt active booking per (user_id, date, time, service_slug). Exempt rows are omitted from the index (intentional duplicates). Rare: multiple exempt rows can share a slot if force is used repeatedly — ops should reconcile.';

revoke all on function public.booking_matches_active_admin_slot(public.bookings, uuid, text, text, text) from public;
grant execute on function public.booking_matches_active_admin_slot(public.bookings, uuid, text, text, text) to service_role;
