-- When `bookings_price_snapshot_required_check` is validated, inserts must set `price_snapshot`.
-- App code sets it for recurring + checkout; this trigger backfills any NULL payload from `total_paid_zar`
-- / `total_price` + `service_slug` so API/cron inserts cannot violate the check (e.g. older deploys).

create or replace function public.bookings_default_price_snapshot_if_missing()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  z numeric;
  slug text;
begin
  if new.price_snapshot is not null then
    return new;
  end if;

  z := round(coalesce(new.total_paid_zar::numeric, new.total_price::numeric, 0));
  slug := nullif(trim(coalesce(new.service_slug::text, '')), '');
  if slug is null or slug = '' then
    slug := 'standard';
  end if;

  if z < 1 and new.booking_snapshot is not null then
    z := 1;
  end if;

  if z < 1 then
    return new;
  end if;

  z := greatest(1, z);

  new.price_snapshot := jsonb_build_object(
    'v', 1,
    'service_type', slug,
    'base_price', z,
    'extras', '[]'::jsonb,
    'total_price', z
  );

  return new;
end;
$$;

comment on function public.bookings_default_price_snapshot_if_missing() is
  'BEFORE INSERT: if price_snapshot is null, derive minimal PriceSnapshotV1-shaped jsonb from total_paid_zar/total_price and service_slug.';

drop trigger if exists trg_bookings_default_price_snapshot_bi on public.bookings;

create trigger trg_bookings_default_price_snapshot_bi
  before insert on public.bookings
  for each row execute function public.bookings_default_price_snapshot_if_missing();
