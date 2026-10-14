-- Validate final booking values after every BEFORE policy trigger. Preserve history
-- without preventing notes, completion timestamps, or verified provider convergence.
begin;
create or replace function public.audit_03c02_guard_final_booking_financials()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_keys text[] := array[
 'date','cleaner_id','payout_owner_cleaner_id','team_id','is_team_job','cleaner_count','team_member_count_snapshot',
 'cleaner_payout_cents','cleaner_bonus_cents','display_earnings_cents','internal_earnings_cents',
 'payout_earnings_cents','cleaner_earnings_total_cents','company_revenue_cents','payout_frozen_cents',
 'earnings_summary','cleaner_line_earnings_finalized_at','earnings_model_version','payout_percentage','payout_type',
 'earnings_percentage_applied','earnings_cap_cents_applied','earnings_tenure_months_at_assignment'];
 v_before jsonb; v_after jsonb;
begin
 if TG_OP='DELETE' then
   if OLD.date is null or OLD.date::date < date '2026-10-01' then
     raise exception 'historical_payout_item_deferred' using errcode='23514';
   end if;
   return OLD;
 end if;
 if TG_OP='INSERT' then
   if NEW.date is null or NEW.date::date < date '2026-10-01' then
     raise exception 'historical_payout_item_deferred' using errcode='23514';
   end if;
   return NEW;
 end if;
 select jsonb_object_agg(key,value) into v_before from jsonb_each(to_jsonb(OLD)) where key=any(v_keys);
 select jsonb_object_agg(key,value) into v_after from jsonb_each(to_jsonb(NEW)) where key=any(v_keys);
 if v_before is distinct from v_after and
   (OLD.date is null or OLD.date::date < date '2026-10-01' or NEW.date is null or NEW.date::date < date '2026-10-01') then
   raise exception 'historical_payout_item_deferred' using errcode='23514';
 end if;
 return NEW;
end; $$;
revoke all on function public.audit_03c02_guard_final_booking_financials() from public,anon,authenticated,service_role;
create trigger audit_03c02_final_booking_financials after insert or update on public.bookings
for each row execute function public.audit_03c02_guard_final_booking_financials();
create trigger audit_03c02_booking_delete_boundary before delete on public.bookings
for each row execute function public.audit_03c02_guard_final_booking_financials();

-- Check identity against both parents, even when amount and status are unchanged.
create or replace function public.audit_03c02_guard_financial_item_identity()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_booking uuid; v_date date; v_identity_changed boolean; v_old_booking uuid;
begin
 if TG_OP='INSERT' then
   v_identity_changed:=true;
 else
   v_old_booking:=OLD.booking_id;
   v_identity_changed := NEW.booking_id is distinct from OLD.booking_id
     or NEW.cleaner_id is distinct from OLD.cleaner_id
     or to_jsonb(NEW)->'team_id' is distinct from to_jsonb(OLD)->'team_id';
 end if;
 if not v_identity_changed then return NEW; end if;
 -- Consistent parent order prevents opposite-direction rekeys from deadlocking.
 for v_booking,v_date in
   select b.id,b.date::date from public.bookings b
   where b.id=NEW.booking_id or b.id=v_old_booking
   order by b.id for update
 loop
   if v_date is null or v_date < date '2026-10-01' then
     raise exception 'historical_payout_item_deferred' using errcode='23514';
   end if;
 end loop;
 if not exists(select 1 from public.bookings b where b.id=NEW.booking_id) then
   raise exception 'historical_payout_item_deferred' using errcode='23514';
 end if;
 return NEW;
end; $$;
revoke all on function public.audit_03c02_guard_financial_item_identity() from public,anon,authenticated,service_role;
create trigger audit_03c02_a_ledger_identity before insert or update on public.cleaner_earnings
for each row execute function public.audit_03c02_guard_financial_item_identity();
create trigger audit_03c02_a_roster_payout_identity before insert or update on public.booking_roster_member_payouts
for each row execute function public.audit_03c02_guard_financial_item_identity();
create trigger audit_03c02_a_team_payout_identity before insert or update on public.team_job_member_payouts
for each row execute function public.audit_03c02_guard_financial_item_identity();
-- Line-level and snapshot writes must obey the same parent boundary.
create or replace function public.audit_03c02_guard_detail_financials()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_old_booking uuid; v_new_booking uuid; v_date date; v_before jsonb; v_after jsonb;
begin
 if TG_OP<>'INSERT' then v_old_booking:=OLD.booking_id; end if;
 if TG_OP<>'DELETE' then v_new_booking:=NEW.booking_id; end if;
 if TG_OP='UPDATE' then
   if TG_TABLE_NAME='booking_line_items' then
     select jsonb_object_agg(key,value) into v_before from jsonb_each(to_jsonb(OLD))
       where key=any(array['booking_id','cleaner_earnings_cents','total_price_cents','unit_price_cents','quantity','earns_cleaner']);
     select jsonb_object_agg(key,value) into v_after from jsonb_each(to_jsonb(NEW))
       where key=any(array['booking_id','cleaner_earnings_cents','total_price_cents','unit_price_cents','quantity','earns_cleaner']);
   else
     v_before:=to_jsonb(OLD)-'updated_at'; v_after:=to_jsonb(NEW)-'updated_at';
   end if;
   if v_before is not distinct from v_after then return NEW; end if;
 end if;
 if TG_TABLE_NAME='booking_cleaner_earnings_snapshot_lines' and TG_OP<>'DELETE' then
   if not exists(select 1 from public.booking_line_items li where li.id=NEW.booking_line_item_id and li.booking_id=NEW.booking_id) then
     raise exception 'snapshot_line_booking_mismatch' using errcode='23514';
   end if;
 end if;
 perform b.id from public.bookings b where b.id in (v_old_booking,v_new_booking) order by b.id for update;
 if TG_OP='DELETE' and not found and pg_trigger_depth()>1 then return OLD; end if;
 if not exists(select 1 from public.bookings b where b.id=coalesce(v_new_booking,v_old_booking))
   or exists(select 1 from public.bookings b where b.id in (v_old_booking,v_new_booking)
     and (b.date is null or b.date::date < date '2026-10-01')) then
   raise exception 'historical_payout_item_deferred' using errcode='23514';
 end if;
 if TG_OP='DELETE' then return OLD; end if;
 return NEW;
end; $$;
revoke all on function public.audit_03c02_guard_detail_financials() from public,anon,authenticated,service_role;
create trigger audit_03c02_line_financials before insert or update or delete on public.booking_line_items
for each row execute function public.audit_03c02_guard_detail_financials();
create trigger audit_03c02_snapshot_financials before insert or update or delete on public.booking_cleaner_earnings_snapshot
for each row execute function public.audit_03c02_guard_detail_financials();
create trigger audit_03c02_snapshot_line_financials before insert or update or delete on public.booking_cleaner_earnings_snapshot_lines
for each row execute function public.audit_03c02_guard_detail_financials();
commit;
