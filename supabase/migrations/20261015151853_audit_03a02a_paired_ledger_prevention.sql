-- Forward prevention only: no historical ledger repair or payout mutations.
begin;

create or replace function public.sync_pending_cleaner_earnings_from_booking_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_ledger_id uuid;
  v_ledger_status text;
  v_ledger_cleaner_id uuid;
  v_ledger_amount integer;
  v_disbursement_id uuid;
  v_owner uuid;
  v_payout_status text;
  v_payout_run_id uuid;
  v_payout_paid_at timestamptz;
  v_child_payout_status text;
  v_child_payout_run_id uuid;
  v_child_payout_paid_at timestamptz;
  v_payout_locked boolean := false;
begin
  -- Inspect ledger/settlement locks before any eligibility return. Reset paths can
  -- clear finalized earnings in the same UPDATE; locked history must still fail closed.
  select
    ce.id,
    lower(coalesce(ce.status::text, '')),
    ce.cleaner_id,
    ce.amount_cents,
    ce.disbursement_id
  into
    v_ledger_id,
    v_ledger_status,
    v_ledger_cleaner_id,
    v_ledger_amount,
    v_disbursement_id
  from public.cleaner_earnings ce
  where ce.booking_id = new.id
  for update;

  if not found then
    return new;
  end if;

  if new.cleaner_id is not null
     and new.payout_owner_cleaner_id is not null
     and new.cleaner_id is distinct from new.payout_owner_cleaner_id then
    raise exception 'solo booking % has conflicting cleaner ownership', new.id
      using errcode = '55000';
  end if;

  v_owner := coalesce(new.cleaner_id, new.payout_owner_cleaner_id);
  v_payout_status := lower(coalesce(new.payout_status::text, ''));
  v_payout_run_id := new.payout_run_id;
  v_payout_paid_at := new.payout_paid_at;

  if new.payout_id is not null then
    select
      lower(coalesce(cp.status::text, '')),
      cp.payout_run_id,
      cp.paid_at
    into
      v_child_payout_status,
      v_child_payout_run_id,
      v_child_payout_paid_at
    from public.cleaner_payouts cp
    where cp.id = new.payout_id
    for update;

    if not found then
      raise exception 'linked cleaner payout missing for booking %', new.id
        using errcode = '55000';
    end if;
  end if;

  v_payout_locked :=
    v_payout_status = 'paid'
    or v_payout_run_id is not null
    or v_payout_paid_at is not null
    or (
      new.payout_id is not null
      and (
        v_child_payout_run_id is not null
        or v_child_payout_paid_at is not null
        or v_child_payout_status not in ('pending', 'frozen')
      )
    );

  if v_ledger_status <> 'pending'
     or v_disbursement_id is not null
     or v_payout_locked then
    if v_ledger_amount is distinct from greatest(coalesce(new.cleaner_earnings_total_cents, 0), 0)
       or (v_owner is not null and v_ledger_cleaner_id is distinct from v_owner) then
      raise exception 'locked cleaner earnings ledger conflicts with booking %', new.id
        using errcode = '55000';
    end if;
    return new;
  end if;

  -- Preserve locked ledger/settlement validation above for every booking.
  -- Only then exclude non-team paired jobs from pending solo synchronization.
  if not coalesce(new.is_team_job, false) and exists (
    select 1 from public.booking_cleaners bc
    where bc.booking_id = new.id
    group by bc.booking_id
    having count(distinct bc.cleaner_id) >= 2
  ) then
    return new;
  end if;

  if lower(coalesce(new.status::text, '')) <> 'completed'
     or coalesce(new.is_team_job, false)
     or new.cleaner_line_earnings_finalized_at is null
     or new.cleaner_earnings_total_cents is null then
    return new;
  end if;

  if v_ledger_status = 'pending' and v_disbursement_id is null then
    update public.cleaner_earnings ce
    set
      cleaner_id = coalesce(v_owner, ce.cleaner_id),
      amount_cents = greatest(coalesce(new.cleaner_earnings_total_cents, 0), 0)
    where ce.id = v_ledger_id;
    return new;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_pending_cleaner_earnings_from_booking_update() from public;
revoke all on function public.sync_pending_cleaner_earnings_from_booking_update() from anon;
revoke all on function public.sync_pending_cleaner_earnings_from_booking_update() from authenticated;

commit;
