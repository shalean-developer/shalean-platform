-- AUDIT-03A02-02 — current cleaner earnings ledger convergence.
--
-- Boundaries:
-- 1) Keep an existing PENDING solo cleaner_earnings row synchronized atomically
--    with canonical booking earnings/owner changes.
-- 2) Never rewrite approved/processing/paid or disbursement-linked ledger history.
-- 3) Provide a service-role-only, hard-allowlisted repair for exactly two proven
--    current-model exceptions. The repair does not mutate cleaner_payouts,
--    payout runs, monthly invoices, or July historical rows.

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

drop trigger if exists trg_sync_pending_cleaner_earnings_from_booking_update on public.bookings;
create trigger trg_sync_pending_cleaner_earnings_from_booking_update
after update of cleaner_earnings_total_cents, cleaner_id, payout_owner_cleaner_id
on public.bookings
for each row
when (
  old.cleaner_earnings_total_cents is distinct from new.cleaner_earnings_total_cents
  or old.cleaner_id is distinct from new.cleaner_id
  or old.payout_owner_cleaner_id is distinct from new.payout_owner_cleaner_id
)
execute function public.sync_pending_cleaner_earnings_from_booking_update();

comment on function public.sync_pending_cleaner_earnings_from_booking_update() is
  'AUDIT-03A02-02: atomically syncs an existing pending solo cleaner_earnings row from canonical booking earnings/owner changes; locked ledger mismatches fail closed.';

