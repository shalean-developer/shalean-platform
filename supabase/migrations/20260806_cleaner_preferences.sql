-- Admin-controlled dispatch preferences per cleaner (areas, services, time windows, strict mode).

create table if not exists public.cleaner_preferences (
  cleaner_id uuid primary key references public.cleaners (id) on delete cascade,
  preferred_areas text[] not null default '{}'::text[],
  preferred_services text[] not null default '{}'::text[],
  preferred_time_blocks jsonb not null default '[]'::jsonb,
  is_strict boolean not null default false,
  updated_at timestamptz not null default now()
);

comment on table public.cleaner_preferences is
  'Optional dispatch tuning: preferred areas (location ids), services, weekly time blocks; strict mode excludes non-matching jobs.';
comment on column public.cleaner_preferences.preferred_areas is
  'Location UUID strings (matches public.locations.id) the cleaner prefers.';
comment on column public.cleaner_preferences.preferred_services is
  'Service slugs (e.g. standard, deep) aligned with bookings.service_slug.';
comment on column public.cleaner_preferences.preferred_time_blocks is
  'JSON array of { "day": 0-6 (Sun-Sat UTC), "start": "HH:MM", "end": "HH:MM" }.';
comment on column public.cleaner_preferences.is_strict is
  'When true, cleaners are excluded from dispatch if the job violates any configured preference dimension.';

create index if not exists cleaner_preferences_updated_at_idx
  on public.cleaner_preferences (updated_at desc);

alter table public.cleaner_preferences enable row level security;

-- Server/admin client uses service_role and bypasses RLS; deny accidental anon access.
create policy cleaner_preferences_no_anon
  on public.cleaner_preferences
  for all
  using (false)
  with check (false);
