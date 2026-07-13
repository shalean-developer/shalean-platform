-- H-12: admin auditability for cleaner earnings disputes & adjustments.
--
-- Adds canonical "who took the action" fields next to the existing timestamps so the dispute PATCH
-- handler can persist admin identity, and extends the `admin_earnings_actions.action` CHECK so the
-- shared `logAdminEarningsAction` helper can record dispute lifecycle events alongside fix/reset.
--
-- Forward-only and idempotent: every column add uses IF NOT EXISTS, the CHECK constraint is
-- recreated via DROP IF EXISTS + ADD, and no row data is rewritten. Cleaner-side reads do not
-- include the new columns (see apps/web/app/api/cleaner/earnings/dispute/route.ts SELECT list)
-- so this change is invisible to cleaners.

-- ---------------------------------------------------------------------------
-- cleaner_earnings_disputes — admin lifecycle audit fields
-- ---------------------------------------------------------------------------
alter table public.cleaner_earnings_disputes
  add column if not exists reviewed_by uuid references auth.users (id) on delete set null;

alter table public.cleaner_earnings_disputes
  add column if not exists reviewed_by_email text;

alter table public.cleaner_earnings_disputes
  add column if not exists reviewed_at timestamptz;

alter table public.cleaner_earnings_disputes
  add column if not exists resolved_by uuid references auth.users (id) on delete set null;

alter table public.cleaner_earnings_disputes
  add column if not exists resolved_by_email text;

comment on column public.cleaner_earnings_disputes.reviewed_by is
  'auth.users.id of the admin who first transitioned the dispute out of `open`. Stamped once.';
comment on column public.cleaner_earnings_disputes.reviewed_by_email is
  'Email captured at review time so the audit trail survives auth.users deletion.';
comment on column public.cleaner_earnings_disputes.reviewed_at is
  'Timestamp the dispute first transitioned out of `open`. Set once; preserved across re-edits.';
comment on column public.cleaner_earnings_disputes.resolved_by is
  'auth.users.id of the admin who resolved or rejected the dispute. Mirrors `resolved_at`.';
comment on column public.cleaner_earnings_disputes.resolved_by_email is
  'Email captured at resolve time so the audit trail survives auth.users deletion.';

-- ---------------------------------------------------------------------------
-- cleaner_earnings_adjustments — admin authoring fields
-- ---------------------------------------------------------------------------
alter table public.cleaner_earnings_adjustments
  add column if not exists created_by uuid references auth.users (id) on delete set null;

alter table public.cleaner_earnings_adjustments
  add column if not exists created_by_email text;

comment on column public.cleaner_earnings_adjustments.created_by is
  'auth.users.id of the admin who posted this manual adjustment.';
comment on column public.cleaner_earnings_adjustments.created_by_email is
  'Email captured at insert time so the audit trail survives auth.users deletion.';

-- ---------------------------------------------------------------------------
-- admin_earnings_actions — extend CHECK to include dispute lifecycle events
-- ---------------------------------------------------------------------------
-- Existing constraint only allowed ('fix','reset'); we widen to also allow dispute lifecycle
-- actions so logAdminEarningsAction can record dispute review/resolve/reject without a new table.
alter table public.admin_earnings_actions
  drop constraint if exists admin_earnings_actions_action_check;

alter table public.admin_earnings_actions
  add constraint admin_earnings_actions_action_check
  check (action in ('fix', 'reset', 'dispute_review', 'dispute_resolve', 'dispute_reject'));

comment on constraint admin_earnings_actions_action_check on public.admin_earnings_actions is
  'Action kinds. Extended in 20260940 to include dispute lifecycle events alongside fix/reset.';
