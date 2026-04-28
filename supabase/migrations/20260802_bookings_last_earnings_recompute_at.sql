-- Cross-instance cooldown for stuck-earnings recompute (avoids per-instance debounce gaps / storms).

alter table public.bookings
  add column if not exists last_earnings_recompute_at timestamptz;

comment on column public.bookings.last_earnings_recompute_at is
  'Last time a server claimed a stuck-earnings recompute for this booking; used with claim_booking_earnings_recompute.';

create or replace function public.claim_booking_earnings_recompute(p_booking_id uuid, p_cooldown_seconds int default 120)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_rows int;
begin
  update public.bookings
  set last_earnings_recompute_at = now()
  where id = p_booking_id
    and (
      last_earnings_recompute_at is null
      or last_earnings_recompute_at < now() - make_interval(secs => p_cooldown_seconds)
    );
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$fn$;

comment on function public.claim_booking_earnings_recompute(uuid, int) is
  'Atomically sets last_earnings_recompute_at when outside cooldown; returns true if this invocation claimed the slot.';

revoke all on function public.claim_booking_earnings_recompute(uuid, int) from public;
grant execute on function public.claim_booking_earnings_recompute(uuid, int) to service_role;