create or replace function public.apply_audit_03a02_02_ledger_repair(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_booking public.bookings%rowtype;
  v_ledger public.cleaner_earnings%rowtype;
  v_snapshot_cleaner uuid;
  v_snapshot_display integer;
  v_snapshot_payout integer;
  v_snapshot_internal integer;
  v_summary_cleaner uuid;
  v_summary_total integer;
  v_expected_owner uuid;
  v_action text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;

  if p_booking_id not in (
    'c98cd9e2-e295-47af-8bcf-faf90120d751'::uuid,
    '39a26e1d-b8ba-433e-9427-ed61c96fbe6c'::uuid
  ) then
    raise exception 'booking outside AUDIT-03A02-02 allowlist' using errcode = '42501';
  end if;

  select *
  into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    raise exception 'booking % not found', p_booking_id using errcode = 'P0002';
  end if;

  if lower(coalesce(v_booking.status::text, '')) <> 'completed'
     or coalesce(v_booking.is_team_job, false)
     or v_booking.cleaner_line_earnings_finalized_at is null
     or lower(coalesce(v_booking.payout_status::text, '')) <> 'eligible'
     or v_booking.payout_paid_at is not null
     or v_booking.payout_id is not null
     or v_booking.payout_run_id is not null then
    raise exception 'booking % is no longer an unsettled eligible solo repair candidate', p_booking_id
      using errcode = '55000';
  end if;

  if v_booking.cleaner_earnings_total_cents is null
     or v_booking.cleaner_earnings_total_cents <= 0
     or v_booking.display_earnings_cents is distinct from v_booking.cleaner_earnings_total_cents
     or v_booking.payout_frozen_cents is distinct from v_booking.cleaner_earnings_total_cents then
    raise exception 'booking % canonical earnings evidence changed', p_booking_id
      using errcode = '55000';
  end if;

  select *
  into v_ledger
  from public.cleaner_earnings ce
  where ce.booking_id = p_booking_id
  for update;

  if p_booking_id = 'c98cd9e2-e295-47af-8bcf-faf90120d751'::uuid then
    v_expected_owner := 'e8f12d90-4212-4ac7-ad85-620c6a744d56'::uuid;

    if v_booking.cleaner_id is distinct from v_expected_owner
       or v_booking.payout_owner_cleaner_id is distinct from v_expected_owner
       or v_booking.cleaner_earnings_total_cents <> 25000 then
      raise exception 'Oct 4 booking evidence no longer matches audited repair state'
        using errcode = '55000';
    end if;

    if v_ledger.id is null
       or lower(coalesce(v_ledger.status::text, '')) <> 'pending'
       or v_ledger.disbursement_id is not null
       or v_ledger.cleaner_id is distinct from v_expected_owner
       or v_ledger.amount_cents <> 30000 then
      if v_ledger.id is not null
         and lower(coalesce(v_ledger.status::text, '')) = 'pending'
         and v_ledger.disbursement_id is null
         and v_ledger.cleaner_id = v_expected_owner
         and v_ledger.amount_cents = 25000 then
        return jsonb_build_object(
          'ok', true,
          'booking_id', p_booking_id,
          'action', 'already_repaired',
          'owner_cleaner_id', v_expected_owner,
          'amount_cents', 25000
        );
      end if;
      raise exception 'Oct 4 pending ledger evidence no longer matches audited repair state'
        using errcode = '55000';
    end if;

    update public.cleaner_earnings
    set amount_cents = 25000
    where id = v_ledger.id
      and lower(coalesce(status::text, '')) = 'pending'
      and disbursement_id is null;
    v_action := 'pending_ledger_synced';

  elsif p_booking_id = '39a26e1d-b8ba-433e-9427-ed61c96fbe6c'::uuid then
    v_expected_owner := '8cce56c6-75ec-4f3b-8781-3dd8304f94dc'::uuid;

    if v_booking.cleaner_earnings_total_cents <> 30000 then
      raise exception 'Aug 23 booking amount no longer matches audited repair state'
        using errcode = '55000';
    end if;

    if v_booking.cleaner_id is not null
       or v_booking.payout_owner_cleaner_id is not null then
      if v_booking.cleaner_id = v_expected_owner
         and v_booking.payout_owner_cleaner_id = v_expected_owner
         and v_ledger.id is not null
         and lower(coalesce(v_ledger.status::text, '')) = 'pending'
         and v_ledger.disbursement_id is null
         and v_ledger.cleaner_id = v_expected_owner
         and v_ledger.amount_cents = 30000 then
        return jsonb_build_object(
          'ok', true,
          'booking_id', p_booking_id,
          'action', 'already_repaired',
          'owner_cleaner_id', v_expected_owner,
          'amount_cents', 30000
        );
      end if;
      raise exception 'Aug 23 booking ownership changed from audited repair state'
        using errcode = '55000';
    end if;

    if v_ledger.id is not null then
      raise exception 'Aug 23 booking unexpectedly has a cleaner_earnings row'
        using errcode = '55000';
    end if;

    if jsonb_typeof(v_booking.earnings_summary) <> 'object'
       or jsonb_typeof(v_booking.earnings_summary -> 'per_cleaner_earnings') <> 'array'
       or jsonb_array_length(v_booking.earnings_summary -> 'per_cleaner_earnings') <> 1 then
      raise exception 'Aug 23 earnings summary is no longer single-cleaner evidence'
        using errcode = '55000';
    end if;

    begin
      v_summary_cleaner :=
        (v_booking.earnings_summary -> 'per_cleaner_earnings' -> 0 ->> 'cleaner_id')::uuid;
      v_summary_total :=
        (v_booking.earnings_summary -> 'per_cleaner_earnings' -> 0 ->> 'total_cents')::integer;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Aug 23 earnings summary evidence is malformed'
        using errcode = '55000';
    end;

    select
      s.cleaner_id,
      s.display_earnings_cents,
      s.payout_earnings_cents,
      s.internal_earnings_cents
    into
      v_snapshot_cleaner,
      v_snapshot_display,
      v_snapshot_payout,
      v_snapshot_internal
    from public.booking_cleaner_earnings_snapshot s
    where s.booking_id = p_booking_id
    for update;

    if not found
       or v_summary_cleaner is distinct from v_expected_owner
       or v_snapshot_cleaner is distinct from v_expected_owner
       or v_summary_total is distinct from 30000
       or v_snapshot_display is distinct from 30000
       or v_snapshot_payout is distinct from 30000
       or v_snapshot_internal is distinct from 30000 then
      raise exception 'Aug 23 independent ownership/earnings evidence no longer converges'
        using errcode = '55000';
    end if;

    if not exists(select 1 from public.cleaners c where c.id = v_expected_owner) then
      raise exception 'Aug 23 proven cleaner no longer exists'
        using errcode = '55000';
    end if;

    update public.bookings
    set
      cleaner_id = v_expected_owner,
      payout_owner_cleaner_id = v_expected_owner
    where id = p_booking_id
      and cleaner_id is null
      and payout_owner_cleaner_id is null;

    if not found then
      raise exception 'Aug 23 booking ownership changed during repair'
        using errcode = '40001';
    end if;

    insert into public.cleaner_earnings (
      cleaner_id,
      booking_id,
      amount_cents,
      status
    )
    values (
      v_expected_owner,
      p_booking_id,
      30000,
      'pending'
    );

    v_action := 'owner_and_pending_ledger_restored';
  end if;

  return jsonb_build_object(
    'ok', true,
    'booking_id', p_booking_id,
    'action', v_action,
    'owner_cleaner_id', v_expected_owner,
    'amount_cents', v_booking.cleaner_earnings_total_cents
  );
end;
$$;

revoke all on function public.apply_audit_03a02_02_ledger_repair(uuid) from public;
revoke all on function public.apply_audit_03a02_02_ledger_repair(uuid) from anon;
revoke all on function public.apply_audit_03a02_02_ledger_repair(uuid) from authenticated;
grant execute on function public.apply_audit_03a02_02_ledger_repair(uuid) to service_role;

comment on function public.apply_audit_03a02_02_ledger_repair(uuid) is
  'AUDIT-03A02-02: service-role-only, two-booking allowlisted repair for current unsettled cleaner earnings ledger drift. Does not mutate cleaner payout batches or historical July rows.';

commit;
