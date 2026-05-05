-- Location hub marketing: recent verified review snippets matched by booking address text (anon-safe RPC).

create or replace function public.public_marketing_reviews_for_area(p_area text, p_limit integer default 4)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select nullif(
      regexp_replace(lower(trim(coalesce(p_area, ''))), '[%_]', '', 'g'),
      ''
    ) as q
  ),
  lim as (
    select greatest(1, least(coalesce(nullif(p_limit, 0), 4), 8))::int as n
  ),
  matched as (
    select
      r.id as review_id,
      r.rating::int as rating,
      left(
        trim(regexp_replace(coalesce(r.comment, ''), E'\\s+', ' ', 'g')),
        220
      ) as comment_excerpt,
      case
        when strpos(coalesce(b.location, ''), ',') > 0 then
          trim(substring(b.location from strpos(b.location, ',') + 1))
        else nullif(trim(coalesce(b.location, '')), '')
      end as suburb_raw,
      case
        when nullif(trim(b.customer_name), '') is not null then split_part(trim(b.customer_name), ' ', 1)
        else 'Customer'
      end as reviewer_first,
      r.created_at
    from public.reviews r
    inner join public.bookings b on b.id = r.booking_id
    cross join params p
    cross join lim l
    where coalesce(r.is_hidden, false) = false
      and r.rating >= 4
      and length(trim(coalesce(r.comment, ''))) >= 20
      and p.q is not null
      and lower(coalesce(b.location, '')) like '%' || p.q || '%'
    order by r.created_at desc
    limit (select n from lim)
  )
  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', review_id,
          'rating', rating,
          'comment_excerpt', comment_excerpt,
          'suburb_label', coalesce(suburb_raw, ''),
          'reviewer_label', reviewer_first
        )
        order by created_at desc
      )
      from matched
    ),
    '[]'::jsonb
  );
$$;

revoke all on function public.public_marketing_reviews_for_area(text, integer) from public;
grant execute on function public.public_marketing_reviews_for_area(text, integer) to anon, authenticated, service_role;

comment on function public.public_marketing_reviews_for_area is
  'Marketing location hubs: recent non-hidden reviews with comments whose booking address contains the area phrase (case-insensitive).';
