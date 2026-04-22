create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  service_type text not null,
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  time_slot text not null,
  address text not null,
  price_per_visit numeric not null check (price_per_visit >= 0),
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  next_booking_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists subscriptions_user_status_idx
  on public.subscriptions (user_id, status, next_booking_date);
create index if not exists subscriptions_due_idx
  on public.subscriptions (status, next_booking_date);
