-- AUDIT-02A01: pending-payment collected-cash source-of-truth convergence.
--
-- Accepted ADR:
--   * total_price / price_snapshot = payable / expected charge
--   * amount_paid_cents / total_paid_cents / total_paid_zar = collected cash only
--
-- Repair only rows that are provably unpaid and have no settlement evidence.
update public.bookings b
set
  amount_paid_cents = 0,
  total_paid_cents = 0,
  total_paid_zar = 0
where lower(trim(coalesce(b.status, ''))) in ('pending_payment', 'payment_expired')
  and lower(trim(coalesce(b.payment_status, 'pending'))) <> 'pending_monthly'
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

alter table public.bookings
  drop constraint if exists bookings_pending_unpaid_cash_zero;

alter table public.bookings
  add constraint bookings_pending_unpaid_cash_zero
  check (
    lower(trim(coalesce(status, ''))) not in ('pending_payment', 'payment_expired')
    or lower(trim(coalesce(payment_status, ''))) = 'pending_monthly'
    or (
      coalesce(amount_paid_cents, 0) = 0
      and coalesce(total_paid_cents, 0) = 0
      and coalesce(total_paid_zar, 0) = 0
    )
  ) not valid;

alter table public.bookings
  validate constraint bookings_pending_unpaid_cash_zero;

comment on constraint bookings_pending_unpaid_cash_zero on public.bookings is
  'AUDIT-02A01: ordinary pending/expired payment rows must not carry collected cash; pending_monthly remains governed by monthly billing semantics.';
