-- Live GPS pings while cleaner is en route (Uber-style tracking).
-- Note: public.cleaner_locations is the existing service-area junction table — this is separate.

create table if not exists public.cleaner_booking_track_points (
  id uuid primary key default gen_random_uuid(),
  cleaner_id uuid not null references public.cleaners (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  lat numeric not null,
  lng numeric not null,
  heading numeric,
  speed numeric,
  created_at timestamptz not null default now()
);

create index if not exists cleaner_booking_track_points_cleaner_booking_idx
  on public.cleaner_booking_track_points (cleaner_id, booking_id);

create index if not exists cleaner_booking_track_points_booking_created_idx
  on public.cleaner_booking_track_points (booking_id, created_at desc);

comment on table public.cleaner_booking_track_points is
  'Time-series GPS samples for a booking; written by service_role via POST /api/cleaner/location/update.';

alter table public.cleaner_booking_track_points enable row level security;

-- Inserts only via service_role (API); no direct client insert.
revoke insert, update, delete on public.cleaner_booking_track_points from anon, authenticated;

grant select on public.cleaner_booking_track_points to authenticated;

drop policy if exists cleaner_booking_track_points_select_booking_owner on public.cleaner_booking_track_points;
create policy cleaner_booking_track_points_select_booking_owner
  on public.cleaner_booking_track_points
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      where b.id = cleaner_booking_track_points.booking_id
        and b.user_id = auth.uid()
    )
  );

drop policy if exists cleaner_booking_track_points_select_assigned_cleaner on public.cleaner_booking_track_points;
create policy cleaner_booking_track_points_select_assigned_cleaner
  on public.cleaner_booking_track_points
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.cleaners c
      where c.id = cleaner_booking_track_points.cleaner_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  );

grant select, insert, delete on public.cleaner_booking_track_points to service_role;

do $$
begin
  begin
    alter publication supabase_realtime add table public.cleaner_booking_track_points;
  exception
    when duplicate_object then null;
  end;
end
$$;
