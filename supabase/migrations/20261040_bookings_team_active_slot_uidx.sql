-- Team jobs schedule by team + slot; cleaner_id on the header is payout owner, not a solo slot.
-- Individual cleaners still use bookings_cleaner_active_slot_uidx.

drop index if exists public.bookings_cleaner_active_slot_uidx;

create unique index if not exists bookings_cleaner_active_slot_uidx
  on public.bookings (cleaner_id, date, time)
  where cleaner_id is not null
    and status in ('assigned', 'in_progress')
    and coalesce(is_team_job, false) = false;

create unique index if not exists bookings_team_active_slot_uidx
  on public.bookings (team_id, date, time)
  where team_id is not null
    and coalesce(is_team_job, false) = true
    and status in ('assigned', 'in_progress');

comment on index public.bookings_team_active_slot_uidx is
  'One active team job per team per date/time slot.';
