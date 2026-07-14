-- Atomic team assignment + booking_cleaners rebuild; block roster mutations when line earnings finalized.

-- ---------------------------------------------------------------------------
-- sync_booking_cleaners_for_team_booking: refuse rebuild after finalize
-- ---------------------------------------------------------------------------
create or replace function public.sync_booking_cleaners_for_team_booking(
  p_booking_id uuid,
  p_source text default 'sync'
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  b_team uuid;
  b_date date;
  b_lead uuid;
  b_is_team boolean;
  b_finalized timestamptz;
  v_start timestamptz;
  v_end timestamptz;
  v_src text;
begin
  if p_booking_id is null then
    raise exception 'sync_booking_cleaners_for_team_booking: p_booking_id required';
  end if;

  select b.team_id,
         b.date::date,
         b.payout_owner_cleaner_id,
         coalesce(b.is_team_job, false),
         b.cleaner_line_earnings_finalized_at
    into b_team, b_date, b_lead, b_is_team, b_finalized
    from public.bookings b
   where b.id = p_booking_id;

  if not found then
    raise exception 'sync_booking_cleaners_for_team_booking: booking % not found', p_booking_id;
  end if;

  if b_is_team is not true or b_team is null then
    return;
  end if;

  if b_finalized is not null then
    raise exception 'sync_booking_cleaners_for_team_booking: roster locked (cleaner_line_earnings_finalized_at is set)';
  end if;

  v_src := nullif(trim(coalesce(p_source, '')), '');
  if v_src is null then
    v_src := 'sync';
  end if;

  v_start := (b_date::text || ' 00:00:00+00')::timestamptz;
  v_end := (b_date::text || ' 23:59:59.999+00')::timestamptz;

  delete from public.booking_cleaners where booking_id = p_booking_id;

  insert into public.booking_cleaners (
    booking_id,
    cleaner_id,
    role,
    payout_weight,
    lead_bonus_cents,
    source
  )
  with active as (
    select tm.cleaner_id
    from public.team_members tm
    where tm.team_id = b_team
      and tm.cleaner_id is not null
      and (tm.active_from is null or tm.active_from <= v_end)
      and (tm.active_to is null or tm.active_to >= v_start)
  ),
  effective_lead as (
    select coalesce(
      case
        when exists (select 1 from active a0 where a0.cleaner_id = b_lead) then b_lead
      end,
      (select a1.cleaner_id from active a1 order by a1.cleaner_id asc limit 1)
    ) as cid
  )
  select
    p_booking_id,
    a.cleaner_id,
    case when a.cleaner_id = el.cid then 'lead'::text else 'member'::text end,
    1,
    0,
    v_src
  from active a
  cross join effective_lead el
  where el.cid is not null;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- replace_booking_cleaners_admin_atomic: block when finalized
-- ---------------------------------------------------------------------------
create or replace function public.replace_booking_cleaners_admin_atomic(
  p_booking_id uuid,
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  n_total int;
  n_lead int;
  n_distinct int;
  lead_id uuid;
  elem jsonb;
  v_fin timestamptz;
begin
  if p_booking_id is null then
    raise exception 'replace_booking_cleaners_admin_atomic: p_booking_id required';
  end if;

  select b.cleaner_line_earnings_finalized_at into v_fin
    from public.bookings b
   where b.id = p_booking_id;
  if not found then
    raise exception 'replace_booking_cleaners_admin_atomic: booking not found';
  end if;
  if v_fin is not null then
    raise exception 'replace_booking_cleaners_admin_atomic: roster locked (cleaner_line_earnings_finalized_at is set)';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1 then
    raise exception 'replace_booking_cleaners_admin_atomic: members must be a non-empty array';
  end if;

  select count(*) from jsonb_array_elements(p_rows) e into n_total;

  select count(*) from jsonb_array_elements(p_rows) e
   where lower(trim(coalesce(e->>'role', ''))) = 'lead' into n_lead;
  if n_lead <> 1 then
    raise exception 'replace_booking_cleaners_admin_atomic: exactly one lead required (got %)', n_lead;
  end if;

  select count(distinct trim(coalesce(e->>'cleaner_id', '')))
    from jsonb_array_elements(p_rows) e into n_distinct;
  if n_distinct <> n_total then
    raise exception 'replace_booking_cleaners_admin_atomic: duplicate cleaner_id';
  end if;

  for elem in select * from jsonb_array_elements(p_rows)
  loop
    if trim(coalesce(elem->>'cleaner_id', '')) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'replace_booking_cleaners_admin_atomic: invalid cleaner_id';
    end if;
    if lower(trim(coalesce(elem->>'role', ''))) not in ('lead', 'member') then
      raise exception 'replace_booking_cleaners_admin_atomic: invalid role %', elem->>'role';
    end if;
  end loop;

  delete from public.booking_cleaners where booking_id = p_booking_id;

  insert into public.booking_cleaners (
    booking_id,
    cleaner_id,
    role,
    payout_weight,
    lead_bonus_cents,
    source
  )
  select
    p_booking_id,
    trim(e->>'cleaner_id')::uuid,
    lower(trim(e->>'role')),
    case
      when (e->>'payout_weight') is null or trim(e->>'payout_weight') = '' then 1::numeric
      else (e->>'payout_weight')::numeric
    end,
    case
      when (e->>'lead_bonus_cents') is null or trim(e->>'lead_bonus_cents') = '' then 0
      else (e->>'lead_bonus_cents')::integer
    end,
    coalesce(nullif(trim(e->>'source'), ''), 'admin')
  from jsonb_array_elements(p_rows) e;

  select bc.cleaner_id into lead_id
    from public.booking_cleaners bc
   where bc.booking_id = p_booking_id
     and bc.role = 'lead'
   limit 1;

  if lead_id is null then
    raise exception 'replace_booking_cleaners_admin_atomic: lead row missing after insert';
  end if;

  update public.bookings b
     set payout_owner_cleaner_id = lead_id
   where b.id = p_booking_id;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- assign_team_and_sync_roster: one transaction — booking team fields + roster
-- ---------------------------------------------------------------------------
create or replace function public.assign_team_and_sync_roster(
  p_booking_id uuid,
  p_team_id uuid,
  p_payout_owner_cleaner_id uuid,
  p_team_member_count_snapshot integer,
  p_variant text,
  p_source text default null,
  p_assigned_at timestamptz default null
)
returns boolean
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
      payout_owner_cleaner_id = p_payout_owner_cleaner_id,
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
      payout_owner_cleaner_id = p_payout_owner_cleaner_id,
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
      return false;
    end if;
  end if;

  perform public.sync_booking_cleaners_for_team_booking(p_booking_id, v_src);
  return true;
end;
$fn$;

revoke all on function public.assign_team_and_sync_roster(uuid, uuid, uuid, integer, text, text, timestamptz) from public;
grant execute on function public.assign_team_and_sync_roster(uuid, uuid, uuid, integer, text, text, timestamptz) to service_role;

comment on function public.assign_team_and_sync_roster(uuid, uuid, uuid, integer, text, text, timestamptz) is
  'Updates booking for team assignment and rebuilds booking_cleaners in one transaction. Returns false when dispatch variant matches no row (race).';
