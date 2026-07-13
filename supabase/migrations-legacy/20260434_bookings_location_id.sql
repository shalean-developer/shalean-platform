-- Service area for the job (alongside bookings.location text where present)

alter table public.bookings
  add column if not exists location_id uuid references public.locations (id) on delete set null;

create index if not exists bookings_location_id_idx on public.bookings (location_id);

comment on column public.bookings.location_id is 'Resolved area; bookings.location may still hold free-form text.';
