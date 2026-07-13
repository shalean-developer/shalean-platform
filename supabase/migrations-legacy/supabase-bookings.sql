-- Run in Supabase SQL editor. Webhook + status API expect this shape.

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  paystack_reference text not null unique,
  customer_email text,
  customer_name text,
  customer_phone text,
  user_id uuid,
  amount_paid_cents integer not null,
  currency text not null default 'ZAR',
  booking_snapshot jsonb,
  status text not null default 'confirmed',
  -- Denormalized for queries / reporting (mirrors booking_snapshot.locked)
  service text,
  rooms integer,
  bathrooms integer,
  extras jsonb,
  location text,
  date text,
  time text,
  total_paid_zar integer,
  created_at timestamptz not null default now()
);

create index if not exists bookings_created_at_idx on public.bookings (created_at desc);

alter table public.bookings enable row level security;

-- If you created `bookings` before flat columns existed, run:
alter table public.bookings add column if not exists service text;
alter table public.bookings add column if not exists rooms integer;
alter table public.bookings add column if not exists bathrooms integer;
alter table public.bookings add column if not exists extras jsonb;
alter table public.bookings add column if not exists location text;
alter table public.bookings add column if not exists date text;
alter table public.bookings add column if not exists time text;
alter table public.bookings add column if not exists total_paid_zar integer;
alter table public.bookings add column if not exists customer_name text;
alter table public.bookings add column if not exists customer_phone text;
alter table public.bookings add column if not exists user_id uuid;

-- Retry queue for webhook/verify failures (processed by a cron or worker).
create table if not exists public.failed_jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  payload jsonb not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists failed_jobs_type_created_idx on public.failed_jobs (type, created_at asc);

alter table public.failed_jobs enable row level security;
