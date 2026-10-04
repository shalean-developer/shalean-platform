-- PAYOUT-E2E-002B: atomic bank-transfer settlement and dual-rail guard.
-- Bank transfer is recorded only when no Paystack transfer is active/successful.
-- Payout row, linked earning rails, booking reconciliation ids/timestamps,
-- and parent run completion are converged in one transaction.

create or replace function public.settle_cleaner_payout_bank_transfer(
  p_payout_id uuid,
  p_paid_by uuid,
  p_reference text,
  p_paid_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payout public.cleaner_payouts%rowtype;
  v_reference text := trim(coalesce(p_reference, ''));
  v_paid_at timestamptz := coalesce(p_paid_at, now());
  v_parent_run_id uuid;
  v_booking_run_id uuid;
  v_remaining integer;
  v_locked_run uuid;
begin
  if p_payout_id is null then
    raise exception 'payout_id_required';
  end if;
  if p_paid_by is null then
    raise exception 'paid_by_required';
  end if;
  if length(v_reference) < 3 then
    raise exception 'bank_reference_required';
  end if;

  select *
  into v_payout
  from public.cleaner_payouts
  where id = p_payout_id
  for update;

  if not found then
    raise exception 'payout_not_found';
  end if;

  -- Idempotent retry for the same already-recorded bank settlement.
  if v_payout.status = 'paid'
     and v_payout.payment_method = 'bank_transfer'
     and coalesce(v_payout.payment_reference, '') = v_reference then
    return true;
  end if;

  if v_payout.status <> 'approved' then
    raise exception 'payout_not_approved';
  end if;

  if lower(coalesce(v_payout.payment_status, '')) = 'processing' then
    raise exception 'paystack_transfer_in_flight';
  end if;

  if exists (
    select 1
    from public.payout_transfers pt
    where pt.payout_id = p_payout_id
      and lower(coalesce(pt.status, '')) <> 'failed'
  ) then
    raise exception 'paystack_transfer_exists';
  end if;

  if not exists (
    select 1
    from public.cleaner_payment_details cpd
    where cpd.cleaner_id = v_payout.cleaner_id
      and length(trim(coalesce(cpd.account_number, ''))) >= 6
      and length(trim(coalesce(cpd.bank_code, ''))) >= 2
      and length(trim(coalesce(cpd.account_name, ''))) >= 2
  ) then
    raise exception 'bank_details_missing';
  end if;

  if (v_paid_at at time zone 'Africa/Johannesburg')::date >
     (now() at time zone 'Africa/Johannesburg')::date then
    raise exception 'future_paid_at_not_allowed';
  end if;

  if exists (
    select 1
    from public.bookings b
    where b.payout_id = p_payout_id
      and b.cleaner_id is distinct from v_payout.cleaner_id
  ) or exists (
    select 1
    from public.booking_roster_member_payouts rp
    where rp.cleaner_payout_id = p_payout_id
      and rp.cleaner_id is distinct from v_payout.cleaner_id
  ) or exists (
    select 1
    from public.team_job_member_payouts tj
    where tj.cleaner_payout_id = p_payout_id
      and tj.cleaner_id is distinct from v_payout.cleaner_id
  ) then
    raise exception 'payout_cleaner_mismatch';
  end if;

  -- Revalidate every earning line transactionally at settlement time. Approval
  -- can precede a later cancellation/refund, so bank settlement must not pay a
  -- liability the Paystack rail would reject.
  --
  -- Lock the linked booking rows first. Refund/cancellation writers must acquire
  -- the same row locks before committing their booking mutation, preventing a
  -- refund from racing between this eligibility check and the paid update.
  perform b.id
  from public.bookings b
  where (
    b.payout_id = p_payout_id
    or exists (
      select 1
      from public.booking_roster_member_payouts rp
      where rp.cleaner_payout_id = p_payout_id
        and rp.booking_id = b.id
    )
    or exists (
      select 1
      from public.team_job_member_payouts tj
      where tj.cleaner_payout_id = p_payout_id
        and tj.booking_id = b.id
    )
  )
  for update of b;

  if exists (
    select 1
    from public.bookings b
    where (
      b.payout_id = p_payout_id
      or exists (
        select 1
        from public.booking_roster_member_payouts rp
        where rp.cleaner_payout_id = p_payout_id
          and rp.booking_id = b.id
      )
      or exists (
        select 1
        from public.team_job_member_payouts tj
        where tj.cleaner_payout_id = p_payout_id
          and tj.booking_id = b.id
      )
    )
      and (
        lower(coalesce(b.status, '')) <> 'completed'
        or b.is_test is true
        or b.refunded_at is not null
        or lower(coalesce(b.refund_status, '')) in ('refunded', 'partial_refund', 'reversed')
        or exists (
          select 1
          from jsonb_array_elements(
            case
              when jsonb_typeof(b.booking_snapshot->'refund_workflow'->'records') = 'array'
                then b.booking_snapshot->'refund_workflow'->'records'
              else '[]'::jsonb
            end
          ) as refund_record
          where lower(coalesce(refund_record->>'provider_state', '')) in ('pending', 'submitted_to_provider')
        )
      )
  ) then
    raise exception 'linked_earning_no_longer_payable';
  end if;

  update public.cleaner_payouts
  set
    status = 'paid',
    paid_at = v_paid_at,
    payment_status = 'success',
    payment_method = 'bank_transfer',
    payment_reference = v_reference,
    paid_by = p_paid_by
  where id = p_payout_id
    and status = 'approved';

  if not found then
    raise exception 'payout_state_changed';
  end if;

  -- bookings.payout_run_id is a required reconciliation UUID for paid bookings.
  -- It is intentionally not an FK to cleaner_payout_runs, but the parent run id
  -- is a stable shared reconciliation id when one exists.
  v_parent_run_id := v_payout.payout_run_id;
  v_booking_run_id := coalesce(v_parent_run_id, gen_random_uuid());

  update public.bookings b
  set
    payout_status = 'paid',
    payout_paid_at = v_paid_at,
    payout_run_id = coalesce(b.payout_run_id, v_booking_run_id)
  where b.payout_id = p_payout_id
    and (
      lower(coalesce(b.payout_status, '')) is distinct from 'paid'
      or b.payout_paid_at is null
      or b.payout_run_id is null
    );

  update public.booking_roster_member_payouts rp
  set status = 'paid'
  where rp.cleaner_payout_id = p_payout_id
    and rp.status is distinct from 'paid';

  update public.team_job_member_payouts tj
  set status = 'paid'
  where tj.cleaner_payout_id = p_payout_id
    and tj.status is distinct from 'paid';

  if v_parent_run_id is not null then
    -- Serialize settlements in the same parent run so the final-child count
    -- cannot race and leave a fully paid run stuck in processing.
    select id
    into v_locked_run
    from public.cleaner_payout_runs
    where id = v_parent_run_id
    for update;

    if found then
      update public.cleaner_payout_runs
      set status = 'processing'
      where id = v_parent_run_id
        and status = 'approved';

      select count(*)
      into v_remaining
      from public.cleaner_payouts
      where payout_run_id = v_parent_run_id
        and status <> 'paid';

      if v_remaining = 0 then
        update public.cleaner_payout_runs
        set status = 'paid',
            paid_at = coalesce(paid_at, v_paid_at)
        where id = v_parent_run_id
          and status in ('approved', 'processing');
      end if;
    end if;
  end if;

  return true;
end;
$$;

revoke all on function public.settle_cleaner_payout_bank_transfer(uuid, uuid, text, timestamptz) from public;
revoke all on function public.settle_cleaner_payout_bank_transfer(uuid, uuid, text, timestamptz) from anon;
revoke all on function public.settle_cleaner_payout_bank_transfer(uuid, uuid, text, timestamptz) from authenticated;
grant execute on function public.settle_cleaner_payout_bank_transfer(uuid, uuid, text, timestamptz) to service_role;

comment on function public.settle_cleaner_payout_bank_transfer(uuid, uuid, text, timestamptz) is
  'Service-role-only atomic bank settlement: blocks active Paystack rail, stamps payout + linked bookings/member lines with the selected paid timestamp and reconciliation id, and serializes/finishes the parent payout run.';


-- Refund claims/retries and payout settlement share the same booking row lock.
-- The claim is a compare-and-transition operation against the freshly locked
-- workflow, so stale/concurrent callers cannot both reach the payment provider.
drop function if exists public.claim_booking_refund_workflow(uuid, jsonb);

create or replace function public.claim_booking_refund_workflow(
  p_booking_id uuid,
  p_expected_booking_snapshot jsonb,
  p_booking_snapshot jsonb,
  p_refund_id text,
  p_expected_provider_state text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_current_snapshot jsonb;
  v_current_state text;
  v_next_state text;
begin
  if p_booking_id is null then
    raise exception 'booking_id_required';
  end if;
  if p_booking_snapshot is null or p_expected_booking_snapshot is null then
    raise exception 'booking_snapshot_required';
  end if;
  if length(trim(coalesce(p_refund_id, ''))) = 0 then
    raise exception 'refund_id_required';
  end if;

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'booking_not_found';
  end if;

  if lower(coalesce(v_booking.payout_status, '')) = 'paid'
     or (
       v_booking.payout_id is not null
       and exists (
         select 1
         from public.cleaner_payouts cp
         where cp.id = v_booking.payout_id
           and (
             lower(coalesce(cp.status, '')) = 'paid'
             or lower(coalesce(cp.payment_status, '')) = 'processing'
             or exists (
               select 1
               from public.payout_transfers pt
               where pt.payout_id = cp.id
                 and lower(coalesce(pt.status, '')) <> 'failed'
             )
           )
       )
     )
     or exists (
       select 1
       from public.booking_roster_member_payouts rp
       left join public.cleaner_payouts cp on cp.id = rp.cleaner_payout_id
       where rp.booking_id = p_booking_id
         and (
           lower(coalesce(rp.status, '')) = 'paid'
           or lower(coalesce(cp.status, '')) = 'paid'
           or lower(coalesce(cp.payment_status, '')) = 'processing'
           or exists (
             select 1
             from public.payout_transfers pt
             where pt.payout_id = cp.id
               and lower(coalesce(pt.status, '')) <> 'failed'
           )
         )
     )
     or exists (
       select 1
       from public.team_job_member_payouts tj
       left join public.cleaner_payouts cp on cp.id = tj.cleaner_payout_id
       where tj.booking_id = p_booking_id
         and (
           lower(coalesce(tj.status, '')) = 'paid'
           or lower(coalesce(cp.status, '')) = 'paid'
           or lower(coalesce(cp.payment_status, '')) = 'processing'
           or exists (
             select 1
             from public.payout_transfers pt
             where pt.payout_id = cp.id
               and lower(coalesce(pt.status, '')) <> 'failed'
           )
         )
     ) then
    raise exception 'booking_payout_already_paid';
  end if;

  v_current_snapshot := coalesce(v_booking.booking_snapshot, '{}'::jsonb);

  -- Compare-and-swap: a payout/refund/other workflow mutation that committed
  -- after the caller read the booking makes this claim stale.
  if v_current_snapshot is distinct from coalesce(p_expected_booking_snapshot, '{}'::jsonb) then
    raise exception 'stale_refund_claim';
  end if;

  select lower(coalesce(r.value->>'provider_state', ''))
  into v_current_state
  from jsonb_array_elements(
    case
      when jsonb_typeof(v_current_snapshot->'refund_workflow'->'records') = 'array'
        then v_current_snapshot->'refund_workflow'->'records'
      else '[]'::jsonb
    end
  ) as r(value)
  where r.value->>'id' = p_refund_id
  limit 1;

  select lower(coalesce(r.value->>'provider_state', ''))
  into v_next_state
  from jsonb_array_elements(
    case
      when jsonb_typeof(p_booking_snapshot->'refund_workflow'->'records') = 'array'
        then p_booking_snapshot->'refund_workflow'->'records'
      else '[]'::jsonb
    end
  ) as r(value)
  where r.value->>'id' = p_refund_id
  limit 1;

  if v_next_state is distinct from 'submitted_to_provider' then
    raise exception 'invalid_refund_claim_transition';
  end if;

  if p_expected_provider_state is null then
    if v_current_state is not null then
      raise exception 'stale_refund_claim';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(v_current_snapshot->'refund_workflow'->'records') = 'array'
            then v_current_snapshot->'refund_workflow'->'records'
          else '[]'::jsonb
        end
      ) as r(value)
      where lower(coalesce(r.value->>'provider_state', '')) in ('pending', 'submitted_to_provider')
    ) then
      raise exception 'refund_claim_already_in_flight';
    end if;
  else
    if lower(coalesce(v_current_state, '')) <> lower(trim(p_expected_provider_state)) then
      raise exception 'stale_refund_claim';
    end if;
    if lower(trim(p_expected_provider_state)) <> 'failed' then
      raise exception 'invalid_refund_claim_transition';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(v_current_snapshot->'refund_workflow'->'records') = 'array'
            then v_current_snapshot->'refund_workflow'->'records'
          else '[]'::jsonb
        end
      ) as r(value)
      where r.value->>'id' <> p_refund_id
        and lower(coalesce(r.value->>'provider_state', '')) in ('pending', 'submitted_to_provider')
    ) then
      raise exception 'refund_claim_already_in_flight';
    end if;
  end if;

  update public.bookings
  set booking_snapshot = p_booking_snapshot
  where id = p_booking_id;

  return true;
