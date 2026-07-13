-- Repair legacy `bookings.payment_status` values so `bookings_payment_status_check` can validate.
-- Error 23514 on that constraint almost always means non-canonical text slipped in before checks existed.

-- Blank / whitespace-only → NULL
update public.bookings
set payment_status = null
where payment_status is not null
  and btrim(payment_status) = '';

-- Canonical casing/spelling for allowed literals
update public.bookings
set payment_status = lower(btrim(payment_status))
where payment_status is not null
  and lower(btrim(payment_status)) in ('pending', 'success', 'failed', 'pending_monthly');

-- Common synonyms → success only when we have evidence of settlement (avoids breaking paid_* constraints)
update public.bookings
set payment_status = 'success'
where payment_status is not null
  and lower(btrim(payment_status)) in ('succeeded', 'successful', 'paid')
  and (
    payment_completed_at is not null
    or coalesce(amount_paid_cents, 0) > 0
    or coalesce(total_paid_cents, 0) > 0
  );

-- Remaining synonym rows without evidence → drop sub-state (booking row stays valid)
update public.bookings
set payment_status = null
where payment_status is not null
  and lower(btrim(payment_status)) in ('succeeded', 'successful', 'paid');

-- Anything still outside the enum → NULL (safe default; ops can fix individual rows if needed)
update public.bookings
set payment_status = null
where payment_status is not null
  and payment_status not in ('pending', 'success', 'failed', 'pending_monthly');
