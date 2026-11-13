-- Complete an explicitly requested multi-cleaner roster in one transaction.
-- Customer preferences never become assignments merely by being selected.
create or replace function public.assign_requested_cleaner_roster_atomic(p_booking_id uuid, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  b public.bookings%rowtype;
  requested integer;
  snapshot_count integer := 0;
  member_id uuid;
  lead_id uuid;
  rows_for_assignment jsonb;
  visit_start timestamp;
  visit_end timestamp;
begin
  select * into b from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'booking_not_found'; end if;
  if b.cleaner_mode='team' or coalesce(b.is_team_job,false) or b.team_id is not null then
    raise exception 'formal_team_requires_team_assignment';
  end if;
  if (b.booking_snapshot->>'cleanerCount') ~ '^[1-3]$' then
    snapshot_count := (b.booking_snapshot->>'cleanerCount')::integer;
  end if;
  requested := greatest(coalesce(b.cleaner_count,1),snapshot_count);
  if requested not between 2 and 3 then raise exception 'multi_cleaner_request_required'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)<>requested then
    raise exception 'complete_requested_roster_required';
  end if;
  if b.status not in ('pending','pending_assignment','offered','assigned','confirmed')
    or b.status is null then raise exception 'booking_not_assignable'; end if;
  if b.date is null or b.date::date<date '2026-10-01' then raise exception 'historical_payout_item_deferred'; end if;
  if b.payment_status is distinct from 'success' and b.payment_status is distinct from 'pending_monthly' then
    raise exception 'payment_required';
  end if;
  if b.cleaner_line_earnings_finalized_at is not null or b.payout_status is distinct from 'pending'
    or b.payout_run_id is not null or b.payout_paid_at is not null then raise exception 'booking_payout_locked'; end if;
  if coalesce(b.duration_minutes,b.estimated_duration_minutes,0)<=0 or b.time is null then
    raise exception 'booking_duration_required';
  end if;
  visit_start := b.date::date+b.time::time;
  visit_end := visit_start+make_interval(mins=>coalesce(b.duration_minutes,b.estimated_duration_minutes));
  -- Sorted per-cleaner day locks serialize this endpoint's overlapping roster assignments.
  for member_id in select distinct (e->>'cleaner_id')::uuid from jsonb_array_elements(p_rows) e order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(member_id::text||':'||b.date::text,0));
    if exists (
      select 1 from public.bookings other
      where other.id<>b.id and other.date::date=b.date::date
        and other.status in ('assigned','confirmed','in_progress','pending_assignment')
        and (other.cleaner_id=member_id or exists(select 1 from public.booking_cleaners bc where bc.booking_id=other.id and bc.cleaner_id=member_id))
        and other.time is not null
        and other.date::date+other.time::time<visit_end
        and visit_start<other.date::date+other.time::time+make_interval(mins=>coalesce(other.duration_minutes,other.estimated_duration_minutes,540))
    ) then raise exception 'cleaner_slot_conflict'; end if;
  end loop;
  -- The existing atomic roster writer owns identity, role, uniqueness and earnings locks.
  -- This distinct provenance is allowed only through this service-role-only full-roster command.
  select jsonb_agg(e||jsonb_build_object('source','admin_multi_cleaner_assignment')) into rows_for_assignment
    from jsonb_array_elements(p_rows) e;
  -- Avoid the pending-with-assignee invariant while roster triggers refresh attribution.
  update public.bookings set status='pending_assignment' where id=b.id and status='pending';
  perform public.replace_booking_cleaners_admin_atomic(b.id,rows_for_assignment);
  select cleaner_id into lead_id from public.booking_cleaners where booking_id=b.id and role='lead';
  update public.bookings set cleaner_id=lead_id,payout_owner_cleaner_id=lead_id,
    status='assigned',dispatch_status='assigned',assignment_type='admin_assigned',
    cleaner_response_status='accepted',assigned_at=now(),accepted_at=now(),
    cleaner_count=requested,fulfillment_mode='ops_assignment',fulfillment_reason='complete_roster_assigned'
    where id=b.id;
  update public.dispatch_offers set status='expired',responded_at=now() where booking_id=b.id and status='pending';
end;
$function$;
revoke all on function public.assign_requested_cleaner_roster_atomic(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.assign_requested_cleaner_roster_atomic(uuid,jsonb) to service_role;
comment on function public.assign_requested_cleaner_roster_atomic(uuid,jsonb) is
  'Service-role command after admin authorization. Assigns the complete requested 2/3-cleaner roster atomically; retains customer intent and existing earnings controls.';
