-- Website approval supports every star rating; the existing Home feed stays exactly five stars.
-- No review is automatically approved and no customer permission is changed by this migration.
create or replace function public.set_review_homepage_publication(
  p_review_id uuid, p_publish boolean, p_actor_id uuid, p_permission_confirmed boolean, p_expected_comment text, p_expected_consent boolean
) returns void language plpgsql security invoker set search_path = '' as $function$
declare r public.reviews%rowtype;
begin
  select * into r from public.reviews where id = p_review_id for update;
  if not found then raise exception 'Review not found.'; end if;
  if p_publish is not true then
    delete from public.review_homepage_publications where review_id = p_review_id;
    return;
  end if;
  if r.comment is distinct from p_expected_comment then
    raise exception 'Review changed. Refresh and check the current comment before approving.';
  end if;
  if r.public_display_consent is distinct from p_expected_consent then
    raise exception 'Display permission changed. Refresh and check current permission before approving.';
  end if;
  if p_actor_id is null then raise exception 'Publishing actor required.'; end if;
  if p_permission_confirmed is not true then
    raise exception 'Confirm permission for anonymous display and check the comment for private details.';
  end if;
  if (r.rating is null or r.rating not between 1 and 5) or r.is_hidden is distinct from false or nullif(btrim(r.comment),'') is null then
    raise exception 'Only visible one-to-five-star reviews with a written comment can be approved.';
  end if;
  if not exists (
    select 1 from public.bookings b where b.id = r.booking_id and (b.status = 'completed' or b.completed_at is not null) and coalesce(b.status,'') not in ('cancelled','failed','payment_expired','pending_payment') and b.is_test = false
      and coalesce(b.booking_reference,'') not ilike 'DEVSEED%'
      and coalesce(b.customer_email,'') not ilike '%@example.com'
      and coalesce(b.customer_email,'') not ilike '%@example.invalid'
  ) then raise exception 'A completed, non-test booking is required.'; end if;
  -- Office has explicitly confirmed customer permission. Keep the owner's preference
  -- accurate and let their later withdrawal revoke this publication via the trigger.
  if r.public_display_consent is not true then
    update public.reviews set public_display_consent = true where id = p_review_id;
  end if;
  insert into public.review_homepage_publications(review_id, approved_by, permission_source)
    values (p_review_id, p_actor_id, case when r.public_display_consent then 'customer_consent' else 'office_confirmed' end)
    on conflict (review_id) do update set approved_at = now(), approved_by = excluded.approved_by,
      permission_source = excluded.permission_source;
end;
$function$;
revoke all on function public.set_review_homepage_publication(uuid, boolean, uuid, boolean, text, boolean) from public, anon, authenticated;
grant execute on function public.set_review_homepage_publication(uuid, boolean, uuid, boolean, text, boolean) to service_role;

-- Bounded server-only listing independent of the six-review Home selection.
create function public.published_customer_reviews(p_offset integer default 0, p_limit integer default 13)
returns table(id uuid, rating smallint, comment text, created_at timestamptz, display_name text, suburb_label text, service_key text)
language sql stable security invoker set search_path = '' as $function$
  select r.id,r.rating,r.comment,r.created_at,
    case when r.public_name_consent then p.display_name end,
    case when r.public_area_consent then p.suburb_label end,
    case when r.public_service_consent then p.service_key end
  from public.review_homepage_publications p
  join public.reviews r on r.id=p.review_id
  join public.bookings b on b.id=r.booking_id
  where r.rating between 1 and 5 and r.is_hidden=false and r.public_display_consent=true
    and nullif(btrim(r.comment),'') is not null
    and (b.status='completed' or b.completed_at is not null)
    and coalesce(b.status,'') not in ('cancelled','failed','payment_expired','pending_payment') and b.is_test=false
    and coalesce(b.booking_reference,'') not ilike 'DEVSEED%'
    and coalesce(b.customer_email,'') not ilike '%@example.com'
    and coalesce(b.customer_email,'') not ilike '%@example.invalid'
  order by r.created_at desc,r.id desc
  limit greatest(1,least(coalesce(p_limit,13),25)) offset greatest(0,coalesce(p_offset,0));
$function$;
revoke all on function public.published_customer_reviews(integer,integer) from public,anon,authenticated;
grant execute on function public.published_customer_reviews(integer,integer) to service_role;
