alter table public.pricing_services
  add column if not exists service_fee_zar integer;

alter table public.pricing_services
  drop constraint if exists pricing_services_service_fee_zar_nonnegative;

alter table public.pricing_services
  add constraint pricing_services_service_fee_zar_nonnegative
  check (service_fee_zar is null or service_fee_zar >= 0);

update public.pricing_services
set service_fee_zar = case slug
  when 'standard' then 30
  when 'airbnb' then 30
  when 'quick' then 40
  when 'carpet' then 50
  when 'deep' then 60
  when 'move' then 60
  else service_fee_zar
end,
updated_at = now()
where slug in ('standard', 'airbnb', 'quick', 'carpet', 'deep', 'move');
