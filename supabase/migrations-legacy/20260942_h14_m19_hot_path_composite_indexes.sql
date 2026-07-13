-- ============================================================================
-- H-14 / M-19 — hot-path composite indexes for booking, dispatch & notification.
-- ----------------------------------------------------------------------------
-- Production Readiness Audit H-14 (HIGH) and M-19 (MEDIUM).
--
-- Symptom
--   Several read-heavy hot paths (booking dashboards, dispatch flows, cleaner
--   offers/jobs, notification cooldown probes, payout scans) use multi-column
--   filter + ORDER BY shapes that the existing indexes only partially cover.
--   Today's row counts mask the cost; at scale these queries trigger seq scans
--   or large bitmap recheck + sort steps that turn into latency cliffs.
--
-- This migration is forward-only, additive, and isolated to performance
-- hardening — no policies, no schema changes, no row mutations, no payout /
-- dispatch behaviour change.
--
-- Online application (CONCURRENTLY)
--   Supabase's standard migration runner (and the SQL editor / MCP RPC) wrap
--   every statement in a transaction, which Postgres rejects for
--   `CREATE INDEX CONCURRENTLY` (`SQLSTATE 25001`). To stay compatible with the
--   default deploy path AND the existing repo convention (all prior index
--   migrations use plain `CREATE INDEX IF NOT EXISTS`), this migration uses the
--   plain form. The brief `ACCESS EXCLUSIVE` lock during build is acceptable
--   for the four target tables at current row counts.
--
--   For online application during peak traffic, run the CONCURRENTLY variants
--   manually from psql (or the SQL editor in autocommit mode) BEFORE applying
--   this migration — see:
--     supabase/queries/h14_m19_hot_path_composite_indexes_concurrently.sql
--   Once those indexes exist, this migration is a no-op (every statement is
--   IF NOT EXISTS guarded).
--
-- Idempotency
--   IF NOT EXISTS guards make this migration safe to re-apply. If the
--   CONCURRENTLY runbook was interrupted and left an INVALID index (visible
--   via `SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid`),
--   drop the offending index manually before re-running:
--       DROP INDEX CONCURRENTLY IF EXISTS public.<index_name>;
--   then re-apply.
--
-- Coverage map (which query each new index accelerates)
--   1. bookings_status_date_time_desc_idx
--      → admin schedule board / day views and any "WHERE status = ?
--        ORDER BY date DESC, time DESC" listing. Existing
--        `bookings_status_date_idx (status, date)` already covers
--        (status, date ASC) but cannot serve a tie-break by `time`
--        without an extra sort.
--
--   2. bookings_user_id_created_at_idx
--      → customer dashboard (`loadCustomerBookingRowsForUser`,
--        `apps/web/app/api/dashboard/summary/route.ts`,
--        `apps/web/components/booking/Step4Payment.tsx`,
--        `apps/web/lib/booking/usePastBookingHints.ts`,
--        `apps/web/lib/referrals/server.ts`) which filter on
--        `user_id = $1` and order chronologically. The existing
--        `bookings_user_id_idx` is single-column and forces an extra sort.
--
--   3. dispatch_offers_booking_cleaner_status_idx
--      → cleaner-payout authorization probe
--        (`apps/web/lib/payout/persistCleanerPayout.ts`),
--        smart-assign prior-offer scan
--        (`apps/web/lib/dispatch/smartAssignCleaner.ts`)
--        and any "(booking, cleaner) → status" lookup. Complements (does NOT
--        duplicate) the existing partial UNIQUE
--        `dispatch_offers_booking_cleaner_pending_uidx` which only indexes
--        `WHERE status = 'pending'`.
--
--   4. notification_logs_booking_template_created_idx
--      → cleaner-paid SMS cooldown probe
--        (`apps/web/lib/notifications/notifyCleanerBookingPaid.ts`,
--        `cleanerPaidSmsRecentlySent`) and any per-(booking, template_key)
--        recency check. Existing single-column
--        `notification_logs_booking_id_idx` and
--        `notification_logs_template_key_idx` cannot serve the combined
--        equality + range scan in a single index.
--
-- Out-of-scope (audit instruction: index/perf hardening only)
--   * No query changes.
--   * No payout / dispatch / notification logic changes.
--   * No existing index drops — single-column indexes that are now
--     supersedable by the new composites are intentionally retained because
--     PostgreSQL is free to choose them for narrow lookups, FK constraint
--     verification, and ANALYZE statistics. The minor write-amplification is
--     acceptable for the read-side latency win.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. bookings (status, date desc, time desc) — admin schedule chronological lists
-- ----------------------------------------------------------------------------
-- Accelerates: WHERE status = ? ORDER BY date DESC, time DESC LIMIT N
-- Complements (does not replace): bookings_status_date_idx (status, date).
create index if not exists bookings_status_date_time_desc_idx
  on public.bookings (status, date desc, time desc);

