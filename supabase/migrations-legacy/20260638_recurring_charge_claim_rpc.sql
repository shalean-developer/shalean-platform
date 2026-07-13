-- Atomic claim for recurring auto-charge (duplicate cron + parallel workers).

create or replace function public.try_claim_recurring_charge(p_booking_id uuid, p_lease_seconds int default 120)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows int;
begin
  update public.bookings
  set
    recurring_last_charge_attempt_at = now(),
    recurring_next_charge_attempt_at = now() + make_interval(secs => p_lease_seconds)
  where id = p_booking_id
    and status = 'pending_payment'
    and is_recurring_generated = true
    and recurring_fallback_at is null
    and (payment_status is distinct from 'failed')
    and (recurring_next_charge_attempt_at is null or recurring_next_charge_attempt_at <= now());
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

comment on function public.try_claim_recurring_charge(uuid, int) is
  'Sets a short lease on recurring_next_charge_attempt_at so only one worker charges; returns true if row was claimed.';

revoke all on function public.try_claim_recurring_charge(uuid, int) from public;
grant execute on function public.try_claim_recurring_charge(uuid, int) to service_role;
