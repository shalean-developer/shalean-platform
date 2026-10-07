-- AUDIT-02A01: pending-payment collected-cash source-of-truth convergence.
--
-- Accepted ADR:
--   * total_price / price_snapshot = payable / expected charge
--   * amount_paid_cents / total_paid_cents / total_paid_zar = collected cash only
--
-- Fail closed if settlement evidence exists only in the normalized ledger.
-- A CHECK constraint cannot safely query payment_transactions, so such rows must be
-- reconciled explicitly instead of being zeroed or blocking validation later.
do $audit02a01$
begin
  if exists (
    select 1
    from public.bookings b
    where lower(trim(coalesce(b.status, ''))) in ('pending_payment', 'payment_expired')
      and lower(trim(coalesce(b.payment_status, 'pending')))
        not in ('success', 'paid', 'succeeded', 'completed', 'pending_monthly')
      and b.payment_completed_at is null
      and b.paid_at is null
      and b.payment_transaction_id is null
      and b.marked_paid_by_admin_id is null
      and greatest(
        coalesce(b.amount_paid_cents, 0),
        coalesce(b.total_paid_cents, 0),
        coalesce(b.total_paid_zar, 0) * 100
      ) > 0
      and exists (
        select 1
        from public.payment_transactions pt
        where pt.booking_id = b.id
      )
  ) then
    raise exception 'audit_02a01_ledger_only_settlement_requires_manual_reconciliation';
  end if;
end
$audit02a01$;

-- Reject anomalous rows whose cash mirrors do not provide one trustworthy ZAR payable.
do $audit02a01_cashshape$
begin
  if exists (
    select 1
    from public.bookings b
    where lower(trim(coalesce(b.status, ''))) in ('pending_payment', 'payment_expired')
      and lower(trim(coalesce(b.payment_status, 'pending')))
        not in ('success', 'paid', 'succeeded', 'completed', 'pending_monthly')
      and b.payment_completed_at is null
      and b.paid_at is null
      and b.payment_transaction_id is null
      and b.marked_paid_by_admin_id is null
      and greatest(
        coalesce(b.amount_paid_cents, 0),
        coalesce(b.total_paid_cents, 0),
        coalesce(b.total_paid_zar, 0) * 100
      ) > 0
      and not exists (
        select 1
        from public.payment_transactions pt
        where pt.booking_id = b.id
      )
      and (
        coalesce(b.total_paid_zar, 0) <= 0
        or (
          coalesce(b.amount_paid_cents, 0) > 0
          and b.amount_paid_cents <> round(b.total_paid_zar * 100)
        )
        or (
          coalesce(b.total_paid_cents, 0) > 0
          and b.total_paid_cents <> round(b.total_paid_zar * 100)
        )
      )
  ) then
    raise exception 'audit_02a01_divergent_cash_mirrors_require_manual_reconciliation';
  end if;
end
$audit02a01_cashshape$;

-- Historical pre-change rows stored the actual checkout payable in total_paid_zar
-- while total_price could remain at the unadjusted visit amount. Require two
-- independent persisted pricing sources to corroborate the legacy payable before
-- promoting it into the canonical payable column.
do $audit02a01_payable$
begin
  if exists (
    select 1
    from public.bookings b
    where lower(trim(coalesce(b.status, ''))) in ('pending_payment', 'payment_expired')
      and lower(trim(coalesce(b.payment_status, 'pending')))
        not in ('success', 'paid', 'succeeded', 'completed', 'pending_monthly')
      and b.payment_completed_at is null
      and b.paid_at is null
      and b.payment_transaction_id is null
      and b.marked_paid_by_admin_id is null
      and coalesce(b.total_paid_zar, 0) > 0
      and not exists (
        select 1
        from public.payment_transactions pt
        where pt.booking_id = b.id
      )
      and (
        not (
          jsonb_typeof(b.price_snapshot) = 'object'
          and nullif(b.price_snapshot->>'total_price', '') is not null
          and abs((b.price_snapshot->>'total_price')::numeric - b.total_paid_zar) < 0.01
        )
        or not exists (
          select 1
          from (
            select
              bli.booking_id,
              sum(coalesce(bli.total_price_cents, 0)) as line_total_cents
            from public.booking_line_items bli
            where bli.booking_id = b.id
            group by bli.booking_id
          ) x
          where abs(x.line_total_cents - round(b.total_paid_zar * 100)) <= 1
        )
      )
  ) then
    raise exception 'audit_02a01_legacy_payable_corroboration_failed';
  end if;
end
$audit02a01_payable$;

-- Repair only rows that are provably unpaid and have no settlement evidence.
-- Promote the corroborated legacy payable first, then clear collected-cash mirrors.
update public.bookings b
set
  total_price = b.total_paid_zar,
  price_snapshot = case
    when jsonb_typeof(b.price_snapshot) = 'object'
      then jsonb_set(
        jsonb_set(
          b.price_snapshot,
          '{total_price}',
          to_jsonb(b.total_paid_zar),
          true
        ),
        '{pay_total_zar}',
        to_jsonb(b.total_paid_zar),
        true
      )
    else b.price_snapshot
  end,
  amount_paid_cents = 0,
  total_paid_cents = 0,
  total_paid_zar = 0
