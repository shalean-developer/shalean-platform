-- Governed acceptance on the retired AUDIT956 staging fixture only.
-- Run this exact file through the approved staging database connector after
-- verifying staging runtime SHA/environment and applying the reviewed migration.
-- Never target production. All mutations (including trigger side effects) roll
-- back. No batch, transfer, payment or notification API is invoked.
begin;
set local statement_timeout='15s';
set local lock_timeout='3s';
do $audit$
declare
  bid constant uuid := '95610000-0000-4000-8000-000000000001';
  lead constant uuid := '95610000-0000-4000-8000-000000000002';
  member constant uuid := '95610000-0000-4000-8000-000000000003';
  b public.bookings%rowtype;
  m public.booking_roster_member_payouts%rowtype;
  roster_member public.booking_cleaners%rowtype;
  adjustment uuid;
  other_adjustment uuid;
  cap_rejected boolean := false;
begin
  select * into strict b from public.bookings where id=bid for update;
  assert b.metadata->>'audit_fixture'='AUDIT956-PAIRED-UI' and (b.metadata->>'synthetic')::boolean,
    'Fixture ownership is not verified';
  assert b.is_test is true and b.status='completed' and b.date>='2026-10-01',
    'Use only the retired current synthetic fixture';
  assert b.cleaner_id=lead and b.payout_owner_cleaner_id=lead and b.display_earnings_cents=26000
    and b.internal_earnings_cents=52000 and b.earnings_summary->>'total_cleaner_earnings_cents'='52000',
    'Fixture earning baseline changed';
  assert b.payout_status='pending' and b.payout_id is null and b.payout_run_id is null and b.payout_paid_at is null,
    'Fixture payout is locked';
  assert b.payment_status='pending' and coalesce(b.amount_paid_cents,0)=0
    and coalesce(b.total_paid_cents,0)=0 and coalesce(b.deposit_paid_cents,0)=0
    and b.payment_completed_at is null and b.paid_at is null and b.payment_transaction_id is null
    and b.payment_reference_external is null and b.marked_paid_by_admin_id is null
    and b.monthly_invoice_id is null and b.zoho_invoice_id is null and b.sales_document_id is null,
    'Customer settlement evidence blocks fixture verification';
  assert exists(select 1 from public.recurring_bookings r where r.id=b.recurring_id
    and r.status='paused' and r.earnings_policy='legacy_july' and r.legacy_earnings_cents=26000
    and r.booking_snapshot_template->>'audit_fixture'='AUDIT956-PAIRED-UI'), 'Fixture schedule changed';
  assert (select array_agg(cleaner_id order by cleaner_id) from public.booking_cleaners where booking_id=bid)
    = array[lead,member], 'Fixture roster changed';
  assert not exists(select 1 from public.cleaner_earnings where booking_id=bid)
    and not exists(select 1 from public.team_job_member_payouts where booking_id=bid)
    and not exists(select 1 from public.cleaner_earnings_adjustments where booking_id=bid),
    'Existing ledger/team/adjustment history blocks fixture verification';
  select * into strict m from public.booking_roster_member_payouts where booking_id=bid;
  assert m.cleaner_id=member and m.status='pending' and m.cleaner_payout_id is null
    and m.payout_cents=26000 and m.bonus_cents=0, 'Fixture member payout changed';

  insert into public.cleaner_earnings_adjustments(booking_id,cleaner_id,amount_cents,reason)
    values(bid,lead,500,'AUDIT960 rollback-only staging bonus') returning id into adjustment;
  select * into strict b from public.bookings where id=bid;
  assert b.cleaner_payout_cents+b.cleaner_bonus_cents=26500 and b.internal_earnings_cents=52500
    and b.earnings_summary->>'total_cleaner_earnings_cents'='52500', 'Lead bonus did not reach payables/summary';
  insert into public.cleaner_earnings_adjustments(booking_id,cleaner_id,amount_cents,reason)
    values(bid,member,-300,'AUDIT960 rollback-only staging deduction') returning id into other_adjustment;
  select * into strict m from public.booking_roster_member_payouts where booking_id=bid;
  assert m.payout_cents+m.bonus_cents=25700, 'Member deduction did not reach payables';
  assert (select internal_earnings_cents from public.bookings where id=bid)=52200, 'Paired obligation diverged';
  update public.cleaner_earnings_adjustments set amount_cents=700 where id=adjustment;
  assert (select internal_earnings_cents from public.bookings where id=bid)=52400, 'Adjustment UPDATE did not refresh';
  delete from public.cleaner_earnings_adjustments where id in(adjustment,other_adjustment);
  assert (select internal_earnings_cents from public.bookings where id=bid)=52000, 'Adjustment DELETE did not refresh';
  begin
    insert into public.cleaner_earnings_adjustments(booking_id,cleaner_id,amount_cents,reason)
      values(bid,member,15000,'AUDIT960 rollback-only over-cap rejection');
  exception when check_violation then
    if sqlerrm='payout_exceeds_financial_cap' then cap_rejected:=true; else raise; end if;
  end;
  assert cap_rejected, 'Over-cap adjustment was accepted';
  assert not exists(select 1 from public.cleaner_earnings_adjustments where booking_id=bid), 'Rejected adjustment persisted';

  select * into strict roster_member from public.booking_cleaners where booking_id=bid and cleaner_id=member;
  delete from public.booking_cleaners where booking_id=bid and cleaner_id=member;
  assert (select internal_earnings_cents from public.bookings where id=bid)=26000, 'Roster removal did not refresh obligation';
  assert not exists(select 1 from public.booking_roster_member_payouts where booking_id=bid), 'Removed member retained a payable';
  insert into public.booking_cleaners select roster_member.*;
  assert (select internal_earnings_cents from public.bookings where id=bid)=52000, 'Roster restoration did not refresh';
  assert (select payout_cents+bonus_cents from public.booking_roster_member_payouts where booking_id=bid)=26000,
    'Restored member has no payable';

  update public.bookings set earnings_summary=null where id=bid;
  insert into public.cleaner_earnings_adjustments(booking_id,cleaner_id,amount_cents,reason)
    values(bid,member,500,'AUDIT960 rollback-only summary-absent scenario');
  select * into strict b from public.bookings where id=bid;
  assert b.earnings_summary is null and b.internal_earnings_cents=52500, 'Summary-absent obligation is incorrect';
  assert b.company_revenue_cents=12500, 'Summary-absent margin did not follow the bonus';
  assert (select payout_cents+bonus_cents from public.booking_roster_member_payouts where booking_id=bid)=26500,
    'Summary-absent member payable is incorrect';
  assert b.is_test is true and b.payout_status='pending' and b.payout_id is null
    and b.payout_run_id is null and b.payout_paid_at is null, 'Verification created financial linkage';
  assert not exists(select 1 from public.cleaner_earnings where booking_id=bid), 'Verification created solo ledger';
end;
$audit$;
rollback;
select 'PASS: retired staging fixture checks completed and transaction rolled back' as verification;
