update public.cleaners
set status = case
  when status is null then null
  when lower(trim(status)) = 'active' then 'available'
  when lower(trim(status)) in ('available','busy','unavailable','day_off','sick','leave','training','suspended','inactive','offline') then lower(trim(status))
  else 'offline'
end;
