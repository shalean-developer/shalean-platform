-- Align change-request approval with dispatch: sync `cleaner_locations` + primary `cleaners.location_id`.
-- One pending request per cleaner (dedupe legacy rows, then partial unique index).

-- Keep oldest pending row per cleaner; remove newer duplicates so the unique index can apply.
delete from public.cleaner_change_requests del
where del.status = 'pending'
  and exists (
    select 1
    from public.cleaner_change_requests keep
    where keep.cleaner_id = del.cleaner_id
      and keep.status = 'pending'
      and (keep.created_at, keep.id) < (del.created_at, del.id)
  );

create unique index if not exists cleaner_change_requests_one_pending_per_cleaner_uidx
  on public.cleaner_change_requests (cleaner_id)
  where status = 'pending';

create or replace function public.approve_cleaner_change_request(p_request_id uuid, p_reviewer text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.cleaner_change_requests%rowtype;
  bad_day boolean;
  unmapped_labels int;
  primary_location_id uuid;
  primary_city_id uuid;
begin
  select * into r from public.cleaner_change_requests where id = p_request_id for update;
  if not found then
    raise exception 'change_request_not_found';
  end if;
  if r.status is distinct from 'pending' then
    raise exception 'change_request_not_pending';
  end if;
  if r.requested_days is null or cardinality(r.requested_days) = 0 then
    raise exception 'change_request_invalid_days';
  end if;
  if r.requested_locations is null or cardinality(r.requested_locations) = 0 then
    raise exception 'change_request_invalid_locations';
  end if;

  select exists (
    select 1
    from unnest(r.requested_days) as d(day)
    where lower(trim(day)) not in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')
  )
  into bad_day;
  if bad_day then
    raise exception 'change_request_invalid_days';
  end if;

  select count(*)::int
  into unmapped_labels
  from (
    select distinct trim(x) as lbl
    from unnest(r.requested_locations) as x
    where trim(x) is not null and trim(x) <> ''
  ) lb
  where not exists (
    select 1
    from public.locations l
    where lower(trim(l.slug)) = lower(regexp_replace(trim(lb.lbl), '\s+', '-', 'g'))
       or lower(trim(l.name)) = lower(trim(lb.lbl))
  );

  if unmapped_labels > 0 then
    raise exception 'change_request_unknown_location';
  end if;

  delete from public.cleaner_locations where cleaner_id = r.cleaner_id;

  insert into public.cleaner_locations (cleaner_id, location_id)
  select distinct r.cleaner_id, l.id
  from unnest(r.requested_locations) as x
  inner join public.locations l
    on lower(trim(l.slug)) = lower(regexp_replace(trim(x), '\s+', '-', 'g'))
    or lower(trim(l.name)) = lower(trim(x))
  where trim(x) is not null and trim(x) <> ''
  on conflict (cleaner_id, location_id) do nothing;

  select l.id, l.city_id
  into primary_location_id, primary_city_id
  from unnest(r.requested_locations) as x
  inner join public.locations l
    on lower(trim(l.slug)) = lower(regexp_replace(trim(x), '\s+', '-', 'g'))
    or lower(trim(l.name)) = lower(trim(x))
  where trim(x) is not null and trim(x) <> ''
  order by l.slug asc nulls last
  limit 1;

  update public.cleaners
  set
    location = nullif(trim(array_to_string(r.requested_locations, ', ')), ''),
    location_id = primary_location_id,
    city_id = coalesce(primary_city_id, city_id),
    availability_weekdays = r.requested_days
  where id = r.cleaner_id;

  update public.cleaner_change_requests
  set
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = nullif(trim(p_reviewer), '')
  where id = p_request_id;
end;
$$;

comment on function public.approve_cleaner_change_request(uuid, text) is
  'Applies a pending change request: replaces cleaner_locations from catalog labels, sets primary location_id/city_id, display location text, and availability_weekdays.';

revoke all on function public.approve_cleaner_change_request(uuid, text) from public;
grant execute on function public.approve_cleaner_change_request(uuid, text) to service_role;
