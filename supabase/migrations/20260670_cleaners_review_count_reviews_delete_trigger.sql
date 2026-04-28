-- Cleaner review_count (denormalized from reviews) + refresh cleaner stats on review delete

alter table public.cleaners add column if not exists review_count integer not null default 0 check (review_count >= 0);

comment on column public.cleaners.review_count is 'Number of reviews; kept in sync with reviews by refresh_cleaner_rating.';

create or replace function public.refresh_cleaner_rating(p_cleaner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  avg_r double precision;
  cnt int;
begin
  select coalesce(avg(rating::double precision), 5), count(*)::int
    into avg_r, cnt
  from public.reviews
  where cleaner_id = p_cleaner_id;

  update public.cleaners
  set
    rating = round(avg_r::numeric, 2)::real,
    review_count = cnt
  where id = p_cleaner_id;
end;
$$;

create or replace function public.trg_reviews_refresh_cleaner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
begin
  cid := coalesce(new.cleaner_id, old.cleaner_id);
  if cid is not null then
    perform public.refresh_cleaner_rating(cid);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists reviews_refresh_cleaner_rating on public.reviews;
create trigger reviews_refresh_cleaner_rating
  after insert or delete or update of rating
  on public.reviews
  for each row execute function public.trg_reviews_refresh_cleaner();

-- Backfill counts from existing reviews
update public.cleaners c
set review_count = coalesce(sub.cnt, 0)
from (
  select cleaner_id, count(*)::int as cnt
  from public.reviews
  group by cleaner_id
) sub
where c.id = sub.cleaner_id;

update public.cleaners c
set review_count = 0
where not exists (select 1 from public.reviews r where r.cleaner_id = c.id);
