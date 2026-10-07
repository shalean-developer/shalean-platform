-- AUDIT-02A01 explicit POST-DEPLOY script.
-- Apply only after the compatible AUDIT-02A01 application writer is live and verified.
-- This script is intentionally outside supabase/migrations so ordinary pre-deploy migration
-- application cannot enforce the cash invariant before the compatible application is running.

-- AUDIT-02A01 POST-DEPLOY: repair historical pending-cash mirrors, reconcile
-- adjusted legacy line items, and install the invariant only after the new writer is live.
--
-- Precondition: application code using apply_pending_booking_init_patch(..., p_line_items)
-- is already deployed and verified in this environment.

begin;

-- Serialize the one-time repair against concurrent settlement/payment writes.
-- Lock every pending/expired positive-cash row before any evidence checks or
-- candidate capture. FOR UPDATE conflicts with the KEY SHARE lock taken by
-- payment_transactions foreign-key inserts, so a concurrent payment either
-- commits before these checks (and is observed) or waits until this repair
-- transaction finishes.
do $audit02a01_repair_lock$
begin
  perform 1
  from public.bookings b
  where lower(trim(coalesce(b.status, ''))) in ('pending_payment', 'payment_expired')
    and lower(trim(coalesce(b.payment_status, 'pending')))
      not in ('success', 'paid', 'succeeded', 'completed', 'pending_monthly')
    and greatest(
      coalesce(b.amount_paid_cents, 0),
      coalesce(b.total_paid_cents, 0),
      coalesce(b.total_paid_zar, 0) * 100
    ) > 0
  for update;
end
$audit02a01_repair_lock$;

-- Fail closed if settlement evidence exists only in the normalized ledger.
do $audit02a01_ledger$
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
$audit02a01_ledger$;

-- Reject divergent mirrors before using total_paid_zar as legacy payable evidence.
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
        select 1 from public.payment_transactions pt where pt.booking_id = b.id
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

-- Require independent corroboration of the legacy payable.
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
        select 1 from public.payment_transactions pt where pt.booking_id = b.id
      )
      and (
        (
          (
            jsonb_typeof(b.booking_snapshot) = 'object'
            and jsonb_typeof(b.booking_snapshot->'total_zar') = 'number'
            and abs((b.booking_snapshot->>'total_zar')::numeric - b.total_paid_zar) < 0.01
          )
          or (
            jsonb_typeof(b.price_snapshot) = 'object'
            and jsonb_typeof(b.price_snapshot->'total_price') = 'number'
            and abs((b.price_snapshot->>'total_price')::numeric - b.total_paid_zar) < 0.01
            and exists (
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
        ) is not true
      )
  ) then
    raise exception 'audit_02a01_legacy_payable_corroboration_failed';
  end if;
end
$audit02a01_payable$;

-- Capture repair candidates and their current line totals before mutating bookings.
create temporary table audit_02a01_repair on commit drop as
select
  b.id as booking_id,
  b.total_paid_zar as legacy_payable_zar,
  coalesce(li.line_total_cents, 0)::bigint as line_total_cents,
  coalesce(li.line_count, 0)::integer as line_count
from public.bookings b
left join lateral (
  select
    count(*)::integer as line_count,
    sum(coalesce(bli.total_price_cents, 0))::bigint as line_total_cents
  from public.booking_line_items bli
  where bli.booking_id = b.id
) li on true
where lower(trim(coalesce(b.status, ''))) in ('pending_payment', 'payment_expired')
  and lower(trim(coalesce(b.payment_status, 'pending')))
    not in ('success', 'paid', 'succeeded', 'completed', 'pending_monthly')
  and b.payment_completed_at is null
  and b.paid_at is null
  and b.payment_transaction_id is null
  and b.marked_paid_by_admin_id is null
  and coalesce(b.total_paid_zar, 0) > 0
  and not exists (
    select 1 from public.payment_transactions pt where pt.booking_id = b.id
  );

-- Reconcile any existing legacy breakdown to the actual historical Paystack payable.
-- Positive delta represents tip; negative delta represents discounts. Adjustment lines
-- never earn cleaner share.
insert into public.booking_line_items (
  booking_id,
  item_type,
  slug,
  name,
  quantity,
  unit_price_cents,
  total_price_cents,
  pricing_source,
  metadata,
  earns_cleaner,
  cleaner_earnings_cents
)
select
  r.booking_id,
  'adjustment',
  null,
  'Legacy checkout payable reconciliation',
  1,
  (round(r.legacy_payable_zar * 100) - r.line_total_cents)::integer,
  (round(r.legacy_payable_zar * 100) - r.line_total_cents)::integer,
  'audit_02a01_legacy_payable_reconciliation',
  jsonb_build_object('source', 'AUDIT-02A01'),
  false,
  null
from audit_02a01_repair r
where r.line_count > 0
  and (round(r.legacy_payable_zar * 100) - r.line_total_cents) <> 0;

-- Promote the corroborated payable, then clear collected-cash mirrors.
update public.bookings b
set
  total_price = r.legacy_payable_zar,
  price_snapshot = case
    when jsonb_typeof(b.price_snapshot) = 'object'
      then jsonb_set(
        jsonb_set(
          b.price_snapshot,
          '{total_price}',
          to_jsonb(r.legacy_payable_zar),
          true
        ),
        '{pay_total_zar}',
        to_jsonb(r.legacy_payable_zar),
        true
      )
    else b.price_snapshot
  end,
  amount_paid_cents = 0,
  total_paid_cents = 0,
  total_paid_zar = 0
from audit_02a01_repair r
where b.id = r.booking_id;

-- Prove repaired line-item totals now equal payable wherever line items exist.
do $audit02a01_lines$
begin
  if exists (
    select 1
    from audit_02a01_repair r
    join public.bookings b on b.id = r.booking_id
    where r.line_count > 0
      and exists (
        select 1
        from (
          select sum(coalesce(bli.total_price_cents, 0))::bigint as total_cents
          from public.booking_line_items bli
          where bli.booking_id = r.booking_id
        ) x
        where x.total_cents <> round(b.total_price * 100)
      )
  ) then
    raise exception 'audit_02a01_line_item_reconciliation_failed';
  end if;
end
$audit02a01_lines$;

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
  'AUDIT-02A01 post-deploy invariant: ordinary unpaid pending/expired rows cannot carry collected cash.';

commit;
