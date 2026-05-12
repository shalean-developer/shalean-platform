-- M-6: customer/admin preferred cleaner for recurring schedules.
--
-- Background.
-- Recurring occurrences spawned by `generate-recurring-bookings` cloned the customer's
-- `booking_snapshot_template` but did NOT propagate the customer's chosen cleaner onto the
-- generated `bookings` row. The result: every cycle "forgot" the customer's pick and went to
-- auto-dispatch. This migration adds an explicit, mutable column so admins / customers can
-- update the preferred cleaner without rewriting the snapshot template, and so the generator
-- has an authoritative source for the preferred cleaner independent of the snapshot.
--
-- The cron generator's order of precedence after this migration is:
--   1. `recurring_bookings.preferred_cleaner_id`             (explicit, mutable)
--   2. `booking_snapshot_template.locked.cleaner_id`        (legacy / inferred from intake)
--   3. `booking_snapshot_template.cleaner_id`               (top-level mirror, last resort)
-- The first non-null value is written to the new occurrence's `bookings.selected_cleaner_id`
-- with `assignment_type='user_selected'`. `bookings.cleaner_id` stays null until the
-- post-payment dispatch offer accepts/declines (no auto-assign of unavailable cleaners).
--
-- Forward-only, idempotent. No row data is rewritten — existing plans simply continue with
-- `preferred_cleaner_id IS NULL` and fall through to the snapshot fallbacks above.

alter table public.recurring_bookings
  add column if not exists preferred_cleaner_id uuid
  references public.cleaners (id) on delete set null;

comment on column public.recurring_bookings.preferred_cleaner_id is
  'M-6: customer/admin preferred cleaner for spawned occurrences. The recurring generator copies '
  'this onto the new bookings row as selected_cleaner_id (assignment_type=user_selected). '
  'Mutable independently of booking_snapshot_template so changing the pick does not require a snapshot rebuild. '
  'NULL falls back to template.locked.cleaner_id then template.cleaner_id; if all three are NULL the '
  'occurrence dispatches without a customer-picked cleaner. ON DELETE SET NULL: removing a cleaner '
  'never breaks recurring generation, it merely reverts the plan to auto-dispatch.';

create index if not exists recurring_bookings_preferred_cleaner_id_idx
  on public.recurring_bookings (preferred_cleaner_id)
  where preferred_cleaner_id is not null;

comment on index public.recurring_bookings_preferred_cleaner_id_idx is
  'Partial index — only plans with a preferred cleaner; supports admin "all plans for cleaner X" lookup '
  'and the cleaner-removal repair sweep that nulls preferred_cleaner_id when a cleaner is offboarded.';
