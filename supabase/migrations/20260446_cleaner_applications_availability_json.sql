alter table public.cleaner_applications
  alter column availability type jsonb
  using case
    when availability is null or btrim(availability) = '' then '[]'::jsonb
    else to_jsonb(string_to_array(availability, ','))
  end;

alter table public.cleaner_applications
  alter column availability set default '[]'::jsonb;
