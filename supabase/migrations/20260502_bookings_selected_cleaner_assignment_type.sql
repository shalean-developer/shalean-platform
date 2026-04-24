-- Persist checkout cleaner choice vs auto-dispatch for auditing and admin UX.
alter table public.bookings
  add column if not exists selected_cleaner_id uuid references public.cleaners (id) on delete set null;

alter table public.bookings
  add column if not exists assignment_type text;

comment on column public.bookings.selected_cleaner_id is
  'Cleaner the customer chose at checkout; mirrors snapshot when assignment_type = user_selected.';

comment on column public.bookings.assignment_type is
  'user_selected = customer picked a cleaner at checkout; auto_dispatch = smart dispatch assigned cleaner_id.';

create index if not exists bookings_assignment_type_idx
  on public.bookings (assignment_type)
  where assignment_type is not null;
