-- PAYOUT-E2E-002B: atomic bank-transfer settlement and dual-rail guard.
-- Bank transfer is recorded only when no Paystack transfer is active/successful.
-- Payout row, linked earning rails, and parent run are converged in one transaction.

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
  v_run_id uuid;
  v_remaining integer;
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
    perform public.mark_bookings_paid_for_cleaner_payout(p_payout_id);
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

  perform public.mark_bookings_paid_for_cleaner_payout(p_payout_id);

  v_run_id := v_payout.payout_run_id;
  if v_run_id is not null then
    update public.cleaner_payout_runs
    set status = 'processing'
    where id = v_run_id
      and status = 'approved';

    select count(*)
    into v_remaining
    from public.cleaner_payouts
    where payout_run_id = v_run_id
      and status <> 'paid';

    if v_remaining = 0 then
      update public.cleaner_payout_runs
      set status = 'paid',
          paid_at = coalesce(paid_at, v_paid_at)
      where id = v_run_id
        and status in ('approved', 'processing');
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
  'Service-role-only atomic bank settlement: blocks active Paystack rail, marks payout + linked earning lines paid, and advances/closes the parent payout run.';
