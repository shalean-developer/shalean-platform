-- Weekly rollup into `dispatch_experiment_snapshots` (calendar week UTC, Monday start).
-- Default target week: the week that ended before the current ISO week (previous Monday 00:00 UTC → Sunday).

create or replace function public.refresh_dispatch_experiment_snapshots(p_week_start date default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week date;
  v_start timestamptz;
  v_end timestamptz;
  n int;
begin
  v_week := coalesce(
    p_week_start,
    ((date_trunc('week', timezone('utc', now())))::date - 7)
  );
  v_start := v_week::timestamp AT TIME ZONE 'UTC';
  v_end := (v_week + 7)::timestamp AT TIME ZONE 'UTC';

  insert into public.dispatch_experiment_snapshots (
    week_start,
    ux_variant,
    p95_time_to_accept_ms,
    accept_rate,
    offers_per_booking,
    resolved_offers
  )
  with b as (
    select o.*
    from public.dispatch_offers o
    where o.created_at >= v_start
      and o.created_at < v_end
      and o.ux_variant in ('control', 'sound_on', 'high_urgency', 'cta_v2')
  ),
  vars as (
    select unnest(array['control', 'sound_on', 'high_urgency', 'cta_v2']::text[]) as ux_variant
  ),
  agg as (
    select
      ux_variant,
      count(*) filter (where status in ('accepted', 'rejected', 'expired'))::bigint as resolved_n,
      count(*) filter (where status = 'accepted')::bigint as accepted_n,
      count(*) filter (where booking_id is not null)::double precision
        / nullif(count(distinct booking_id) filter (where booking_id is not null), 0)::double precision as opb_all
    from b
    group by ux_variant
  ),
  lat as (
    select
      ux_variant,
      percentile_disc(0.95) within group (
        order by extract(epoch from (responded_at - created_at)) * 1000.0
      ) as p95_ms
    from b
    where status = 'accepted'
      and responded_at is not null
      and created_at is not null
    group by ux_variant
  )
  select
    v_week,
    v.ux_variant,
    lat.p95_ms,
    case
      when coalesce(agg.resolved_n, 0) > 0 then agg.accepted_n::double precision / agg.resolved_n::double precision
    end as accept_rate,
    agg.opb_all,
    coalesce(agg.resolved_n, 0)::integer
  from vars v
  left join agg on agg.ux_variant = v.ux_variant
  left join lat on lat.ux_variant = v.ux_variant
  on conflict (week_start, ux_variant) do update set
    p95_time_to_accept_ms = excluded.p95_time_to_accept_ms,
    accept_rate = excluded.accept_rate,
    offers_per_booking = excluded.offers_per_booking,
    resolved_offers = excluded.resolved_offers;

  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.refresh_dispatch_experiment_snapshots(date) is
  'Upserts one row per ux_variant for the calendar week [p_week_start, p_week_start+7) UTC. Default p_week_start: previous ISO week Monday.';

revoke all on function public.refresh_dispatch_experiment_snapshots(date) from public;
grant execute on function public.refresh_dispatch_experiment_snapshots(date) to service_role;

do $$
declare
  r record;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;
  for r in
    select jobid
    from cron.job
    where jobname = 'refresh-dispatch-experiment-snapshots'
  loop
    perform cron.unschedule(r.jobid);
  end loop;
  perform cron.schedule(
    'refresh-dispatch-experiment-snapshots',
    '0 6 * * 1',
    'select public.refresh_dispatch_experiment_snapshots(null);'
  );
end
$$;
