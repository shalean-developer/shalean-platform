-- Optional ops note when admin creates with ignore_cleaner_conflict (e.g. urgent job, cleaner agreed).

alter table public.bookings
  add column if not exists cleaner_slot_override_reason text;

comment on column public.bookings.cleaner_slot_override_reason is
  'Free-text context when admin acknowledged a cleaner slot overlap (paired with ignore_cleaner_conflict).';
