-- Team payout owner must be on the team roster (prevents orphan owners).
create or replace function public.bookings_trg_ensure_payout_owner_in_team()
returns trigger
language plpgsql
as $fn$
begin
  if new.is_team_job is true
     and new.team_id is not null
     and new.payout_owner_cleaner_id is not null then
    if not exists (
      select 1
      from public.team_members tm
      where tm.team_id = new.team_id
        and tm.cleaner_id = new.payout_owner_cleaner_id
    ) then
      raise exception 'payout_owner_cleaner_id must exist in team_members for team_id %', new.team_id;
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_bookings_ensure_payout_owner_in_team on public.bookings;
create trigger trg_bookings_ensure_payout_owner_in_team
  before insert or update on public.bookings
  for each row
  execute procedure public.bookings_trg_ensure_payout_owner_in_team();

-- Once eligible or paid, frozen cleaner amount must not drift.
create or replace function public.bookings_trg_payout_frozen_immutable_after_eligible()
returns trigger
language plpgsql
as $fn$
declare
  prev text;
begin
  if tg_op <> 'update' then
    return new;
  end if;
  prev := lower(coalesce(old.payout_status::text, ''));
  if prev in ('eligible', 'paid') then
    if new.payout_frozen_cents is distinct from old.payout_frozen_cents then
      raise exception 'payout_frozen_cents is immutable once payout_status is eligible or paid (booking %)', old.id;
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_bookings_payout_frozen_immutable_after_eligible on public.bookings;
create trigger trg_bookings_payout_frozen_immutable_after_eligible
  before update on public.bookings
  for each row
  execute procedure public.bookings_trg_payout_frozen_immutable_after_eligible();
