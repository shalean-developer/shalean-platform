-- Refresh analytics MVs + populate daily rollup tables (called by cron RPC or pg_cron).

create or replace function public.refresh_analytics_materialized_views()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view public.mv_booking_funnel_daily;
  refresh materialized view public.mv_payment_conversion_daily;
end;
$$;

comment on function public.refresh_analytics_materialized_views() is
  'Non-concurrent MV refresh (transaction-safe). Schedule nightly after traffic dip.';

create or replace function public.populate_daily_analytics_rollups(p_day date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote_views int;
  v_payment_reached int;
  v_distinct_sessions int;
  v_pay_open int;
  v_book_done int;
  v_bc_direct int;
  v_starts int;
  v_completed int;
  v_pay_init int;
  v_pay_done int;
  v_abandon numeric;
begin
  select quote_views, payment_step_reached, distinct_sessions
    into v_quote_views, v_payment_reached, v_distinct_sessions
  from public.mv_booking_funnel_daily
  where day = p_day;

  select paystack_opened, booking_completed_events
    into v_pay_open, v_book_done
  from public.mv_payment_conversion_daily
  where day = p_day;

  select count(*)::int
    into v_bc_direct
  from public.user_events
  where (created_at at time zone 'UTC')::date = p_day
    and event_type = 'booking_completed';

  insert into public.daily_booking_funnel_metrics (
    day,
    quote_starts,
    payment_reached,
    booking_completed_signals,
    paystack_opened,
    paystack_completed,
    unique_sessions,
    updated_at
  )
  values (
    p_day,
    coalesce(v_quote_views, 0),
    coalesce(v_payment_reached, 0),
    coalesce(v_bc_direct, 0),
    coalesce(v_pay_open, 0),
    coalesce(v_book_done, 0),
    coalesce(v_distinct_sessions, 0),
    now()
  )
  on conflict (day) do update set
    quote_starts = excluded.quote_starts,
    payment_reached = excluded.payment_reached,
    booking_completed_signals = excluded.booking_completed_signals,
    paystack_opened = excluded.paystack_opened,
    paystack_completed = excluded.paystack_completed,
    unique_sessions = excluded.unique_sessions,
    updated_at = excluded.updated_at;

  select count(*)::int into v_starts
  from public.user_events
  where (created_at at time zone 'UTC')::date = p_day and event_type = 'booking_started';

  select count(*)::int into v_completed
  from public.user_events
  where (created_at at time zone 'UTC')::date = p_day and event_type = 'booking_completed';

  select count(*)::int into v_pay_init
  from public.user_events
  where (created_at at time zone 'UTC')::date = p_day and event_type = 'payment_initiated';

  select count(*)::int into v_pay_done
  from public.user_events
  where (created_at at time zone 'UTC')::date = p_day and event_type = 'payment_completed';

  insert into public.daily_conversion_metrics (
    day,
    booking_started,
    booking_completed,
    payment_initiated,
    payment_completed,
    updated_at
  )
  values (
    p_day,
    coalesce(v_starts, 0),
    coalesce(v_completed, 0),
    coalesce(v_pay_init, 0),
    coalesce(v_pay_done, 0),
    now()
  )
  on conflict (day) do update set
    booking_started = excluded.booking_started,
    booking_completed = excluded.booking_completed,
    payment_initiated = excluded.payment_initiated,
    payment_completed = excluded.payment_completed,
    updated_at = excluded.updated_at;

  v_abandon :=
    case
      when coalesce(v_pay_open, 0) > 0 then
        round(((v_pay_open - coalesce(v_book_done, 0))::numeric / v_pay_open::numeric) * 100, 2)
      else null
    end;

  insert into public.daily_payment_metrics (
    day,
    paystack_opened,
    payment_failed_signals,
    abandonment_pct,
    updated_at
  )
  values (
    p_day,
    coalesce(v_pay_open, 0),
    0,
    v_abandon,
    now()
  )
  on conflict (day) do update set
    paystack_opened = excluded.paystack_opened,
    payment_failed_signals = excluded.payment_failed_signals,
    abandonment_pct = excluded.abandonment_pct,
    updated_at = excluded.updated_at;
end;
$$;

comment on function public.populate_daily_analytics_rollups(date) is
  'Upserts daily_* rollup rows for one UTC calendar day (run after MV refresh).';

create or replace function public.run_analytics_warehouse_nightly()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yesterday date := (timezone('utc', now()))::date - 1;
begin
  perform public.refresh_analytics_materialized_views();
  perform public.populate_daily_analytics_rollups(v_yesterday);
end;
$$;

comment on function public.run_analytics_warehouse_nightly() is
  'Single entrypoint: refresh MVs + populate yesterday''s rollups (UTC).';

revoke all on function public.refresh_analytics_materialized_views() from public;
revoke all on function public.populate_daily_analytics_rollups(date) from public;
revoke all on function public.run_analytics_warehouse_nightly() from public;

grant execute on function public.refresh_analytics_materialized_views() to service_role;
grant execute on function public.populate_daily_analytics_rollups(date) to service_role;
grant execute on function public.run_analytics_warehouse_nightly() to service_role;

-- Optional: Supabase pg_cron (skip when extension missing).
do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not installed — schedule run_analytics_warehouse_nightly via Vercel POST /api/cron/analytics-warehouse';
    return;
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'analytics-warehouse-nightly';

  perform cron.schedule(
    'analytics-warehouse-nightly',
    '25 2 * * *',
    $$select public.run_analytics_warehouse_nightly();$$
  );
end;
$cron$;
