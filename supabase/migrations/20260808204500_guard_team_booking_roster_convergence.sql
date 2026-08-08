-- P2 Allocation & Operations Source of Truth
-- Prevent a team booking header from committing with a booking_cleaners roster
-- that belongs to a different team/membership window.
--
-- The triggers are DEFERRABLE so assign_team_and_sync_roster can update the booking
-- header first and rebuild booking_cleaners later in the same transaction.

create or replace function public.assert_team_booking_roster_converged()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  v_membership_date date;
  v_start timestamptz;
  v_end timestamptz;
  v_roster_count integer;
  v_invalid_count integer;
begin
  if new.team_id is null or coalesce(new.is_team_job, false) is false then
    return new;
  end if;

  -- For UPDATE, only writes that can change team membership scope need re-checking.
  -- INSERT is always checked when the row is team-shaped.
  if tg_op = 'UPDATE'
     and new.team_id is not distinct from old.team_id
     and coalesce(new.is_team_job, false) = coalesce(old.is_team_job, false)
     and new.date is not distinct from old.date
     and new.assigned_at is not distinct from old.assigned_at then
    return new;
  end if;

  -- Match sync_booking_cleaners_for_team_booking: for past jobs assigned later,
  -- the effective membership day is the later of visit date and assignment date.
  v_membership_date := greatest(
    coalesce(new.date::date, (new.assigned_at at time zone 'UTC')::date),
    coalesce((new.assigned_at at time zone 'UTC')::date, new.date::date)
  );

  if v_membership_date is null then
    raise exception 'team booking % has no effective membership date', new.id
      using errcode = '23514';
  end if;

  v_start := (v_membership_date::text || ' 00:00:00+00')::timestamptz;
  v_end := (v_membership_date::text || ' 23:59:59.999+00')::timestamptz;

  select count(*)
    into v_roster_count
    from public.booking_cleaners bc
   where bc.booking_id = new.id;

  if v_roster_count = 0 then
    raise exception 'team booking % has no booking_cleaners roster after team assignment', new.id
      using errcode = '23514';
  end if;

  select count(*)
    into v_invalid_count
    from public.booking_cleaners bc
   where bc.booking_id = new.id
     and not exists (
       select 1
         from public.team_members tm
        where tm.team_id = new.team_id
          and tm.cleaner_id = bc.cleaner_id
          and (tm.active_from is null or tm.active_from <= v_end)
          and (tm.active_to is null or tm.active_to >= v_start)
     );

  if v_invalid_count > 0 then
    raise exception 'team booking % roster does not converge with team % (% incompatible cleaner row(s))',
      new.id, new.team_id, v_invalid_count
      using errcode = '23514';
  end if;

  return new;
end;
$fn$;

revoke all on function public.assert_team_booking_roster_converged() from public;

-- Constraint triggers fire at transaction end, after atomic roster-sync RPC work.
drop trigger if exists bookings_team_roster_convergence_guard_insert on public.bookings;
create constraint trigger bookings_team_roster_convergence_guard_insert
after insert on public.bookings
deferrable initially deferred
for each row
execute function public.assert_team_booking_roster_converged();

drop trigger if exists bookings_team_roster_convergence_guard_update on public.bookings;
create constraint trigger bookings_team_roster_convergence_guard_update
after update of team_id, is_team_job, date, assigned_at on public.bookings
deferrable initially deferred
for each row
execute function public.assert_team_booking_roster_converged();

-- Remove the earlier single-trigger name if this migration is re-run in an environment
-- where a draft version was applied during testing.
drop trigger if exists bookings_team_roster_convergence_guard on public.bookings;

comment on function public.assert_team_booking_roster_converged() is
  'P2 guard: team-shaped inserts and team_id/is_team_job/date/assigned_at changes must finish with a non-empty booking_cleaners roster whose cleaners belong to the assigned team on the effective membership date.';
