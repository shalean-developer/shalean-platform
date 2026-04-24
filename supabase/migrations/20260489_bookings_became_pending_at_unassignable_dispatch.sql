-- Accurate SLA: when a booking becomes payable/dispatchable (status = pending), clock from became_pending_at.
-- Terminal dispatch: unassignable = auto-dispatch exhausted; ops assigns manually or clears state.

alter table public.bookings
  add column if not exists became_pending_at timestamptz;

comment on column public.bookings.became_pending_at is
  'Set when status transitions into pending (paid / re-opened for dispatch). Used for unassigned SLA; distinct from created_at for long-lived pending_payment rows.';

update public.bookings
set became_pending_at = coalesce(became_pending_at, created_at)
where status = 'pending'
  and became_pending_at is null;

create or replace function public.bookings_touch_became_pending_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'pending' then
    if tg_op = 'INSERT' then
      new.became_pending_at := coalesce(new.became_pending_at, now());
    elsif old.status is distinct from 'pending' then
      new.became_pending_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_touch_became_pending_at_trg on public.bookings;

create trigger bookings_touch_became_pending_at_trg
before insert or update on public.bookings
for each row
execute procedure public.bookings_touch_became_pending_at();

-- dispatch_status: allow terminal unassignable (retry queue exhausted)
alter table public.bookings drop constraint if exists bookings_dispatch_status_check;

alter table public.bookings
  add constraint bookings_dispatch_status_check
  check (
    dispatch_status in (
      'searching',
      'offered',
      'assigned',
      'failed',
      'no_cleaner',
      'unassignable'
    )
  );

update public.bookings
set dispatch_status = 'failed'
where dispatch_status is not null
  and dispatch_status not in (
    'searching',
    'offered',
    'assigned',
    'failed',
    'no_cleaner',
    'unassignable'
  );

comment on column public.bookings.dispatch_status is
  'Dispatch funnel: searching → offered → assigned | failed | no_cleaner | unassignable (manual ops).';

-- Do not enqueue SQL retries for terminal unassignable bookings
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
    where lower(trim(coalesce(b.status, ''))) = 'pending'
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

create index if not exists bookings_pending_dispatch_sla_idx
  on public.bookings (became_pending_at asc)
  where status = 'pending'
    and cleaner_id is null
    and dispatch_status in ('searching', 'offered');
