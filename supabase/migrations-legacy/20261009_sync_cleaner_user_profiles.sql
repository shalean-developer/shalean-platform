-- Sync linked cleaner auth profiles from public.cleaners (name, phone, role).
-- Safe to re-run: overwrites role/full_name/phone on matching auth user ids.

update public.user_profiles up
set
  role = 'cleaner',
  full_name = nullif(btrim(c.full_name), ''),
  phone = coalesce(nullif(btrim(c.phone), ''), nullif(btrim(c.phone_number), '')),
  phone_e164 = coalesce(nullif(btrim(c.phone), ''), nullif(btrim(c.phone_number), '')),
  updated_at = now()
from public.cleaners c
where c.auth_user_id = up.id
  and c.auth_user_id is not null
  and nullif(btrim(c.full_name), '') is not null;

-- Insert missing profiles for linked cleaners (orphan auth users without user_profiles).
insert into public.user_profiles (
  id,
  full_name,
  phone,
  phone_e164,
  role,
  tier,
  billing_type,
  schedule_type,
  booking_count,
  total_spent_cents,
  updated_at
)
select
  c.auth_user_id,
  nullif(btrim(c.full_name), ''),
  coalesce(nullif(btrim(c.phone), ''), nullif(btrim(c.phone_number), '')),
  coalesce(nullif(btrim(c.phone), ''), nullif(btrim(c.phone_number), '')),
  'cleaner',
  'regular',
  'per_booking',
  'on_demand',
  0,
  0,
  now()
from public.cleaners c
where c.auth_user_id is not null
  and nullif(btrim(c.full_name), '') is not null
  and not exists (
    select 1 from public.user_profiles up where up.id = c.auth_user_id
  )
on conflict (id) do nothing;
