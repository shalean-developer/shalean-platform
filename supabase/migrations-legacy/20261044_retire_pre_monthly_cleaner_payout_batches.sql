-- Retire weekly-era cleaner_payout batches outside the monthly calendar-month model (from July 2026).
-- Unlinks open bookings so catch-up generation can rebuild July+ monthly batches.

create or replace function public.payout_period_is_canonical_jhb_month(p_start date, p_end date)
returns boolean
language sql
immutable
as $$
  select p_start = date_trunc('month', p_start)::date
     and p_end = (date_trunc('month', p_start) + interval '1 month' - interval '1 day')::date;
$$;

comment on function public.payout_period_is_canonical_jhb_month(date, date) is
  'True when period_start/period_end span a full calendar month (Johannesburg YMD dates).';

do $retire$
declare
  retired_ids uuid[];
begin
  select array_agg(id)
  into retired_ids
  from public.cleaner_payouts
  where status not in ('paid', 'cancelled')
    and payout_run_id is null
    and (
      period_start < date '2026-07-01'
      or not public.payout_period_is_canonical_jhb_month(period_start::date, period_end::date)
    );

  if retired_ids is null or cardinality(retired_ids) = 0 then
    return;
  end if;

  update public.bookings
  set payout_id = null
  where payout_id = any (retired_ids);

  update public.booking_roster_member_payouts
  set cleaner_payout_id = null,
      status = 'pending'
  where cleaner_payout_id = any (retired_ids)
    and status = 'batched';

  update public.cleaner_payouts
  set status = 'cancelled'
  where id = any (retired_ids);
end;
$retire$;
