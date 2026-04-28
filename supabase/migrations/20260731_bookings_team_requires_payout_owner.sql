-- Deterministic payroll owner for every team booking (booking row = one owner; per-member splits live in team_job_member_payouts).
update public.bookings b
set payout_owner_cleaner_id = x.lead_id
from (
  select distinct on (b2.id)
    b2.id,
    tm.cleaner_id as lead_id
  from public.bookings b2
  inner join public.team_members tm on tm.team_id = b2.team_id and tm.cleaner_id is not null
  where b2.is_team_job = true
    and b2.team_id is not null
    and b2.payout_owner_cleaner_id is null
  order by b2.id, tm.cleaner_id asc
) x
where b.id = x.id;

alter table public.bookings drop constraint if exists bookings_team_has_payout_owner;
alter table public.bookings
  add constraint bookings_team_has_payout_owner
  check (
    is_team_job is not true
    or payout_owner_cleaner_id is not null
  );

comment on constraint bookings_team_has_payout_owner on public.bookings is
  'Team jobs must have a canonical payout_owner_cleaner_id for admin grouping and invariants.';
