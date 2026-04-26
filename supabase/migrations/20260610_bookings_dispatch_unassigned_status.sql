-- Allow API / dispatch to mark bookings awaiting manual or queued assignment.

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
      'unassignable',
      'unassigned'
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
    'unassignable',
    'unassigned'
  );

comment on column public.bookings.dispatch_status is
  'Dispatch funnel: searching → offered → assigned | failed | no_cleaner | unassignable | unassigned (API: no cleaner / assignment lost).';