where lower(trim(coalesce(b.status, ''))) in ('pending_payment', 'payment_expired')
  and lower(trim(coalesce(b.payment_status, 'pending'))) not in ('success', 'paid', 'succeeded', 'completed', 'pending_monthly')
  and b.payment_completed_at is null
  and b.paid_at is null
  and b.payment_transaction_id is null
  and b.marked_paid_by_admin_id is null
  and greatest(
    coalesce(b.amount_paid_cents, 0),
    coalesce(b.total_paid_cents, 0),
    coalesce(b.total_paid_zar, 0) * 100
  ) > 0
  and not exists (
    select 1
    from public.payment_transactions pt
    where pt.booking_id = b.id
  );

-- Atomic pending-payment repricing boundary used by Paystack initialization.
-- The booking row is locked, settlement evidence is checked in the same transaction,
-- and the mutation only succeeds while the booking is still safely unpaid.
create or replace function public.apply_pending_booking_init_patch(
  p_booking_id uuid,
  p_patch jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $audit02a01_rpc$
declare
  v_row public.bookings%rowtype;
  v_updated_id uuid;
begin
  select *
    into v_row
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    return null;
  end if;

  if lower(trim(coalesce(v_row.status, ''))) <> 'pending_payment'
     or lower(trim(coalesce(v_row.payment_status, '')))
        in ('success', 'paid', 'succeeded', 'completed', 'pending_monthly')
     or v_row.payment_completed_at is not null
     or v_row.paid_at is not null
     or v_row.payment_transaction_id is not null
     or v_row.marked_paid_by_admin_id is not null
     or exists (
       select 1
       from public.payment_transactions pt
       where pt.booking_id = p_booking_id
     )
  then
    return null;
  end if;

  update public.bookings b
  set (
    booking_snapshot,
    duration_minutes,
    price_breakdown,
    total_price,
    price_snapshot,
    amount_paid_cents,
    total_paid_cents,
    total_paid_zar,
    customer_name,
    customer_phone,
    customer_id,
    user_id,
    location_id,
    city_id,
    surge_multiplier,
    surge_reason,
    extras,
    slot_duplicate_exempt,
    admin_force_slot_override,
    selected_cleaner_id,
    assignment_type,
    cleaner_count,
    cleaner_share_percentage
  ) = (
    select
      x.booking_snapshot,
      x.duration_minutes,
      x.price_breakdown,
      x.total_price,
      x.price_snapshot,
      x.amount_paid_cents,
      x.total_paid_cents,
      x.total_paid_zar,
      x.customer_name,
      x.customer_phone,
      x.customer_id,
      x.user_id,
      x.location_id,
      x.city_id,
      x.surge_multiplier,
      x.surge_reason,
      x.extras,
      x.slot_duplicate_exempt,
      x.admin_force_slot_override,
      x.selected_cleaner_id,
      x.assignment_type,
      x.cleaner_count,
      x.cleaner_share_percentage
    from jsonb_populate_record(b, p_patch) as x
  )
  where b.id = p_booking_id
    and lower(trim(coalesce(b.status, ''))) = 'pending_payment'
    and lower(trim(coalesce(b.payment_status, '')))
      not in ('success', 'paid', 'succeeded', 'completed', 'pending_monthly')
    and b.payment_completed_at is null
    and b.paid_at is null
    and b.payment_transaction_id is null
    and b.marked_paid_by_admin_id is null
    and not exists (
      select 1
      from public.payment_transactions pt
      where pt.booking_id = b.id
    )
  returning b.id into v_updated_id;

  return v_updated_id;
end
$audit02a01_rpc$;

revoke all on function public.apply_pending_booking_init_patch(uuid, jsonb) from public;
revoke all on function public.apply_pending_booking_init_patch(uuid, jsonb) from anon;
revoke all on function public.apply_pending_booking_init_patch(uuid, jsonb) from authenticated;
grant execute on function public.apply_pending_booking_init_patch(uuid, jsonb) to service_role;

alter table public.bookings
  drop constraint if exists bookings_pending_unpaid_cash_zero;

alter table public.bookings
  add constraint bookings_pending_unpaid_cash_zero
  check (
    lower(trim(coalesce(status, ''))) not in ('pending_payment', 'payment_expired')
    or lower(trim(coalesce(payment_status, ''))) in ('success', 'paid', 'succeeded', 'completed', 'pending_monthly')
    or payment_completed_at is not null
    or paid_at is not null
    or payment_transaction_id is not null
    or marked_paid_by_admin_id is not null
    or (
      coalesce(amount_paid_cents, 0) = 0
      and coalesce(total_paid_cents, 0) = 0
      and coalesce(total_paid_zar, 0) = 0
    )
  ) not valid;

alter table public.bookings
  validate constraint bookings_pending_unpaid_cash_zero;

comment on constraint bookings_pending_unpaid_cash_zero on public.bookings is
  'AUDIT-02A01: ordinary unpaid pending/expired rows must not carry collected cash; settled and pending_monthly states are preserved for separate reconciliation.';
