-- When a cleaner accepts a dispatch offer, `assigned_at` marks assignment time; `accepted_at` mirrors
-- the same instant in the unified pipeline (lifecycle may treat it as "committed to the job").
alter table public.bookings
  add column if not exists accepted_at timestamptz;

comment on column public.bookings.accepted_at is
  'Cleaner committed to the booking (dispatch offer accepted); aligns with cleaner_response accepted in unified flow.';
