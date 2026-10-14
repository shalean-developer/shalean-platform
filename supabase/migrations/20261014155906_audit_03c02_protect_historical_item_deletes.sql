-- Preserve deferred historical earnings during reassignment and synchronization.
begin;
create or replace function public.audit_03c02_guard_item_delete()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_date date;
begin
  select b.date::date into v_date from public.bookings b where b.id=OLD.booking_id for update;
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
  if TG_OP <> 'INSERT' then
    select b.date::date into v_date from public.bookings b where b.id=OLD.booking_id for update;
    if v_date is null or v_date < date '2026-10-01' then
      raise exception 'historical_payout_item_deferred' using errcode='23514';
    end if;
  end if;
  if TG_OP <> 'DELETE' then
    select b.date::date into v_date from public.bookings b where b.id=NEW.booking_id for update;
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
