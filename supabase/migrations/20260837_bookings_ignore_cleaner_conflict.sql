-- Persist when admin acknowledged overlapping cleaner assignment (audit / analytics).

alter table public.bookings
  add column if not exists ignore_cleaner_conflict boolean not null default false;

comment on column public.bookings.ignore_cleaner_conflict is
  'True when admin create used ignore_cleaner_slot_conflict after a same-slot cleaner overlap warning.';

create index if not exists bookings_ignore_cleaner_conflict_idx
  on public.bookings (ignore_cleaner_conflict)
  where ignore_cleaner_conflict = true;
