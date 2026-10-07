-- AUDIT-02A01: converge canonical booking roster with operational booking header.
-- selected_cleaner_id is customer intent and is intentionally not rewritten here.

create or replace function public.replace_booking_cleaners_admin_atomic(
  p_booking_id uuid,
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  n_total int;
  n_lead int;
  n_distinct int;
  lead_id uuid;
  lead_source text;
  elem jsonb;
  v_fin timestamptz;
  v_old_cleaner_id uuid;

begin
  if p_booking_id is null then
    raise exception 'replace_booking_cleaners_admin_atomic: p_booking_id required';
  end if;

  select
    b.cleaner_line_earnings_finalized_at,
    b.cleaner_id
    into
      v_fin,
      v_old_cleaner_id
    from public.bookings b
   where b.id = p_booking_id
   for update;
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

  select bc.cleaner_id, lower(trim(coalesce(bc.source, '')))
    into lead_id, lead_source
    from public.booking_cleaners bc
   where bc.booking_id = p_booking_id
     and bc.role = 'lead'
   limit 1;

  if lead_id is null then
    raise exception 'replace_booking_cleaners_admin_atomic: lead row missing after insert';
  end if;

  if lead_source = 'admin_roster_edit' and v_old_cleaner_id is distinct from lead_id then
    raise exception 'replace_booking_cleaners_admin_atomic: lead replacement requires canonical direct assignment';
  end if;

  update public.bookings b
     set cleaner_id = lead_id,
         payout_owner_cleaner_id = lead_id,
         cleaner_count = n_total
   where b.id = p_booking_id;
end;
$function$;


-- Preference rosters represent customer intent / offer candidates, not an accepted
-- operational assignment. This RPC atomically replaces only preference-generated
-- rosters and updates cleaner_count without claiming cleaner_id/payout ownership.
create or replace function public.replace_booking_cleaners_preference_atomic(
  p_booking_id uuid,
  p_rows jsonb
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  n_total int;
  n_lead int;
  n_distinct int;
  elem jsonb;
  v_fin timestamptz;
  v_cleaner_id uuid;
  v_team_id uuid;
  v_is_team_job boolean;
  v_status text;
  v_response text;
  v_accepted_at timestamptz;
  v_en_route_at timestamptz;
  v_started_at timestamptz;
  v_source text;
begin
  if p_booking_id is null then
    raise exception 'replace_booking_cleaners_preference_atomic: p_booking_id required';
  end if;

  select
    b.cleaner_line_earnings_finalized_at,
    b.cleaner_id,
    b.team_id,
    b.is_team_job,
    lower(trim(coalesce(b.status, ''))),
    lower(trim(coalesce(b.cleaner_response_status, ''))),
    b.accepted_at,
    b.en_route_at,
    b.started_at
    into
      v_fin,
      v_cleaner_id,
      v_team_id,
      v_is_team_job,
      v_status,
      v_response,
      v_accepted_at,
      v_en_route_at,
      v_started_at
    from public.bookings b
   where b.id = p_booking_id
   for update;
  if not found then
    raise exception 'replace_booking_cleaners_preference_atomic: booking not found';
  end if;
  if v_fin is not null then
    raise exception 'replace_booking_cleaners_preference_atomic: roster locked (cleaner_line_earnings_finalized_at is set)';
  end if;

  if
    v_cleaner_id is not null
    or v_team_id is not null
    or coalesce(v_is_team_job, false)
    or v_status = 'in_progress'
    or v_response in ('accepted', 'on_my_way', 'started', 'completed')
    or v_accepted_at is not null
    or v_en_route_at is not null
    or v_started_at is not null
  then
    return 'skipped_authoritative_assignment';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1 then
    raise exception 'replace_booking_cleaners_preference_atomic: members must be a non-empty array';
  end if;

  select count(*) from jsonb_array_elements(p_rows) e into n_total;
  select count(*) from jsonb_array_elements(p_rows) e
   where lower(trim(coalesce(e->>'role', ''))) = 'lead' into n_lead;
  if n_lead <> 1 then
    raise exception 'replace_booking_cleaners_preference_atomic: exactly one lead required (got %)', n_lead;
  end if;

  select count(distinct trim(coalesce(e->>'cleaner_id', '')))
    from jsonb_array_elements(p_rows) e into n_distinct;
  if n_distinct <> n_total then
    raise exception 'replace_booking_cleaners_preference_atomic: duplicate cleaner_id';
  end if;

  for elem in select * from jsonb_array_elements(p_rows)
  loop
    if trim(coalesce(elem->>'cleaner_id', '')) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'replace_booking_cleaners_preference_atomic: invalid cleaner_id';
    end if;
    if lower(trim(coalesce(elem->>'role', ''))) not in ('lead', 'member') then
      raise exception 'replace_booking_cleaners_preference_atomic: invalid role %', elem->>'role';
    end if;
    v_source := lower(trim(coalesce(elem->>'source', '')));
    if v_source not in ('checkout_preferred', 'customer_preferred', 'booking_v2_r0', 'recurring_preferred') then
      raise exception 'replace_booking_cleaners_preference_atomic: invalid preference source %', elem->>'source';
    end if;
  end loop;

  -- Never overwrite an admin/custom/continuity roster that won a race after the
  -- caller's read. Existing preference-only rows are safe to replace idempotently.
  if exists (
    select 1
      from public.booking_cleaners bc
     where bc.booking_id = p_booking_id
       and lower(trim(coalesce(bc.source, ''))) not in
         ('checkout_preferred', 'customer_preferred', 'booking_v2_r0', 'recurring_preferred')
  ) then
    return 'skipped_authoritative_existing_roster';
  end if;

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
    lower(trim(e->>'source'))
  from jsonb_array_elements(p_rows) e;

  update public.bookings b
     set cleaner_count = n_total
   where b.id = p_booking_id;

  return 'synced';
end;
$function$;

revoke all on function public.replace_booking_cleaners_preference_atomic(uuid, jsonb) from public;
revoke all on function public.replace_booking_cleaners_preference_atomic(uuid, jsonb) from anon;
revoke all on function public.replace_booking_cleaners_preference_atomic(uuid, jsonb) from authenticated;
grant execute on function public.replace_booking_cleaners_preference_atomic(uuid, jsonb) to service_role;
