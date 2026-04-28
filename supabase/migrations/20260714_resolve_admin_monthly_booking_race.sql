-- Transaction-safe race resolver for concurrent admin monthly creates on the same slot.
-- Cluster: [min(created_at), min(created_at) + 2s] among active rows (same user/date/time/service_slug).
-- Winner: earliest row with a non-draft monthly invoice link, else earliest in cluster.
-- Deletes only "safe" losers: (payment pending or null) AND (no invoice OR invoice still draft).

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
  v_winner uuid;
  v_deleted uuid[] := '{}';
  r_id uuid;
  v_json_deleted jsonb;
begin
  if p_force then
    return jsonb_build_object('ok', true, 'winner_id', null, 'deleted_ids', '[]'::jsonb);
  end if;

  perform 1
  from public.bookings b
  where b.user_id = p_user_id
    and b.date = p_date
    and b.time = p_time
    and b.service_slug = v_slug
    and b.status not in ('cancelled', 'failed', 'payment_expired')
  for update;

  select min(b.created_at) into v_t0
  from public.bookings b
  where b.user_id = p_user_id
    and b.date = p_date
    and b.time = p_time
    and b.service_slug = v_slug
    and b.status not in ('cancelled', 'failed', 'payment_expired');

  if v_t0 is null then
    return jsonb_build_object('ok', true, 'winner_id', null, 'deleted_ids', '[]'::jsonb);
  end if;

  select b.id into v_winner
  from public.bookings b
  where b.user_id = p_user_id
    and b.date = p_date
    and b.time = p_time
    and b.service_slug = v_slug
    and b.status not in ('cancelled', 'failed', 'payment_expired')
    and b.created_at >= v_t0
    and b.created_at <= v_t0 + interval '2 seconds'
    and b.monthly_invoice_id is not null
    and exists (
      select 1 from public.monthly_invoices mi
      where mi.id = b.monthly_invoice_id and lower(mi.status) is distinct from 'draft'
    )
  order by b.created_at asc
  limit 1;

  if v_winner is null then
    select b.id into v_winner
    from public.bookings b
    where b.user_id = p_user_id
      and b.date = p_date
      and b.time = p_time
      and b.service_slug = v_slug
      and b.status not in ('cancelled', 'failed', 'payment_expired')
      and b.created_at >= v_t0
      and b.created_at <= v_t0 + interval '2 seconds'
    order by b.created_at asc
    limit 1;
  end if;

  if v_winner is null then
    return jsonb_build_object('ok', true, 'winner_id', null, 'deleted_ids', '[]'::jsonb);
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
      and b.created_at <= v_t0 + interval '2 seconds'
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
      'ok', false,
      'winner_id', v_winner,
      'deleted_ids', v_json_deleted,
      'rolled_back_self', true
    );
  end if;

  if p_our_id is distinct from v_winner then
    return jsonb_build_object(
      'ok', false,
      'winner_id', v_winner,
      'deleted_ids', v_json_deleted,
      'left_duplicate', true
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'winner_id', v_winner,
    'deleted_ids', v_json_deleted
  );
end;
$fn$;

comment on function public.resolve_admin_monthly_booking_race(uuid, uuid, text, text, text, boolean) is
  'Serializes concurrent admin monthly duplicate cleanup: FOR UPDATE on slot, cluster [min(created_at), min+2s], invoice-safe deletes.';

revoke all on function public.resolve_admin_monthly_booking_race(uuid, uuid, text, text, text, boolean) from public;
grant execute on function public.resolve_admin_monthly_booking_race(uuid, uuid, text, text, text, boolean) to service_role;

comment on index public.idx_bookings_active_dup is
  'Active-slot duplicate probe. WHERE status NOT IN must match TERMINAL_BOOKING_STATUSES_FOR_DUPLICATE_GUARD in apps/web/lib/booking/bookingTerminalStatuses.ts: cancelled, failed, payment_expired.';
