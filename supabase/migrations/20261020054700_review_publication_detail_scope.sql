-- Office omission controls the publication snapshot, not the customer's permission.
-- Explicitly confirmed added scopes may be recorded; an omitted scope never clears existing consent.
create or replace function public.set_review_homepage_publication_v2(
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
  update public.reviews set public_name_consent=r.public_name_consent or (p_details->>'name')::boolean,
    public_area_consent=r.public_area_consent or (p_details->>'area')::boolean, public_service_consent=r.public_service_consent or (p_details->>'service')::boolean where id=p_review_id;
  update public.review_homepage_publications set
    details_permission_source='office_confirmed',
    display_name=case when (p_details->>'name')::boolean then c.display_name end,
    suburb_label=case when (p_details->>'area')::boolean then c.suburb_label end,
    service_key=case when (p_details->>'service')::boolean then c.service_key end where review_id=p_review_id;
end;
$function$;
revoke all on function public.set_review_homepage_publication_v2(uuid,boolean,uuid,boolean,text,boolean,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.set_review_homepage_publication_v2(uuid,boolean,uuid,boolean,text,boolean,jsonb,jsonb,jsonb) to service_role;

