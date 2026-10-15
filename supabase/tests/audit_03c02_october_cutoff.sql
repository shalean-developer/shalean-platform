-- AUDIT-03C-02 governed staging probes for the October 2026 rollout.
-- Run only against staging uwvnmluiqbczeduzjgse with outbound disabled.
-- All fixture changes are transaction-contained and rolled back.
begin;
select set_config('request.jwt.claim.role', 'service_role', true);
do $$
declare c uuid; b uuid; v jsonb; n integer;
begin
  if date_trunc('month', timezone('Africa/Johannesburg', now()))::date <> date '2026-10-01' then
    raise exception 'This rollout probe requires October 2026; use permanent clock-controlled unit tests otherwise';
  end if;
  select id into c from public.cleaners order by id limit 1;
  select id into b from public.bookings where status='pending'
    and payout_id is null order by id limit 1;
  if c is null or b is null then raise exception 'staging fixtures unavailable'; end if;

  begin
    insert into public.cleaner_payouts(id,cleaner_id,total_amount_cents,period_start,period_end)
    values('a03c0202-0000-4000-8000-000000000001',c,100,'2026-09-01','2026-09-30');
    raise exception 'FAIL historical batch accepted';
  exception when check_violation then
    if sqlerrm <> 'closed_october_or_later_month_required' then raise; end if;
  end;
  begin
    insert into public.cleaner_payouts(id,cleaner_id,total_amount_cents,period_start,period_end)
    values('a03c0202-0000-4000-8000-000000000002',c,100,'2026-10-01','2026-10-31');
    raise exception 'FAIL open month accepted';
  exception when check_violation then
    if sqlerrm <> 'closed_october_or_later_month_required' then raise; end if;
  end;
  begin
    perform public.upsert_pending_payout_earnings(null,c,'2026-09-01','2026-09-30','{}'::uuid[],'{}'::uuid[],'{}'::uuid[],null);
    raise exception 'FAIL historical RPC accepted';
  exception when check_violation then
    if sqlerrm <> 'closed_october_or_later_month_required' then raise; end if;
  end;
  v := public.create_cleaner_payout_run_atomic('2026-12-31');
  if v is not null then raise exception 'FAIL run created before October closure'; end if;
  n := public.freeze_eligible_cleaner_payouts_atomic('2026-12-01',now());
  if n <> 0 then raise exception 'FAIL unexpected freeze'; end if;

  -- Temporarily model a deferred visit without introducing a live booking.
 set constraints all immediate;
 alter table public.bookings disable trigger audit_03c02_final_booking_financials;
  update public.bookings set date='2026-09-30' where id=b;
 set constraints all immediate;
 alter table public.bookings enable trigger audit_03c02_final_booking_financials;
  begin
    update public.bookings set cleaner_payout_cents=coalesce(cleaner_payout_cents,0)+1 where id=b;
    raise exception 'FAIL historical booking amount changed';
  exception when check_violation then
    if sqlerrm <> 'historical_payout_item_deferred' then raise; end if;
  end;
 set constraints all immediate;
 alter table public.booking_roster_member_payouts disable trigger audit_03c02_a_roster_payout_identity;
  insert into public.booking_roster_member_payouts(id,booking_id,cleaner_id,payout_cents,bonus_cents,status)
    values('a03c0202-0000-4000-8000-000000000003',b,c,100,0,'pending');
 set constraints all immediate;
 alter table public.booking_roster_member_payouts enable trigger audit_03c02_a_roster_payout_identity;
  begin
    update public.booking_roster_member_payouts set payout_cents=101
      where id='a03c0202-0000-4000-8000-000000000003';
    raise exception 'FAIL historical roster amount changed';
  exception when check_violation then
    if sqlerrm <> 'historical_payout_item_deferred' then raise; end if;
  end;
  begin
    insert into public.team_job_member_payouts(id,booking_id,team_id,cleaner_id,payout_cents,status)
      values('a03c0202-0000-4000-8000-000000000004',b,'a03c0202-0000-4000-8000-000000000099',c,100,'paid');
    raise exception 'FAIL historical team earning paid';
  exception when check_violation then
    if sqlerrm <> 'historical_payout_item_deferred' then raise; end if;
  end;
  begin
    insert into public.cleaner_earnings(id,booking_id,cleaner_id,amount_cents,status)
      values('a03c0202-0000-4000-8000-000000000005',b,c,100,'processing');
    raise exception 'FAIL historical ledger earning claimed';
  exception when check_violation then
    if sqlerrm <> 'historical_payout_item_deferred' then raise; end if;
  end;
  begin
    perform public.adjust_unrun_member_payout_earnings(b,c,101,0,'{}'::jsonb);
    raise exception 'FAIL historical member adjustment RPC accepted';
  exception when check_violation then
    if sqlerrm <> 'historical_payout_item_deferred' then raise; end if;
  end;
end $$;
rollback;
select 'PASS: historical/open periods, booking/roster/team/ledger claims and historical adjustment RPC blocked; fixtures rolled back' as evidence;
