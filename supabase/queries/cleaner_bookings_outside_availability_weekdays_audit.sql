-- ============================================================================
-- Audit: bookings on weekdays outside cleaner roster (availability_weekdays)
-- ============================================================================
-- `bookings.date` is **text** (`YYYY-MM-DD`); cast to `date` for ISO weekday (same civil day as app).
-- `cleaners.availability_weekdays` is lowercase mon..sun (see migration 20260835).
--
-- Empty array = treat as "all days" (matches app normalize when no days selected).
-- Default DB array is all seven days → no rows for those cleaners unless roster was narrowed.
--
-- Run in Supabase → SQL Editor. Uncomment the date filter if the table is large.
-- ============================================================================

with
params as (
  select
    -- optional: restrict how far back you scan
    (current_date - interval '18 months')::date as from_date,
    current_date as to_date
),
booking_dow as (
  select
    b.id as booking_id,
    b.cleaner_id,
    b.date as service_date,
    b.status,
    b.recurring_id,
    (b.recurring_id is not null) as is_recurring,
    (case extract(isodow from (b.date::date))::integer
      when 1 then 'mon'
      when 2 then 'tue'
      when 3 then 'wed'
      when 4 then 'thu'
      when 5 then 'fri'
      when 6 then 'sat'
      when 7 then 'sun'
    end) as dow_code
  from public.bookings b
  cross join params p
  where b.cleaner_id is not null
    and b.date is not null
    and b.date ~ '^\d{4}-\d{2}-\d{2}$'
    and (b.date::date) >= p.from_date
    and (b.date::date) <= p.to_date
    and lower(coalesce(b.status, '')) in ('assigned', 'in_progress', 'completed')
),
joined as (
  select
    bd.*,
    c.full_name,
    c.email as cleaner_email,
    c.status as cleaner_status,
    c.is_available,
    c.availability_weekdays,
    exists (
      select 1
      from unnest(coalesce(c.availability_weekdays, array[]::text[])) as w(day_code)
      where lower(trim(day_code)) = bd.dow_code
    ) as dow_allowed
  from booking_dow bd
  inner join public.cleaners c on c.id = bd.cleaner_id
)
select
  cleaner_id,
  full_name,
  cleaner_email,
  cleaner_status,
  is_available,
  availability_weekdays,
  booking_id,
  service_date,
  dow_code as booking_weekday_code,
  status as booking_status,
  recurring_id,
  is_recurring
from joined
where
  -- roster has at least one day; otherwise treat as unrestricted (app default-all)
  cardinality(coalesce(availability_weekdays, array[]::text[])) > 0
  and dow_allowed = false
order by full_name nulls last, service_date desc, booking_id;

-- ---------------------------------------------------------------------------
-- Summary: mismatch counts per cleaner (same window as params CTE above)
-- ---------------------------------------------------------------------------
/*
with
params as (
  select (current_date - interval '18 months')::date as from_date, current_date as to_date
),
booking_dow as (
  select
    b.id as booking_id,
    b.cleaner_id,
    b.date as service_date,
    (case extract(isodow from (b.date::date))::integer
      when 1 then 'mon' when 2 then 'tue' when 3 then 'wed' when 4 then 'thu'
      when 5 then 'fri' when 6 then 'sat' when 7 then 'sun'
    end) as dow_code
  from public.bookings b
  cross join params p
  where b.cleaner_id is not null
    and b.date is not null
    and b.date ~ '^\d{4}-\d{2}-\d{2}$'
    and (b.date::date) >= p.from_date
    and (b.date::date) <= p.to_date
    and lower(coalesce(b.status, '')) in ('assigned', 'in_progress', 'completed')
),
joined as (
  select
    bd.cleaner_id,
    c.full_name,
    c.availability_weekdays,
    exists (
      select 1
      from unnest(coalesce(c.availability_weekdays, array[]::text[])) as w(day_code)
      where lower(trim(day_code)) = bd.dow_code
    ) as dow_allowed
  from booking_dow bd
  inner join public.cleaners c on c.id = bd.cleaner_id
)
select
  cleaner_id,
  max(full_name) as full_name,
  count(*) filter (where dow_allowed = false) as bookings_outside_roster,
  count(*) as bookings_in_window
from joined
where cardinality(coalesce(availability_weekdays, array[]::text[])) > 0
group by cleaner_id
having count(*) filter (where dow_allowed = false) > 0
order by bookings_outside_roster desc, full_name nulls last;
*/
