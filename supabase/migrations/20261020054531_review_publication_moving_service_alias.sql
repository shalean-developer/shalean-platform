-- Recognize the canonical booking-v2 moving service and its supported legacy aliases.
create or replace function public.review_publication_context(p_review_ids uuid[])
returns table(review_id uuid, display_name text, suburb_label text, service_key text)
language sql stable security invoker set search_path = '' as $function$
  with source as (
    select r.id, regexp_split_to_array(btrim(regexp_replace(coalesce(nullif(btrim(u.full_name),''), b.customer_name,''), '\s+', ' ', 'g')), ' ') as names,
      l.name as area, lower(coalesce(nullif(btrim(b.service_slug),''), b.service,'')) as service
    from public.reviews r join public.bookings b on b.id=r.booking_id
    left join public.user_profiles u on u.id=r.user_id
    left join public.locations l on l.id=b.location_id
    where r.id=any(p_review_ids)
  )
  select id,
    case when array_length(names,1) between 1 and 8
      and not exists (select 1 from unnest(names) n where n !~ '^[[:alpha:]][[:alpha:]’''-]*$')
      and lower(names[1]) not in ('unknown','anonymous','customer','test')
      then names[1] || case when array_length(names,1)>1 then ' ' || left(names[array_length(names,1)],1) || '.' else '' end
      else null end,
    nullif(btrim(area),''),
    case when service in ('standard','standard_cleaning','standard-cleaning','regular','regular-cleaning','regular_cleaning') then 'standard'
      when service in ('deep','deep-cleaning','deep_cleaning') then 'deep'
      when service in ('moving-cleaning','moving','move-in','move-out','moving-in-cleaning','move_cleaning','move-cleaning','move','move-in-out','move-in-out-cleaning','move-out-cleaning','move_out_cleaning') then 'move'
      when service in ('airbnb','airbnb-cleaning','airbnb_cleaning') then 'airbnb'
      when service in ('office','office-cleaning','office_cleaning') then 'office'
      when service in ('carpet','carpet-cleaning','carpet_cleaning') then 'carpet'
      else null end
  from source;
$function$;
revoke all on function public.review_publication_context(uuid[]) from public, anon, authenticated;
grant execute on function public.review_publication_context(uuid[]) to service_role;

