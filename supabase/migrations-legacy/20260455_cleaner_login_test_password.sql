-- Temporary test credential for cleaner login debugging.
-- Password: 123456
alter table public.cleaners
  add column if not exists phone_number text,
  add column if not exists password_hash text;

update public.cleaners
set phone_number = coalesce(nullif(trim(phone_number), ''), nullif(trim(phone), ''))
where phone_number is null;

update public.cleaners
set password_hash = '$2b$10$TSgg6FPhxT9aDYUl8.gFAu.nu80riWTO1z3Io5kXcoij7p3O87YKK'
where phone_number in ('0792022648', '27792022648', '+27792022648');
