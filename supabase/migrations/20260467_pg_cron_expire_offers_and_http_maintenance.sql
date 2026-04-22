-- ============================================================================
-- Supabase pg_cron: dispatch + maintenance (no Vercel Hobby cron limits)
-- ============================================================================
-- Flow:
--   1) Booking stays status = pending until assign path succeeds.
--   2) dispatch-cycle (*/5): SQL expire stale offers + enqueue retries / stranded rows.
--   3) retry-unassigned (*/10): pg_net → Next.js /api/cron/retry-failed-jobs (smart assign,
--      failed Paystack inserts, lifecycle retries). Replace YOUR_DOMAIN + YOUR_CRON_SECRET.
--
-- Optional Edge Function: if you outgrow HTTP to Vercel, point pg_net at the function URL
-- instead; keep the same Authorization pattern.
--
-- Replaces / extends: 20260439_move_crons_to_supabase_scheduler.sql job names on re-apply.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Optional audit / ops log (cron + dispatch SQL steps)
-- ---------------------------------------------------------------------------
create table if not exists public.dispatch_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  level text not null default 'info' check (level in ('debug', 'info', 'warn', 'error')),
  message text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dispatch_logs_created_at_idx
  on public.dispatch_logs (created_at desc);

comment on table public.dispatch_logs is
  'Dispatch/cron diagnostics: written from SQL maintenance functions; safe to truncate.';

alter table public.dispatch_logs enable row level security;

revoke all on public.dispatch_logs from public;
grant select, insert on public.dispatch_logs to service_role;

