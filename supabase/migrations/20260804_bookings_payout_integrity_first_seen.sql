-- Soft tracking: first time an integrity anomaly was observed for a booking (earnings / ops).

alter table public.bookings
  add column if not exists payout_integrity_first_seen_at timestamptz;

comment on column public.bookings.payout_integrity_first_seen_at is
  'Set once when cleaner earnings (or ops) first records a payout integrity anomaly for this row; used for MTTR-style debugging.';

create or replace function public.touch_payout_integrity_first_seen(p_booking_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_out timestamptz := null;
begin
  update public.bookings b
  set payout_integrity_first_seen_at = coalesce(b.payout_integrity_first_seen_at, now())
  where b.id = p_booking_id
  returning b.payout_integrity_first_seen_at into v_out;
  return v_out;
end;
$fn$;

comment on function public.touch_payout_integrity_first_seen(uuid) is
  'Sets payout_integrity_first_seen_at on first call per booking; returns current value (null if booking id missing).';

revoke all on function public.touch_payout_integrity_first_seen(uuid) from public;
grant execute on function public.touch_payout_integrity_first_seen(uuid) to service_role;
