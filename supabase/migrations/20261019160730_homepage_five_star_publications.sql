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
