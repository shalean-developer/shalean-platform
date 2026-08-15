alter table public.pricing_extras
  add column if not exists service_slugs text[] not null default '{}'::text[];

update public.pricing_extras
set service_slugs = case
  when slug in ('carpet-cleaning','mattress-cleaning','stain-treatment','pet-odour-treatment','fabric-protector','sofa-upholstery')
    then array['carpet-cleaning']::text[]
  when slug like 'office-%' or slug = 'waste-removal'
    then array['office-cleaning']::text[]
  when slug in ('welcome-setup','inspection-photos')
    then array['airbnb-cleaning']::text[]
  when slug = 'garage-cleaning'
    then array['deep-cleaning','moving-cleaning']::text[]
  when service_type = 'light'
    then array['regular-cleaning','airbnb-cleaning']::text[]
  when service_type = 'heavy'
    then array['deep-cleaning','moving-cleaning']::text[]
  when service_type = 'all'
    then array['regular-cleaning','deep-cleaning','moving-cleaning','airbnb-cleaning']::text[]
  else '{}'::text[]
end
where cardinality(service_slugs) = 0;

alter table public.pricing_extras
  drop constraint if exists pricing_extras_service_slugs_valid;

alter table public.pricing_extras
  add constraint pricing_extras_service_slugs_valid check (
    service_slugs <@ array[
      'regular-cleaning',
      'deep-cleaning',
      'moving-cleaning',
      'office-cleaning',
      'carpet-cleaning',
      'airbnb-cleaning'
    ]::text[]
  );
