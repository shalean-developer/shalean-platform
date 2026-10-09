-- MASTER-03A — allow late earnings to reconcile only while the parent payout run is DRAFT.
-- The payout remains frozen/attached; service-role sync updates the payout and its
-- parent run inside one database transaction.

create or replace function public.cleaner_payouts_block_mutate_when_frozen()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  old_status text := lower(coalesce(old.status::text, ''));
  new_status text := lower(coalesce(new.status::text, ''));
  pre_approval boolean;
  draft_run boolean := false;
begin
  if old.payout_run_id is not null then
    select exists (
      select 1
      from public.cleaner_payout_runs r
      where r.id = old.payout_run_id
        and lower(coalesce(r.status::text, '')) = 'draft'
    )
    into draft_run;
  end if;

  pre_approval := old.payout_run_id is null
    and old_status in ('pending', 'frozen')
    and new_status in ('pending', 'frozen');

  if pre_approval then
    if new.cleaner_id is distinct from old.cleaner_id
      or new.period_start is distinct from old.period_start
      or new.period_end is distinct from old.period_end
    then
      raise exception 'cleaner_payouts %: cannot change cleaner or period before approval', old.id;
    end if;
    return new;
  end if;

  if old.frozen_at is not null or old.payout_run_id is not null then
    if new.cleaner_id is distinct from old.cleaner_id
      or new.period_start is distinct from old.period_start
      or new.period_end is distinct from old.period_end
    then
      raise exception 'cleaner_payouts % is frozen or in a disbursement run: cannot change cleaner or period', old.id;
    end if;

    if new.total_amount_cents is distinct from old.total_amount_cents
      and not (
        old_status = 'frozen'
        and new_status = 'frozen'
        and old.payout_run_id is not null
        and new.payout_run_id is not distinct from old.payout_run_id
        and draft_run
      )
    then
      raise exception 'cleaner_payouts % is frozen or in a non-draft disbursement run: cannot change amount', old.id;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.cleaner_payouts_block_mutate_when_frozen() is
  'Blocks cleaner/period changes after freeze and amount changes after run approval; permits total reconciliation only while a frozen payout remains attached to a DRAFT run.';

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

  update public.cleaner_payouts
  set total_amount_cents = p_total_amount_cents,
      calculated_amount_cents = p_total_amount_cents,
      adjustment_note = null,
      amount_adjusted_at = null,
      amount_adjusted_by = null
  where id = p_payout_id
    and payout_run_id = v_run_id
    and lower(coalesce(status::text, '')) = 'frozen';

  if not found then
    raise exception 'cleaner payout % changed before reconciliation', p_payout_id using errcode = '40001';
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
  'Service-role-only MASTER-03A reconciliation: atomically updates a frozen payout total and its parent DRAFT payout-run total without detaching the payout.';
