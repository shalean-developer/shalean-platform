-- Per-cleaner visit completion for paired roster jobs (booking_cleaners roster, not formal team jobs).
-- Lets each roster member mark their portion complete from the cleaner dashboard independently.

alter table public.booking_cleaners
  add column if not exists completed_at timestamptz;

create index if not exists booking_cleaners_cleaner_completed_at_idx
  on public.booking_cleaners (cleaner_id, completed_at desc nulls last)
  where completed_at is not null;

comment on column public.booking_cleaners.completed_at is
  'When this roster cleaner marked their visit complete (paired / dual-cleaner solo jobs).';
