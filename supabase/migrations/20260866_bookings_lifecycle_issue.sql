alter table public.bookings
  add column if not exists lifecycle_issue boolean not null default false;

comment on column public.bookings.lifecycle_issue is
  'Set when post-payment lifecycle job scheduling failed (Day 6); cleared after successful repair.';

create index if not exists bookings_lifecycle_issue_idx
  on public.bookings (lifecycle_issue)
  where lifecycle_issue = true;
