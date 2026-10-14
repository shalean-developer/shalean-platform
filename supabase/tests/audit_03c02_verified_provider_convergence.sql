-- Staging only. Synthetic provider evidence; no provider requests. Always rollback.
begin;
select set_config('request.jwt.claim.role','service_role',true);
create temp table audit03c02_controls as
select 'bookings' as t,count(*) as n,md5(coalesce(string_agg(to_jsonb(b)::text,'' order by id),'')) as h from public.bookings b
union all select 'cleaner_payouts',count(*),md5(coalesce(string_agg(to_jsonb(b)::text,'' order by id),'')) from public.cleaner_payouts b
union all select 'cleaner_earnings',count(*),md5(coalesce(string_agg(to_jsonb(b)::text,'' order by id),'')) from public.cleaner_earnings b;
-- Model a pre-existing September intent. Only the new cutoff trigger is suspended
-- for fixture construction, within this transaction; existing financial guards remain.
alter table public.cleaner_payouts disable trigger audit_03c02_payout_batch_boundary;
insert into public.cleaner_payouts(id,cleaner_id,total_amount_cents,status,payment_status,period_start,period_end)
select 'a03c0203-0000-4000-8000-000000000001',id,12345,'approved','processing','2026-09-01','2026-09-30' from public.cleaners order by id limit 1;
alter table public.cleaner_payouts enable trigger audit_03c02_payout_batch_boundary;
do $$ begin
  begin
    update public.cleaner_payouts set status='paid',paid_at=now(),payment_status='success',payment_method='paystack' where id='a03c0203-0000-4000-8000-000000000001';
    raise exception 'FAIL settlement without provider evidence';
  exception when check_violation then
    if sqlerrm <> 'historical_payout_deferred' then raise; end if;
  end;
end $$;
insert into public.payout_transfers(id,payout_id,cleaner_id,amount_cents,reference,transfer_code,status,webhook_processed_at)
select 'a03c0203-0000-4000-8000-000000000002',id,cleaner_id,total_amount_cents,'AUDIT03C02-SYNTHETIC','TRF_AUDIT03C02','failed',now() from public.cleaner_payouts where id='a03c0203-0000-4000-8000-000000000001';
insert into public.payout_transfer_outbox(id,rail,subject_id,cleaner_id,amount_cents,recipient_code,reference,transfer_row_id,status,attempts)
select 'a03c0203-0000-4000-8000-000000000003','cleaner_payout',id,cleaner_id,total_amount_cents,'RCP_SYNTHETIC','AUDIT03C02-SYNTHETIC','a03c0203-0000-4000-8000-000000000002','submitted',1 from public.cleaner_payouts where id='a03c0203-0000-4000-8000-000000000001';
update public.cleaner_payouts set payment_status='failed' where id='a03c0203-0000-4000-8000-000000000001';
update public.payout_transfers set status='success' where id='a03c0203-0000-4000-8000-000000000002';
update public.cleaner_payouts set status='paid',paid_at=now(),payment_status='success',payment_method='paystack' where id='a03c0203-0000-4000-8000-000000000001';
update public.cleaner_payouts set payment_reference='TRF_AUDIT03C02' where id='a03c0203-0000-4000-8000-000000000001';
-- Replay is idempotent. Financial identity edits must remain blocked even with evidence.
update public.cleaner_payouts set payment_reference='TRF_AUDIT03C02' where id='a03c0203-0000-4000-8000-000000000001';
do $$ begin
  if not exists(select 1 from public.cleaner_payouts where id='a03c0203-0000-4000-8000-000000000001' and status='paid' and total_amount_cents=12345 and payment_reference='TRF_AUDIT03C02') then raise exception 'FAIL convergence'; end if;
  begin
    update public.cleaner_payouts set total_amount_cents=12346 where id='a03c0203-0000-4000-8000-000000000001';
    raise exception 'FAIL amount edit accepted';
  exception when check_violation then
    if sqlerrm <> 'historical_payout_deferred' then raise; end if;
  end;
  begin
    update public.cleaner_payouts set payment_reference='UNRELATED' where id='a03c0203-0000-4000-8000-000000000001';
    raise exception 'FAIL unrelated reference accepted';
  exception when check_violation then
    if sqlerrm <> 'historical_payout_deferred' then raise; end if;
  end;
