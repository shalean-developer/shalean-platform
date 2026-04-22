-- Run after a successful Paystack test.
--
-- EDIT SECTIONS 1–3: replace the sentinel values below with your real reference / UUIDs
-- from the success page or query 1. Sentinels are valid SQL and return no rows until replaced.
--
-- If the SQL editor shows "upstream connect error" / connection reset, retry the run;
-- that is a transient Supabase/network issue, not bad SQL.

-- ---------------------------------------------------------------------------
-- 1) bookings — set your Paystack reference (from success URL ?reference=...)
-- ---------------------------------------------------------------------------

select
  id,
  paystack_reference,
  customer_email,
  amount_paid_cents,
  total_paid_zar,
  booking_snapshot is not null as has_snapshot,
  jsonb_typeof(booking_snapshot) as snapshot_type,
  created_at
from public.bookings
where paystack_reference = '__REPLACE_WITH_YOUR_PAYSTACK_REFERENCE__'
limit 5;

-- Duplicate check for same reference (expect no rows here)
select paystack_reference, count(*) as cnt
from public.bookings
group by paystack_reference
having count(*) > 1;

-- ---------------------------------------------------------------------------
-- 2) user_events — booking_created (paste `id` from query 1 as booking uuid)
-- ---------------------------------------------------------------------------

select id, user_id, event_type, booking_id, created_at
from public.user_events
where event_type = 'booking_created'
  and booking_id = '00000000-0000-0000-0000-000000000001'::uuid;

-- ↑ Replace 00000000-0000-0000-0000-000000000001 with your booking id from section 1.

-- ---------------------------------------------------------------------------
-- 3) user_profiles — logged-in checkout only (paste auth user id)
-- ---------------------------------------------------------------------------

select id, booking_count, total_spent_cents, updated_at
from public.user_profiles
where id = '00000000-0000-0000-0000-000000000002'::uuid;

-- ↑ Replace with your user id, or skip this query if the booking was guest.

-- ---------------------------------------------------------------------------
-- 4) system_logs — recent operational entries (safe to run as-is)
-- ---------------------------------------------------------------------------

select level, source, left(message, 120) as message_preview, created_at
from public.system_logs
order by created_at desc
limit 40;

select level, source, message, created_at
from public.system_logs
where source in ('email', 'paystack/webhook', 'paystack/verify', 'recordBookingSideEffects')
   or message ilike '%email%'
order by created_at desc
limit 30;
