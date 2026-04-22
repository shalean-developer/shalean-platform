-- ============================================================================
-- Shalean — seed cleaner workforce (Western Cape)
-- ============================================================================
-- Prerequisites:
--   • Marketplace migrations through 20260434_bookings_location_id.sql
--   • seed/locations_seed.sql applied first (so location_id can resolve)
--   • Run in SQL Editor with sufficient privileges (postgres / dashboard)
--
-- Inserts 32 cleaners: auth.users + auth.identities + public.cleaners
-- Login (dev only): email cleaner.seed01@shalean.test … seed32 — password SeedCleaner!2026
--
-- Distribution: ~22 available, ~6 busy, ~4 offline; ratings 4.36–4.98; total_jobs 54–298
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Auth users (skip if email already exists)
-- ---------------------------------------------------------------------------
with
  inst as (
    select coalesce(
      (select instance_id from auth.users limit 1),
      '00000000-0000-0000-0000-000000000000'::uuid
    ) as instance_id
  ),
  pw as (
    select crypt('SeedCleaner!2026', gen_salt('bf')) as hash
  ),
  v as (
    select * from (values
      ('a0000001-0000-4000-8000-000000000000'::uuid, 'cleaner.seed01@shalean.test'),
      ('a0000002-0000-4000-8000-000000000000'::uuid, 'cleaner.seed02@shalean.test'),
      ('a0000003-0000-4000-8000-000000000000'::uuid, 'cleaner.seed03@shalean.test'),
      ('a0000004-0000-4000-8000-000000000000'::uuid, 'cleaner.seed04@shalean.test'),
      ('a0000005-0000-4000-8000-000000000000'::uuid, 'cleaner.seed05@shalean.test'),
      ('a0000006-0000-4000-8000-000000000000'::uuid, 'cleaner.seed06@shalean.test'),
      ('a0000007-0000-4000-8000-000000000000'::uuid, 'cleaner.seed07@shalean.test'),
      ('a0000008-0000-4000-8000-000000000000'::uuid, 'cleaner.seed08@shalean.test'),
      ('a0000009-0000-4000-8000-000000000000'::uuid, 'cleaner.seed09@shalean.test'),
      ('a000000a-0000-4000-8000-000000000000'::uuid, 'cleaner.seed10@shalean.test'),
      ('a000000b-0000-4000-8000-000000000000'::uuid, 'cleaner.seed11@shalean.test'),
      ('a000000c-0000-4000-8000-000000000000'::uuid, 'cleaner.seed12@shalean.test'),
      ('a000000d-0000-4000-8000-000000000000'::uuid, 'cleaner.seed13@shalean.test'),
      ('a000000e-0000-4000-8000-000000000000'::uuid, 'cleaner.seed14@shalean.test'),
      ('a000000f-0000-4000-8000-000000000000'::uuid, 'cleaner.seed15@shalean.test'),
      ('a0000010-0000-4000-8000-000000000000'::uuid, 'cleaner.seed16@shalean.test'),
      ('a0000011-0000-4000-8000-000000000000'::uuid, 'cleaner.seed17@shalean.test'),
      ('a0000012-0000-4000-8000-000000000000'::uuid, 'cleaner.seed18@shalean.test'),
      ('a0000013-0000-4000-8000-000000000000'::uuid, 'cleaner.seed19@shalean.test'),
      ('a0000014-0000-4000-8000-000000000000'::uuid, 'cleaner.seed20@shalean.test'),
      ('a0000015-0000-4000-8000-000000000000'::uuid, 'cleaner.seed21@shalean.test'),
      ('a0000016-0000-4000-8000-000000000000'::uuid, 'cleaner.seed22@shalean.test'),
      ('a0000017-0000-4000-8000-000000000000'::uuid, 'cleaner.seed23@shalean.test'),
      ('a0000018-0000-4000-8000-000000000000'::uuid, 'cleaner.seed24@shalean.test'),
      ('a0000019-0000-4000-8000-000000000000'::uuid, 'cleaner.seed25@shalean.test'),
      ('a000001a-0000-4000-8000-000000000000'::uuid, 'cleaner.seed26@shalean.test'),
      ('a000001b-0000-4000-8000-000000000000'::uuid, 'cleaner.seed27@shalean.test'),
      ('a000001c-0000-4000-8000-000000000000'::uuid, 'cleaner.seed28@shalean.test'),
      ('a000001d-0000-4000-8000-000000000000'::uuid, 'cleaner.seed29@shalean.test'),
      ('a000001e-0000-4000-8000-000000000000'::uuid, 'cleaner.seed30@shalean.test'),
      ('a000001f-0000-4000-8000-000000000000'::uuid, 'cleaner.seed31@shalean.test'),
      ('a0000020-0000-4000-8000-000000000000'::uuid, 'cleaner.seed32@shalean.test')
    ) as t(id, email)
  )
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  v.id,
  inst.instance_id,
  'authenticated',
  'authenticated',
  v.email,
  pw.hash,
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
from v
cross join inst
cross join pw
where not exists (select 1 from auth.users u where lower(u.email) = lower(v.email));

