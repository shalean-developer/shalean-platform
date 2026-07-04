-- Security audit V-01: confirm RLS is enabled on core financial / identity tables.
-- Run in Supabase SQL Editor against production (or staging).
-- relrowsecurity = false → add a migration to ENABLE ROW LEVEL SECURITY + scoped policies.
--
-- Note: this project uses `user_profiles` (not `profiles`) and has no `payment_events`
-- table (payment attribution lives on `payment_link_delivery_events`).

select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in (
    'bookings',
    'cleaner_earnings',
    'cleaner_payouts',
    'cleaners',
    'user_profiles',
    'payment_link_delivery_events'
  )
order by relname;
