-- Preserve deferred historical earnings during reassignment and synchronization.
begin;
-- A strict canonical parser matches application date policy. Invalid/undated visits are deferred.
create or replace function public.audit_03c02_trim(p_value text)
returns text language sql immutable set search_path=pg_catalog as $$
 select btrim(p_value,E' \t\n\r\f' || U&'\000B\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
$$;
revoke all on function public.audit_03c02_trim(text) from public,anon,authenticated,service_role;
create or replace function public.audit_03c02_visit_date(p_value text)
returns date language plpgsql immutable set search_path=pg_catalog as $$
declare value text:=public.audit_03c02_trim(p_value); parsed date;
begin
 if value is null or value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null; end if;
 begin parsed:=value::date;
 exception when invalid_datetime_format or datetime_field_overflow then return null; end;
 return parsed;
end; $$;
revoke all on function public.audit_03c02_visit_date(text) from public,anon,authenticated,service_role;
create or replace function public.audit_03c02_guard_item_delete()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_date date;
begin
  select coalesce(public.audit_03c02_visit_date(b.date::text),date '-infinity') into v_date from public.bookings b where b.id=OLD.booking_id for update;
  -- Parent DELETE is fenced before any FK cascade; no parent is visible during a valid cascade.
  if not found and pg_trigger_depth()>1 then return OLD; end if;
  if v_date is null or v_date < date '2026-10-01' then
    raise exception 'historical_payout_item_deferred' using errcode='23514';
  end if;
  return OLD;
end; $$;
revoke all on function public.audit_03c02_guard_item_delete() from public,anon,authenticated,service_role;
create trigger audit_03c02_ledger_delete_boundary before delete on public.cleaner_earnings
for each row execute function public.audit_03c02_guard_item_delete();
create trigger audit_03c02_roster_delete_boundary before delete on public.booking_roster_member_payouts
for each row execute function public.audit_03c02_guard_item_delete();
create trigger audit_03c02_team_delete_boundary before delete on public.team_job_member_payouts
for each row execute function public.audit_03c02_guard_item_delete();
-- Shared RPCs are atomic: reject roster mutation before its first row change,
-- so direct admin and recurring callers cannot desynchronize historical attribution.
create or replace function public.audit_03c02_guard_booking_roster_mutation()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_date date;
begin
  if TG_OP='UPDATE' and
    (to_jsonb(NEW)->'booking_id',to_jsonb(NEW)->'cleaner_id',to_jsonb(NEW)->'role',to_jsonb(NEW)->'payout_weight',to_jsonb(NEW)->'lead_bonus_cents',to_jsonb(NEW)->'source')
    is not distinct from
    (to_jsonb(OLD)->'booking_id',to_jsonb(OLD)->'cleaner_id',to_jsonb(OLD)->'role',to_jsonb(OLD)->'payout_weight',to_jsonb(OLD)->'lead_bonus_cents',to_jsonb(OLD)->'source') then
    return NEW;
  end if;
  if TG_OP <> 'INSERT' then
    select coalesce(public.audit_03c02_visit_date(b.date::text),date '-infinity') into v_date from public.bookings b where b.id=OLD.booking_id for update;
    if TG_OP='DELETE' and not found and pg_trigger_depth()>1 then return OLD; end if;
    if v_date is null or v_date < date '2026-10-01' then
      raise exception 'historical_payout_item_deferred' using errcode='23514';
    end if;
  end if;
  if TG_OP <> 'DELETE' then
    select coalesce(public.audit_03c02_visit_date(b.date::text),date '-infinity') into v_date from public.bookings b where b.id=NEW.booking_id for update;
    if v_date is null or v_date < date '2026-10-01' then
      raise exception 'historical_payout_item_deferred' using errcode='23514';
    end if;
    return NEW;
  end if;
  return OLD;
end; $$;
revoke all on function public.audit_03c02_guard_booking_roster_mutation() from public,anon,authenticated,service_role;
create trigger audit_03c02_booking_roster_boundary before insert or update or delete on public.booking_cleaners
for each row execute function public.audit_03c02_guard_booking_roster_mutation();
commit;
