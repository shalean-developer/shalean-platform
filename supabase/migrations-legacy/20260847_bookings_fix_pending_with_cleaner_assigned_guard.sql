-- Backfill: operational pending must not coexist with a cleaner or preferred cleaner id.
-- Guard: DB rejects rows where cleaner_id/selected_cleaner_id is set but status stays pending.

update public.bookings
set
  status = 'assigned',
  cleaner_response_status = coalesce(cleaner_response_status, 'pending'),
  assigned_at = coalesce(assigned_at, now())
where lower(trim(coalesce(status, ''))) = 'pending'
  and (
    cleaner_id is not null
    or selected_cleaner_id is not null
  );

alter table public.bookings
  drop constraint if exists bookings_assigned_requires_status;

alter table public.bookings
  add constraint bookings_assigned_requires_status check (
    not (
      (cleaner_id is not null or selected_cleaner_id is not null)
      and lower(trim(coalesce(status, ''))) = 'pending'
    )
  );

comment on constraint bookings_assigned_requires_status on public.bookings is
  'Forbids operational pending when cleaner_id or selected_cleaner_id is set (cleaner lifecycle requires assigned).';
