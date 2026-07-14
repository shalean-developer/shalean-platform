-- Team-eligible rows: ensure payout_owner is set when still null (e.g. roster drift).
update public.bookings b
set payout_owner_cleaner_id = x.lead_id
from (
  select distinct on (b2.id)
    b2.id,
    tm.cleaner_id as lead_id
  from public.bookings b2
  inner join public.team_members tm on tm.team_id = b2.team_id and tm.cleaner_id is not null
  where b2.is_team_job = true
    and b2.cleaner_id is null
    and b2.team_id is not null
    and b2.payout_owner_cleaner_id is null
  order by b2.id, tm.cleaner_id asc
) x
where b.id = x.id;

-- Mark paid: solo cleaner, payout owner, OR any active team member for that booking's team.
create or replace function public.admin_mark_payout_paid(p_cleaner_ids uuid[])
returns table(updated_count bigint, payout_run_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid := gen_random_uuid();
  v_count bigint := 0;
begin
  with locked as (
    select b.id
    from public.bookings b
    where b.payout_status = 'eligible'
      and (
        b.cleaner_id = any(p_cleaner_ids)
        or b.payout_owner_cleaner_id = any(p_cleaner_ids)
        or (
          b.is_team_job = true
          and b.team_id is not null
          and exists (
            select 1
            from public.team_members tm
            where tm.team_id = b.team_id
              and tm.cleaner_id is not null
              and tm.cleaner_id = any(p_cleaner_ids)
          )
        )
      )
    for update
  ),
  updated as (
    update public.bookings b
    set
      payout_status = 'paid',
      payout_paid_at = now(),
      payout_run_id = v_run_id
    from locked l
    where b.id = l.id
    returning b.id
  )
  select count(*)::bigint into v_count from updated;

  return query select v_count, v_run_id;
end;
$$;

comment on function public.admin_mark_payout_paid(uuid[]) is
  'Marks eligible bookings paid for given cleaner ids: cleaner_id, payout_owner_cleaner_id, or team_members.cleaner_id on team jobs.';

revoke all on function public.admin_mark_payout_paid(uuid[]) from public;
grant execute on function public.admin_mark_payout_paid(uuid[]) to service_role;

-- Legacy solo assigned rows: null response treated as acknowledged in app lifecycle.
update public.bookings
set cleaner_response_status = 'accepted'
where status = 'assigned'
  and cleaner_id is not null
  and (cleaner_response_status is null or btrim(cleaner_response_status) = '');
