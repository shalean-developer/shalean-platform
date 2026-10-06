-- MASTER-01C-01: atomically enforce promotion telemetry global + client limits.
-- Forward migration: the original 20261006144500 migration is already applied and must remain immutable.

create or replace function public.consume_promotion_telemetry_limits(
  p_client_rate_key text,
  p_client_limit integer,
  p_global_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  reason text,
  retry_after_seconds integer,
  client_request_count integer,
  global_request_count integer
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_window interval;
  v_global_started timestamptz;
  v_global_count integer;
  v_client_started timestamptz;
  v_client_count integer;
begin
  if p_client_rate_key is null
     or p_client_rate_key not like 'client:%'
     or length(p_client_rate_key) > 128 then
    raise exception 'invalid client rate key';
  end if;
  if p_client_limit < 1 or p_client_limit > 100000 then
    raise exception 'invalid client rate limit';
  end if;
  if p_global_limit < 1 or p_global_limit > 100000 then
    raise exception 'invalid global rate limit';
  end if;
  if p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception 'invalid rate window';
  end if;

  v_window := make_interval(secs => p_window_seconds);

  -- Fast reject already-saturated global traffic before taking the advisory
  -- lock. This path is read-only and prevents rejected attack traffic from
  -- queueing database connections behind the serialized mutation boundary.
  select bucket.window_started_at, bucket.request_count
  into v_global_started, v_global_count
  from public.promotion_telemetry_rate_limit_buckets as bucket
  where bucket.rate_key = 'global';

  if found
     and v_global_started > v_now - v_window
     and v_global_count >= p_global_limit then
    allowed := false;
    reason := 'global';
    retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from ((v_global_started + v_window) - v_now)))::integer
    );
    client_request_count := null;
    global_request_count := v_global_count;
    return next;
    return;
  end if;

  -- Fast reject an already-saturated client before taking the advisory
  -- lock. This keeps repeated rejected traffic from one source off the
  -- serialized mutation path.
  select bucket.window_started_at, bucket.request_count
  into v_client_started, v_client_count
  from public.promotion_telemetry_rate_limit_buckets as bucket
  where bucket.rate_key = p_client_rate_key;

  if found
     and v_client_started > v_now - v_window
     and v_client_count >= p_client_limit then
    allowed := false;
    reason := 'client';
    retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from ((v_client_started + v_window) - v_now)))::integer
    );
    client_request_count := v_client_count;
    global_request_count := coalesce(v_global_count, 0);
    return next;
    return;
  end if;

  -- Admit at most one mutation transaction without queueing burst traffic.
  -- Requests that lose this race fail fast instead of occupying a database
  -- connection while waiting for the serialized limiter boundary.
  if not pg_try_advisory_xact_lock(
    hashtext('promotion_telemetry_rate_limit'),
    0
  ) then
    allowed := false;
    reason := 'busy';
    retry_after_seconds := 1;
    client_request_count := coalesce(v_client_count, 0);
    global_request_count := coalesce(v_global_count, 0);
    return next;
    return;
  end if;

  -- The fast prechecks are optimizations. Refresh time and recheck global
  -- saturation under the lock before touching any client bucket.
  v_now := clock_timestamp();
  v_global_started := null;
  v_global_count := null;

  select bucket.window_started_at, bucket.request_count
  into v_global_started, v_global_count
  from public.promotion_telemetry_rate_limit_buckets as bucket
  where bucket.rate_key = 'global';

  if found
     and v_global_started > v_now - v_window
     and v_global_count >= p_global_limit then
    allowed := false;
    reason := 'global';
    retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from ((v_global_started + v_window) - v_now)))::integer
    );
    client_request_count := null;
    global_request_count := v_global_count;
    return next;
    return;
  end if;

  -- Reject an already-saturated client without consuming global quota.
  -- Refresh the client snapshot under the same lock before any mutation.
  v_client_started := null;
  v_client_count := null;

  select bucket.window_started_at, bucket.request_count
  into v_client_started, v_client_count
  from public.promotion_telemetry_rate_limit_buckets as bucket
  where bucket.rate_key = p_client_rate_key;

  if found
     and v_client_started > v_now - v_window
     and v_client_count >= p_client_limit then
    allowed := false;
    reason := 'client';
    retry_after_seconds := greatest(
      1,
      ceil(extract(epoch from ((v_client_started + v_window) - v_now)))::integer
    );
    client_request_count := v_client_count;
    global_request_count := coalesce(v_global_count, 0);
    return next;
    return;
  end if;

  -- Both buckets have capacity under the same transaction lock.
  insert into public.promotion_telemetry_rate_limit_buckets as bucket (
    rate_key,
    window_started_at,
    request_count,
    updated_at
  )
  values (
    p_client_rate_key,
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
  returning bucket.request_count
  into v_client_count;

  insert into public.promotion_telemetry_rate_limit_buckets as bucket (
    rate_key,
    window_started_at,
    request_count,
    updated_at
  )
  values (
    'global',
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
  returning bucket.request_count
  into v_global_count;

  if v_global_count = 1 then
    delete from public.promotion_telemetry_rate_limit_buckets
    where rate_key like 'client:%'
      and updated_at < v_now - interval '1 day';
  end if;

  allowed := true;
  reason := null;
  retry_after_seconds := 0;
  client_request_count := v_client_count;
  global_request_count := v_global_count;
  return next;
end;
$function$;

revoke all on function public.consume_promotion_telemetry_limits(text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_promotion_telemetry_limits(text, integer, integer, integer)
  to service_role;


-- Rolling-deploy compatibility: old runtimes call the legacy RPC twice,
-- first with 'global' and then with a client:* key. Preserve atomic semantics by
-- making the global call read-only and delegating the client call to the new
-- combined RPC, which consumes both quotas in one transaction.
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
as $legacy$
declare
  v_now timestamptz := clock_timestamp();
  v_window interval;
  v_started timestamptz;
  v_count integer;
  v_combined record;
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

  if p_rate_key = 'global' then
    -- Old runtimes perform this call first. Keep it read-only so a later
    -- client rejection cannot consume global quota.
    select bucket.window_started_at, bucket.request_count
    into v_started, v_count
    from public.promotion_telemetry_rate_limit_buckets as bucket
    where bucket.rate_key = 'global';

    if found
       and v_started > v_now - v_window
       and v_count >= p_limit then
      allowed := false;
      retry_after_seconds := greatest(
        1,
        ceil(extract(epoch from ((v_started + v_window) - v_now)))::integer
      );
      request_count := v_count;
      return next;
      return;
    end if;

    allowed := true;
    retry_after_seconds := 0;
    request_count := coalesce(v_count, 0);
    return next;
    return;
  end if;

  if p_rate_key not like 'client:%' then
    raise exception 'invalid legacy rate key';
  end if;

  -- Old runtimes call this second with the client bucket. Delegate to the new
  -- combined limiter so client and global quotas are consumed atomically.
  select *
  into v_combined
  from public.consume_promotion_telemetry_limits(
    p_rate_key,
    p_limit,
    600,
    p_window_seconds
  );

  if v_combined.reason = 'busy' then
    allowed := false;
    retry_after_seconds := 1;
    request_count := coalesce(v_combined.client_request_count, 0);
    return next;
    return;
  end if;

  allowed := v_combined.allowed;
  retry_after_seconds := v_combined.retry_after_seconds;
  request_count := coalesce(v_combined.client_request_count, 0);
  return next;
end;
$legacy$;

revoke all on function public.consume_promotion_telemetry_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_promotion_telemetry_rate_limit(text, integer, integer)
  to service_role;
