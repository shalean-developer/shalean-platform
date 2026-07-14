-- WhatsApp dispatch support: cleaner phone destination.

alter table public.cleaners
  add column if not exists phone_number text;

create index if not exists cleaners_phone_number_idx
  on public.cleaners (phone_number);
