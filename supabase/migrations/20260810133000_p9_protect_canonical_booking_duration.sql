-- P9 Booking Duration: keep the minute column canonical while synchronising
-- legacy/reporting mirrors. Historical rows remain nullable and can be repaired
-- with the governed repair:missing-booking-duration command.

create or replace function public.sync_booking_duration_columns()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  canonical_minutes integer;
begin
  canonical_minutes := case
    when new.duration_minutes is not null and new.duration_minutes >= 30
      then round(new.duration_minutes)::integer
    when new.estimated_duration_minutes is not null and new.estimated_duration_minutes >= 30
      then round(new.estimated_duration_minutes)::integer
    when new.duration_hours is not null and new.duration_hours >= 0.5
      then round(new.duration_hours * 60)::integer
    else null
  end;

  if canonical_minutes is not null then
    new.duration_minutes := canonical_minutes;
    new.estimated_duration_minutes := canonical_minutes;
    -- Match durationHoursFromMinutes(): duration_hours is a one-decimal
    -- reporting mirror while integer minutes remain canonical.
    new.duration_hours := round((canonical_minutes::numeric / 60), 1);
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_sync_duration_columns on public.bookings;
create trigger bookings_sync_duration_columns
before insert or update of duration_minutes, estimated_duration_minutes, duration_hours
on public.bookings
for each row execute function public.sync_booking_duration_columns();

comment on function public.sync_booking_duration_columns() is
  'P9: keeps bookings.duration_minutes canonical and synchronises reporting mirrors without inventing missing durations.';
