-- Allow explicit "no cleaner matched" dispatch outcome + optional cleaners.is_active flag.

alter table public.cleaners add column if not exists is_active boolean not null default true;

comment on column public.cleaners.is_active is 'When false, cleaner is excluded from auto-dispatch and roster marketing.';

alter table public.bookings drop constraint if exists bookings_dispatch_status_check;

alter table public.bookings
  add constraint bookings_dispatch_status_check
  check (dispatch_status in ('searching', 'offered', 'assigned', 'failed', 'no_cleaner'));

update public.bookings
set dispatch_status = 'failed'
where dispatch_status is not null
  and dispatch_status not in ('searching', 'offered', 'assigned', 'failed', 'no_cleaner');

comment on column public.bookings.dispatch_status is
  'Dispatch lifecycle: searching → offered → assigned | failed | no_cleaner.';
