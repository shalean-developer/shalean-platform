-- Richer return from claim RPC: whether we claimed + earliest time the next claim is allowed.

drop function if exists public.claim_booking_earnings_recompute(uuid, int);

create or replace function public.claim_booking_earnings_recompute(p_booking_id uuid, p_cooldown_seconds int default 120)
returns table(claimed boolean, next_allowed_at timestamptz)
language plpgsql
security definer
set search_path = public
as $fn$
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
$fn$;

comment on function public.claim_booking_earnings_recompute(uuid, int) is
  'Sets last_earnings_recompute_at when outside cooldown (claimed=true). When claimed=false, next_allowed_at is earliest time a claim may succeed.';

revoke all on function public.claim_booking_earnings_recompute(uuid, int) from public;
grant execute on function public.claim_booking_earnings_recompute(uuid, int) to service_role;