end $$;
-- Exercise linked booking convergence without changing its visit or amount.
set constraints all immediate;
alter table public.bookings disable trigger audit_03c02_booking_boundary;
alter table public.bookings disable trigger audit_03c02_final_booking_financials;
update public.bookings set date='2026-09-20',payout_frozen_cents=12345,payout_run_id='a03c0203-0000-4000-8000-000000000099',payout_id='a03c0203-0000-4000-8000-000000000001'
where id=(select id from public.bookings where status='pending' and payout_id is null order by id limit 1);
set constraints all immediate;
alter table public.bookings enable trigger audit_03c02_booking_boundary;
alter table public.bookings enable trigger audit_03c02_final_booking_financials;
select public.mark_bookings_paid_for_cleaner_payout('a03c0203-0000-4000-8000-000000000001');
select public.mark_bookings_paid_for_cleaner_payout('a03c0203-0000-4000-8000-000000000001');
-- A second historical visit models an already-claimed ledger intent.
set constraints all immediate;
alter table public.bookings disable trigger audit_03c02_booking_boundary;
alter table public.bookings disable trigger audit_03c02_final_booking_financials;
update public.bookings set date='2026-09-21',payout_frozen_cents=100,payout_run_id='a03c0203-0000-4000-8000-000000000099'
where id=(select id from public.bookings where status='pending' and payout_id is null order by id limit 1);
set constraints all immediate;
alter table public.bookings enable trigger audit_03c02_booking_boundary;
alter table public.bookings enable trigger audit_03c02_final_booking_financials;
insert into public.cleaner_earnings_disbursements(id,cleaner_id,total_amount_cents,status)
select 'a03c0203-0000-4000-8000-000000000004',id,100,'processing' from public.cleaners order by id limit 1;
set constraints all immediate;
alter table public.cleaner_earnings disable trigger audit_03c02_ledger_boundary;
alter table public.cleaner_earnings disable trigger audit_03c02_a_ledger_identity;
insert into public.cleaner_earnings(id,booking_id,cleaner_id,amount_cents,status,disbursement_id)
select 'a03c0203-0000-4000-8000-000000000005',b.id,d.cleaner_id,100,'processing',d.id from public.bookings b
cross join public.cleaner_earnings_disbursements d where b.date='2026-09-21' and d.id='a03c0203-0000-4000-8000-000000000004' limit 1;
set constraints all immediate;
alter table public.cleaner_earnings enable trigger audit_03c02_ledger_boundary;
alter table public.cleaner_earnings enable trigger audit_03c02_a_ledger_identity;
insert into public.earnings_disbursement_transfers(id,disbursement_id,cleaner_id,amount_cents,reference,transfer_code,status,webhook_processed_at)
select 'a03c0203-0000-4000-8000-000000000006',id,cleaner_id,total_amount_cents,'AUDIT03C02-LEDGER','TRF_AUDIT03C02_LEDGER','success',now() from public.cleaner_earnings_disbursements where id='a03c0203-0000-4000-8000-000000000004';
insert into public.payout_transfer_outbox(id,rail,subject_id,cleaner_id,amount_cents,recipient_code,reference,transfer_row_id,status,attempts)
select 'a03c0203-0000-4000-8000-000000000007','cleaner_earnings',id,cleaner_id,total_amount_cents,'RCP_SYNTHETIC','AUDIT03C02-LEDGER','a03c0203-0000-4000-8000-000000000006','submitted',1 from public.cleaner_earnings_disbursements where id='a03c0203-0000-4000-8000-000000000004';
do $$ begin
  begin
    update public.earnings_disbursement_transfers set status='failed' where id='a03c0203-0000-4000-8000-000000000006';
    update public.cleaner_earnings set status='approved',disbursement_id=null where id='a03c0203-0000-4000-8000-000000000005';
    if not exists(select 1 from public.cleaner_earnings where id='a03c0203-0000-4000-8000-000000000005' and status='approved' and disbursement_id is null) then raise exception 'FAIL historical ledger failure release'; end if;
    begin
      update public.cleaner_earnings set status='processing',disbursement_id='a03c0203-0000-4000-8000-000000000004' where id='a03c0203-0000-4000-8000-000000000005';
      raise exception 'FAIL historical ledger reclaimed';
    exception when check_violation then
      if sqlerrm <> 'historical_payout_item_deferred' then raise; end if;
    end;
    raise exception 'ROLLBACK_VERIFIED_FAILURE_PROBE';
  exception when raise_exception then
    if sqlerrm <> 'ROLLBACK_VERIFIED_FAILURE_PROBE' then raise; end if;
  end;
end $$;
update public.cleaner_earnings set status='paid',paid_at=now() where id='a03c0203-0000-4000-8000-000000000005';
select public.mark_bookings_paid_for_earnings_disbursement('a03c0203-0000-4000-8000-000000000004');
do $$ begin
  if not exists(select 1 from public.cleaner_earnings ce join public.bookings b on b.id=ce.booking_id where ce.id='a03c0203-0000-4000-8000-000000000005' and ce.status='paid' and b.payout_status='paid') then raise exception 'FAIL ledger convergence'; end if;
  begin
    update public.cleaner_earnings set amount_cents=101 where id='a03c0203-0000-4000-8000-000000000005';
    raise exception 'FAIL ledger amount changed';
  exception when check_violation then
    if sqlerrm <> 'historical_payout_item_deferred' then raise; end if;
  end;
end $$;
rollback;
select 'PASS: historical provider failure/success/replay converge; missing evidence, amount and unrelated reference rejected; transaction rolled back' as evidence;
