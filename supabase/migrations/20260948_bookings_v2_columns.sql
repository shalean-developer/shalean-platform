-- Booking Form V2 — new columns for service-specific data, team/cleaner logic, and pricing breakdown.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS service_details      jsonb,
  ADD COLUMN IF NOT EXISTS selected_extras      jsonb,
  ADD COLUMN IF NOT EXISTS pricing_summary      jsonb,
  ADD COLUMN IF NOT EXISTS cleaner_mode         text CHECK (cleaner_mode IN ('team', 'individual_cleaners')),
  ADD COLUMN IF NOT EXISTS assigned_team_id     text,
  ADD COLUMN IF NOT EXISTS cleaner_count        integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS booking_type         text CHECK (booking_type IN ('once_off', 'recurring')),
  ADD COLUMN IF NOT EXISTS alt_date             text,
  ADD COLUMN IF NOT EXISTS alt_time             text,
  ADD COLUMN IF NOT EXISTS suburb               text,
  ADD COLUMN IF NOT EXISTS postal_code          text,
  ADD COLUMN IF NOT EXISTS access_instructions  text,
  ADD COLUMN IF NOT EXISTS parking_instructions text,
  ADD COLUMN IF NOT EXISTS gate_code            text,
  ADD COLUMN IF NOT EXISTS recurring_frequency  text CHECK (recurring_frequency IN ('weekly', 'fortnightly', 'monthly', 'custom')),
  ADD COLUMN IF NOT EXISTS recurring_days       jsonb,
  ADD COLUMN IF NOT EXISTS recurring_start_date text,
  ADD COLUMN IF NOT EXISTS recurring_end_date   text;

COMMENT ON COLUMN public.bookings.service_details      IS 'Service-specific step 1 answers (JSONB map of question key → answer)';
COMMENT ON COLUMN public.bookings.selected_extras      IS 'Array of selected extra service IDs';
COMMENT ON COLUMN public.bookings.pricing_summary      IS 'Itemised price breakdown at time of booking confirmation';
COMMENT ON COLUMN public.bookings.cleaner_mode         IS 'team = deep/moving cleaning, individual_cleaners = all other services';
COMMENT ON COLUMN public.bookings.assigned_team_id     IS 'Team 1/2/3 assigned for deep or moving cleaning bookings';
COMMENT ON COLUMN public.bookings.cleaner_count        IS 'Number of individual cleaners (1–3) for non-team services';
COMMENT ON COLUMN public.bookings.booking_type         IS 'once_off or recurring';
COMMENT ON COLUMN public.bookings.recurring_frequency  IS 'Weekly, fortnightly, monthly, or custom schedule';
COMMENT ON COLUMN public.bookings.recurring_days       IS 'Array of weekday names for custom recurring schedules';
