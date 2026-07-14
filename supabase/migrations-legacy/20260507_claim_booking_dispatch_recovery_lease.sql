-- DB-clock lease claim (avoids app vs Postgres clock drift on comparisons and lease end time).
create or replace function public.claim_booking_dispatch_recovery_lease(
  p_booking_id uuid,
  p_lease_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secs integer;
begin
  v_secs := greatest(60, least(120, coalesce(nullif(p_lease_seconds, 0), 90)));

  update public.bookings
  set dispatch_recovery_lease_until = now() + make_interval(secs => v_secs)
  where id = p_booking_id
    and (dispatch_recovery_lease_until is null or dispatch_recovery_lease_until < now());

  return found;
end;
$$;

comment on function public.claim_booking_dispatch_recovery_lease(uuid, integer) is
  'Atomically extends dispatch_recovery_lease_until using now() for steal/compare; TTL clamped 60–120s.';

revoke all on function public.claim_booking_dispatch_recovery_lease(uuid, integer) from public;
grant execute on function public.claim_booking_dispatch_recovery_lease(uuid, integer) to service_role;
