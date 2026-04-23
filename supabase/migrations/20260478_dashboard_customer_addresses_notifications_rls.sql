-- Customer dashboard: saved addresses, in-app notifications, tighter reviews read access,
-- and cleaners visible to customers who have a booking with them.

-- ---------------------------------------------------------------------------
-- Saved addresses (customer dashboard)
-- ---------------------------------------------------------------------------
create table if not exists public.customer_saved_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  line1 text not null,
  suburb text not null default '',
  city text not null default 'Cape Town',
  postal_code text not null default '',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_saved_addresses_user_idx
  on public.customer_saved_addresses (user_id);

alter table public.customer_saved_addresses enable row level security;

drop policy if exists customer_saved_addresses_select_own on public.customer_saved_addresses;
create policy customer_saved_addresses_select_own
  on public.customer_saved_addresses for select to authenticated
  using (user_id = auth.uid());

drop policy if exists customer_saved_addresses_insert_own on public.customer_saved_addresses;
create policy customer_saved_addresses_insert_own
  on public.customer_saved_addresses for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists customer_saved_addresses_update_own on public.customer_saved_addresses;
create policy customer_saved_addresses_update_own
  on public.customer_saved_addresses for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists customer_saved_addresses_delete_own on public.customer_saved_addresses;
create policy customer_saved_addresses_delete_own
  on public.customer_saved_addresses for delete to authenticated
  using (user_id = auth.uid());

comment on table public.customer_saved_addresses is 'Customer saved service addresses; RLS by user_id.';

-- ---------------------------------------------------------------------------
-- In-app notifications
-- ---------------------------------------------------------------------------
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null,
  type text not null default 'system' check (type in ('confirmed', 'assigned', 'reminder', 'system')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_user_created_idx
  on public.user_notifications (user_id, created_at desc);

alter table public.user_notifications enable row level security;

drop policy if exists user_notifications_select_own on public.user_notifications;
create policy user_notifications_select_own
  on public.user_notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists user_notifications_update_own on public.user_notifications;
create policy user_notifications_update_own
  on public.user_notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.user_notifications is 'Customer notifications; inserts typically via service role / backend jobs.';

-- ---------------------------------------------------------------------------
-- Reviews: customers and cleaners see relevant rows only (replace open read)
-- ---------------------------------------------------------------------------
drop policy if exists reviews_select_authenticated on public.reviews;
create policy reviews_select_owner_or_cleaner on public.reviews for select to authenticated using (
  user_id = auth.uid() or cleaner_id = auth.uid()
);

-- ---------------------------------------------------------------------------
-- Cleaners: customers can read cleaners assigned to their bookings (name/phone for UI)
-- ---------------------------------------------------------------------------
drop policy if exists cleaners_select_for_customer_booking on public.cleaners;
create policy cleaners_select_for_customer_booking on public.cleaners for select to authenticated using (
  exists (
    select 1
    from public.bookings b
    where b.cleaner_id = cleaners.id
      and b.user_id = auth.uid()
  )
);
