-- User-selected checkout bookings use status `pending_assignment` until a dispatch offer is accepted.
-- Align SQL recovery / retry enqueue with app logic (redispatchAfterOfferReject, acceptDispatchOffer).

create or replace function public.list_bookings_due_user_selected_recovery(
  p_max_attempts integer,
  p_limit integer,
  p_offset integer default 0
) returns table (
  id uuid,
  selected_cleaner_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.selected_cleaner_id
  from public.bookings b
  where lower(trim(coalesce(b.status, ''))) in ('pending', 'pending_assignment', 'offered')
    and b.cleaner_id is null
    and b.assignment_type = 'user_selected'
    and b.dispatch_attempt_count < p_max_attempts
    and b.dispatch_status in ('offered', 'searching')
    and (b.dispatch_next_recovery_at is null or b.dispatch_next_recovery_at <= now())
    and b.selected_cleaner_id is not null
    and not exists (
      select 1
      from public.dispatch_offers o
      where o.booking_id = b.id
        and o.status = 'pending'
    )
  order by b.dispatch_next_recovery_at nulls first, b.created_at asc
  limit greatest(1, least(coalesce(nullif(p_limit, 0), 40), 500))
  offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function public.list_bookings_due_user_selected_recovery(integer, integer, integer) is
  'Cron: user-selected recovery; includes pending_assignment (post-pay offer wait).';

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
    where lower(trim(coalesce(b.status, ''))) in ('pending', 'pending_assignment', 'offered')
      and b.cleaner_id is null
      and lower(trim(coalesce(b.dispatch_status, ''))) <> 'unassignable'
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
    where lower(trim(coalesce(b.status, ''))) in ('pending', 'pending_assignment', 'offered')
      and b.cleaner_id is null
      and b.location_id is not null
      and lower(trim(coalesce(b.dispatch_status, ''))) in ('searching', 'offered', 'failed')
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
    order by coalesce(b.became_pending_at, b.created_at) asc
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
