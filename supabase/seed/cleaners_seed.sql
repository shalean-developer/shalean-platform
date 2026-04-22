-- ============================================================================
-- Shalean — seed cleaners (imported from legacy export, mapped to public.cleaners)
-- ============================================================================
-- Source: cleaners_rows.sql (legacy app). Only columns that exist in this repo's
--         `public.cleaners` are populated. Omitted: photo_url, areas[], bio,
--         specialties[], password_hash, OTP flags, day booleans, payout fields, etc.
-- Prerequisites: ideally apply migrations 20260464–20260465 (or rely on ALTERs below).
--                  email + phone are NOT NULL: empty legacy emails use {digits}@cleaner.shalean.com.
-- Regenerate: node scripts/generate-cleaners-seed-from-export.mjs [path/to/export.sql]
-- ============================================================================

create extension if not exists pgcrypto;

-- Self-heal when run in SQL Editor on legacy / partial schemas (before 20260464–20260465).
alter table public.cleaners add column if not exists phone_number text;
alter table public.cleaners add column if not exists jobs_completed integer default 0;
alter table public.cleaners add column if not exists home_lat double precision;
alter table public.cleaners add column if not exists home_lng double precision;
alter table public.cleaners add column if not exists latitude double precision;
alter table public.cleaners add column if not exists longitude double precision;
alter table public.cleaners add column if not exists location text;
alter table public.cleaners add column if not exists city_id uuid;
alter table public.cleaners add column if not exists location_id uuid;
alter table public.cleaners add column if not exists is_available boolean default true;
alter table public.cleaners add column if not exists availability_start time;
alter table public.cleaners add column if not exists availability_end time;
alter table public.cleaners add column if not exists auth_user_id uuid;
alter table public.cleaners add column if not exists acceptance_rate_recent real default 1.0;
alter table public.cleaners add column if not exists tier text default 'bronze';
alter table public.cleaners add column if not exists priority_score double precision default 0;

