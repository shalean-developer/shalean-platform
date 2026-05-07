-- Read-only audits for cleaner lifecycle / earnings (run in SQL editor against staging/prod).
-- Adjust schema if your branch differs.

-- 1) Completed rows missing display earnings (violates CHECK if any slipped past app guard)
select id, status, display_earnings_cents, cleaner_id, payout_owner_cleaner_id, is_team_job, team_id, service, date
from public.bookings
where lower(trim(coalesce(status, ''))) = 'completed'
  and display_earnings_cents is null
order by completed_at desc nulls last
limit 200;

-- 2) Distinct booking statuses (expect assigned, confirmed, in_progress, completed, cancelled, failed, … — not ad-hoc "on_my_way")
select lower(trim(coalesce(status, ''))) as status_norm, count(*) as n
from public.bookings
group by 1
order by n desc;

-- 3) Team jobs: payout owner not on team_members (DB trigger `bookings_trg_ensure_payout_owner_in_team` rejects updates)
select b.id, b.team_id, b.payout_owner_cleaner_id, b.status
from public.bookings b
where b.is_team_job is true
  and b.team_id is not null
  and b.payout_owner_cleaner_id is not null
  and not exists (
    select 1
    from public.team_members tm
    where tm.team_id = b.team_id
      and tm.cleaner_id = b.payout_owner_cleaner_id
  )
limit 200;
