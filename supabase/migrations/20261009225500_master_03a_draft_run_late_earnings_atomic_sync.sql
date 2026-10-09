-- MASTER-03A — atomically reconcile late earnings into a frozen payout whose
-- parent payout run is still DRAFT.
--
-- Do not redefine the MASTER-00B frozen-payout trigger here. MASTER-00B
-- permanently owns that security contract. Instead this service-role-only RPC
-- performs the existing detach/update/reattach sequence inside one PostgreSQL
-- transaction, so a failure or process exit rolls back the whole sequence.

create or replace function public.sync_draft_run_payout_total(
  p_payout_id uuid,
  p_total_amount_cents bigint
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_run_id uuid;
  v_payout_status text;
  v_run_status text;
  v_run_total bigint;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;

  if p_total_amount_cents < 0 then
    raise exception 'p_total_amount_cents must be non-negative' using errcode = '22003';
  end if;

  select p.payout_run_id, lower(coalesce(p.status::text, ''))
    into v_run_id, v_payout_status
  from public.cleaner_payouts p
  where p.id = p_payout_id
  for update;

  if not found then
    raise exception 'cleaner payout % not found', p_payout_id using errcode = 'P0002';
  end if;

  if v_payout_status <> 'frozen' or v_run_id is null then
    raise exception 'cleaner payout % is not a frozen run payout', p_payout_id using errcode = '55000';
  end if;

  select lower(coalesce(r.status::text, ''))
    into v_run_status
  from public.cleaner_payout_runs r
  where r.id = v_run_id
  for update;

  if not found or v_run_status <> 'draft' then
    raise exception 'payout run % is no longer draft', v_run_id using errcode = '55000';
  end if;

  -- The existing frozen-payout trigger permits linkage changes when amount,
  -- cleaner and period are unchanged. Detach first, then the pre-approval
  -- branch permits the amount refresh while the payout remains frozen.
  update public.cleaner_payouts
  set payout_run_id = null
  where id = p_payout_id
    and payout_run_id = v_run_id
    and lower(coalesce(status::text, '')) = 'frozen';

  if not found then
    raise exception 'cleaner payout % changed before reconciliation', p_payout_id using errcode = '40001';
  end if;

  update public.cleaner_payouts
  set total_amount_cents = p_total_amount_cents,
      calculated_amount_cents = p_total_amount_cents,
      adjustment_note = null,
      amount_adjusted_at = null,
      amount_adjusted_by = null
  where id = p_payout_id
    and payout_run_id is null
    and lower(coalesce(status::text, '')) = 'frozen';

  if not found then
    raise exception 'cleaner payout % could not be reconciled', p_payout_id using errcode = '40001';
  end if;

  update public.cleaner_payouts
  set payout_run_id = v_run_id
  where id = p_payout_id
    and payout_run_id is null
    and lower(coalesce(status::text, '')) = 'frozen';

  if not found then
    raise exception 'cleaner payout % could not be restored to payout run %', p_payout_id, v_run_id
      using errcode = '40001';
  end if;

  select coalesce(sum(greatest(coalesce(p.total_amount_cents, 0), 0)), 0)::bigint
    into v_run_total
  from public.cleaner_payouts p
  where p.payout_run_id = v_run_id
    and lower(coalesce(p.status::text, '')) <> 'cancelled';

  update public.cleaner_payout_runs
  set total_amount_cents = v_run_total
  where id = v_run_id
    and lower(coalesce(status::text, '')) = 'draft';

  if not found then
    raise exception 'payout run % changed before reconciliation', v_run_id using errcode = '40001';
  end if;

  return v_run_total;
end;
$$;

revoke all on function public.sync_draft_run_payout_total(uuid, bigint) from public;
revoke all on function public.sync_draft_run_payout_total(uuid, bigint) from anon;
revoke all on function public.sync_draft_run_payout_total(uuid, bigint) from authenticated;
grant execute on function public.sync_draft_run_payout_total(uuid, bigint) to service_role;

comment on function public.sync_draft_run_payout_total(uuid, bigint) is
  'Service-role-only MASTER-03A reconciliation: atomically detaches, refreshes and restores a frozen payout inside a DRAFT run, then recomputes the run total.';


create or replace function public.append_draft_run_payout_earnings(
  p_payout_id uuid,
  p_cleaner_id uuid,
  p_direct_booking_ids uuid[],
  p_roster_ids uuid[],
  p_team_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_run_id uuid;
  v_payout_status text;
  v_run_status text;
  v_payout_cleaner_id uuid;
  v_direct_count integer := 0;
  v_roster_count integer := 0;
  v_team_count integer := 0;
  v_linked_count integer := 0;
  v_total bigint := 0;
  v_run_total bigint := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;

  select p.payout_run_id, lower(coalesce(p.status::text, '')), p.cleaner_id
    into v_run_id, v_payout_status, v_payout_cleaner_id
  from public.cleaner_payouts p
  where p.id = p_payout_id
  for update;

  if not found then
    raise exception 'cleaner payout % not found', p_payout_id using errcode = 'P0002';
  end if;

  if v_payout_status <> 'frozen' or v_run_id is null then
    raise exception 'cleaner payout % is not a frozen run payout', p_payout_id using errcode = '55000';
  end if;

  if v_payout_cleaner_id is distinct from p_cleaner_id then
    raise exception 'cleaner payout % does not belong to cleaner %', p_payout_id, p_cleaner_id using errcode = '22023';
  end if;

  select lower(coalesce(r.status::text, ''))
    into v_run_status
  from public.cleaner_payout_runs r
  where r.id = v_run_id
  for update;

  if not found or v_run_status <> 'draft' then
    raise exception 'payout run % is no longer draft', v_run_id using errcode = '55000';
  end if;

  update public.bookings
  set payout_id = p_payout_id
  where id = any(coalesce(p_direct_booking_ids, array[]::uuid[]))
    and cleaner_id = p_cleaner_id
    and payout_id is null;
  get diagnostics v_direct_count = row_count;

  update public.booking_roster_member_payouts
  set cleaner_payout_id = p_payout_id,
      status = 'batched'
  where id = any(coalesce(p_roster_ids, array[]::uuid[]))
    and cleaner_id = p_cleaner_id
    and cleaner_payout_id is null
    and lower(coalesce(status::text, '')) = 'pending';
  get diagnostics v_roster_count = row_count;

  update public.team_job_member_payouts
  set cleaner_payout_id = p_payout_id,
      status = 'batched'
  where id = any(coalesce(p_team_ids, array[]::uuid[]))
    and cleaner_id = p_cleaner_id
    and cleaner_payout_id is null
    and lower(coalesce(status::text, '')) = 'pending';
  get diagnostics v_team_count = row_count;

  v_linked_count := v_direct_count + v_roster_count + v_team_count;
  if v_linked_count = 0 then
    return 0;
  end if;

  with payout_items as (
    select
      b.cleaner_id,
      b.id as booking_id,
      0 as source_rank,
      case
        when lower(coalesce(b.payout_status::text, '')) in ('eligible', 'paid')
          and coalesce(b.payout_frozen_cents, 0) > 0
        then greatest(coalesce(b.payout_frozen_cents, 0), 0)::bigint
        else (
          greatest(coalesce(b.cleaner_payout_cents, 0), 0)
          + greatest(coalesce(b.cleaner_bonus_cents, 0), 0)
        )::bigint
      end as amount_cents
    from public.bookings b
    where b.payout_id = p_payout_id

    union all

    select
      r.cleaner_id,
      r.booking_id,
      1 as source_rank,
      (
        greatest(coalesce(r.payout_cents, 0), 0)
        + greatest(coalesce(r.bonus_cents, 0), 0)
      )::bigint as amount_cents
    from public.booking_roster_member_payouts r
    where r.cleaner_payout_id = p_payout_id

    union all

    select
      t.cleaner_id,
      t.booking_id,
      2 as source_rank,
      greatest(coalesce(t.payout_cents, 0), 0)::bigint as amount_cents
    from public.team_job_member_payouts t
    where t.cleaner_payout_id = p_payout_id
  ),
  authoritative as (
    select distinct on (cleaner_id, booking_id)
      cleaner_id,
      booking_id,
      amount_cents
    from payout_items
    order by cleaner_id, booking_id, source_rank desc
  )
  select coalesce(sum(amount_cents), 0)::bigint
    into v_total
  from authoritative;

  update public.cleaner_payouts
  set payout_run_id = null
  where id = p_payout_id
    and payout_run_id = v_run_id
    and lower(coalesce(status::text, '')) = 'frozen';

  if not found then
    raise exception 'cleaner payout % changed before reconciliation', p_payout_id using errcode = '40001';
  end if;

  update public.cleaner_payouts
  set total_amount_cents = v_total,
      calculated_amount_cents = v_total,
      adjustment_note = null,
      amount_adjusted_at = null,
      amount_adjusted_by = null
  where id = p_payout_id
    and payout_run_id is null
    and lower(coalesce(status::text, '')) = 'frozen';

  if not found then
    raise exception 'cleaner payout % could not be reconciled', p_payout_id using errcode = '40001';
  end if;

  update public.cleaner_payouts
  set payout_run_id = v_run_id
  where id = p_payout_id
    and payout_run_id is null
    and lower(coalesce(status::text, '')) = 'frozen';

  if not found then
    raise exception 'cleaner payout % could not be restored to payout run %', p_payout_id, v_run_id
      using errcode = '40001';
  end if;

  select coalesce(sum(greatest(coalesce(p.total_amount_cents, 0), 0)), 0)::bigint
    into v_run_total
  from public.cleaner_payouts p
  where p.payout_run_id = v_run_id
    and lower(coalesce(p.status::text, '')) <> 'cancelled';

  update public.cleaner_payout_runs
  set total_amount_cents = v_run_total
  where id = v_run_id
    and lower(coalesce(status::text, '')) = 'draft';

  if not found then
    raise exception 'payout run % changed before reconciliation', v_run_id using errcode = '40001';
  end if;

  return v_linked_count;
end;
$$;

revoke all on function public.append_draft_run_payout_earnings(uuid, uuid, uuid[], uuid[], uuid[]) from public;
revoke all on function public.append_draft_run_payout_earnings(uuid, uuid, uuid[], uuid[], uuid[]) from anon;
revoke all on function public.append_draft_run_payout_earnings(uuid, uuid, uuid[], uuid[], uuid[]) from authenticated;
grant execute on function public.append_draft_run_payout_earnings(uuid, uuid, uuid[], uuid[], uuid[]) to service_role;

comment on function public.append_draft_run_payout_earnings(uuid, uuid, uuid[], uuid[], uuid[]) is
  'Service-role-only MASTER-03A operation: atomically links late earning rows to a frozen payout in a DRAFT run, recomputes the authoritative payout total, and recomputes the run total.';
