-- Link public.bookings to auth.users via user_id; normalize emails for reliable matching.
-- Apply in Supabase SQL Editor or via supabase db push.

-- 1) Column + FK (idempotent)
alter table public.bookings
  add column if not exists user_id uuid references auth.users (id) on delete set null;

create index if not exists bookings_user_id_idx on public.bookings (user_id)
  where user_id is not null;

-- 2) Normalize stored customer emails (lowercase, trimmed)
update public.bookings
set customer_email = lower(trim(customer_email))
where customer_email is not null
  and customer_email <> lower(trim(customer_email));

-- 3) Backfill user_id from auth.users by email match (case-insensitive)
update public.bookings b
set user_id = u.id
from auth.users u
where b.user_id is null
  and b.customer_email is not null
  and length(trim(b.customer_email)) > 0
  and lower(trim(b.customer_email)) = lower(trim(u.email));
