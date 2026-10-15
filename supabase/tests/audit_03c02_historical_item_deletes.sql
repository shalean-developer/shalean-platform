-- Staging-only probes. No retained fixture writes.
begin;
select set_config('request.jwt.claim.role','service_role',true);
create temp table audit03c02_delete_probe(booking_id uuid);
create trigger probe_delete before delete on audit03c02_delete_probe
for each row execute function public.audit_03c02_guard_item_delete();
create temp table audit03c02_roster_probe(booking_id uuid,cleaner_id uuid,completed_at timestamptz);
create trigger probe_roster before insert or update or delete on audit03c02_roster_probe
for each row execute function public.audit_03c02_guard_booking_roster_mutation();
do $$
declare b uuid; c uuid; n integer;
begin
 select id into b from public.bookings where status='pending' and payout_id is null order by id limit 1;
 select id into c from public.cleaners order by id limit 1;
 if b is null or c is null then raise exception 'staging fixtures unavailable'; end if;
 select count(*) into n from pg_trigger where not tgisinternal and tgenabled='O' and tgname in ('audit_03c02_ledger_delete_boundary','audit_03c02_roster_delete_boundary','audit_03c02_team_delete_boundary');
 if n<>3 then raise exception 'FAIL missing production-table DELETE trigger'; end if;
 set constraints all immediate;
 alter table public.bookings disable trigger audit_03c02_final_booking_financials;
 update public.bookings set date='2026-10-01' where id=b;
 set constraints all immediate;
 alter table public.bookings enable trigger audit_03c02_final_booking_financials;
 insert into audit03c02_roster_probe(booking_id,cleaner_id) values(b,c);
 set constraints all immediate;
 alter table public.bookings disable trigger audit_03c02_final_booking_financials;
 update public.bookings set date='2026-09-30' where id=b;
 set constraints all immediate;
 alter table public.bookings enable trigger audit_03c02_final_booking_financials;
 begin
  insert into audit03c02_roster_probe(booking_id,cleaner_id) values(b,c);
  raise exception 'FAIL historical roster insert';
 exception when check_violation then if sqlerrm<>'historical_payout_item_deferred' then raise; end if; end;
 begin
  update audit03c02_roster_probe set cleaner_id='a03c0204-0000-4000-8000-000000000099';
  raise exception 'FAIL historical roster update';
 exception when check_violation then if sqlerrm<>'historical_payout_item_deferred' then raise; end if; end;
 begin
  delete from audit03c02_roster_probe;
  raise exception 'FAIL historical roster delete';
 exception when check_violation then if sqlerrm<>'historical_payout_item_deferred' then raise; end if; end;
 update audit03c02_roster_probe set completed_at=now();
 if not exists(select 1 from audit03c02_roster_probe where completed_at is not null) then raise exception 'FAIL operational completion blocked'; end if;
 if not exists(select 1 from pg_trigger where tgname='audit_03c02_booking_roster_boundary' and tgrelid='public.booking_cleaners'::regclass and tgenabled='O') then raise exception 'FAIL shared roster trigger missing'; end if;
 set constraints all immediate;
 alter table public.cleaner_earnings disable trigger audit_03c02_a_ledger_identity;

 insert into public.cleaner_earnings(id,booking_id,cleaner_id,amount_cents,status) values('a03c0204-0000-4000-8000-000000000001',b,c,100,'pending');
 set constraints all immediate;
 alter table public.cleaner_earnings enable trigger audit_03c02_a_ledger_identity;
 set constraints all immediate;
 alter table public.booking_roster_member_payouts disable trigger audit_03c02_a_roster_payout_identity;
 insert into public.booking_roster_member_payouts(id,booking_id,cleaner_id,payout_cents,bonus_cents,status) values('a03c0204-0000-4000-8000-000000000002',b,c,100,0,'pending');
 set constraints all immediate;
 alter table public.booking_roster_member_payouts enable trigger audit_03c02_a_roster_payout_identity;
 if not exists(select 1 from pg_trigger where tgname='audit_03c02_cleaner_tenure' and tgrelid='public.cleaners'::regclass and tgenabled='O') then raise exception 'FAIL cleaner tenure guard missing'; end if;
 begin
  update public.cleaners set joined_at=coalesce(joined_at,created_at)+interval '1 day' where id=c;
  raise exception 'FAIL historical cleaner tenure changed';
 exception when check_violation then if sqlerrm<>'historical_cleaner_tenure_deferred' then raise; end if; end;
 update public.cleaners set joined_at=joined_at where id=c;
 begin
  update public.cleaner_earnings set status='approved',approved_at=now() where id='a03c0204-0000-4000-8000-000000000001';
  raise exception 'FAIL historical ledger approved';
 exception when check_violation then if sqlerrm<>'historical_payout_item_deferred' then raise; end if; end;
 begin
  update public.cleaner_earnings set amount_cents=999 where id='a03c0204-0000-4000-8000-000000000001';
  raise exception 'FAIL historical ledger amount changed';
 exception when check_violation then if sqlerrm<>'historical_payout_item_deferred' then raise; end if; end;
 begin
  update public.cleaner_earnings set approved_at=now() where id='a03c0204-0000-4000-8000-000000000001';
  raise exception 'FAIL historical ledger approval metadata changed';
 exception when check_violation then if sqlerrm<>'historical_payout_item_deferred' then raise; end if; end;
 begin
  delete from public.cleaner_earnings where id='a03c0204-0000-4000-8000-000000000001';
  raise exception 'FAIL historical ledger deleted';
 exception when check_violation then if sqlerrm<>'historical_payout_item_deferred' then raise; end if; end;
 begin
  delete from public.booking_roster_member_payouts where id='a03c0204-0000-4000-8000-000000000002';
  raise exception 'FAIL historical roster deleted';
 exception when check_violation then if sqlerrm<>'historical_payout_item_deferred' then raise; end if; end;
 insert into public.teams(id,name,service_type,capacity_per_day,is_active) values('a03c0204-0000-4000-8000-000000000003','AUDIT03C02 disposable team','deep',1,false);
 set constraints all immediate;
 alter table public.team_job_member_payouts disable trigger audit_03c02_a_team_payout_identity;
 insert into public.team_job_member_payouts(id,booking_id,team_id,cleaner_id,payout_cents,status) values('a03c0204-0000-4000-8000-000000000004',b,'a03c0204-0000-4000-8000-000000000003',c,100,'pending');
 set constraints all immediate;
 alter table public.team_job_member_payouts enable trigger audit_03c02_a_team_payout_identity;
 begin
  delete from public.team_job_member_payouts where id='a03c0204-0000-4000-8000-000000000004';
  raise exception 'FAIL historical team item deleted';
 exception when check_violation then if sqlerrm<>'historical_payout_item_deferred' then raise; end if; end;
 begin
  update public.bookings set display_earnings_cents=coalesce(display_earnings_cents,0)+1 where id=b;
  raise exception 'FAIL historical display earnings changed';
 exception when check_violation then if sqlerrm<>'historical_payout_item_deferred' then raise; end if; end;
 begin
  update public.cleaner_earnings set cleaner_id='a03c0204-0000-4000-8000-000000000099' where id='a03c0204-0000-4000-8000-000000000001';
  raise exception 'FAIL historical ledger identity changed';
 exception when check_violation then if sqlerrm<>'historical_payout_item_deferred' then raise; end if; end;
 insert into audit03c02_delete_probe values(b);
 begin
  delete from audit03c02_delete_probe;
  raise exception 'FAIL historical shared delete guard';
 exception when check_violation then if sqlerrm<>'historical_payout_item_deferred' then raise; end if; end;
 set constraints all immediate;
 alter table public.bookings disable trigger audit_03c02_final_booking_financials;
 update public.bookings set date='2026-10-01' where id=b;
 set constraints all immediate;
 alter table public.bookings enable trigger audit_03c02_final_booking_financials;
 delete from public.cleaner_earnings where id='a03c0204-0000-4000-8000-000000000001';
 delete from public.booking_roster_member_payouts where id='a03c0204-0000-4000-8000-000000000002';
 delete from public.team_job_member_payouts where id='a03c0204-0000-4000-8000-000000000004';
 delete from audit03c02_delete_probe;
 if exists(select 1 from public.cleaner_earnings where id='a03c0204-0000-4000-8000-000000000001') or exists(select 1 from audit03c02_delete_probe) then raise exception 'FAIL forward pending delete blocked'; end if;
 insert into audit03c02_delete_probe values(null);
 begin
  delete from audit03c02_delete_probe;
  raise exception 'FAIL undated delete accepted';
 exception when check_violation then if sqlerrm<>'historical_payout_item_deferred' then raise; end if; end;
end $$;
rollback;
select 'PASS: historical ledger/roster/team deletes and unknown-date deletion rejected; shared team guard installed; forward pending deletes allowed; fixtures rolled back' evidence;
