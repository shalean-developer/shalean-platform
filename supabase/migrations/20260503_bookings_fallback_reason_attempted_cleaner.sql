-- Why checkout cleaner choice was not honored + raw id when FK cannot store it.
alter table public.bookings
  add column if not exists fallback_reason text;

alter table public.bookings
  add column if not exists attempted_cleaner_id text;

comment on column public.bookings.fallback_reason is
  'When assignment_type = auto_fallback: e.g. invalid_cleaner_id, cleaner_not_available, cleaner_offline.';

comment on column public.bookings.attempted_cleaner_id is
  'Cleaner id the customer chose at checkout (text); may differ from cleaner_id when fallback. For user_selected often matches selected_cleaner_id.';

create index if not exists bookings_fallback_reason_idx
  on public.bookings (fallback_reason)
  where fallback_reason is not null;