insert into public.cleaners (
  id,
  full_name,
  phone,
  phone_number,
  email,
  status,
  rating,
  jobs_completed,
  home_lat,
  home_lng,
  latitude,
  longitude,
  location,
  is_available,
  created_at,
  availability_start,
  availability_end,
  auth_user_id,
  acceptance_rate_recent,
  tier,
  priority_score
) values

  ('04d5ae12-5f78-464b-92c8-46d61df5b5cd'::uuid, 'Silibaziso Moyo', '+27845559202', '+27845559202', '27845559202@cleaner.shalean.com', 'available', 4.7::real, 0, -33.9921063::double precision, 18.5063144::double precision, -33.9921063::double precision, 18.5063144::double precision, 'Claremont', true, '2025-10-17 19:38:30.924719+00'::timestamptz, '08:00'::time, '17:00'::time, NULL, 0::real, 'bronze', 0),
  ('19e3eb27-5be0-4e8e-a654-e42d27586ada'::uuid, 'Natasha Magashito', '+27678316466', '+27678316466', '27678316466@cleaner.shalean.com', 'available', 4.7::real, 0, -33.889916::double precision, 18.6328149::double precision, -33.889916::double precision, 18.6328149::double precision, 'Cape Town', true, '2025-10-16 22:22:13.815891+00'::timestamptz, '08:00'::time, '17:00'::time, NULL, 0::real, 'bronze', 0),
  ('21c9ed33-7054-49af-b91a-396a40746a51'::uuid, 'Ngwira Madalitso', '+27680582573', '+27680582573', '27680582573@cleaner.shalean.com', 'offline', 5::real, 0, NULL::double precision, NULL::double precision, NULL::double precision, NULL::double precision, 'Claremont', false, '2025-12-05 02:00:28.101478+00'::timestamptz, '08:00'::time, '17:00'::time, NULL, 0::real, 'bronze', 0),
  ('22304709-7c94-4d6b-b4bc-ed35e1c26fce'::uuid, 'Lucia Pazvakavambwa', '+27812736804', '+27812736804', '27812736804@cleaner.shalean.com', 'available', 4.9::real, 0, -33.9678462::double precision, 18.5118828::double precision, -33.9678462::double precision, 18.5118828::double precision, 'Muizenberg', true, '2025-10-17 19:38:30.924719+00'::timestamptz, '08:00'::time, '17:00'::time, NULL, 0::real, 'bronze', 0),
  ('2231fa06-1ba5-43d6-bf2d-ca757368a05a'::uuid, 'Normatter Mazhinji', '+27742649775', '+27742649775', '27742649775@cleaner.shalean.com', 'available', 4.8::real, 0, -34.0735381::double precision, 18.5800443::double precision, -34.0735381::double precision, 18.5800443::double precision, 'Camps Bay', true, '2025-10-17 19:38:30.924719+00'::timestamptz, '08:00'::time, '17:00'::time, NULL, 0.5::real, 'bronze', 0),
  ('2a92664c-7e6c-4cbc-9d1b-6387f1c2b021'::uuid, 'Beaulla Chemugarira', '+27810768318', '+27810768318', 'beaullachemugarira@gmail.com', 'available', 5::real, 0, -33.9542016::double precision, 18.5827328::double precision, -33.9542016::double precision, 18.5827328::double precision, 'Cape Town', true, '2025-10-19 12:45:52.990962+00'::timestamptz, '08:00'::time, '17:00'::time, NULL, 0::real, 'bronze', 0),
  ('2ba4ac8f-f271-4ce3-9811-58dbca218dc1'::uuid, 'Magaret Jiri', '+27658193061', '+27658193061', '27658193061@cleaner.shalean.com', 'available', 4.9::real, 0, -33.9921032::double precision, 18.5063148::double precision, -33.9921032::double precision, 18.5063148::double precision, 'Fish Hoek', true, '2025-10-17 19:38:30.924719+00'::timestamptz, '08:00'::time, '17:00'::time, NULL, 0.8234999999999999::real, 'bronze', 0),
  ('45427254-968d-4115-9285-b5f1b03010eb'::uuid, 'Princess Saidi', '+27738111327', '+27738111327', '27738111327@cleaner.shalean.com', 'busy', 5::real, 0, NULL::double precision, NULL::double precision, NULL::double precision, NULL::double precision, 'Seapoint', true, '2025-11-07 18:25:30.82194+00'::timestamptz, '08:00'::time, '17:00'::time, NULL, 0.7917000000000001::real, 'bronze', 0),
  ('53f7c0c0-684a-4cbe-aeec-8aa9758940c3'::uuid, 'Nicole James', '+27694069060', '+27694069060', '27694069060@cleaner.shalean.com', 'available', 4.8::real, 0, -33.93832843::double precision, 18.54384685::double precision, -33.93832843::double precision, 18.54384685::double precision, 'Gardens', true, '2025-10-17 19:38:30.924719+00'::timestamptz, '08:00'::time, '17:00'::time, NULL, 0.6486::real, 'bronze', 0),
  ('555cf8fc-9669-4d86-8857-570fc667e3f0'::uuid, 'Emarald Nyamoto', '+27719382131', '+27719382131', '27719382131@cleaner.shalean.com', 'busy', 4.6::real, 0, -34.07207207::double precision, 18.46755817::double precision, -34.07207207::double precision, 18.46755817::double precision, 'Plumstead', true, '2025-10-16 22:22:13.815891+00'::timestamptz, '08:00'::time, '17:00'::time, NULL, 0::real, 'bronze', 0),
  ('5d31128f-8508-40e7-b63f-b37ccb166cdf'::uuid, 'Sinikiwe Murire', '+27843640805', '+27843640805', '27843640805@cleaner.shalean.com', 'offline', 5::real, 0, NULL::double precision, NULL::double precision, NULL::double precision, NULL::double precision, 'Claremont', false, '2025-12-05 01:56:05.84902+00'::timestamptz, '08:00'::time, '17:00'::time, NULL, 0::real, 'bronze', 0),
  ('6fd4f144-92a8-44fd-bcd6-64005a5d0ba6'::uuid, 'Chrissy Roman', '+27752175328', '+27752175328', 'jagadrey@gmail.com', 'available', 5::real, 0, NULL::double precision, NULL::double precision, NULL::double precision, NULL::double precision, 'Capetown', true, '2025-12-05 02:04:43.018937+00'::timestamptz, '08:00'::time, '17:00'::time, NULL, 0::real, 'bronze', 0),
  ('72642f1a-4745-47e1-9a13-1edbb19b20d0'::uuid, 'Lucia Chiuta', '+27785567309', '+27785567309', '27785567309@cleaner.shalean.com', 'offline', 4.6::real, 0, -34.1297293::double precision, 18.3792748::double precision, -34.1297293::double precision, 18.3792748::double precision, 'Bishopscourt', false, '2025-10-17 19:38:30.924719+00'::timestamptz, '08:00'::time, '17:00'::time, NULL, 0.6087::real, 'bronze', 0),
  ('74ddb79f-8cdc-4483-954a-1e6d5ab562eb'::uuid, 'Ruvarashe Pazvakavambwa', '+27627958190', '+27627958190', '27627958190@cleaner.shalean.com', 'available', 4.7::real, 0, -34.0866803::double precision, 18.4878631::double precision, -34.0866803::double precision, 18.4878631::double precision, 'Bellville', true, '2025-10-17 19:38:30.924719+00'::timestamptz, '08:00'::time, '17:00'::time, NULL, 0.9512::real, 'bronze', 0),
  ('7590892c-6177-4efe-8c5f-7263b7bf19cd'::uuid, 'Tsungaimunashe Mbera', '+27699192765', '+27699192765', '27699192765@cleaner.shalean.com', 'busy', 4.9::real, 0, -34.0823614::double precision, 18.4853572::double precision, -34.0823614::double precision, 18.4853572::double precision, 'Muizenberg', true, '2025-10-16 22:22:13.815891+00'::timestamptz, '08:00'::time, '17:00'::time, NULL, 0::real, 'bronze', 0),
  ('796e3ad7-07f3-44eb-b4cf-bed439a59f8b'::uuid, 'Nyasha Mudani', '+27697567515', '+27697567515', '27697567515@cleaner.shalean.com', 'available', 4.6::real, 0, -34.0070772::double precision, 18.5946443::double precision, -34.0070772::double precision, 18.5946443::double precision, 'Simon''s Town', true, '2025-10-17 19:38:30.924719+00'::timestamptz, '08:00'::time, '17:00'::time, NULL, 0.6720999999999999::real, 'bronze', 0),
  ('869b80b9-00e2-4b34-9e42-7b87d42b4aac'::uuid, 'Mary Mugari', '+27814857486', '+27814857486', '27814857486@cleaner.shalean.com', 'offline', 4.7::real, 0, -33.87387387::double precision, 18.51136826::double precision, -33.87387387::double precision, 18.51136826::double precision, 'Table View', false, '2025-10-17 19:38:30.924719+00'::timestamptz, '08:00'::time, '17:00'::time, NULL, 1::real, 'bronze', 0),
  ('8aabdbfb-1428-44d5-8ff9-7661a0b355aa'::uuid, 'Shyleen Pfende', '+27641940583', '+27641940583', '27641940583@cleaner.shalean.com', 'available', 4.9::real, 0, -34.0866757::double precision, 18.4878949::double precision, -34.0866757::double precision, 18.4878949::double precision, 'Bergvliet', true, '2025-10-17 19:38:30.924719+00'::timestamptz, '08:00'::time, '17:00'::time, NULL, 0::real, 'bronze', 0),
  ('91068f7f-bb91-476f-ad73-ddfe376d5e4c'::uuid, 'Jacqueline Maphosa', '+27693893953', '+27693893953', '27693893953@cleaner.shalean.com', 'available', 4.8::real, 0, -34.1181578::double precision, 18.8696922::double precision, -34.1181578::double precision, 18.8696922::double precision, 'Wynberg', true, '2025-10-17 19:38:30.924719+00'::timestamptz, '08:00'::time, '17:00'::time, NULL, 0::real, 'bronze', 0),
  ('914b3acf-40e8-4ad5-a5a2-9e2de711849a'::uuid, 'Ethel Chizombe', '+27743214943', '+27743214943', '27743214943@cleaner.shalean.com', 'available', 4.8::real, 0, -33.942732::double precision, 18.6453737::double precision, -33.942732::double precision, 18.6453737::double precision, 'Claremont', true, '2025-10-17 19:38:30.924719+00'::timestamptz, '08:00'::time, '17:00'::time, NULL, 0.45899999999999996::real, 'bronze', 0),
  ('ac73ea99-48b3-4c30-9d6b-5a8beab40f33'::uuid, 'Mavis Thandeka Gurajena', '+27629474955', '+27629474955', '27629474955@cleaner.shalean.com', 'available', 4.9::real, 0, -34.0866993::double precision, 18.4878712::double precision, -34.0866993::double precision, 18.4878712::double precision, 'Green Point', true, '2025-10-17 19:38:30.924719+00'::timestamptz, '08:00'::time, '17:00'::time, NULL, 0::real, 'bronze', 0),
  ('b748ccf2-983e-43aa-9ab2-7ff27882fbe4'::uuid, 'Primrose Chinohamba', '+27815404023', '+27815404023', '27815404023@cleaner.shalean.com', 'busy', 4.8::real, 0, -33.94435381::double precision, 18.64691477::double precision, -33.94435381::double precision, 18.64691477::double precision, 'Cape Town', true, '2025-10-16 22:22:13.815891+00'::timestamptz, '08:00'::time, '17:00'::time, NULL, 0::real, 'bronze', 0),
  ('c0771cf5-3a83-4299-99ee-b0e399e8745f'::uuid, 'Mitchell Piyo', '+27607222189', '+27607222189', '27607222189@cleaner.shalean.com', 'available', 4.9::real, 0, -33.9285715::double precision, 18.414059::double precision, -33.9285715::double precision, 18.414059::double precision, 'City Bowl', true, '2025-10-17 19:38:30.924719+00'::timestamptz, '08:00'::time, '17:00'::time, NULL, 0::real, 'bronze', 0),
  ('d8a75570-4b3f-44bc-848a-ad9f33857c91'::uuid, 'Estery Phiri', '+27691445709', '+27691445709', '27691445709@cleaner.shalean.com', 'available', 4.6::real, 0, -34.085689::double precision, 18.4872247::double precision, -34.085689::double precision, 18.4872247::double precision, 'Muizenberg', true, '2025-10-17 19:38:30.924719+00'::timestamptz, '08:00'::time, '17:00'::time, NULL, 0::real, 'bronze', 0),
  ('e7e2e61a-608d-4fc7-b7d7-865988039d4a'::uuid, 'Rutendo Shamba', '+27842676534', '+27842676534', '27842676534@cleaner.shalean.com', 'available', 4.9::real, 0, -33.87387387::double precision, 18.51136826::double precision, -33.87387387::double precision, 18.51136826::double precision, 'Century City', true, '2025-10-16 22:22:13.815891+00'::timestamptz, '08:00'::time, '17:00'::time, NULL, 0.92::real, 'bronze', 0),
  ('f781f062-dbed-4a33-84eb-f3bef3493063'::uuid, 'Marvellous Muneri', '+27603634903', '+27603634903', '27603634903@cleaner.shalean.com', 'available', 5::real, 0, NULL::double precision, NULL::double precision, NULL::double precision, NULL::double precision, 'Capetown', true, '2025-12-04 19:58:11.739+00'::timestamptz, '08:00'::time, '17:00'::time, NULL, 0::real, 'bronze', 0)

on conflict (id) do update set
  full_name = excluded.full_name,
  phone = excluded.phone,
  phone_number = excluded.phone_number,
  email = excluded.email,
  status = excluded.status,
  rating = excluded.rating,
  home_lat = excluded.home_lat,
  home_lng = excluded.home_lng,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  location = excluded.location,
  is_available = excluded.is_available,
  availability_start = excluded.availability_start,
  availability_end = excluded.availability_end,
  acceptance_rate_recent = excluded.acceptance_rate_recent,
  tier = excluded.tier,
  priority_score = excluded.priority_score;
