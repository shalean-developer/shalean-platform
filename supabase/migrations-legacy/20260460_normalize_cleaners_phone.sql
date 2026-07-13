-- Normalize public.cleaners.phone to +27XXXXXXXXX (9 digits after country code) for reliable cleaner login.

update public.cleaners
set phone = '+' || regexp_replace(trim(phone), '\D', '', 'g')
where phone is not null
  and trim(phone) <> ''
  and regexp_replace(trim(phone), '\D', '', 'g') ~ '^27[0-9]{9}$'
  and trim(phone) not like '+%';

update public.cleaners
set phone = '+27' || substring(regexp_replace(trim(phone), '\D', '', 'g') from 2 for 9)
where phone is not null
  and trim(phone) <> ''
  and regexp_replace(trim(phone), '\D', '', 'g') ~ '^0[0-9]{9}$';

update public.cleaners
set phone = '+27' || regexp_replace(trim(phone), '\D', '', 'g')
where phone is not null
  and trim(phone) <> ''
  and regexp_replace(trim(phone), '\D', '', 'g') ~ '^[0-9]{9}$'
  and regexp_replace(trim(phone), '\D', '', 'g') !~ '^0'
  and regexp_replace(trim(phone), '\D', '', 'g') !~ '^27';

-- Align phone_number with phone when that column exists (added in 20260442 / 20260454).
update public.cleaners
set phone_number = phone
where phone is not null;
