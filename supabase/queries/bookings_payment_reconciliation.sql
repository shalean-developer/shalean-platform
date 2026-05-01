-- Ops: bookings that paid in Paystack but need manual reconciliation (Day 4).
select
  id,
  paystack_reference,
  status,
  total_price,
  total_paid_zar,
  price_snapshot,
  updated_at
from public.bookings
where status in ('payment_mismatch', 'payment_reconciliation_required')
order by updated_at desc;
