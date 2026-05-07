-- Monthly / invoice-linked bookings: billing classification + financial cap inputs (read-only).

select
  id,
  billing_type,
  payment_status,
  is_monthly_billing_booking,
  monthly_invoice_id is not null as has_invoice,
  total_paid_cents,
  amount_paid_cents,
  total_paid_zar,
  cleaner_payout_cents,
  cleaner_bonus_cents,
  status
from public.bookings
where
  coalesce(is_monthly_billing_booking, false)
  or lower(trim(coalesce(payment_status, ''))) = 'pending_monthly'
  or monthly_invoice_id is not null
order by date desc nulls last
limit 200;