comment on index public.bookings_status_date_time_desc_idx is
  'H-14: status-filtered chronological lists ordered by (date desc, time desc). Complements bookings_status_date_idx which only covers (status, date asc) with no time tie-break.';

-- ----------------------------------------------------------------------------
-- 2. bookings (user_id, created_at desc) — customer dashboard list
-- ----------------------------------------------------------------------------
-- Matches the existing `bookings_user_id_idx` partial predicate so PostgreSQL
-- treats the new index as a strict superset for user-scoped lookups while
-- keeping the index small (excludes guest / unlinked rows where user_id is
-- null, which never participate in user-scoped lists).
create index if not exists bookings_user_id_created_at_idx
  on public.bookings (user_id, created_at desc)
  where user_id is not null;

comment on index public.bookings_user_id_created_at_idx is
  'H-14: customer dashboard `WHERE user_id = ? ORDER BY created_at DESC` queries (loadCustomerBookingRowsForUser, /api/dashboard/summary, Step4Payment past-booking hints, referral checks). Partial WHERE user_id IS NOT NULL matches bookings_user_id_idx so this is a behavioural superset.';

-- ----------------------------------------------------------------------------
-- 3. dispatch_offers (booking_id, cleaner_id, status) — open-offer probe
-- ----------------------------------------------------------------------------
-- The existing partial `dispatch_offers_booking_cleaner_pending_uidx` only
-- covers WHERE status = 'pending'. This non-partial composite serves any
-- (booking, cleaner) → status lookup regardless of status value — including
-- accepted / rejected / expired history checks (smart-assign already-offered
-- exclusion, redispatch eligibility, ledger eligibility). The `status` column
-- as the trailing key lets PostgreSQL do an equality probe on status without
-- a heap fetch.
create index if not exists dispatch_offers_booking_cleaner_status_idx
  on public.dispatch_offers (booking_id, cleaner_id, status);

comment on index public.dispatch_offers_booking_cleaner_status_idx is
  'M-19: (booking, cleaner) → status probes for any status value. Complements the partial dispatch_offers_booking_cleaner_pending_uidx (WHERE status=''pending'') which cannot serve queries that filter by accepted/rejected/expired or read all statuses.';

-- ----------------------------------------------------------------------------
-- 4. notification_logs (booking_id, template_key, created_at desc) — cooldown probe
-- ----------------------------------------------------------------------------
-- `cleanerPaidSmsRecentlySent` runs
--   WHERE booking_id = ?
--     AND template_key = ?
--     AND channel = 'sms'
--     AND status = 'sent'
--     AND created_at >= since
-- with `count: exact, head: true`. The existing single-column
-- `notification_logs_booking_id_idx` and `notification_logs_template_key_idx`
-- force a bitmap-AND + recheck; this composite turns the probe into a tight
-- index range scan ordered for HEAD-style "is there a recent row?" checks.
-- Partial `WHERE booking_id IS NOT NULL` matches the existing
-- `notification_logs_booking_id_idx` predicate (booking_id is nullable for
-- non-booking-scoped notifications, so excluding nulls is both faithful and
-- shrinks the index considerably).
create index if not exists notification_logs_booking_template_created_idx
  on public.notification_logs (booking_id, template_key, created_at desc)
  where booking_id is not null;

comment on index public.notification_logs_booking_template_created_idx is
  'M-19: per-(booking, template_key) recency probes used by SMS cooldown checks (notifyCleanerBookingPaid.cleanerPaidSmsRecentlySent) and any future "did we already send X for booking Y?" lookup. Partial WHERE booking_id IS NOT NULL matches notification_logs_booking_id_idx.';
