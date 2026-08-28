-- SR-08C — Invoice/payment/payout reconciliation
-- Keep payout parent state and every linked earning rail transactionally aligned.
-- These triggers run inside the same database transaction as the parent status update,
-- so a child-sync failure rolls the parent update back instead of leaving split paid state.

create or replace function public.sync_cleaner_payout_paid_children()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from 'paid' then
    return new;
  end if;

  update public.bookings b
  set
    payout_status = 'paid',
    payout_paid_at = coalesce(b.payout_paid_at, new.paid_at, now())
  where b.payout_id = new.id
    and (
      lower(coalesce(b.payout_status, '')) is distinct from 'paid'
      or b.payout_paid_at is null
    );

  update public.booking_roster_member_payouts rp
  set status = 'paid'
  where rp.cleaner_payout_id = new.id
    and rp.status is distinct from 'paid';

  update public.team_job_member_payouts tj
  set status = 'paid'
  where tj.cleaner_payout_id = new.id
    and tj.status is distinct from 'paid';

  return new;
end;
$$;

revoke all on function public.sync_cleaner_payout_paid_children() from public;
revoke all on function public.sync_cleaner_payout_paid_children() from anon;
revoke all on function public.sync_cleaner_payout_paid_children() from authenticated;
grant execute on function public.sync_cleaner_payout_paid_children() to service_role;

drop trigger if exists cleaner_payout_paid_children_sync on public.cleaner_payouts;
create trigger cleaner_payout_paid_children_sync
after update of status on public.cleaner_payouts
for each row
when (new.status = 'paid')
execute function public.sync_cleaner_payout_paid_children();

comment on function public.sync_cleaner_payout_paid_children() is
  'SR-08C: transactionally converges direct, roster-member, and team-member paid state whenever cleaner_payouts becomes paid.';

create or replace function public.sync_cleaner_earnings_disbursement_paid_children()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from 'paid' then
    return new;
  end if;

  update public.cleaner_earnings ce
  set
    status = 'paid',
    paid_at = coalesce(ce.paid_at, new.paid_at, now())
  where ce.disbursement_id = new.id
    and ce.status is distinct from 'paid';

  update public.bookings b
  set
    payout_status = 'paid',
    payout_paid_at = coalesce(b.payout_paid_at, new.paid_at, now())
  from public.cleaner_earnings ce
  where ce.disbursement_id = new.id
    and ce.booking_id = b.id
    and (
      lower(coalesce(b.payout_status, '')) is distinct from 'paid'
      or b.payout_paid_at is null
    );

  return new;
end;
$$;

revoke all on function public.sync_cleaner_earnings_disbursement_paid_children() from public;
revoke all on function public.sync_cleaner_earnings_disbursement_paid_children() from anon;
revoke all on function public.sync_cleaner_earnings_disbursement_paid_children() from authenticated;
grant execute on function public.sync_cleaner_earnings_disbursement_paid_children() to service_role;

drop trigger if exists cleaner_earnings_disbursement_paid_children_sync on public.cleaner_earnings_disbursements;
create trigger cleaner_earnings_disbursement_paid_children_sync
after update of status on public.cleaner_earnings_disbursements
for each row
when (new.status = 'paid')
execute function public.sync_cleaner_earnings_disbursement_paid_children();

comment on function public.sync_cleaner_earnings_disbursement_paid_children() is
  'SR-08C: transactionally converges cleaner earnings and linked booking paid state whenever a cleaner_earnings_disbursement becomes paid.';
