-- =============================================================================
-- Shalean: seed completed bookings + one review per booking
--
-- * Inserts 3 completed rows into public.bookings (unique paystack_reference).
-- * Inserts 3 rows into public.reviews (unique booking_id); cleaner rating and
--   review_count are updated by trigger public.reviews_refresh_cleaner_rating
--   → public.refresh_cleaner_rating (do not UPDATE public.cleaners manually).
--
-- Preconditions (script will RAISE if missing):
--   1) At least one row in public.cleaners (id = auth.users.id).
--   2) At least one row in auth.users.
--
-- Run as a role that bypasses RLS (e.g. postgres in Supabase SQL Editor, or
-- service_role via a trusted path). Not for anonymous PostgREST.
-- =============================================================================

begin;

do $guard$
begin
  if not exists (select 1 from public.cleaners limit 1) then
    raise exception 'seed_completed_bookings_and_reviews: no rows in public.cleaners';
  end if;
  if not exists (select 1 from auth.users limit 1) then
    raise exception 'seed_completed_bookings_and_reviews: no rows in auth.users';
  end if;
end;
$guard$;

with ctx as (
  select
    c.id as cleaner_id,
    coalesce(
      (
        select au.id
        from auth.users au
        where not exists (select 1 from public.cleaners cx where cx.id = au.id)
        order by au.created_at asc nulls last
        limit 1
      ),
      (select id from auth.users order by created_at asc nulls last limit 1)
    ) as user_id
  from public.cleaners c
  order by c.created_at asc nulls last
  limit 1
),
slots as (
  select *
  from (
    values
      (1, '2025-03-10'::text, '08:00'::text),
      (2, '2025-03-12'::text, '10:00'::text),
      (3, '2025-03-14'::text, '13:30'::text)
  ) as t(slot, job_date, job_time)
),
ins as (
  insert into public.bookings (
    paystack_reference,
    customer_email,
    customer_name,
    customer_phone,
    user_id,
    amount_paid_cents,
    currency,
    booking_snapshot,
    status,
    service,
    rooms,
    bathrooms,
    extras,
    location,
    date,
    time,
    total_paid_zar,
    total_paid_cents,
    cleaner_id,
    selected_cleaner_id,
    assignment_type,
    dispatch_status,
    cleaner_response_status,
    assigned_at,
    en_route_at,
    started_at,
    completed_at,
    is_test
  )
  select
    'seed_' || replace(gen_random_uuid()::text, '-', ''),
    coalesce(nullif(trim(u.email::text), ''), 'seed.customer+' || u.id::text || '@invalid.local'),
    'Seed Customer',
    '0821234567',
    x.user_id,
    49900,
    'ZAR',
    jsonb_build_object(
      'v',
      1,
      'seed_meta',
      jsonb_build_object('slot', s.slot),
      'locked',
      jsonb_build_object(
        'service',
        'Deep clean',
        'rooms',
        3,
        'bathrooms',
        2,
        'extras',
        '[]'::jsonb,
        'location',
        'Cape Town',
        'date',
        s.job_date,
        'time',
        s.job_time,
        'lockedAt',
        to_char((timezone('UTC', now()) - interval '60 days'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'lockExpiresAt',
        to_char((timezone('UTC', now()) - interval '59 days'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'quoteSignature',
        'seed',
        'cleaningFrequency',
        'one_time',
        'surge',
        1.0
      )
    ),
    'completed',
    'Deep clean',
    3,
    2,
    '[]'::jsonb,
    'Cape Town',
    s.job_date,
    s.job_time,
    499,
    49900,
    x.cleaner_id,
    x.cleaner_id,
    'auto_dispatch',
    'assigned',
    'accepted',
    tm.base_ts,
    tm.base_ts + interval '20 minutes',
    tm.base_ts + interval '50 minutes',
    tm.base_ts + interval '3 hours',
    true
  from ctx x
  inner join slots s on true
  inner join auth.users u on u.id = x.user_id
  cross join lateral (
    select (now() - ((55 + s.slot)::double precision * interval '1 day')) as base_ts
  ) tm
  returning id, user_id, cleaner_id, booking_snapshot
),
numbered as (
  select
    id,
    user_id,
    cleaner_id,
    (booking_snapshot #>> '{seed_meta,slot}')::int as slot
  from ins
)
insert into public.reviews (booking_id, user_id, cleaner_id, rating, comment)
select
  n.id,
  n.user_id,
  n.cleaner_id,
  r.rating,
  r.comment
from numbered n
inner join (
  values
    (1, 5::smallint, 'Flawless clean and very professional. Kitchen and bathrooms were spotless.'),
    (2, 4::smallint, 'Great service overall; punctual and thorough. One small missed spot behind a door.'),
    (3, 5::smallint, 'Friendly, careful with our things, and the place smelled fresh. Would book again.')
) as r(slot, rating, comment)
  on r.slot = n.slot;

commit;
