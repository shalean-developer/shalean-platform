-- MASTER-03B: allow service-role atomic terminal convergence of a
-- provider-verified absent cleaner payout intent from needs_reconcile.

alter table public.payout_transfer_outbox
  add column if not exists reconcile_started_at timestamptz;

update public.payout_transfer_outbox
set reconcile_started_at = coalesce(reconcile_started_at, updated_at, created_at)
where status = 'needs_reconcile'
  and reconcile_started_at is null;

create or replace function public.stamp_payout_transfer_reconcile_started_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'needs_reconcile'
     and old.status is distinct from 'needs_reconcile'
     and new.reconcile_started_at is null then
    new.reconcile_started_at := now();
  elsif new.status = 'needs_reconcile'
     and old.status = 'needs_reconcile'
     and old.reconcile_started_at is not null then
    new.reconcile_started_at := old.reconcile_started_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_payout_transfer_reconcile_started_at on public.payout_transfer_outbox;
create trigger trg_payout_transfer_reconcile_started_at
before update on public.payout_transfer_outbox
for each row
execute function public.stamp_payout_transfer_reconcile_started_at();

comment on column public.payout_transfer_outbox.reconcile_started_at is
  'Stable start time for the current needs_reconcile episode. updated_at may rotate for queue fairness without resetting the provider-absence grace period.';

create or replace function public.fail_cleaner_payout_outbox_validation(
  p_outbox_id uuid,
  p_error text,
  p_expected_status text,
  p_expected_attempts integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outbox public.payout_transfer_outbox%rowtype;
  v_error text := left(trim(coalesce(p_error, 'validation_failed')), 2000);
  v_expected_status text := lower(trim(coalesce(p_expected_status, '')));
begin
  if p_outbox_id is null then
    raise exception 'outbox_id_required';
  end if;
  if v_expected_status not in ('pending', 'sending', 'needs_reconcile') then
    raise exception 'invalid_expected_outbox_status';
  end if;
  if p_expected_attempts is null or p_expected_attempts < 0 then
    raise exception 'expected_attempts_required';
  end if;

  select *
  into v_outbox
  from public.payout_transfer_outbox
  where id = p_outbox_id
  for update;

  if not found then
    raise exception 'outbox_not_found';
  end if;

  if v_outbox.rail <> 'cleaner_payout' then
    raise exception 'outbox_rail_not_cleaner_payout';
  end if;

  if lower(coalesce(v_outbox.status, '')) <> v_expected_status
     or v_outbox.transfer_code is not null
     or coalesce(v_outbox.attempts, 0) <> p_expected_attempts then
    raise exception 'outbox_not_safe_for_terminal_failure';
  end if;

  update public.payout_transfer_outbox
  set
    status = 'failed',
    last_error = v_error,
    updated_at = now()
  where id = p_outbox_id
    and lower(status) = v_expected_status
    and transfer_code is null
    and coalesce(attempts, 0) = p_expected_attempts;

  if not found then
    raise exception 'outbox_terminal_state_changed';
  end if;

  if v_outbox.transfer_row_id is not null then
    update public.payout_transfers
    set
      status = 'failed',
      error = v_error
    where id = v_outbox.transfer_row_id
      and status <> 'success';

    if not found then
      raise exception 'transfer_audit_not_converged';
    end if;
  end if;

  update public.cleaner_payouts
  set payment_status = 'failed'
  where id = v_outbox.subject_id
    and status = 'approved'
    and lower(coalesce(payment_status, '')) = 'processing';

  if not found then
    raise exception 'payout_not_converged';
  end if;

  return true;
end;
$$;

revoke all on function public.fail_cleaner_payout_outbox_validation(uuid, text, text, integer) from public;
revoke all on function public.fail_cleaner_payout_outbox_validation(uuid, text, text, integer) from anon;
revoke all on function public.fail_cleaner_payout_outbox_validation(uuid, text, text, integer) from authenticated;
grant execute on function public.fail_cleaner_payout_outbox_validation(uuid, text, text, integer) to service_role;


comment on function public.fail_cleaner_payout_outbox_validation(uuid, text, text, integer) is
  'Service-role-only atomic terminal transition for deterministic cleaner-payout pre-provider or provider-verified-absent failures. Uses caller-observed outbox status + attempts CAS so active/uncertain send state cannot race terminal convergence.';
