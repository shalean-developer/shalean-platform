-- AUDIT-03A02A: rollback-only PostgreSQL contract proof, using deployed source.
-- Run only on the approved staging project. No public table is written.
-- The function is cloned into pg_temp with ONLY its three relation bindings changed.
-- This proves database behavior and live source/schema compatibility, not browser UI behavior.
do $audit$
declare
  body text;
  checks integer := 0;
  scope integer;
  lock_case integer;
  rejected boolean;
  amount integer;
  bid uuid := '95100000-0000-4000-8000-000000000001';
  lead uuid := '95100000-0000-4000-8000-000000000002';
  member uuid := '95100000-0000-4000-8000-000000000003';
  child uuid := '95100000-0000-4000-8000-000000000004';
  run_id uuid := '95100000-0000-4000-8000-000000000005';
  result jsonb;
begin
  if to_regclass('pg_temp.audit951_bookings') is not null then
    raise exception 'Stale fixture exists; use a fresh connection';
  end if;
  select prosrc into strict body from pg_proc
  where oid='public.sync_pending_cleaner_earnings_from_booking_update()'::regprocedure;
  if md5(body) <> '90543fec6b406f6135d55660fc291293' then
    raise exception 'Deployed function differs from reviewed 17213bcd; no acceptance';
  end if;
  checks := checks + 1;
  begin
    create temporary table audit951_bookings as select * from public.bookings where false;
    create temporary table audit951_cleaner_earnings as select * from public.cleaner_earnings where false;
    create temporary table audit951_booking_cleaners as select * from public.booking_cleaners where false;
    create temporary table audit951_cleaner_payouts as select * from public.cleaner_payouts where false;
    body := replace(body,'public.cleaner_earnings','pg_temp.audit951_cleaner_earnings');
    body := replace(body,'public.booking_cleaners','pg_temp.audit951_booking_cleaners');
    body := replace(body,'public.cleaner_payouts','pg_temp.audit951_cleaner_payouts');
    if body like '%public.%' then raise exception 'Unmapped public relation'; end if;
    execute format('create function pg_temp.audit951_sync() returns trigger language plpgsql security invoker set search_path=pg_catalog as %L',body);
    create trigger audit951_sync after update of cleaner_earnings_total_cents,cleaner_id,payout_owner_cleaner_id
      on pg_temp.audit951_bookings for each row execute function pg_temp.audit951_sync();
    -- scope 0=solo, 1=paired non-team, 2=formal team.
    for scope in 0..2 loop
      for lock_case in 0..10 loop
        truncate pg_temp.audit951_bookings,pg_temp.audit951_cleaner_earnings,
          pg_temp.audit951_booking_cleaners,pg_temp.audit951_cleaner_payouts;
        insert into pg_temp.audit951_bookings(id,cleaner_id,payout_owner_cleaner_id,is_team_job,status,
          cleaner_line_earnings_finalized_at,cleaner_earnings_total_cents,payout_status,payout_run_id,payout_paid_at,payout_id)
        values(bid,lead,lead,scope=2,'completed',now(),26000,
          case when lock_case=4 then 'paid' else 'pending' end,
          case when lock_case=5 then run_id end,
          case when lock_case=6 then now() end,
          case when lock_case>=7 then child end);
        insert into pg_temp.audit951_cleaner_earnings(id,booking_id,cleaner_id,status,amount_cents,disbursement_id)
        values(run_id,bid,lead,case lock_case when 1 then 'approved' when 2 then 'paid' else 'pending' end,
          26000,case when lock_case=3 then child end);
        insert into pg_temp.audit951_booking_cleaners(booking_id,cleaner_id) values(bid,lead);
        if scope>0 then insert into pg_temp.audit951_booking_cleaners(booking_id,cleaner_id) values(bid,member); end if;
        if lock_case between 7 and 9 then
          insert into pg_temp.audit951_cleaner_payouts(id,status,payout_run_id,paid_at)
          values(child,case when lock_case=7 then 'paid' else 'pending' end,
            case when lock_case=8 then run_id end,case when lock_case=9 then now() end);
        end if;
        rejected := false;
        begin
          update pg_temp.audit951_bookings set cleaner_earnings_total_cents=52000 where id=bid;
        exception when sqlstate '55000' then rejected := true;
        end;
        if rejected is distinct from (lock_case>0) then
          raise exception 'Lock contract failed: scope %, lock %',scope,lock_case;
        end if;
        select amount_cents into strict amount from pg_temp.audit951_cleaner_earnings where booking_id=bid;
        if amount <> (case when scope=0 and lock_case=0 then 52000 else 26000 end) then
          raise exception 'Ledger amount contract failed: scope %, lock %',scope,lock_case;
        end if;
        checks := checks + 1;
      end loop;
    end loop;
    -- Database synchronization must never invent a missing solo ledger row.
    truncate pg_temp.audit951_cleaner_earnings,pg_temp.audit951_cleaner_payouts,pg_temp.audit951_booking_cleaners;
    insert into pg_temp.audit951_booking_cleaners(booking_id,cleaner_id) values(bid,lead);
    update pg_temp.audit951_bookings set is_team_job=false,payout_id=null,payout_status='pending',payout_run_id=null,payout_paid_at=null;
    update pg_temp.audit951_bookings set cleaner_earnings_total_cents=53000;
    if exists(select 1 from pg_temp.audit951_cleaner_earnings) then raise exception 'Unexpected ledger insertion'; end if;
    checks := checks + 1;
    result := jsonb_build_object('database_checks',checks,'deployed_source_hash','90543fec6b406f6135d55660fc291293',
      'relation_bindings','temporary_clones_only','public_rows_written',0,'browser_ui_verified',false);
    -- Roll back every fixture relation/function/row while retaining outer variables.
    raise exception using errcode='P0951',message='rollback successful fixture';
  exception when sqlstate 'P0951' then
    if result is null then raise exception 'Missing verification result'; end if;
  end;
  if to_regclass('pg_temp.audit951_bookings') is not null
    or exists(select 1 from pg_proc where pronamespace=pg_my_temp_schema() and proname='audit951_sync') then
    raise exception 'Fixture cleanup failed';
  end if;
  checks := checks + 1;
  perform set_config('audit951.proof',(result || jsonb_build_object('checks_including_cleanup',checks,'fixtures_rolled_back',true))::text,true);
end;
$audit$;
select current_setting('audit951.proof')::jsonb as paired_ledger_staging_contract;
