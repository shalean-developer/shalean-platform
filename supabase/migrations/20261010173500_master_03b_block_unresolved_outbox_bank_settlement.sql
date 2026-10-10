-- MASTER-03B: prevent bank settlement while any Paystack payout intent remains active or unresolved.
-- This closes the legacy case where payout_transfers may be failed while the outbox still requires provider reconciliation.

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
  v_item_count integer;
  v_item_total bigint;
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

  -- Any active or unresolved Paystack outbox intent must block bank settlement,
  -- even when a legacy payout_transfers audit row is already marked failed.
  if exists (
    select 1
    from public.payout_transfer_outbox pto
    where pto.rail = 'cleaner_payout'
      and pto.subject_id = p_payout_id
      and (
        lower(coalesce(pto.status, '')) in ('pending', 'sending', 'submitted', 'needs_reconcile', 'succeeded')
        or (
          lower(coalesce(pto.status, '')) = 'failed'
          and lower(coalesce(pto.last_error, '')) ~ '(duplicate|already|reference)'
        )
      )
  ) then
    raise exception 'paystack_transfer_in_flight';
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

  with raw_items as (
    select
      b.id as booking_id,
      0 as source_rank,
      case
        when lower(coalesce(b.payout_status, '')) in ('eligible', 'paid')
             and coalesce(b.payout_frozen_cents, 0) > 0
          then coalesce(b.payout_frozen_cents, 0)::bigint
        else (coalesce(b.cleaner_payout_cents, 0) + coalesce(b.cleaner_bonus_cents, 0))::bigint
      end as amount_cents
    from public.bookings b
    where b.payout_id = p_payout_id

    union all

    select
      rp.booking_id,
      1 as source_rank,
      (coalesce(rp.payout_cents, 0) + coalesce(rp.bonus_cents, 0))::bigint
    from public.booking_roster_member_payouts rp
    where rp.cleaner_payout_id = p_payout_id

    union all

    select
      tj.booking_id,
      2 as source_rank,
      coalesce(tj.payout_cents, 0)::bigint
    from public.team_job_member_payouts tj
    where tj.cleaner_payout_id = p_payout_id
  ),
  ranked_items as (
    select
      booking_id,
      amount_cents,
      row_number() over (partition by booking_id order by source_rank desc) as rn
    from raw_items
  )
  select count(*)::integer, coalesce(sum(amount_cents), 0)::bigint
  into v_item_count, v_item_total
  from ranked_items
  where rn = 1;

  if coalesce(v_item_count, 0) = 0 then
    raise exception 'payout_has_no_earning_items';
  end if;

  if coalesce(v_payout.total_amount_cents, 0) <= 0 then
    raise exception 'payout_amount_not_positive';
  end if;

  if v_payout.amount_adjusted_at is null
     and v_item_total <> coalesce(v_payout.total_amount_cents, 0)::bigint then
    raise exception 'payout_total_mismatch';
  end if;

  if v_payout.amount_adjusted_at is not null
     and length(trim(coalesce(v_payout.adjustment_note, ''))) < 3 then
    raise exception 'payout_adjustment_reason_required';
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
