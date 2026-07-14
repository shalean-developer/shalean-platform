-- Prefer multiple requested service areas per cleaner change request (replaces single text column).

alter table public.cleaner_change_requests
  add column if not exists requested_locations text[];

update public.cleaner_change_requests
set requested_locations = array[nullif(trim(requested_location), '')]
where requested_locations is null
  and requested_location is not null
  and trim(requested_location) <> '';

update public.cleaner_change_requests
set requested_locations = '{}'::text[]
where requested_locations is null;

alter table public.cleaner_change_requests
  alter column requested_locations set default '{}'::text[],
  alter column requested_locations set not null;

create or replace function public.approve_cleaner_change_request(p_request_id uuid, p_reviewer text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.cleaner_change_requests%rowtype;
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

  update public.cleaners
  set
    location = nullif(trim(array_to_string(r.requested_locations, ', ')), ''),
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
  'Atomically applies a pending cleaner change request to cleaners.location (joined requested areas) and availability_weekdays.';

alter table public.cleaner_change_requests drop column if exists requested_location;
