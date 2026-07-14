-- Re-derive cleaner_share_percentage from cleaner tenure at appointment (0.6 vs 0.7),
-- replacing the flat 0.7 from 20260845 where we have cleaner + booking date.
-- Calendar month delta matches apps/web/lib/payout/tenureBasedCleanerLineShare.ts.

CREATE OR REPLACE FUNCTION public._shalean_months_between_cal(joined_ts timestamptz, end_ts timestamptz)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(
    0,
    (EXTRACT(YEAR FROM end_ts)::int - EXTRACT(YEAR FROM joined_ts)::int) * 12
      + (EXTRACT(MONTH FROM end_ts)::int - EXTRACT(MONTH FROM joined_ts)::int)
      - CASE
          WHEN EXTRACT(DAY FROM end_ts)::int < EXTRACT(DAY FROM joined_ts)::int THEN 1
          ELSE 0
        END
  );
$$;

UPDATE public.bookings b
SET cleaner_share_percentage = CASE
  WHEN src.tenure_m < 4 THEN 0.6
  ELSE 0.7
END
FROM (
  SELECT
    b.id,
    public._shalean_months_between_cal(
      COALESCE(c.joined_at, c.created_at)::timestamptz,
      (
        (b.date::text || ' ' || coalesce(trim(to_char(b.time, 'HH24:MI:SS')), '12:00:00'))::timestamp AT TIME ZONE 'UTC'
      )::timestamptz
    ) AS tenure_m
  FROM public.bookings b
  INNER JOIN public.cleaners c ON c.id = COALESCE(b.cleaner_id, b.selected_cleaner_id, b.payout_owner_cleaner_id)
  WHERE b.date IS NOT NULL
) AS src
WHERE b.id = src.id;

DROP FUNCTION IF EXISTS public._shalean_months_between_cal(timestamptz, timestamptz);

COMMENT ON COLUMN public.bookings.cleaner_share_percentage IS
  'Tenure-based share of eligible line totals at booking time (0.6 if cleaner tenure <4 months at appointment, else 0.7).';
