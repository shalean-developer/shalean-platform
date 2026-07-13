-- Retire pre-July 2026 cleaner pipeline rows: monthly payout epoch starts 2026-07-01.
-- Clears stale pending/eligible bookings and ledger rows so cleaner dashboards only surface July+ pipeline.

create or replace function public.retire_pre_july_pending_cleaner_earnings()
returns table(bookings_updated bigint, ledger_updated bigint, roster_updated bigint, batches_updated bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid := '00000000-0000-4000-8000-000610450001'::uuid;
  v_bookings bigint := 0;
  v_ledger bigint := 0;
  v_roster bigint := 0;
  v_batches bigint := 0;
begin
  perform set_config('session_replication_role', 'replica', true);

  update public.bookings
  set
    payout_frozen_cents = coalesce(
      payout_frozen_cents,
      display_earnings_cents,
      cleaner_payout_cents,
      cleaner_earnings_total_cents,
      0
    ),
    payout_status = 'paid',
    payout_paid_at = coalesce(
      payout_paid_at,
      completed_at,
      (date::text || 'T12:00:00+02:00')::timestamptz
    ),
    payout_run_id = coalesce(payout_run_id, v_run_id)
  where status = 'completed'
    and is_test = false
    and date < date '2026-07-01'
    and payout_status in ('pending', 'eligible');
  get diagnostics v_bookings = row_count;

  update public.cleaner_earnings ce
  set
    status = 'paid',
    paid_at = coalesce(ce.paid_at, now())
  from public.bookings b
  where ce.booking_id = b.id
    and b.date < date '2026-07-01'
    and ce.status in ('pending', 'approved');
  get diagnostics v_ledger = row_count;

  update public.booking_roster_member_payouts brmp
  set
    status = 'paid',
    cleaner_payout_id = null
  from public.bookings b
  where brmp.booking_id = b.id
    and b.date < date '2026-07-01'
    and brmp.status in ('pending', 'batched');
  get diagnostics v_roster = row_count;

  update public.cleaner_payouts
  set
    status = 'paid',
    approved_at = coalesce(approved_at, now()),
    paid_at = coalesce(paid_at, now())
  where period_end < date '2026-07-01'
    and status not in ('paid', 'cancelled');
  get diagnostics v_batches = row_count;

  perform set_config('session_replication_role', 'origin', true);

  return query select v_bookings, v_ledger, v_roster, v_batches;
end;
$$;

comment on function public.retire_pre_july_pending_cleaner_earnings() is
  'One-shot: mark pre-July 2026 pipeline bookings/ledger/batches paid (monthly epoch starts July 2026).';

revoke all on function public.retire_pre_july_pending_cleaner_earnings() from public;
grant execute on function public.retire_pre_july_pending_cleaner_earnings() to service_role;

select * from public.retire_pre_july_pending_cleaner_earnings();
