-- Optional property-level notes for saved addresses (admin Airbnb / booking flows).

alter table public.customer_saved_addresses
  add column if not exists notes text;

comment on column public.customer_saved_addresses.notes is
  'Optional property-level instructions; distinct from per-booking notes.';
