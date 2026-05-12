-- ============================================================================
-- H-14 / M-19 — online (CONCURRENTLY) variant of the hot-path composite indexes.
-- ----------------------------------------------------------------------------
-- This file is a manual operator runbook, NOT a migration. The corresponding
-- migration is:
--   supabase/migrations/20260942_h14_m19_hot_path_composite_indexes.sql
--
-- WHY THIS FILE EXISTS
--   `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block
--   (Postgres `SQLSTATE 25001`). Supabase's standard migration runner — and
--   the SQL editor / MCP `execute_sql` RPC — wrap every statement in a
--   transaction by default, so the migration file itself uses the plain
--   `CREATE INDEX IF NOT EXISTS` form. That is the repo's standing convention
--   (see every prior index-only migration).
--
--   For online application during peak traffic — or any time the brief
--   ACCESS EXCLUSIVE lock from a non-concurrent build is unacceptable — run
--   THIS file FIRST, statement by statement, in a tool that does NOT wrap
--   each statement in a transaction. After every CREATE INDEX CONCURRENTLY
--   call returns, the matching IF NOT EXISTS guard in the migration becomes
--   a no-op, so the migration can be applied normally afterwards.
--
-- HOW TO RUN
--   Option A — psql (recommended; honours autocommit reliably)
--     export PGPASSWORD=...
--     psql "$SUPABASE_DB_URL" \
--          --single-transaction=off \
--          --set ON_ERROR_STOP=1 \
--          -f supabase/queries/h14_m19_hot_path_composite_indexes_concurrently.sql
--
--   Option B — Supabase SQL editor
--     The Supabase Studio SQL editor runs each top-level statement
--     individually (no enclosing transaction). Paste ONE statement at a time
--     and run. Do NOT paste multiple CONCURRENTLY statements at once.
--
--   Option C — Supabase CLI db push with no-transaction directive
--     Move this file (or copy each CREATE INDEX into a new file) under
--     `supabase/migrations/` with the directive `-- supabase: no-transaction`
--     on the very first line. The CLI will then skip the transaction wrapper
--     for that file. Not recommended unless you control the deploy path
--     end-to-end — the SQL editor and MCP RPC do NOT honour this directive.
--
-- INVALID-INDEX RECOVERY
--   A failed CONCURRENTLY build leaves the index in INVALID state (visible
--   via `SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid`).
--   Drop it before retrying:
--       DROP INDEX CONCURRENTLY IF EXISTS public.<index_name>;
--   Then re-run the matching CREATE statement below.
--
-- IDEMPOTENCY
--   Every statement uses IF NOT EXISTS, so repeated runs are safe. Comments
--   on indexes are re-applied unconditionally — Postgres accepts this.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. bookings (status, date desc, time desc) — admin schedule chronological lists
-- ----------------------------------------------------------------------------
create index concurrently if not exists bookings_status_date_time_desc_idx
  on public.bookings (status, date desc, time desc);

comment on index public.bookings_status_date_time_desc_idx is
  'H-14: status-filtered chronological lists ordered by (date desc, time desc). Complements bookings_status_date_idx which only covers (status, date asc) with no time tie-break.';

-- ----------------------------------------------------------------------------
-- 2. bookings (user_id, created_at desc) WHERE user_id IS NOT NULL — customer dashboard
-- ----------------------------------------------------------------------------
create index concurrently if not exists bookings_user_id_created_at_idx
  on public.bookings (user_id, created_at desc)
  where user_id is not null;

comment on index public.bookings_user_id_created_at_idx is
  'H-14: customer dashboard `WHERE user_id = ? ORDER BY created_at DESC` queries (loadCustomerBookingRowsForUser, /api/dashboard/summary, Step4Payment past-booking hints, referral checks). Partial WHERE user_id IS NOT NULL matches bookings_user_id_idx so this is a behavioural superset.';

-- ----------------------------------------------------------------------------
-- 3. dispatch_offers (booking_id, cleaner_id, status) — open-offer probe
-- ----------------------------------------------------------------------------
create index concurrently if not exists dispatch_offers_booking_cleaner_status_idx
  on public.dispatch_offers (booking_id, cleaner_id, status);

comment on index public.dispatch_offers_booking_cleaner_status_idx is
  'M-19: (booking, cleaner) → status probes for any status value. Complements the partial dispatch_offers_booking_cleaner_pending_uidx (WHERE status=''pending'') which cannot serve queries that filter by accepted/rejected/expired or read all statuses.';

-- ----------------------------------------------------------------------------
-- 4. notification_logs (booking_id, template_key, created_at desc) WHERE booking_id IS NOT NULL — cooldown probe
-- ----------------------------------------------------------------------------
create index concurrently if not exists notification_logs_booking_template_created_idx
  on public.notification_logs (booking_id, template_key, created_at desc)
  where booking_id is not null;

comment on index public.notification_logs_booking_template_created_idx is
  'M-19: per-(booking, template_key) recency probes used by SMS cooldown checks (notifyCleanerBookingPaid.cleanerPaidSmsRecentlySent) and any future "did we already send X for booking Y?" lookup. Partial WHERE booking_id IS NOT NULL matches notification_logs_booking_id_idx.';

-- ----------------------------------------------------------------------------
-- Verification (read-only; safe to run anytime)
-- ----------------------------------------------------------------------------
-- Confirm all four indexes exist and are valid:
--   SELECT i.indexrelid::regclass AS index_name,
--          c.relname              AS table_name,
--          i.indisvalid           AS is_valid,
--          i.indisready           AS is_ready,
--          pg_size_pretty(pg_relation_size(i.indexrelid)) AS size
--   FROM pg_index i
--   JOIN pg_class c ON c.oid = i.indrelid
--   WHERE i.indexrelid::regclass::text IN (
--     'public.bookings_status_date_time_desc_idx',
--     'public.bookings_user_id_created_at_idx',
--     'public.dispatch_offers_booking_cleaner_status_idx',
--     'public.notification_logs_booking_template_created_idx'
--   )
--   ORDER BY index_name;