-- ---------------------------------------------------------------------------
-- Idempotent: expire stale pending dispatch_offers; enqueue retry for still-pending bookings.
-- (Former /api/cron/dispatch-offer-expiry DB behaviour.)
-- ---------------------------------------------------------------------------
create or replace function public.expire_pending_dispatch_offers(p_limit int default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expired bigint;
  v_enqueued bigint;
begin
  if p_limit is null or p_limit < 1 then
    p_limit := 100;
  end if;
  if p_limit > 500 then
    p_limit := 500;
  end if;

  with candidates as (
    select d.id, d.booking_id
    from public.dispatch_offers d
    where d.status = 'pending'
      and d.expires_at < now()
    order by d.expires_at asc
    limit p_limit
    for update skip locked
  ),
  expired as (
    update public.dispatch_offers d
    set
      status = 'expired',
      responded_at = now()
    from candidates c
    where d.id = c.id
      and d.status = 'pending'
    returning d.booking_id
  ),
  need as (
    select distinct e.booking_id
    from expired e
    inner join public.bookings b on b.id = e.booking_id
    where lower(trim(coalesce(b.status, ''))) = 'pending'
      and b.cleaner_id is null
  ),
  ins as (
    insert into public.dispatch_retry_queue (
      booking_id,
      retries_done,
      next_retry_at,
      status,
      last_reason,
      updated_at
    )
    select
      n.booking_id,
      1::smallint,
      now(),
      'pending',
      'offer_expired',
      now()
    from need n
    where not exists (
      select 1
      from public.dispatch_retry_queue q
      where q.booking_id = n.booking_id
        and q.status = 'pending'
    )
    returning id
  ),
  stats as (
    select
      (select count(*) from expired) as expired_n,
      (select count(*) from ins) as enqueued_n
  )
  select expired_n, enqueued_n into v_expired, v_enqueued from stats;

  return jsonb_build_object(
    'expired_offers', coalesce(v_expired, 0),
    'retry_enqueued', coalesce(v_enqueued, 0),
    'ran_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
exception
  when others then
    insert into public.dispatch_logs (source, level, message, context)
    values (
      'expire_pending_dispatch_offers',
      'error',
      sqlerrm,
      jsonb_build_object('sqlstate', sqlstate, 'p_limit', p_limit)
    );
    return jsonb_build_object('ok', false, 'error', sqlerrm, 'sqlstate', sqlstate);
end;
$$;

comment on function public.expire_pending_dispatch_offers(int) is
  'Expire pending dispatch_offers past expires_at; enqueue dispatch_retry_queue (retries_done=1). Duplicate-safe.';

revoke all on function public.expire_pending_dispatch_offers(int) from public;
grant execute on function public.expire_pending_dispatch_offers(int) to service_role;

-- ---------------------------------------------------------------------------
-- Enqueue pending bookings that have no active offer and no pending retry row
-- (prevents duplicate assignment work: unique partial index on dispatch_retry_queue).
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_stranded_pending_bookings(p_limit int default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted bigint;
begin
  if p_limit is null or p_limit < 1 then
    p_limit := 50;
  end if;
  if p_limit > 200 then
    p_limit := 200;
  end if;

  with picked as (
    select b.id as booking_id
    from public.bookings b
    where lower(trim(coalesce(b.status, ''))) = 'pending'
      and b.cleaner_id is null
      and b.location_id is not null
      and b.dispatch_status in ('searching', 'offered', 'failed')
      and not exists (
        select 1
        from public.dispatch_offers o
        where o.booking_id = b.id
          and o.status = 'pending'
      )
      and not exists (
        select 1
        from public.dispatch_retry_queue q
        where q.booking_id = b.id
          and q.status = 'pending'
      )
    order by b.created_at asc
    limit p_limit
  ),
  ins as (
    insert into public.dispatch_retry_queue (
      booking_id,
      retries_done,
      next_retry_at,
      status,
      last_reason,
      updated_at
    )
    select
      p.booking_id,
      0::smallint,
      now(),
      'pending',
      'stranded_pending',
      now()
    from picked p
    returning id
  )
  select count(*) into v_inserted from ins;

  return jsonb_build_object(
    'stranded_enqueued', coalesce(v_inserted, 0),
    'ran_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
exception
  when others then
    insert into public.dispatch_logs (source, level, message, context)
    values (
      'enqueue_stranded_pending_bookings',
      'error',
      sqlerrm,
      jsonb_build_object('sqlstate', sqlstate, 'p_limit', p_limit)
    );
    return jsonb_build_object('ok', false, 'error', sqlerrm, 'sqlstate', sqlstate);
end;
$$;

comment on function public.enqueue_stranded_pending_bookings(int) is
  'Queue pending unassigned bookings that have no pending offer and no pending retry row.';

revoke all on function public.enqueue_stranded_pending_bookings(int) from public;
grant execute on function public.enqueue_stranded_pending_bookings(int) to service_role;

-- ---------------------------------------------------------------------------
-- dispatch-cycle cron: SQL-only cadence (every 5 min)
-- ---------------------------------------------------------------------------
create or replace function public.run_dispatch_cycle()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expire jsonb;
  v_strand jsonb;
  v_out jsonb;
begin
  v_expire := public.expire_pending_dispatch_offers(200);
  v_strand := public.enqueue_stranded_pending_bookings(50);

  v_out := jsonb_build_object(
    'step', 'run_dispatch_cycle',
    'expire', coalesce(v_expire, '{}'::jsonb),
    'stranded', coalesce(v_strand, '{}'::jsonb),
    'ok',
    not (
      ((v_expire -> 'ok') is not null and (v_expire -> 'ok') = to_jsonb(false))
      or ((v_strand -> 'ok') is not null and (v_strand -> 'ok') = to_jsonb(false))
      or (v_expire ? 'error')
      or (v_strand ? 'error')
    )
  );

  insert into public.dispatch_logs (source, level, message, context)
  values ('run_dispatch_cycle', 'info', 'dispatch-cycle', v_out);

  return v_out;
exception
  when others then
    insert into public.dispatch_logs (source, level, message, context)
    values (
      'run_dispatch_cycle',
      'error',
      sqlerrm,
      jsonb_build_object('sqlstate', sqlstate)
    );
    return jsonb_build_object('ok', false, 'error', sqlerrm, 'sqlstate', sqlstate);
end;
$$;

comment on function public.run_dispatch_cycle() is
  'Cron dispatch-cycle: expire offers + enqueue stranded pending bookings. JS assign via retry-unassigned job.';

revoke all on function public.run_dispatch_cycle() from public;
grant execute on function public.run_dispatch_cycle() to service_role;

-- ---------------------------------------------------------------------------
-- retry-unassigned cron: trigger Next.js worker (smart assign + failed_jobs + lifecycle retries)
-- Replace YOUR_DOMAIN / YOUR_CRON_SECRET before production.
-- ---------------------------------------------------------------------------
create or replace function public.retry_unassigned_jobs()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req_id bigint;
begin
  select
    net.http_post(
      url := 'https://YOUR_DOMAIN/api/cron/retry-failed-jobs',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_CRON_SECRET'
      ),
      body := '{}'::jsonb
    )
  into v_req_id;

  insert into public.dispatch_logs (source, level, message, context)
  values (
    'retry_unassigned_jobs',
    'info',
    'triggered http retry-failed-jobs',
    jsonb_build_object('pg_net_request_id', v_req_id)
  );

  return jsonb_build_object(
    'ok', true,
    'pg_net_request_id', v_req_id,
    'ran_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
exception
  when others then
    insert into public.dispatch_logs (source, level, message, context)
    values (
      'retry_unassigned_jobs',
      'error',
      sqlerrm,
      jsonb_build_object('sqlstate', sqlstate)
    );
    return jsonb_build_object('ok', false, 'error', sqlerrm, 'sqlstate', sqlstate);
end;
$$;

comment on function public.retry_unassigned_jobs() is
  'Cron retry-unassigned: pg_net POST to /api/cron/retry-failed-jobs (processDispatchRetryQueue, etc.).';

revoke all on function public.retry_unassigned_jobs() from public;
grant execute on function public.retry_unassigned_jobs() to service_role;

-- Alias
create or replace function public.expire_old_offers()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.expire_pending_dispatch_offers(100);
$$;

revoke all on function public.expire_old_offers() from public;
grant execute on function public.expire_old_offers() to service_role;

-- ---------------------------------------------------------------------------
-- Unschedule legacy / duplicate names (idempotent re-apply)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select jobid, jobname
    from cron.job
    where jobname in (
      'booking-lifecycle-job',
      'retry-failed-jobs',
      'ai-optimize',
      'expire-dispatch-offers-sql',
      'shalean_expire_dispatch_offers',
      'shalean_retry_failed_jobs',
      'shalean_booking_lifecycle',
      'shalean_ai_optimize',
      'shalean_subscription_bookings',
      'dispatch-cycle',
      'retry-unassigned'
    )
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Core dispatch cadence (your naming)
-- ---------------------------------------------------------------------------

-- Every 5 minutes: SQL offer expiry + stranded booking enqueue
select cron.schedule(
  'dispatch-cycle',
  '*/5 * * * *',
  $$select public.run_dispatch_cycle();$$
);

-- Every 10 minutes: HTTP → Next (smart assign, dispatch_retry_queue, failed_jobs, lifecycle retries)
select cron.schedule(
  'retry-unassigned',
  '*/10 * * * *',
  $$select public.retry_unassigned_jobs();$$
);

-- ---------------------------------------------------------------------------
-- Other maintenance (still HTTP — Paystack / email / complex TS)
-- Replace YOUR_DOMAIN + YOUR_CRON_SECRET in SQL Editor if needed.
-- ---------------------------------------------------------------------------

select cron.schedule(
  'shalean_booking_lifecycle',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_DOMAIN/api/cron/booking-lifecycle',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_CRON_SECRET'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

select cron.schedule(
  'shalean_ai_optimize',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_DOMAIN/api/cron/ai-optimize',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_CRON_SECRET'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

select cron.schedule(
  'shalean_subscription_bookings',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_DOMAIN/api/cron/subscription-bookings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_CRON_SECRET'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
