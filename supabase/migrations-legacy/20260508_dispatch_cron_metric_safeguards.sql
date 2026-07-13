-- First-offer KPI dedupe (parallel offers / retries), DB-time recovery listing, richer lease claim payload.

alter table public.bookings
  add column if not exists first_offer_kpi_logged_at timestamptz;

comment on column public.bookings.first_offer_kpi_logged_at is
  'Set once when time_to_first_offer_ms KPI is emitted (idempotent under parallel offer creation).';

-- Replace boolean return with jsonb for steal visibility (existing callers: deploy app + migration together).
drop function if exists public.claim_booking_dispatch_recovery_lease(uuid, integer);

create or replace function public.claim_booking_dispatch_recovery_lease(
  p_booking_id uuid,
  p_lease_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

comment on function public.claim_booking_dispatch_recovery_lease(uuid, integer) is
  'Atomically extends dispatch_recovery_lease_until using DB now(); returns claimed + stole_expired_lease.';

revoke all on function public.claim_booking_dispatch_recovery_lease(uuid, integer) from public;
grant execute on function public.claim_booking_dispatch_recovery_lease(uuid, integer) to service_role;

create or replace function public.list_bookings_due_user_selected_recovery(
  p_max_attempts integer,
  p_limit integer
) returns table (
  id uuid,
  selected_cleaner_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.selected_cleaner_id
  from public.bookings b
  where b.status = 'pending'
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
  limit greatest(1, least(coalesce(nullif(p_limit, 0), 40), 200));
$$;

comment on function public.list_bookings_due_user_selected_recovery(integer, integer) is
  'Cron: user-selected bookings eligible for recovery using DB now() for dispatch_next_recovery_at.';

revoke all on function public.list_bookings_due_user_selected_recovery(integer, integer) from public;
grant execute on function public.list_bookings_due_user_selected_recovery(integer, integer) to service_role;
