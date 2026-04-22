-- Optional FK to public.locations (keeps cleaners.location text for display / legacy)

alter table public.cleaners
  add column if not exists location_id uuid references public.locations (id) on delete set null;

create index if not exists cleaners_location_id_idx on public.cleaners (location_id);

comment on column public.cleaners.location_id is 'Resolved service area; cleaners.location may still hold the label.';
