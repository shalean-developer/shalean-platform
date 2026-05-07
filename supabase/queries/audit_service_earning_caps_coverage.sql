-- Caps drive `computeBookingEarnings` when present. Service ids are lowercase slugs (standard, deep, move, …).
-- This lists active cap rows (not “missing bookings” — bookings store `service` label, not always `service_id`).

select service_id, cap_cents, is_active, effective_from, effective_to
from public.service_earning_caps
where coalesce(is_active, false) = true
order by service_id, effective_from desc nulls last;
