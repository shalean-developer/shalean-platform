-- Cleaner-requested work area / weekday changes (admin approves; no self-serve edits on cleaners row).

create table if not exists public.cleaner_change_requests (
  id uuid primary key default gen_random_uuid(),
  cleaner_id uuid not null references public.cleaners (id) on delete cascade,
  requested_location text not null,
  requested_days text[] not null default '{}'::text[],
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text
);

create index if not exists cleaner_change_requests_cleaner_status_idx
  on public.cleaner_change_requests (cleaner_id, status, created_at desc);

create index if not exists cleaner_change_requests_pending_created_idx
  on public.cleaner_change_requests (status, created_at asc)
  where status = 'pending';

comment on table public.cleaner_change_requests is
  'Cleaner-submitted preferred service area and weekdays; ops applies to cleaners via approve flow.';

alter table public.cleaner_change_requests enable row level security;

create policy cleaner_change_requests_insert_own
  on public.cleaner_change_requests
  for insert
  to authenticated
  with check (
    cleaner_id in (select c.id from public.cleaners c where c.auth_user_id = auth.uid())
  );

create policy cleaner_change_requests_select_own
  on public.cleaner_change_requests
  for select
  to authenticated
  using (
    cleaner_id in (select c.id from public.cleaners c where c.auth_user_id = auth.uid())
  );

grant select, insert on public.cleaner_change_requests to authenticated;

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

  update public.cleaners
  set
    location = nullif(trim(r.requested_location), ''),
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
  'Atomically applies a pending cleaner change request to cleaners.location and availability_weekdays.';

revoke all on function public.approve_cleaner_change_request(uuid, text) from public;
grant execute on function public.approve_cleaner_change_request(uuid, text) to service_role;
