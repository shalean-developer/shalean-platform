-- Extra attribution is opt-in. Existing anonymous approvals and choices remain valid.
alter table public.reviews
  add column public_name_consent boolean not null default false,
  add column public_area_consent boolean not null default false,
  add column public_service_consent boolean not null default false;
alter table public.review_homepage_publications
  add column display_name text,
  add column suburb_label text,
  add column service_key text,
  add column details_permission_source text check (details_permission_source in ('office_confirmed'));

-- Server/Office preview only. Never select street addresses or return full customer names.
-- Only a linked location-catalog entry may supply a suburb.
create function public.review_publication_context(p_review_ids uuid[])
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
      when service in ('move','move-in-out','move-in-out-cleaning','move-out-cleaning','move_out_cleaning') then 'move'
      when service in ('airbnb','airbnb-cleaning','airbnb_cleaning') then 'airbnb'
      when service in ('office','office-cleaning','office_cleaning') then 'office'
      when service in ('carpet','carpet-cleaning','carpet_cleaning') then 'carpet'
      else null end
  from source;
$function$;
revoke all on function public.review_publication_context(uuid[]) from public, anon, authenticated;
grant execute on function public.review_publication_context(uuid[]) to service_role;

-- Versioned API keeps old callers working during schema-first rollout and rollback.
-- Approval snapshots the preview, so later profile/booking changes cannot silently change attribution.
create function public.set_review_homepage_publication_v2(
  p_review_id uuid, p_publish boolean, p_actor_id uuid, p_permission_confirmed boolean,
  p_expected_comment text, p_expected_consent boolean,
  p_expected_preferences jsonb, p_expected_context jsonb, p_details jsonb
) returns void language plpgsql security invoker set search_path = '' as $function$
declare r public.reviews%rowtype; c record;
begin
  select * into r from public.reviews where id=p_review_id for update;
  if not found then raise exception 'Review not found.'; end if;
  if p_publish is not true then
    delete from public.review_homepage_publications where review_id=p_review_id;
    return;
  end if;
  if p_expected_preferences is distinct from jsonb_build_object('name',r.public_name_consent,'area',r.public_area_consent,'service',r.public_service_consent) then
    raise exception 'Detail permissions changed. Refresh before approving.';
  end if;
  select * into c from public.review_publication_context(array[p_review_id]);
  if p_expected_context is distinct from jsonb_build_object('display_name',c.display_name,'suburb_label',c.suburb_label,'service_key',c.service_key) then
    raise exception 'Review context changed. Refresh and check the public preview.';
  end if;
  if p_details is null or jsonb_typeof(p_details->'name') is distinct from 'boolean'
    or jsonb_typeof(p_details->'area') is distinct from 'boolean' or jsonb_typeof(p_details->'service') is distinct from 'boolean' then
    raise exception 'Explicit detail choices required.';
  end if;
  if ((p_details->>'name')::boolean and c.display_name is null)
    or ((p_details->>'area')::boolean and c.suburb_label is null)
    or ((p_details->>'service')::boolean and c.service_key is null) then
    raise exception 'A selected detail is unavailable. Review the public preview.';
  end if;
  -- Reuse the original actor, comment, consent, completion, moderation and test-data guards.
  perform public.set_review_homepage_publication(p_review_id,true,p_actor_id,p_permission_confirmed,p_expected_comment,p_expected_consent);
  update public.reviews set public_name_consent=(p_details->>'name')::boolean,
    public_area_consent=(p_details->>'area')::boolean, public_service_consent=(p_details->>'service')::boolean where id=p_review_id;
  update public.review_homepage_publications set
    details_permission_source='office_confirmed',
    display_name=case when (p_details->>'name')::boolean then c.display_name end,
    suburb_label=case when (p_details->>'area')::boolean then c.suburb_label end,
    service_key=case when (p_details->>'service')::boolean then c.service_key end where review_id=p_review_id;
end;
$function$;
revoke all on function public.set_review_homepage_publication_v2(uuid,boolean,uuid,boolean,text,boolean,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.set_review_homepage_publication_v2(uuid,boolean,uuid,boolean,text,boolean,jsonb,jsonb,jsonb) to service_role;

create function public.homepage_five_star_reviews_v2()
returns table(id uuid, rating smallint, comment text, created_at timestamptz, display_name text, suburb_label text, service_key text)
language sql stable security invoker set search_path = '' as $function$
  select f.id,f.rating,f.comment,f.created_at,
    case when r.public_name_consent then p.display_name end,
    case when r.public_area_consent then p.suburb_label end,
    case when r.public_service_consent then p.service_key end
  from public.homepage_five_star_reviews() f
  join public.reviews r on r.id=f.id
  join public.review_homepage_publications p on p.review_id=f.id
  where r.public_display_consent=true
  order by f.created_at desc,f.id desc;
$function$;
revoke all on function public.homepage_five_star_reviews_v2() from public,anon,authenticated;
grant execute on function public.homepage_five_star_reviews_v2() to service_role;
comment on table public.review_homepage_publications is 'Office-approved website reviews. Optional attribution is separately permitted, previewed and snapshotted. Withdrawal masks details immediately.';
