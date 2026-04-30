-- Channel attribution + explicit admin creator (additive, non-breaking).

alter table public.bookings
  add column if not exists booking_source text not null default 'website';

comment on column public.bookings.booking_source is
  'Origin: website, admin, whatsapp, etc. Defaults to website for legacy rows.';

alter table public.bookings
  add column if not exists created_by_admin_id uuid references auth.users (id) on delete set null;

comment on column public.bookings.created_by_admin_id is
  'Admin staff user id when booking was created via admin tools; mirrors created_by for staff-created rows.';

create index if not exists bookings_booking_source_idx on public.bookings (booking_source);

create index if not exists bookings_created_by_admin_id_idx
  on public.bookings (created_by_admin_id)
  where created_by_admin_id is not null;

-- Best-effort backfill from existing flags
update public.bookings
set booking_source = 'admin'
where coalesce(created_by_admin, false) = true
  and booking_source = 'website';

update public.bookings
set created_by_admin_id = created_by
where created_by is not null
  and created_by_admin_id is null
  and coalesce(created_by_admin, false) = true;
