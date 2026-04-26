-- Atomic capacity check + insert under team row lock (prevents concurrent over-capacity adds).
-- DROP required when return type (or other signature details) changed vs a prior deploy.

drop function if exists public.add_team_members_guarded(uuid, uuid[]);

create or replace function public.add_team_members_guarded(
  p_team_id uuid,
  p_cleaner_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity int;
  v_current int;
  v_is_active boolean;
  v_to_add int;
  v_now timestamptz := now();
  v_inserted int := 0;
  v_ids jsonb := '[]'::jsonb;
  v_after int;
  v_new_ids uuid[];
  v_row_diag int;
  v_on_roster int;
begin
  if p_cleaner_ids is null or coalesce(array_length(p_cleaner_ids, 1), 0) = 0 then
    return jsonb_build_object('ok', true, 'inserted', 0, 'cleaner_ids', '[]'::jsonb);
  end if;

  if array_length(p_cleaner_ids, 1) > 50 then
    return jsonb_build_object(
      'ok', false,
      'error', 'Too many IDs.',
      'code', 'TOO_MANY_IDS',
      'http_status', 400
    );
  end if;

  set local lock_timeout = '2s';
  set local statement_timeout = '3s';

  begin
    select t.capacity_per_day, coalesce(t.is_active, false)
    into v_capacity, v_is_active
    from public.teams t
    where t.id = p_team_id
    for update;
    if not found then
      return jsonb_build_object(
        'ok', false,
        'error', 'Team not found.',
        'code', 'TEAM_NOT_FOUND',
        'http_status', 404
      );
    end if;
  exception
    when lock_not_available then
      return jsonb_build_object(
        'ok', false,
        'error', 'Team is busy, try again.',
        'code', 'TEAM_BUSY',
        'http_status', 409
      );
    when deadlock_detected then
      return jsonb_build_object(
        'ok', false,
        'error', 'Team is busy, try again.',
        'code', 'TEAM_BUSY',
        'http_status', 409
      );
    when query_canceled then
      if sqlerrm ilike '%lock timeout%' then
        return jsonb_build_object(
          'ok', false,
          'error', 'Team is busy, try again.',
          'code', 'TEAM_BUSY',
          'http_status', 409
        );
      end if;
      raise;
  end;

  if v_is_active is not true then
    return jsonb_build_object(
      'ok', false,
      'error', 'Team is inactive.',
      'code', 'TEAM_INACTIVE',
      'http_status', 400
    );
  end if;

  v_capacity := greatest(coalesce(v_capacity, 1), 1);

  select count(*)::int
  into v_current
  from public.team_members tm
  where tm.team_id = p_team_id
    and tm.cleaner_id is not null;

  with input_ids as (
    select distinct u.cid
    from unnest(p_cleaner_ids) as u(cid)
    where u.cid is not null
      and u.cid <> '00000000-0000-0000-0000-000000000000'::uuid
      and u.cid::text ~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  ),
  new_ids as (
    select i.cid
    from input_ids i
    inner join public.cleaners c on c.id = i.cid
    where not exists (
      select 1
      from public.team_members tm
      where tm.team_id = p_team_id
        and tm.cleaner_id = i.cid
    )
  )
  select count(*)::int into v_to_add from new_ids;

  if v_to_add = 0 then
    select count(*)::int
    into v_after
    from public.team_members tm
    where tm.team_id = p_team_id
      and tm.cleaner_id is not null;

    return jsonb_build_object(
      'ok', true,
      'inserted', 0,
      'cleaner_ids', '[]'::jsonb,
      'skipped_all_duplicates', true,
      'current', v_after,
      'capacity', v_capacity
    );
  end if;

  if v_current + v_to_add > v_capacity then
    return jsonb_build_object(
      'ok', false,
      'error', 'Exceeds team capacity.',
      'code', 'EXCEEDS_CAPACITY',
      'http_status', 409,
      'current', v_current,
      'capacity', v_capacity,
      'would_add', v_to_add
    );
  end if;

  with input_ids as (
    select distinct u.cid
    from unnest(p_cleaner_ids) as u(cid)
    where u.cid is not null
      and u.cid <> '00000000-0000-0000-0000-000000000000'::uuid
      and u.cid::text ~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  ),
  new_ids as (
    select i.cid
    from input_ids i
    inner join public.cleaners c on c.id = i.cid
    where not exists (
      select 1
      from public.team_members tm
      where tm.team_id = p_team_id
        and tm.cleaner_id = i.cid
    )
  )
  select coalesce(array_agg(cid order by cid), array[]::uuid[])
  into v_new_ids
  from new_ids;

  insert into public.team_members (team_id, cleaner_id, active_from, active_to)
  select p_team_id, x, v_now, null
  from unnest(v_new_ids) as x
  on conflict (team_id, cleaner_id) do nothing;

  get diagnostics v_row_diag = row_count;

  select
    coalesce(count(*)::int, 0),
    coalesce(jsonb_agg(tm.cleaner_id order by tm.cleaner_id), '[]'::jsonb)
  into v_on_roster, v_ids
  from public.team_members tm
  where tm.team_id = p_team_id
    and tm.cleaner_id = any (v_new_ids);

  v_inserted := coalesce(v_row_diag, 0);

  -- Fail only if expected cleaners are missing from roster (e.g. data corruption).
  -- When v_row_diag = 0 because a peer inserted the same set first, v_on_roster still matches cardinality.
  if v_on_roster < coalesce(cardinality(v_new_ids), 0) then
    return jsonb_build_object(
      'ok', false,
      'error', 'Member insert verification failed.',
      'code', 'VERIFY_FAILED',
      'http_status', 500
    );
  end if;

  select count(*)::int
  into v_after
  from public.team_members tm
  where tm.team_id = p_team_id
    and tm.cleaner_id is not null;

  return jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'cleaner_ids', coalesce(v_ids, '[]'::jsonb),
    'current', v_after,
    'capacity', v_capacity
  );
end;
$$;

comment on function public.add_team_members_guarded(uuid, uuid[]) is
  'Locks team (2s lock timeout, 3s statement timeout), validates is_active, normalizes/dedupes UUIDs, caps batch at 50, enforces roster vs capacity_per_day, inserts team_members with row-count verification.';

grant execute on function public.add_team_members_guarded(uuid, uuid[]) to service_role;
