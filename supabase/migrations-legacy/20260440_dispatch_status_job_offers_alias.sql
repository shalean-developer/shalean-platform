-- Dispatch v5: explicit booking dispatch state + compatibility alias for job offers

alter table public.bookings
  add column if not exists dispatch_status text not null default 'searching'
    check (dispatch_status in ('searching', 'offered', 'assigned', 'failed'));

comment on column public.bookings.dispatch_status is
  'Cleaner dispatch lifecycle: searching -> offered -> assigned or failed';

-- Backfill from current booking state
update public.bookings
set dispatch_status = case
  when cleaner_id is not null or lower(coalesce(status, '')) = 'assigned' then 'assigned'
  when lower(coalesce(status, '')) in ('completed', 'cancelled', 'failed') then 'failed'
  else 'searching'
end
where dispatch_status is null or dispatch_status not in ('searching', 'offered', 'assigned', 'failed');

-- Compatibility alias for systems that expect "job_offers".
drop view if exists public.job_offers;
create view public.job_offers as
select
  id,
  booking_id,
  cleaner_id,
  case
    when status = 'rejected' then 'declined'
    else status
  end as status,
  expires_at,
  created_at
from public.dispatch_offers;