end;
$$;

revoke all on function public.claim_booking_refund_workflow(uuid, jsonb, jsonb, text, text) from public;
revoke all on function public.claim_booking_refund_workflow(uuid, jsonb, jsonb, text, text) from anon;
revoke all on function public.claim_booking_refund_workflow(uuid, jsonb, jsonb, text, text) from authenticated;
grant execute on function public.claim_booking_refund_workflow(uuid, jsonb, jsonb, text, text) to service_role;

comment on function public.claim_booking_refund_workflow(uuid, jsonb, jsonb, text, text) is
  'Service-role-only atomic refund claim/retry gate. Locks the booking row shared with payout settlement, rejects paid payouts and stale snapshots, validates new/failed to submitted transitions, rejects another in-flight refund, then stores the claim before any provider call.';


-- Paystack payout claim/resume shares the same payout -> booking lock order as
-- bank settlement. Both initial claims and processing resumes revalidate every
-- linked booking before any transfer/outbox submission.
drop function if exists public.claim_cleaner_payout_paystack_processing(uuid);
drop function if exists public.claim_cleaner_payout_paystack_processing(uuid, boolean);

create or replace function public.claim_cleaner_payout_paystack_processing(
  p_payout_id uuid,
  p_allow_existing_processing boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payout public.cleaner_payouts%rowtype;
  v_payment_status text;
begin
  if p_payout_id is null then
    raise exception 'payout_id_required';
  end if;

  select *
  into v_payout
  from public.cleaner_payouts
  where id = p_payout_id
  for update;

  if not found then
    raise exception 'payout_not_found';
  end if;

  if v_payout.status <> 'approved' then
    raise exception 'payout_not_approved';
  end if;

  v_payment_status := lower(coalesce(v_payout.payment_status, ''));

  if p_allow_existing_processing then
    if v_payment_status <> 'processing' then
      raise exception 'payout_not_processing';
    end if;
  elsif v_payment_status not in ('pending', 'failed', 'partial_failed') then
    raise exception 'payout_payment_already_in_progress';
  end if;

  if exists (
    select 1
    from public.bookings b
    where b.payout_id = p_payout_id
      and b.cleaner_id is distinct from v_payout.cleaner_id
  ) or exists (
    select 1
    from public.booking_roster_member_payouts rp
    where rp.cleaner_payout_id = p_payout_id
      and rp.cleaner_id is distinct from v_payout.cleaner_id
  ) or exists (
    select 1
    from public.team_job_member_payouts tj
    where tj.cleaner_payout_id = p_payout_id
      and tj.cleaner_id is distinct from v_payout.cleaner_id
  ) then
    raise exception 'payout_cleaner_mismatch';
  end if;

  perform b.id
  from public.bookings b
  where (
    b.payout_id = p_payout_id
    or exists (
      select 1
      from public.booking_roster_member_payouts rp
      where rp.cleaner_payout_id = p_payout_id
        and rp.booking_id = b.id
    )
    or exists (
      select 1
      from public.team_job_member_payouts tj
      where tj.cleaner_payout_id = p_payout_id
        and tj.booking_id = b.id
    )
  )
  for update of b;

  if exists (
    select 1
    from public.bookings b
    where (
      b.payout_id = p_payout_id
      or exists (
        select 1
        from public.booking_roster_member_payouts rp
        where rp.cleaner_payout_id = p_payout_id
          and rp.booking_id = b.id
      )
      or exists (
        select 1
        from public.team_job_member_payouts tj
        where tj.cleaner_payout_id = p_payout_id
          and tj.booking_id = b.id
      )
    )
      and (
        lower(coalesce(b.status, '')) <> 'completed'
        or b.is_test is true
        or b.refunded_at is not null
        or lower(coalesce(b.refund_status, '')) in ('refunded', 'partial_refund', 'partial', 'full', 'reversed', 'chargeback')
        or exists (
          select 1
          from jsonb_array_elements(
            case
              when jsonb_typeof(b.booking_snapshot->'refund_workflow'->'records') = 'array'
                then b.booking_snapshot->'refund_workflow'->'records'
              else '[]'::jsonb
            end
          ) as refund_record
          where lower(coalesce(refund_record->>'provider_state', '')) in ('pending', 'submitted_to_provider')
        )
      )
  ) then
    raise exception 'linked_refund_or_ineligible_booking_blocks_payout';
  end if;

  if not p_allow_existing_processing then
    update public.cleaner_payouts
    set
      payment_status = 'processing',
      payment_method = 'paystack'
    where id = p_payout_id
      and status = 'approved'
      and lower(coalesce(payment_status, '')) in ('pending', 'failed', 'partial_failed');

    if not found then
      raise exception 'payout_payment_already_in_progress';
    end if;
  end if;

  return true;
end;
$$;

revoke all on function public.claim_cleaner_payout_paystack_processing(uuid, boolean) from public;
revoke all on function public.claim_cleaner_payout_paystack_processing(uuid, boolean) from anon;
revoke all on function public.claim_cleaner_payout_paystack_processing(uuid, boolean) from authenticated;
grant execute on function public.claim_cleaner_payout_paystack_processing(uuid, boolean) to service_role;

comment on function public.claim_cleaner_payout_paystack_processing(uuid, boolean) is
  'Service-role-only Paystack payout claim/resume gate. Locks payout then linked bookings, rejects test/non-completed/refunded/in-flight-refund bookings, and atomically claims or revalidates processing before any transfer submission.';

