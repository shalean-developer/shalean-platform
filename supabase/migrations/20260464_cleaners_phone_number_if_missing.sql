-- Some databases never received the phone_number column (skipped / divergent history).
-- Align with app + seed expectations without re-introducing password_hash.

alter table public.cleaners add column if not exists phone_number text;

update public.cleaners
set phone_number = coalesce(nullif(trim(phone_number), ''), nullif(trim(phone), ''))
where phone_number is null or btrim(coalesce(phone_number, '')) = '';

create index if not exists cleaners_phone_number_idx on public.cleaners (phone_number);

comment on column public.cleaners.phone_number is 'Canonical phone for lookups; mirrors phone when unset.';
