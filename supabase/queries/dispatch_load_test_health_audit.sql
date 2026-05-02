-- Dispatch load-test health audit (run on the SAME Supabase project as apps/web).
-- After running, apply Step 8 scoring in your runbook (penalties are manual from counts below).

-- ---------------------------------------------------------------------------
-- Assigned cohort (24h) — use assigned_at when the column exists; else updated_at
-- ---------------------------------------------------------------------------
-- Uses updated_at so it runs on DBs without assigned_at; if you have assigned_at, prefer:
--   and assigned_at > now() - interval '24 hours'
select count(*)::bigint as assigned_bookings_24h
from public.bookings
where status = 'assigned'
  and cleaner_id is not null
  and updated_at > now() - interval '24 hours';

-- ---------------------------------------------------------------------------
-- Step 1 — single winner (must return zero rows on both)
-- ---------------------------------------------------------------------------
select booking_id, count(*)::bigint as accepted_rows
from public.dispatch_offers
where status = 'accepted'
group by booking_id
having count(*) > 1;

select booking_id, count(distinct cleaner_id)::bigint as accepted_cleaners
from public.dispatch_offers
where status = 'accepted'
group by booking_id
having count(distinct cleaner_id) > 1;

-- ---------------------------------------------------------------------------
-- Step 2 — offer lifecycle (last 24h)
-- ---------------------------------------------------------------------------
select status, count(*)::bigint as cnt
from public.dispatch_offers
where created_at > now() - interval '24 hours'
group by status
order by cnt desc;

-- ---------------------------------------------------------------------------
-- Step 3 — accept latency KPI (last 24h)
-- ---------------------------------------------------------------------------
select
  percentile_cont(0.5) within group (order by time_to_accept_ms) as p50_ms,
  percentile_cont(0.95) within group (order by time_to_accept_ms) as p95_ms,
  count(*)::bigint as sample_size
from public.dispatch_metrics
where created_at > now() - interval '24 hours';

-- ---------------------------------------------------------------------------
-- Step 3b — assignment wall-clock (only when assigned_at exists)
-- ---------------------------------------------------------------------------
select
  o.booking_id,
  min(o.created_at) as first_offer_at,
  b.assigned_at,
  extract(epoch from (b.assigned_at - min(o.created_at))) as seconds_to_assign
from public.dispatch_offers o
join public.bookings b on b.id = o.booking_id
where b.status = 'assigned'
  and b.assigned_at is not null
group by o.booking_id, b.assigned_at
order by seconds_to_assign desc nulls last;

-- ---------------------------------------------------------------------------
-- Step 4 — orphan accepted
-- ---------------------------------------------------------------------------
select count(*)::bigint as orphan_accepted
from public.dispatch_offers o
join public.bookings b on b.id = o.booking_id
where o.status = 'accepted'
  and (
    b.status <> 'assigned'
    or b.cleaner_id is distinct from o.cleaner_id
  );

-- ---------------------------------------------------------------------------
-- Step 5 — SMS duplication (notification_logs has NO cleaner_id column)
-- ---------------------------------------------------------------------------
select
  booking_id,
  payload->>'cleaner_id' as cleaner_id,
  count(*)::bigint as sms_count
from public.notification_logs
where event_type = 'dispatch_offer'
  and template_key = 'dispatch_offer_link'
  and channel = 'sms'
  and status = 'sent'
  and created_at > now() - interval '24 hours'
group by booking_id, payload->>'cleaner_id'
having count(*) > 1;

-- If event_type column is missing on an old DB, use template + channel only:
-- select booking_id, payload->>'cleaner_id' as cleaner_id, count(*)::bigint as sms_count
-- from public.notification_logs
-- where template_key = 'dispatch_offer_link'
--   and channel = 'sms'
--   and status = 'sent'
--   and created_at > now() - interval '24 hours'
-- group by booking_id, payload->>'cleaner_id'
-- having count(*) > 1;

-- ---------------------------------------------------------------------------
-- Step 6 — cleaner offer volume (10m) — compare max to DISPATCH_OFFER_NOTIFY_MAX_PER_10M (code default 3)
-- ---------------------------------------------------------------------------
select cleaner_id, count(*)::bigint as offers_last_10m
from public.dispatch_offers
where created_at > now() - interval '10 minutes'
group by cleaner_id
order by offers_last_10m desc
limit 50;

-- ---------------------------------------------------------------------------
-- Step 6b — stale pending (expires_at passed but still pending; expiry path suspect)
-- ---------------------------------------------------------------------------
select count(*)::bigint as stale_pending_offers
from public.dispatch_offers
where status = 'pending'
  and expires_at < now()
  and created_at > now() - interval '24 hours';

-- ---------------------------------------------------------------------------
-- Step 7 — retry queue
-- ---------------------------------------------------------------------------
select status, count(*)::bigint as cnt
from public.dispatch_retry_queue
group by status;

-- ---------------------------------------------------------------------------
-- Assignment without any accepted dispatch offer (should be 0 for marketplace soft-dispatch)
-- (Do NOT use `left join ... o.status != 'accepted'` — that flags unrelated offer rows.)
-- ---------------------------------------------------------------------------
select count(*)::bigint as assigned_without_accepted_offer
from public.bookings b
where b.status = 'assigned'
  and b.cleaner_id is not null
  and coalesce(b.is_team_job, false) = false
  and not exists (
    select 1
    from public.dispatch_offers o
    where o.booking_id = b.id
      and o.status = 'accepted'
  );
