-- ============================================================================
-- M-20: notification_logs.booking_id integrity hardening
-- ----------------------------------------------------------------------------
-- Problem
--   public.notification_logs.booking_id is TEXT with no FK and no shape
--   constraint. The writer (apps/web/lib/notifications/notificationLogWrite.ts)
--   trims and slices to 128 chars but does no format validation, so a typo,
--   stale legacy id, or future caller bug could insert garbage into the audit
--   trail with no DB-level signal. Joins to public.bookings(id) only succeed
--   when the TEXT happens to be a UUID; orphans / malformed values are
--   silently accepted and pollute admin notification-logs surfaces.
--
-- Fix
--   Add a CHECK constraint asserting booking_id is either NULL or matches the
--   canonical UUID textual format (8-4-4-4-12 hex). The constraint is added
--   `NOT VALID` so:
--     1. existing rows are NOT scanned or modified (audit history preserved
--        even if some legacy rows are non-UUID — see "Audit-history
--        preservation" below);
--     2. all FUTURE INSERT / UPDATE statements are validated immediately at
--        the database layer.
--   The companion writer change in notificationLogWrite.ts proactively
--   normalises malformed inputs to NULL and logs a warn-level operational
--   issue, so the audit row is preserved (with a null booking_id) instead of
--   being lost to a constraint violation. Defense in depth: writer normalises,
--   DB rejects regardless.
--
-- Why CHECK and not a real FK
--   Adding a real FK to public.bookings(id) requires changing the column type
--   to UUID. That would
--     * fail to deploy if any legacy notification_logs row has a non-UUID
--       booking_id value (we cannot guarantee zero such rows on every env);
--     * force every reader (admin notification-logs route, retry route,
--       notifyCleanerBookingPaid cooldown probe, customer contact health
--       aggregator) to switch to UUID-typed parameters in lockstep;
--     * complicate audit-history preservation: ON DELETE SET NULL would null
--       the booking_id on every booking delete (losing the audit trace);
--       ON DELETE NO ACTION would block booking deletes entirely.
--   A future migration can add a UUID-typed companion column with FK and
--   ON DELETE SET NULL once historical rows are guaranteed clean (validated
--   via `VALIDATE CONSTRAINT` — see operator runbook below).
--
-- Audit-history preservation
--   This migration NEVER deletes, truncates, or null-mutates any existing row.
--   The constraint addition is metadata-only at NOT VALID time. Operators MAY
--   later run, in a maintenance window, to validate that all historical rows
--   conform (no app behaviour change at validate-time):
--
--     ALTER TABLE public.notification_logs
--       VALIDATE CONSTRAINT notification_logs_booking_id_uuid_or_null_chk;
--
--   If validation fails, operators can identify offending rows via:
--     SELECT id, booking_id
--     FROM public.notification_logs
--     WHERE booking_id IS NOT NULL
--       AND booking_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
--   …and decide whether to (a) backfill the correct UUID, (b) NULL out the
--   field manually (preserving the audit row), or (c) leave NOT VALID
--   indefinitely. NEVER bulk-delete to "fix" the validation failure.
--
-- Idempotent
--   The DROP IF EXISTS + ADD pattern lets this migration re-run safely on any
--   environment, including ones where a prior version of the constraint exists.
-- ============================================================================

ALTER TABLE public.notification_logs
  DROP CONSTRAINT IF EXISTS notification_logs_booking_id_uuid_or_null_chk;

ALTER TABLE public.notification_logs
  ADD CONSTRAINT notification_logs_booking_id_uuid_or_null_chk
  CHECK (
    booking_id IS NULL
    OR booking_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  ) NOT VALID;

COMMENT ON CONSTRAINT notification_logs_booking_id_uuid_or_null_chk
  ON public.notification_logs IS
  'M-20: rejects non-UUID booking_id strings at INSERT / UPDATE time. Added NOT VALID — existing rows are intentionally not scanned to preserve audit history. After confirming historical rows are clean, operators may run `ALTER TABLE public.notification_logs VALIDATE CONSTRAINT notification_logs_booking_id_uuid_or_null_chk` in a maintenance window. Companion writer normalises malformed inputs to NULL (see notificationLogWrite.ts).';
