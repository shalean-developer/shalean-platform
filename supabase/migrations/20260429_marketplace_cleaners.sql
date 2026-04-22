-- Marketplace: cleaners, availability, reviews, booking workflow (pending → assigned → in_progress → completed)

-- ---------------------------------------------------------------------------
-- Cleaners (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.cleaners (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  status text not null default 'offline' check (status in ('available', 'busy', 'offline')),
  rating real not null default 5 check (rating >= 0 and rating <= 5),
  total_jobs integer not null default 0 check (total_jobs >= 0),
  home_lat double precision,
  home_lng double precision,
  created_at timestamptz not null default now()
);

create index if not exists cleaners_status_idx on public.cleaners (status);

comment on table public.cleaners is 'Cleaning professionals; id matches auth.users.id for login.';

-- ---------------------------------------------------------------------------
-- Availability windows (date-local, HH:MM)
-- ---------------------------------------------------------------------------
create table if not exists public.cleaner_availability (
  id uuid primary key default gen_random_uuid(),
  cleaner_id uuid not null references public.cleaners (id) on delete cascade,
  date date not null,
  start_time text not null,
  end_time text not null,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  constraint cleaner_availability_time_fmt check (
    start_time ~ '^\d{2}:\d{2}$' and end_time ~ '^\d{2}:\d{2}$'
  )
);

create index if not exists cleaner_availability_cleaner_date_idx
  on public.cleaner_availability (cleaner_id, date);

-- ---------------------------------------------------------------------------
-- Reviews (one per booking)
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  cleaner_id uuid not null references public.cleaners (id) on delete cascade,
  rating smallint not null check (rating >= 1 and rating <= 5),
  comment text,
  created_at timestamptz not null default now(),
  constraint reviews_one_per_booking unique (booking_id)
);

create index if not exists reviews_cleaner_idx on public.reviews (cleaner_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Bookings: marketplace columns
-- ---------------------------------------------------------------------------
alter table public.bookings add column if not exists cleaner_id uuid references public.cleaners (id) on delete set null;
alter table public.bookings add column if not exists assigned_at timestamptz;
alter table public.bookings add column if not exists en_route_at timestamptz;
alter table public.bookings add column if not exists started_at timestamptz;
alter table public.bookings add column if not exists completed_at timestamptz;
alter table public.bookings add column if not exists assignment_attempts integer not null default 0;

-- Migrate legacy confirmed → pending (paid, awaiting cleaner)
update public.bookings set status = 'pending' where status = 'confirmed';

alter table public.bookings alter column status set default 'pending';

create index if not exists bookings_cleaner_id_idx on public.bookings (cleaner_id);
create index if not exists bookings_status_date_idx on public.bookings (status, date);

-- One active job per cleaner per slot (excludes pending/unassigned)
drop index if exists bookings_cleaner_active_slot_uidx;
create unique index if not exists bookings_cleaner_active_slot_uidx
  on public.bookings (cleaner_id, date, time)
  where cleaner_id is not null and status in ('assigned', 'in_progress');

-- ---------------------------------------------------------------------------
-- Rating refresh
-- ---------------------------------------------------------------------------
create or replace function public.refresh_cleaner_rating(p_cleaner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  avg_r double precision;
  cnt int;
begin
  select coalesce(avg(rating::double precision), 5), count(*)::int
    into avg_r, cnt
  from public.reviews
  where cleaner_id = p_cleaner_id;

  update public.cleaners
  set rating = round(avg_r::numeric, 2)::real
  where id = p_cleaner_id;
end;
$$;

create or replace function public.trg_reviews_refresh_cleaner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_cleaner_rating(new.cleaner_id);
  return new;
end;
$$;

drop trigger if exists reviews_refresh_cleaner_rating on public.reviews;
create trigger reviews_refresh_cleaner_rating
  after insert or update of rating on public.reviews
  for each row execute function public.trg_reviews_refresh_cleaner();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.cleaners enable row level security;
alter table public.cleaner_availability enable row level security;
alter table public.reviews enable row level security;

-- Cleaners: read/update own row
drop policy if exists cleaners_select_own on public.cleaners;
create policy cleaners_select_own on public.cleaners for select using (auth.uid() = id);
drop policy if exists cleaners_update_own on public.cleaners;
create policy cleaners_update_own on public.cleaners for update using (auth.uid() = id);

-- Availability: own rows
drop policy if exists cleaner_availability_select_own on public.cleaner_availability;
create policy cleaner_availability_select_own on public.cleaner_availability for select using (
  cleaner_id = auth.uid()
);
drop policy if exists cleaner_availability_all_own on public.cleaner_availability;
create policy cleaner_availability_all_own on public.cleaner_availability for all using (
  cleaner_id = auth.uid()
) with check (cleaner_id = auth.uid());

-- Reviews: customers insert own completed booking; read own
drop policy if exists reviews_select_authenticated on public.reviews;
create policy reviews_select_authenticated on public.reviews for select to authenticated using (true);

drop policy if exists reviews_insert_booking_owner on public.reviews;
create policy reviews_insert_booking_owner on public.reviews for insert to authenticated with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.bookings b
    where b.id = booking_id and b.user_id = auth.uid() and b.status = 'completed'
  )
);

-- Bookings: customers read own; cleaners read assigned
drop policy if exists bookings_user_select_own on public.bookings;
create policy bookings_user_select_own on public.bookings for select to authenticated using (
  user_id = auth.uid()
);

drop policy if exists bookings_cleaner_select_assigned on public.bookings;
create policy bookings_cleaner_select_assigned on public.bookings for select to authenticated using (
  cleaner_id = auth.uid()
);

-- Service role used by APIs bypasses RLS

-- ---------------------------------------------------------------------------
-- Realtime (Supabase): replica identity for broadcast updates
-- ---------------------------------------------------------------------------
alter table public.bookings replica identity full;
alter table public.cleaners replica identity full;

comment on column public.bookings.en_route_at is 'When cleaner marks “on the way” (Uber-style tracking).';
comment on column public.bookings.assignment_attempts is 'Increments when a cleaner rejects — dispatch fallback.';
