-- Preferred cleaner dispatch: workflow status on bookings + richer offer rows.

alter table public.bookings
  add column if not exists preferred_dispatch_status text
    check (
      preferred_dispatch_status is null
      or preferred_dispatch_status in (
        'preferred_cleaner_pending',
        'preferred_cleaner_accepted',
        'preferred_cleaner_expired',
        'preferred_cleaner_skipped_urgent',
        'backup_dispatch_started',
        'backup_offer_pending',
        'assigned_to_backup_cleaner',
        'accepted',
        'expired'
      )
    );

comment on column public.bookings.preferred_dispatch_status is
  'Customer-selected cleaner dispatch phase (preferred offer → backup wave → assigned).';

alter table public.dispatch_offers
  add column if not exists offer_type text
    check (offer_type is null or offer_type in ('preferred', 'backup')),
  add column if not exists sent_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists declined_at timestamptz,
  add column if not exists expired_at timestamptz,
  add column if not exists reason text;

comment on column public.dispatch_offers.offer_type is 'preferred = customer pick; backup = auto-dispatch wave after preferred window.';
comment on column public.dispatch_offers.sent_at is 'When the offer was sent (may differ from created_at when deferred).';

alter table public.dispatch_offers drop constraint if exists dispatch_offers_status_check;
alter table public.dispatch_offers
  add constraint dispatch_offers_status_check
  check (status in ('pending', 'accepted', 'rejected', 'declined', 'expired', 'skipped'));

-- Backfill sent_at for existing rows.
update public.dispatch_offers
set sent_at = coalesce(sent_at, created_at)
where sent_at is null;

create index if not exists idx_dispatch_offers_booking_offer_type_status
  on public.dispatch_offers (booking_id, offer_type, status);

-- Extend SQL expiry job: stamp expired_at + preferred booking phase.
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
    select d.id, d.booking_id, d.offer_type
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
      responded_at = now(),
      expired_at = now()
    from candidates c
    where d.id = c.id
      and d.status = 'pending'
    returning d.booking_id, d.offer_type
  ),
  preferred_bookings as (
    update public.bookings b
    set preferred_dispatch_status = 'preferred_cleaner_expired'
    from (
      select distinct e.booking_id
      from expired e
      where coalesce(e.offer_type, '') = 'preferred'
    ) pb
    where b.id = pb.booking_id
      and b.cleaner_id is null
      and coalesce(b.preferred_dispatch_status, '') in ('', 'preferred_cleaner_pending')
    returning b.id
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
    'expired', v_expired,
    'enqueued', v_enqueued
  );
end;
$$;

comment on function public.expire_pending_dispatch_offers(int) is
  'Expire stale pending dispatch_offers; mark preferred_cleaner_expired; enqueue retry when unassigned.';
