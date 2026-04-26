-- Track WhatsApp (non–dispatch_offer) declines for dispatch scoring / penalties.

alter table public.bookings
  add column if not exists last_declined_by_cleaner_id uuid references public.cleaners (id) on delete set null;

alter table public.bookings
  add column if not exists last_declined_at timestamptz;

create index if not exists bookings_last_declined_at_idx
  on public.bookings (last_declined_at desc)
  where last_declined_by_cleaner_id is not null;

comment on column public.bookings.last_declined_by_cleaner_id is
  'Cleaner who last declined this row via assigned-booking WhatsApp flow; cleared on assignment / timeout release.';

comment on column public.bookings.last_declined_at is
  'When last_declined_by_cleaner_id was set; used for recent-decline dispatch penalty.';
