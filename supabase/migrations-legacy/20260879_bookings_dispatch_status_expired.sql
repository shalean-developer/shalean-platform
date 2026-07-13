alter table public.bookings drop constraint if exists bookings_dispatch_status_check;

alter table public.bookings
  add constraint bookings_dispatch_status_check
  check (
    dispatch_status is null
    or dispatch_status in (
      'searching',
      'offered',
      'assigned',
      'failed',
      'no_cleaner',
      'unassignable',
      'unassigned',
      'accepted',
      'expired'
    )
  );

comment on column public.bookings.dispatch_status is
  'Dispatch funnel: searching → offered → assigned | accepted | failed | no_cleaner | unassignable | unassigned | expired.';
