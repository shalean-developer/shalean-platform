-- assign_team_and_sync_roster: structured JSON result (dispatch race_lost vs ok).
-- repair_empty_team_booking_rosters: safety net for team jobs missing booking_cleaners.
-- Optional hourly pg_cron when extension exists.

-- ---------------------------------------------------------------------------
-- Replace assign_team_and_sync_roster (return type boolean -> jsonb)
-- ---------------------------------------------------------------------------
drop function if exists public.assign_team_and_sync_roster(uuid, uuid, uuid, integer, text, text, timestamptz);

create or replace function public.assign_team_and_sync_roster(
  p_booking_id uuid,
  p_team_id uuid,
  p_payout_owner_cleaner_id uuid,
  p_team_member_count_snapshot integer,
  p_variant text,
  p_source text default null,
  p_assigned_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_variant text := lower(trim(coalesce(p_variant, '')));
  v_fin timestamptz;
  v_src text;
  v_n int;
  v_lock_id uuid;
begin
  if p_booking_id is null or p_team_id is null or p_payout_owner_cleaner_id is null then
    raise exception 'assign_team_and_sync_roster: p_booking_id, p_team_id, and p_payout_owner_cleaner_id are required';
  end if;

  select b.id, b.cleaner_line_earnings_finalized_at
    into v_lock_id, v_fin
    from public.bookings b
   where b.id = p_booking_id
   for update;

  if v_lock_id is null then
    raise exception 'assign_team_and_sync_roster: booking % not found', p_booking_id;
  end if;

  if v_fin is not null then
    raise exception 'assign_team_and_sync_roster: roster changes blocked (cleaner line earnings finalized)';
  end if;

  if v_variant not in ('admin', 'dispatch') then
    raise exception 'assign_team_and_sync_roster: invalid variant %', p_variant;
  end if;

  v_src := nullif(trim(coalesce(p_source, '')), '');
  if v_src is null then
    v_src := case when v_variant = 'admin' then 'admin' else 'dispatch' end;
  end if;

  if v_variant = 'admin' then
    update public.bookings b set
      team_id = p_team_id,
      is_team_job = true,
      cleaner_id = null,
      -- Snapshot is legacy UX / analytics; canonical roster is booking_cleaners.
      team_member_count_snapshot = coalesce(p_team_member_count_snapshot, b.team_member_count_snapshot),
      cleaner_response_status = 'pending',
      en_route_at = null,
      started_at = null
    where b.id = p_booking_id;
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      raise exception 'assign_team_and_sync_roster: admin update expected 1 row (got %)', v_n;
    end if;
  else
    update public.bookings b set
      team_id = p_team_id,
      is_team_job = true,
      cleaner_id = null,
      team_member_count_snapshot = coalesce(p_team_member_count_snapshot, b.team_member_count_snapshot),
      status = 'assigned',
      dispatch_status = 'assigned',
      assigned_at = coalesce(p_assigned_at, now()),
      cleaner_response_status = 'pending'
    where b.id = p_booking_id
      and lower(trim(coalesce(b.status, ''))) = 'pending'
      and b.cleaner_id is null;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      return jsonb_build_object('ok', false, 'reason', 'race_lost');
    end if;
  end if;

  perform public.sync_booking_cleaners_for_team_booking(p_booking_id, v_src);
  return jsonb_build_object('ok', true, 'variant', v_variant);
end;
$fn$;

revoke all on function public.assign_team_and_sync_roster(uuid, uuid, uuid, integer, text, text, timestamptz) from public;
grant execute on function public.assign_team_and_sync_roster(uuid, uuid, uuid, integer, text, text, timestamptz) to service_role;

comment on function public.assign_team_and_sync_roster(uuid, uuid, uuid, integer, text, text, timestamptz) is
  'Atomically assigns team on booking and rebuilds booking_cleaners. JSON: {ok:true,variant} or {ok:false,reason:race_lost}.';

-- ---------------------------------------------------------------------------
-- Batch repair: team jobs with no booking_cleaners (earnings not finalized)
-- ---------------------------------------------------------------------------
create or replace function public.repair_empty_team_booking_rosters(p_batch int default 40)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r record;
  n int := 0;
  v_lim int := greatest(1, least(coalesce(p_batch, 40), 200));
begin
  for r in
    select b.id
      from public.bookings b
     where b.team_id is not null
       and coalesce(b.is_team_job, false) = true
       and b.cleaner_line_earnings_finalized_at is null
       and not exists (select 1 from public.booking_cleaners bc where bc.booking_id = b.id)
     limit v_lim
  loop
    perform public.sync_booking_cleaners_for_team_booking(r.id, 'cron_repair');
    n := n + 1;
  end loop;
  return n;
end;
$fn$;

revoke all on function public.repair_empty_team_booking_rosters(int) from public;
grant execute on function public.repair_empty_team_booking_rosters(int) to service_role;

comment on function public.repair_empty_team_booking_rosters(int) is
  'Rebuilds booking_cleaners for team jobs missing roster rows (pre-finalize). Returns count repaired.';

-- ---------------------------------------------------------------------------
-- pg_cron: hourly safety net (skip if extension missing)
-- ---------------------------------------------------------------------------
do $$
declare
  j record;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;
  for j in
    select jobid
      from cron.job
     where jobname = 'repair-empty-team-booking-rosters'
  loop
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule(
    'repair-empty-team-booking-rosters',
    '17 * * * *',
    'select public.repair_empty_team_booking_rosters(40);'
  );
end
$$;
