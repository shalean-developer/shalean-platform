-- Production checks: Paystack reference vs booking id (decoupled inline flow uses pay_<uuid>).
-- Run after deploy; trend legacy `paystack_reference = id::text` toward zero.

-- 1) Legacy leakage: row still keyed as "reference equals internal id" (UUID text = id)
select count(*) as legacy_reference_equals_id
from public.bookings
where paystack_reference is not null
  and trim(paystack_reference) <> ''
  and lower(trim(paystack_reference)) = lower(id::text);

-- 2) Impossible state: pay_ prefix should never equal id::text (different formats)
select id, paystack_reference, status, created_at
from public.bookings
where paystack_reference ilike 'pay_%'
  and lower(trim(paystack_reference)) = lower(id::text)
order by created_at desc
limit 50;

-- 3) Recent decoupled refs (spot-check)
select id, paystack_reference, status, updated_at
from public.bookings
where paystack_reference ilike 'pay_%'
order by updated_at desc
limit 25;

-- 4) Orphan risk: pay_ reference but still awaiting payment (should be 0 or explainable stuck rows)
select count(*) as pay_ref_still_pending_payment
from public.bookings
where paystack_reference ilike 'pay_%'
  and status = 'pending_payment';

select id, paystack_reference, customer_email, updated_at
from public.bookings
where paystack_reference ilike 'pay_%'
  and status = 'pending_payment'
order by updated_at desc
limit 50;

-- 5) Dispatch integrity: assigned bookings should have an accepted dispatch offer
--    (adjust if product allows assignment without offer, e.g. admin-only paths)
select count(*) as assigned_without_accepted_offer
from public.bookings b
where b.status = 'assigned'
  and not exists (
    select 1
    from public.dispatch_offers o
    where o.booking_id = b.id
      and o.status = 'accepted'
  );
