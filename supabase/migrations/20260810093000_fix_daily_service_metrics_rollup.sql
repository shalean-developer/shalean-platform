-- Populate the previously empty daily_service_metrics rollup and backfill history.
--
-- booking_starts is sourced from user_events when a service can be resolved
-- from event payload or linked booking. Historical catalog-level starts that
-- did not carry a service remain intentionally unattributed rather than being
-- assigned to a misleading "unknown" service bucket.
-- completions are attributed through the linked booking where available.
-- revenue_zar uses settled booking amounts on the settlement day.

create or replace function public.populate_daily_analytics_rollups(p_day date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    day, quote_starts, payment_reached, booking_completed_signals,
    paystack_opened, paystack_completed, unique_sessions, updated_at
  ) values (
    p_day, coalesce(v_quote_views, 0), coalesce(v_payment_reached, 0),
    coalesce(v_bc_direct, 0), coalesce(v_pay_open, 0), coalesce(v_book_done, 0),
    coalesce(v_distinct_sessions, 0), now()
  ) on conflict (day) do update set
    quote_starts = excluded.quote_starts,
    payment_reached = excluded.payment_reached,
    booking_completed_signals = excluded.booking_completed_signals,
    paystack_opened = excluded.paystack_opened,
    paystack_completed = excluded.paystack_completed,
    unique_sessions = excluded.unique_sessions,
    updated_at = excluded.updated_at;

  select count(*)::int into v_starts from public.user_events
  where (created_at at time zone 'UTC')::date = p_day and event_type = 'booking_started';
  select count(*)::int into v_completed from public.user_events
  where (created_at at time zone 'UTC')::date = p_day and event_type = 'booking_completed';
  select count(*)::int into v_pay_init from public.user_events
  where (created_at at time zone 'UTC')::date = p_day and event_type = 'payment_initiated';
  select count(*)::int into v_pay_done from public.user_events
  where (created_at at time zone 'UTC')::date = p_day and event_type = 'payment_completed';

  insert into public.daily_conversion_metrics (
    day, booking_started, booking_completed, payment_initiated, payment_completed, updated_at
  ) values (
    p_day, coalesce(v_starts, 0), coalesce(v_completed, 0),
    coalesce(v_pay_init, 0), coalesce(v_pay_done, 0), now()
  ) on conflict (day) do update set
    booking_started = excluded.booking_started,
    booking_completed = excluded.booking_completed,
    payment_initiated = excluded.payment_initiated,
    payment_completed = excluded.payment_completed,
    updated_at = excluded.updated_at;

  v_abandon := case
    when coalesce(v_pay_open, 0) > 0 then
      round(((v_pay_open - coalesce(v_book_done, 0))::numeric / v_pay_open::numeric) * 100, 2)
    else null
  end;

  insert into public.daily_payment_metrics (
    day, paystack_opened, payment_failed_signals, abandonment_pct, updated_at
  ) values (
    p_day, coalesce(v_pay_open, 0), 0, v_abandon, now()
  ) on conflict (day) do update set
    paystack_opened = excluded.paystack_opened,
    payment_failed_signals = excluded.payment_failed_signals,
    abandonment_pct = excluded.abandonment_pct,
    updated_at = excluded.updated_at;

  delete from public.daily_service_metrics where day = p_day;

  with event_metrics as (
    select
      coalesce(
        nullif(ue.payload ->> 'service_type', ''),
        nullif(ue.payload ->> 'service_slug', ''),
        nullif(b.service_slug, ''),
        nullif(b.service, '')
      ) as service_slug,
      count(*) filter (where ue.event_type = 'booking_started')::int as booking_starts,
      count(*) filter (where ue.event_type = 'booking_completed')::int as completions
    from public.user_events ue
    left join public.bookings b on b.id = ue.booking_id
    where (ue.created_at at time zone 'UTC')::date = p_day
      and ue.event_type in ('booking_started', 'booking_completed')
    group by 1
  ), revenue_metrics as (
    select
      coalesce(nullif(b.service_slug, ''), nullif(b.service, '')) as service_slug,
      sum(coalesce(
        b.total_paid_cents,
        b.amount_paid_cents,
        round(coalesce(b.total_price, 0) * 100)::int,
        0
      ))::numeric / 100 as revenue_zar
    from public.bookings b
    where coalesce(
      (b.paid_at at time zone 'UTC')::date,
      (b.payment_completed_at at time zone 'UTC')::date,
      (b.created_at at time zone 'UTC')::date
    ) = p_day
      and coalesce(b.payment_status, '') in ('success', 'paid')
    group by 1
  ), service_rollup as (
    select
      coalesce(e.service_slug, r.service_slug) as service_slug,
      coalesce(e.booking_starts, 0) as booking_starts,
      coalesce(e.completions, 0) as completions,
      coalesce(r.revenue_zar, 0) as revenue_zar
    from event_metrics e
    full join revenue_metrics r using (service_slug)
  )
  insert into public.daily_service_metrics (
    day, service_slug, booking_starts, completions, revenue_zar, updated_at
  )
  select p_day, service_slug, booking_starts, completions, revenue_zar, now()
  from service_rollup
  where service_slug is not null;
end;
$function$;

-- Backfill every date for which the analytics warehouse has source data.
-- Refresh first because some non-production databases keep the MVs unpopulated.
do $backfill$
declare
  v_start date;
  v_end date := (timezone('utc', now()))::date;
  v_day date;
begin
  perform public.refresh_analytics_materialized_views();

  select least(
    coalesce((select min((ue.created_at at time zone 'UTC')::date) from public.user_events ue), v_end),
    coalesce((select min((b.created_at at time zone 'UTC')::date) from public.bookings b), v_end)
  ) into v_start;

  if v_start is null then
    return;
  end if;

  for v_day in select generate_series(v_start, v_end, interval '1 day')::date
  loop
    perform public.populate_daily_analytics_rollups(v_day);
  end loop;
end;
$backfill$;