-- ---------------------------------------------------------------------------
-- 2) Email identities (for Supabase Auth email provider)
-- ---------------------------------------------------------------------------
insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select
  gen_random_uuid(),
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email',
  u.email::text,
  now(),
  now(),
  now()
from auth.users u
where u.email like 'cleaner.seed%@shalean.test'
  and not exists (
    select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
  );

-- ---------------------------------------------------------------------------
-- 3) Cleaner profiles (matches user ids)
-- ---------------------------------------------------------------------------
insert into public.cleaners (
  id,
  full_name,
  email,
  phone,
  status,
  rating,
  total_jobs,
  location,
  home_lat,
  home_lng,
  created_at
)
values
  ('a0000001-0000-4000-8000-000000000000', 'Thabo Mkhize', 'cleaner.seed01@shalean.test', '+27824511001', 'available', 4.62, 187, 'Cape Town CBD', -33.9249, 18.4241, now() - interval '400 days'),
  ('a0000002-0000-4000-8000-000000000000', 'Nomsa Dlamini', 'cleaner.seed02@shalean.test', '+27824511002', 'available', 4.85, 263, 'Claremont', -33.9804, 18.4655, now() - interval '380 days'),
  ('a0000003-0000-4000-8000-000000000000', 'Pieter van der Berg', 'cleaner.seed03@shalean.test', '+27824511003', 'available', 4.71, 92, 'Rondebosch', -33.9633, 18.4765, now() - interval '310 days'),
  ('a0000004-0000-4000-8000-000000000000', 'Fatima Abrahams', 'cleaner.seed04@shalean.test', '+27824511004', 'busy', 4.93, 241, 'Sea Point', -33.9148, 18.3921, now() - interval '290 days'),
  ('a0000005-0000-4000-8000-000000000000', 'Sipho Nkosi', 'cleaner.seed05@shalean.test', '+27824511005', 'available', 4.55, 156, 'Green Point', -33.9057, 18.4039, now() - interval '270 days'),
  ('a0000006-0000-4000-8000-000000000000', 'Lindiwe Mthembu', 'cleaner.seed06@shalean.test', '+27824511006', 'available', 4.78, 204, 'Observatory', -33.9358, 18.4476, now() - interval '260 days'),
  ('a0000007-0000-4000-8000-000000000000', 'Johan du Preez', 'cleaner.seed07@shalean.test', '+27824511007', 'offline', 4.42, 71, 'Woodstock', -33.9276, 18.4432, now() - interval '250 days'),
  ('a0000008-0000-4000-8000-000000000000', 'Zanele Khumalo', 'cleaner.seed08@shalean.test', '+27824511008', 'available', 4.88, 298, 'Bellville', -33.9022, 18.6292, now() - interval '240 days'),
  ('a0000009-0000-4000-8000-000000000000', 'André Pretorius', 'cleaner.seed09@shalean.test', '+27824511009', 'available', 4.67, 133, 'Durbanville', -33.8321, 18.6453, now() - interval '230 days'),
  ('a000000a-0000-4000-8000-000000000000', 'Chantelle Jacobs', 'cleaner.seed10@shalean.test', '+27824511010', 'busy', 4.51, 164, 'Milnerton', -33.8861, 18.4931, now() - interval '220 days'),
  ('a000000b-0000-4000-8000-000000000000', 'Bongani Cele', 'cleaner.seed11@shalean.test', '+27824511011', 'available', 4.95, 276, 'Table View', -33.8218, 18.4821, now() - interval '210 days'),
  ('a000000c-0000-4000-8000-000000000000', 'Megan Williams', 'cleaner.seed12@shalean.test', '+27824511012', 'available', 4.73, 119, 'Khayelitsha', -34.0492, 18.6721, now() - interval '200 days'),
  ('a000000d-0000-4000-8000-000000000000', 'Sibusiso Zulu', 'cleaner.seed13@shalean.test', '+27824511013', 'available', 4.36, 58, 'Mitchells Plain', -34.0517, 18.6097, now() - interval '195 days'),
  ('a000000e-0000-4000-8000-000000000000', 'Rethabile Moeketsi', 'cleaner.seed14@shalean.test', '+27824511014', 'offline', 4.82, 219, 'Cape Town CBD', -33.9255, 18.4235, now() - interval '190 days'),
  ('a000000f-0000-4000-8000-000000000000', 'David Govender', 'cleaner.seed15@shalean.test', '+27824511015', 'available', 4.59, 142, 'Claremont', -33.9810, 18.4648, now() - interval '185 days'),
  ('a0000010-0000-4000-8000-000000000000', 'Anika Naidoo', 'cleaner.seed16@shalean.test', '+27824511016', 'busy', 4.91, 255, 'Rondebosch', -33.9625, 18.4772, now() - interval '180 days'),
  ('a0000011-0000-4000-8000-000000000000', 'Kwanele Booi', 'cleaner.seed17@shalean.test', '+27824511017', 'available', 4.64, 176, 'Sea Point', -33.9155, 18.3915, now() - interval '175 days'),
  ('a0000012-0000-4000-8000-000000000000', 'Elmarie Steyn', 'cleaner.seed18@shalean.test', '+27824511018', 'available', 4.77, 201, 'Green Point', -33.9062, 18.4045, now() - interval '170 days'),
  ('a0000013-0000-4000-8000-000000000000', 'Mpho Radebe', 'cleaner.seed19@shalean.test', '+27824511019', 'available', 4.45, 63, 'Observatory', -33.9365, 18.4468, now() - interval '165 days'),
  ('a0000014-0000-4000-8000-000000000000', 'Heinrich van Wyk', 'cleaner.seed20@shalean.test', '+27824511020', 'available', 4.69, 189, 'Woodstock', -33.9280, 18.4425, now() - interval '160 days'),
  ('a0000015-0000-4000-8000-000000000000', 'Nosipho Gumede', 'cleaner.seed21@shalean.test', '+27824511021', 'busy', 4.86, 267, 'Bellville', -33.9015, 18.6285, now() - interval '155 days'),
  ('a0000016-0000-4000-8000-000000000000', 'Jerome Petersen', 'cleaner.seed22@shalean.test', '+27824511022', 'available', 4.53, 98, 'Durbanville', -33.8330, 18.6445, now() - interval '150 days'),
  ('a0000017-0000-4000-8000-000000000000', 'Aphiwe Mafuya', 'cleaner.seed23@shalean.test', '+27824511023', 'available', 4.98, 291, 'Milnerton', -33.8855, 18.4925, now() - interval '145 days'),
  ('a0000018-0000-4000-8000-000000000000', 'Bianca Botha', 'cleaner.seed24@shalean.test', '+27824511024', 'offline', 4.41, 54, 'Table View', -33.8225, 18.4815, now() - interval '140 days'),
  ('a0000019-0000-4000-8000-000000000000', 'Siya Ntuli', 'cleaner.seed25@shalean.test', '+27824511025', 'available', 4.74, 211, 'Khayelitsha', -34.0485, 18.6715, now() - interval '135 days'),
  ('a000001a-0000-4000-8000-000000000000', 'Tamara Daniels', 'cleaner.seed26@shalean.test', '+27824511026', 'available', 4.61, 147, 'Mitchells Plain', -34.0525, 18.6088, now() - interval '130 days'),
  ('a000001b-0000-4000-8000-000000000000', 'Musa Qwabe', 'cleaner.seed27@shalean.test', '+27824511027', 'available', 4.89, 228, 'Cape Town CBD', -33.9242, 18.4250, now() - interval '125 days'),
  ('a000001c-0000-4000-8000-000000000000', 'René Fourie', 'cleaner.seed28@shalean.test', '+27824511028', 'busy', 4.56, 169, 'Claremont', -33.9795, 18.4662, now() - interval '120 days'),
  ('a000001d-0000-4000-8000-000000000000', 'Noluthando Maseko', 'cleaner.seed29@shalean.test', '+27824511029', 'available', 4.92, 244, 'Sea Point', -33.9138, 18.3930, now() - interval '115 days'),
  ('a000001e-0000-4000-8000-000000000000', 'Grant Michaels', 'cleaner.seed30@shalean.test', '+27824511030', 'busy', 4.47, 81, 'Rondebosch', -33.9640, 18.4755, now() - interval '110 days'),
  ('a000001f-0000-4000-8000-000000000000', 'Zinhle Moyo', 'cleaner.seed31@shalean.test', '+27824511031', 'offline', 4.83, 232, 'Green Point', -33.9048, 18.4055, now() - interval '105 days'),
  ('a0000020-0000-4000-8000-000000000000', 'Francois le Roux', 'cleaner.seed32@shalean.test', '+27824511032', 'available', 4.68, 195, 'Observatory', -33.9348, 18.4482, now() - interval '100 days')
on conflict (id) do update set
  full_name = excluded.full_name,
  email = excluded.email,
  phone = excluded.phone,
  status = excluded.status,
  rating = excluded.rating,
  total_jobs = excluded.total_jobs,
  location = excluded.location,
  home_lat = excluded.home_lat,
  home_lng = excluded.home_lng;

-- ---------------------------------------------------------------------------
-- 4) Resolve location_id from text label → locations.slug (kebab-case)
-- ---------------------------------------------------------------------------
update public.cleaners c
set location_id = l.id
from public.locations l
where c.location_id is null
  and c.location is not null
  and l.slug = lower(regexp_replace(trim(c.location), '\s+', '-', 'g'));

-- Validation (optional):
-- select count(*) as seed_cleaners from public.cleaners where email like '%@shalean.test';
-- select status, count(*) from public.cleaners where email like '%@shalean.test' group by 1 order by 1;
-- select min(rating)::numeric(3,2), max(rating)::numeric(3,2), min(total_jobs), max(total_jobs) from public.cleaners where email like '%@shalean.test';
