-- QA MVP: per-booking section checklist + optional before/after photos (premium deep/move jobs).
-- Access via Next.js API + service_role only (RLS enabled, no policies).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.booking_service_checklists (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  cleaner_id uuid not null references public.cleaners (id) on delete cascade,
  section_key text not null,
  completed boolean not null default false,
  completed_at timestamptz null,
  notes text null,
  created_at timestamptz not null default now(),
  constraint booking_service_checklists_section_ok check (length(trim(section_key)) > 0),
  constraint booking_service_checklists_booking_cleaner_section_uidx unique (booking_id, cleaner_id, section_key)
);

create index if not exists booking_service_checklists_booking_idx on public.booking_service_checklists (booking_id);
create index if not exists booking_service_checklists_cleaner_idx on public.booking_service_checklists (cleaner_id);

comment on table public.booking_service_checklists is
  'MVP execution checklist rows per cleaner per booking section (deep/move premium QA).';

create table if not exists public.booking_service_photos (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  cleaner_id uuid not null references public.cleaners (id) on delete cascade,
  section_key text not null,
  photo_type text not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  constraint booking_service_photos_section_ok check (length(trim(section_key)) > 0),
  constraint booking_service_photos_path_ok check (length(trim(storage_path)) > 0),
  constraint booking_service_photos_type_check check (lower(trim(photo_type)) in ('before', 'after'))
);

create index if not exists booking_service_photos_booking_idx on public.booking_service_photos (booking_id);

comment on table public.booking_service_photos is
  'Optional before/after photo refs (storage bucket booking-service-photos); MVP metadata only.';

-- ---------------------------------------------------------------------------
-- RLS: deny direct client access; server uses service_role.
-- ---------------------------------------------------------------------------
alter table public.booking_service_checklists enable row level security;
alter table public.booking_service_photos enable row level security;

-- ---------------------------------------------------------------------------
-- Storage bucket (private; uploads via API service_role)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'booking-service-photos',
  'booking-service-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
