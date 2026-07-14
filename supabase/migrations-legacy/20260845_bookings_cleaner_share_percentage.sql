-- Cleaner line-earnings share frozen at booking time (0–1). Recompute uses this column, not live CLEANER_LINE_EARNINGS_SHARE.
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS cleaner_share_percentage numeric;

UPDATE public.bookings
SET cleaner_share_percentage = 0.7
WHERE cleaner_share_percentage IS NULL;

COMMENT ON COLUMN public.bookings.cleaner_share_percentage IS
  'Share of each eligible line item total allocated to cleaner at booking time; recompute reads this, not process env.';

-- Optional after rollout: ALTER TABLE public.bookings ALTER COLUMN cleaner_share_percentage SET NOT NULL;
