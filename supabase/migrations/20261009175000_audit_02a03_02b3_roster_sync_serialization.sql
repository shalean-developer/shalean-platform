-- A02-03-02B3: serialize canonical team-roster sync with the bounded financial repair.
-- Preserve roster-sync behavior; add only the booking-scoped transaction advisory lock
-- already used by repair_a02_03_02_team_line_items.

create or replace function public.sync_booking_cleaners_for_team_booking(
  p_booking_id uuid,
  p_source text default 'sync'::text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  b_team uuid;
  b_date date;
  b_assigned date;
  b_membership date;
  b_lead uuid;
  b_is_team boolean;
  b_finalized timestamptz;
  b_status text;
  v_start timestamptz;
  v_end timestamptz;
  v_src text;
begin
  if p_booking_id is null then
    raise exception 'sync_booking_cleaners_for_team_booking: p_booking_id required';
  end if;

  -- Serialize roster mutation with A02-03-02 bounded financial repair for this booking.
  perform pg_advisory_xact_lock(920302, abs(hashtext(p_booking_id::text)));

  select b.team_id,
         b.date::date,
         (b.assigned_at at time zone 'UTC')::date,
         b.payout_owner_cleaner_id,
         coalesce(b.is_team_job, false),
         b.cleaner_line_earnings_finalized_at,
         lower(trim(coalesce(b.status, '')))
    into b_team, b_date, b_assigned, b_lead, b_is_team, b_finalized, b_status
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

  if b_status = 'completed' then
    return;
  end if;

  v_src := nullif(trim(coalesce(p_source, '')), '');
  if v_src is null then
    v_src := 'sync';
  end if;

  b_membership := greatest(coalesce(b_date, b_assigned), coalesce(b_assigned, b_date));
  v_start := (b_membership::text || ' 00:00:00+00')::timestamptz;
  v_end := (b_membership::text || ' 23:59:59.999+00')::timestamptz;

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
      (select t.lead_cleaner_id from public.teams t where t.id = b_team and exists (
        select 1 from active a2 where a2.cleaner_id = t.lead_cleaner_id
      )),
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
$function$;

comment on function public.sync_booking_cleaners_for_team_booking(uuid, text) is
  'Canonical team-roster sync; A02-03-02B3 adds booking-scoped advisory serialization with bounded historical financial repair.';
