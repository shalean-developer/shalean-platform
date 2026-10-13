-- AUDIT-03A-02B.1 — testable bounded cleaner earnings repair helper.
--
-- Keeps the operational wrapper hard-allowlisted to the same 11 production
-- bookings while extracting one-booking validation/insert logic into an
-- owner-only helper. PUBLIC, anon, authenticated, and service_role cannot call
-- the helper directly. This permits controlled SQL-editor staging fixtures
-- without creating a general-purpose service-role repair primitive.

begin;

create or replace function public.audit_03a02b_repair_missing_ledger_one(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_booking public.bookings%rowtype;
  v_snapshot public.booking_cleaner_earnings_snapshot%rowtype;
  v_existing public.cleaner_earnings%rowtype;
  v_owner uuid;
  v_summary_cleaner uuid;
  v_summary_total integer;
begin
  select *
    into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    raise exception 'AUDIT-03A02B booking % missing', p_booking_id using errcode = 'P0002';
  end if;

  if lower(coalesce(v_booking.status::text, '')) <> 'completed'
     or coalesce(v_booking.is_team_job, false)
     or v_booking.cleaner_line_earnings_finalized_at is null
     or v_booking.cleaner_earnings_total_cents is null
     or v_booking.cleaner_earnings_total_cents <= 0 then
    raise exception 'AUDIT-03A02B booking % is no longer a finalized positive solo earning', p_booking_id
      using errcode = '55000';
  end if;

  if v_booking.payout_id is not null
     or v_booking.payout_run_id is not null
     or v_booking.payout_paid_at is not null
     or lower(coalesce(v_booking.payout_status::text, '')) = 'paid' then
    raise exception 'AUDIT-03A02B booking % is settlement-locked', p_booking_id
      using errcode = '55000';
  end if;

  if v_booking.cleaner_id is not null
     and v_booking.payout_owner_cleaner_id is not null
     and v_booking.cleaner_id is distinct from v_booking.payout_owner_cleaner_id then
    raise exception 'AUDIT-03A02B booking % has conflicting cleaner ownership', p_booking_id
      using errcode = '55000';
  end if;

  v_owner := coalesce(v_booking.cleaner_id, v_booking.payout_owner_cleaner_id);
  if v_owner is null then
    raise exception 'AUDIT-03A02B booking % has no proven owner', p_booking_id using errcode = '55000';
  end if;

  if v_booking.display_earnings_cents is distinct from v_booking.cleaner_earnings_total_cents then
    raise exception 'AUDIT-03A02B booking % display earnings no longer converge', p_booking_id
      using errcode = '55000';
  end if;

  if lower(coalesce(v_booking.payout_status::text, '')) = 'eligible'
     and v_booking.payout_frozen_cents is distinct from v_booking.cleaner_earnings_total_cents then
    raise exception 'AUDIT-03A02B booking % frozen earnings no longer converge', p_booking_id
      using errcode = '55000';
  end if;

  if lower(coalesce(v_booking.payout_status::text, '')) = 'pending'
     and v_booking.payout_frozen_cents is not null
     and v_booking.payout_frozen_cents is distinct from v_booking.cleaner_earnings_total_cents then
    raise exception 'AUDIT-03A02B booking % pending frozen earnings conflict', p_booking_id
      using errcode = '55000';
  end if;

  select *
    into v_snapshot
  from public.booking_cleaner_earnings_snapshot s
  where s.booking_id = p_booking_id
  for update;

  if not found
     or v_snapshot.cleaner_id is distinct from v_owner
     or v_snapshot.display_earnings_cents is distinct from v_booking.cleaner_earnings_total_cents
     or v_snapshot.payout_earnings_cents is distinct from v_booking.cleaner_earnings_total_cents
     or v_snapshot.internal_earnings_cents is distinct from v_booking.cleaner_earnings_total_cents then
    raise exception 'AUDIT-03A02B booking % snapshot evidence no longer converges', p_booking_id
      using errcode = '55000';
  end if;

  if jsonb_typeof(v_booking.earnings_summary) <> 'object'
     or jsonb_typeof(v_booking.earnings_summary -> 'per_cleaner_earnings') <> 'array'
     or jsonb_array_length(v_booking.earnings_summary -> 'per_cleaner_earnings') <> 1 then
    raise exception 'AUDIT-03A02B booking % summary is not single-cleaner evidence', p_booking_id
      using errcode = '55000';
  end if;

  begin
    v_summary_cleaner :=
      (v_booking.earnings_summary -> 'per_cleaner_earnings' -> 0 ->> 'cleaner_id')::uuid;
    v_summary_total :=
      (v_booking.earnings_summary -> 'per_cleaner_earnings' -> 0 ->> 'total_cents')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'AUDIT-03A02B booking % summary evidence malformed', p_booking_id
      using errcode = '55000';
  end;

  if v_summary_cleaner is distinct from v_owner
     or v_summary_total is distinct from v_booking.cleaner_earnings_total_cents then
    raise exception 'AUDIT-03A02B booking % summary evidence no longer converges', p_booking_id
      using errcode = '55000';
  end if;

  select *
    into v_existing
  from public.cleaner_earnings ce
  where ce.booking_id = p_booking_id
  for update;

  if found then
    if lower(coalesce(v_existing.status::text, '')) = 'pending'
       and v_existing.disbursement_id is null
       and v_existing.cleaner_id = v_owner
       and v_existing.amount_cents = v_booking.cleaner_earnings_total_cents then
      return jsonb_build_object(
        'ok', true,
        'booking_id', p_booking_id,
        'action', 'already_aligned',
        'owner_cleaner_id', v_owner,
        'amount_cents', v_booking.cleaner_earnings_total_cents
      );
    end if;

    raise exception 'AUDIT-03A02B booking % acquired conflicting ledger evidence', p_booking_id
      using errcode = '55000';
  end if;

  insert into public.cleaner_earnings (
    cleaner_id,
    booking_id,
    amount_cents,
    status
  ) values (
    v_owner,
    p_booking_id,
    v_booking.cleaner_earnings_total_cents,
    'pending'
  );

  return jsonb_build_object(
    'ok', true,
    'booking_id', p_booking_id,
    'action', 'inserted',
    'owner_cleaner_id', v_owner,
    'amount_cents', v_booking.cleaner_earnings_total_cents
  );
end;
$$;

revoke all on function public.audit_03a02b_repair_missing_ledger_one(uuid) from public;
revoke all on function public.audit_03a02b_repair_missing_ledger_one(uuid) from anon;
revoke all on function public.audit_03a02b_repair_missing_ledger_one(uuid) from authenticated;
revoke all on function public.audit_03a02b_repair_missing_ledger_one(uuid) from service_role;

comment on function public.audit_03a02b_repair_missing_ledger_one(uuid) is
  'AUDIT-03A02B.1 owner-only helper for controlled staging verification and the hard-allowlisted service-role wrapper. Not directly executable by service_role or client roles.';

create or replace function public.apply_audit_03a02b_unlocked_missing_ledger_backfill()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_id uuid;
  v_result jsonb;
  v_inserted integer := 0;
  v_already_aligned integer := 0;
  v_allowlist uuid[] := array[
    'ecb13764-01f7-490a-bd06-aacaf992c5f5'::uuid,
    '9c87c65f-e847-4157-b0dd-ea4f14edb6e9'::uuid,
    '7cd9b6b8-22ee-497c-9b4c-357d40aee71c'::uuid,
    '2933f61b-3380-4149-95ab-8f05875f90b6'::uuid,
    '5eb7d0b4-b8bf-4c2e-a975-7aea7fd4515f'::uuid,
    '24dff648-ea7b-470e-8d22-69966b193c8e'::uuid,
    '47924352-5bf0-40f9-bd6f-4ee04c2464a7'::uuid,
    '629da654-ad55-4b1c-83e4-33c57a103211'::uuid,
    '62b33aa3-8a97-48fe-8781-35be046e5b09'::uuid,
    'e2fb83a5-fcd3-4183-8f2b-7473b32b0389'::uuid,
    '76b1eee2-bd8b-42e9-b9e1-17e3f9a19cb0'::uuid
  ];
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;

  foreach v_id in array v_allowlist loop
    v_result := public.audit_03a02b_repair_missing_ledger_one(v_id);

    if v_result ->> 'action' = 'inserted' then
      v_inserted := v_inserted + 1;
    elsif v_result ->> 'action' = 'already_aligned' then
      v_already_aligned := v_already_aligned + 1;
    else
      raise exception 'AUDIT-03A02B unexpected helper result for booking %', v_id
        using errcode = '55000';
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'allowlisted', array_length(v_allowlist, 1),
    'inserted', v_inserted,
    'already_aligned', v_already_aligned
  );
end;
$$;

revoke all on function public.apply_audit_03a02b_unlocked_missing_ledger_backfill() from public;
revoke all on function public.apply_audit_03a02b_unlocked_missing_ledger_backfill() from anon;
revoke all on function public.apply_audit_03a02b_unlocked_missing_ledger_backfill() from authenticated;
grant execute on function public.apply_audit_03a02b_unlocked_missing_ledger_backfill() to service_role;

comment on function public.apply_audit_03a02b_unlocked_missing_ledger_backfill() is
  'AUDIT-03A02B.1 service-role-only wrapper; remains hard-allowlisted to exactly 11 proven production bookings and delegates invariant checks to an owner-only helper.';

commit;
