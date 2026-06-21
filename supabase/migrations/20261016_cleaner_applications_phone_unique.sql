alter table public.cleaner_applications
  add column if not exists phone_normalized text;

update public.cleaner_applications
set phone_normalized = regexp_replace(phone, '\D', '', 'g')
where phone_normalized is null or phone_normalized = '';

create unique index if not exists cleaner_applications_phone_active_uidx
  on public.cleaner_applications (phone_normalized)
  where status in ('pending', 'approved') and phone_normalized is not null and phone_normalized <> '';

create index if not exists cleaner_applications_phone_normalized_idx
  on public.cleaner_applications (phone_normalized);
