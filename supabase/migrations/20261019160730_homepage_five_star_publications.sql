-- Opt-in consent is separate from moderation and homepage publication. No existing review is published.
alter table public.reviews add column if not exists public_display_consent boolean not null default false;

create table public.review_homepage_publications (
  review_id uuid primary key references public.reviews(id) on delete cascade,
  approved_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete set null,
  permission_source text not null check (permission_source in ('customer_consent','office_confirmed'))
);
alter table public.review_homepage_publications enable row level security;
revoke all on public.review_homepage_publications from public, anon, authenticated;
grant select, insert, update, delete on public.review_homepage_publications to service_role;

-- Executable only by the server. The authenticated Office route independently requires content.publish.
create or replace function public.set_review_homepage_publication(
  p_review_id uuid, p_publish boolean, p_actor_id uuid, p_permission_confirmed boolean, p_expected_comment text
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
  if p_actor_id is null then raise exception 'Publishing actor required.'; end if;
  if p_permission_confirmed is not true then
    raise exception 'Confirm permission for anonymous display and check the comment for private details.';
  end if;
  if r.rating <> 5 or r.is_hidden is distinct from false or nullif(btrim(r.comment),'') is null then
    raise exception 'Only visible five-star reviews with a written comment can be approved.';
  end if;
  if not exists (
    select 1 from public.bookings b where b.id = r.booking_id and b.status = 'completed'
      and coalesce(b.booking_reference,'') not ilike 'DEVSEED%'
      and coalesce(b.customer_email,'') not ilike '%@example.com'
      and coalesce(b.customer_email,'') not ilike '%@example.invalid'
  ) then raise exception 'A completed, non-test booking is required.'; end if;
  insert into public.review_homepage_publications(review_id, approved_by, permission_source)
    values (p_review_id, p_actor_id, case when r.public_display_consent then 'customer_consent' else 'office_confirmed' end)
    on conflict (review_id) do update set approved_at = now(), approved_by = excluded.approved_by,
      permission_source = excluded.permission_source;
end;
$function$;
revoke all on function public.set_review_homepage_publication(uuid, boolean, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.set_review_homepage_publication(uuid, boolean, uuid, boolean, text) to service_role;

-- Trigger-only definer: customers cannot forge approval via direct review inserts/updates.
create or replace function public.invalidate_review_homepage_publication()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if new.rating is distinct from old.rating or new.comment is distinct from old.comment
    or new.is_hidden is distinct from old.is_hidden or new.public_display_consent is distinct from old.public_display_consent
    or new.booking_id is distinct from old.booking_id or new.user_id is distinct from old.user_id then
    delete from public.review_homepage_publications where review_id = old.id;
  end if;
  return new;
end;
$function$;
revoke all on function public.invalidate_review_homepage_publication() from public, anon, authenticated;
create trigger invalidate_review_homepage_publication before update on public.reviews
  for each row execute function public.invalidate_review_homepage_publication();

-- Minimal server-only projection. No customer names, email, address, user or booking IDs.
create or replace function public.homepage_five_star_reviews()
returns table(id uuid, rating smallint, comment text, created_at timestamptz)
language sql stable security invoker set search_path = '' as $function$
  select r.id, r.rating, r.comment, r.created_at
  from public.review_homepage_publications p
  join public.reviews r on r.id = p.review_id
  join public.bookings b on b.id = r.booking_id
  where r.rating = 5 and r.is_hidden = false and nullif(btrim(r.comment),'') is not null
    and b.status = 'completed'
    and coalesce(b.booking_reference,'') not ilike 'DEVSEED%'
    and coalesce(b.customer_email,'') not ilike '%@example.com'
    and coalesce(b.customer_email,'') not ilike '%@example.invalid'
  order by r.created_at desc, r.id desc limit 6;
$function$;
revoke all on function public.homepage_five_star_reviews() from public, anon, authenticated;
grant execute on function public.homepage_five_star_reviews() to service_role;
comment on table public.review_homepage_publications is 'Office-approved anonymous homepage testimonials. Separate from review visibility and customer opt-in.';


-- Honour the website-display choice on the existing public location-page projection too.
-- Preserve the existing 4+ star location selection; only the homepage selects exactly five.
create or replace function public.public_marketing_reviews_for_area(p_area text, p_limit integer default 4)
returns jsonb language sql stable security definer set search_path = '' as $function$
  with params as (
    select nullif(regexp_replace(lower(trim(coalesce(p_area,''))), '[%_]', '', 'g'),'') as q
  ), matched as (
    select r.id, r.rating, left(btrim(r.comment),220) as comment_excerpt, r.created_at
    from public.reviews r join public.bookings b on b.id=r.booking_id cross join params p
    where r.public_display_consent = true and r.is_hidden = false and r.rating >= 4
      and length(btrim(coalesce(r.comment,''))) >= 20 and b.status = 'completed'
      and p.q is not null and lower(coalesce(b.location,'')) like '%' || p.q || '%'
      and coalesce(b.booking_reference,'') not ilike 'DEVSEED%'
      and coalesce(b.customer_email,'') not ilike '%@example.com'
      and coalesce(b.customer_email,'') not ilike '%@example.invalid'
    order by r.created_at desc,r.id desc limit greatest(1,least(coalesce(nullif(p_limit,0),4),8))
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'rating',rating,'comment_excerpt',comment_excerpt,
    'suburb_label','','reviewer_label','Verified customer') order by created_at desc,id desc),'[]'::jsonb)
  from matched;
$function$;
revoke all on function public.public_marketing_reviews_for_area(text, integer) from public;
grant execute on function public.public_marketing_reviews_for_area(text, integer) to anon, authenticated, service_role;
