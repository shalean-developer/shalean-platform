-- MASTER-01C-01: shared promotion telemetry rate-limit state.
-- Keeps anonymous promotion telemetry bounded across all app/serverless instances.

create table if not exists public.promotion_telemetry_rate_limit_buckets (
  rate_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.promotion_telemetry_rate_limit_buckets enable row level security;

revoke all on table public.promotion_telemetry_rate_limit_buckets from public, anon, authenticated;
grant select, insert, update, delete on table public.promotion_telemetry_rate_limit_buckets to service_role;

create or replace function public.consume_promotion_telemetry_rate_limit(
  p_rate_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  request_count integer
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_window interval;
  v_started timestamptz;
  v_count integer;
begin
  if p_rate_key is null or length(p_rate_key) = 0 or length(p_rate_key) > 128 then
    raise exception 'invalid rate key';
  end if;
  if p_limit < 1 or p_limit > 100000 then
    raise exception 'invalid rate limit';
  end if;
  if p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception 'invalid rate window';
  end if;

  v_window := make_interval(secs => p_window_seconds);

  insert into public.promotion_telemetry_rate_limit_buckets as bucket (
    rate_key,
    window_started_at,
    request_count,
    updated_at
  )
  values (
    p_rate_key,
    v_now,
    1,
    v_now
  )
  on conflict (rate_key) do update
  set
    window_started_at = case
      when bucket.window_started_at <= v_now - v_window then v_now
      else bucket.window_started_at
    end,
    request_count = case
      when bucket.window_started_at <= v_now - v_window then 1
      else bucket.request_count + 1
    end,
    updated_at = v_now
  returning
    promotion_telemetry_rate_limit_buckets.window_started_at,
    promotion_telemetry_rate_limit_buckets.request_count
  into v_started, v_count;

  allowed := v_count <= p_limit;
  retry_after_seconds := case
    when allowed then 0
    else greatest(
      1,
      ceil(extract(epoch from ((v_started + v_window) - v_now)))::integer
    )
  end;
  request_count := v_count;

  return next;
end;
$function$;

revoke all on function public.consume_promotion_telemetry_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_promotion_telemetry_rate_limit(text, integer, integer)
  to service_role;
