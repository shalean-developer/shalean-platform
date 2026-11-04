-- HISTORICAL RECORD: the prior one-booking atomic candidate was withdrawn.
-- DO NOT EXECUTE. The 12 October booking is CANCELLED and is not the payment
-- destination. The actual paid 5 October Paystack charge is linked to Zoho
-- INV-001971; the completed 8 October booking is SHL-BK-002994.
-- The 12 October cancelled booking SHL-BK-002812 and completed booking both
-- retain a link to monthly invoice INV-002025 (duplicate per owner).
-- Voiding/crediting INV-002025 and correcting internal links requires a
-- separately approved accounting operation and validation of both bookings.
-- The previous executable SQL must not be used as a repair. See PR #1049
-- review evidence for read-only verification and isolated test outcomes.
DO $$ BEGIN RAISE EXCEPTION
  'withdrawn_unsafe_repair: cancelled booking and duplicate monthly invoice; no writes permitted';
END $$;
