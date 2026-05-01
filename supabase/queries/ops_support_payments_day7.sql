-- Day 7 ops: failed / integrity booking states
select
  id,
  paystack_reference,
  status,
  total_price,
  total_paid_zar,
  price_snapshot,
  lifecycle_issue,
  updated_at
from public.bookings
where status in ('payment_mismatch', 'payment_reconciliation_required')
order by updated_at desc;

-- Stale pending_payment (possible abandoned init or webhook delay)
select
  id,
  paystack_reference,
  status,
  customer_email,
  created_at,
  updated_at
from public.bookings
where status = 'pending_payment'
  and created_at < now() - interval '10 minutes'
order by created_at desc;

-- Notification audit: duplicate delivery rows (same booking + template channel)
select
  booking_id,
  event_type,
  channel,
  count(*) as row_count
from public.notification_logs
where booking_id is not null
group by booking_id, event_type, channel
having count(*) > 1
order by row_count desc;

-- Idempotency claims: duplicate keys should not occur (sanity — should return 0 rows)
select
  booking_id,
  event_type,
  channel,
  count(*) as row_count
from public.notification_idempotency_claims
group by booking_id, event_type, channel
having count(*) > 1;

-- Referral checkout redemptions by code
select
  referral_code,
  count(*) as uses
from public.referral_discount_redemptions
group by referral_code
order by uses desc;

-- Payment integrity + lifecycle flags (single glance)
select
  id,
  paystack_reference,
  status,
  lifecycle_issue,
  updated_at
from public.bookings
where lifecycle_issue = true
   or status in ('payment_mismatch', 'payment_reconciliation_required')
order by updated_at desc
limit 100;
