alter table public.cleaners
  add column if not exists phone_number text,
  add column if not exists password_hash text;

update public.cleaners
set phone_number = coalesce(nullif(trim(phone_number), ''), nullif(trim(phone), ''))
where phone_number is null;

update public.cleaners
set phone_number = concat('cleaner-', substr(id::text, 1, 8))
where phone_number is null;

with dups as (
  select id, phone_number, row_number() over (partition by phone_number order by created_at, id) as rn
  from public.cleaners
)
update public.cleaners c
set phone_number = concat(c.phone_number, '-', substr(c.id::text, 1, 4))
from dups d
where c.id = d.id and d.rn > 1;

update public.cleaners
set password_hash = '$2b$10$7EqJtq98hPqEX7fNZaFWoO5w5uE8q5Mzdg3NofM8JrIoYNewc0h7W'
where password_hash is null;

alter table public.cleaners
  alter column phone_number set not null,
  alter column password_hash set not null;

create unique index if not exists cleaners_phone_number_unique_idx
  on public.cleaners (phone_number);
