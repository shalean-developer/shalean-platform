-- Read-only ops audits: cleaner ↔ auth linkage and stuck assigned lifecycle.
-- Run in SQL editor against staging/prod.

-- Cleaners missing Supabase auth linkage (realtime / RLS / me mapping).
select id, full_name, email, created_at
from public.cleaners
where auth_user_id is null
order by created_at desc nulls last
limit 500;

-- Bookings assigned to cleaners without auth_user_id (subscriptions / access risk).
select b.id, b.status, b.cleaner_response_status, b.cleaner_id, b.updated_at
from public.bookings b
left join public.cleaners c on c.id = b.cleaner_id
where b.cleaner_id is not null
  and c.auth_user_id is null
order by b.updated_at desc nulls last
limit 500;

-- Solo jobs stuck in assigned with no recent update (possible accept / sync failure).
select b.id, b.status, b.cleaner_response_status, b.dispatch_status, b.updated_at, b.date, b.time
from public.bookings b
where lower(trim(coalesce(b.status, ''))) = 'assigned'
  and coalesce(b.is_team_job, false) is false
  and b.updated_at < now() - interval '15 minutes'
order by b.updated_at asc nulls first
limit 500;
