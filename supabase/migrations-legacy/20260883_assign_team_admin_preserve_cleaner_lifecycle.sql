-- Admin variant of assign_team_and_sync_roster must not wipe cleaner lifecycle when the RPC is
-- re-run (e.g. roster re-sync, repeated admin save). Previously every admin call forced
-- cleaner_response_status = 'pending', which made accepted jobs flip back to "Needs accept".

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
      team_member_count_snapshot = coalesce(p_team_member_count_snapshot, b.team_member_count_snapshot),
      cleaner_response_status = case
        when lower(trim(coalesce(b.cleaner_response_status, ''))) in (
          'accepted', 'on_my_way', 'started', 'completed'
        ) then b.cleaner_response_status
        else 'pending'
      end,
      en_route_at = case
        when lower(trim(coalesce(b.cleaner_response_status, ''))) in (
          'accepted', 'on_my_way', 'started', 'completed'
        ) then b.en_route_at
        else null
      end,
      started_at = case
        when lower(trim(coalesce(b.cleaner_response_status, ''))) in (
          'accepted', 'on_my_way', 'started', 'completed'
        ) then b.started_at
        else null
      end,
      accepted_at = case
        when lower(trim(coalesce(b.cleaner_response_status, ''))) in (
          'accepted', 'on_my_way', 'started', 'completed'
        ) then b.accepted_at
        else null
      end
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

comment on function public.assign_team_and_sync_roster(uuid, uuid, uuid, integer, text, text, timestamptz) is
  'Atomically assigns team on booking and rebuilds booking_cleaners. JSON: {ok:true,variant} or {ok:false,reason:race_lost}. Admin variant preserves cleaner_response_status/en_route_at/started_at/accepted_at once accepted or beyond.';
