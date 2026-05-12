-- ============================================================================
-- H-6 / H-4 — backfill orphan auth users into public.user_profiles
-- ----------------------------------------------------------------------------
-- Production Readiness Audit H-6 (auth/profile drift) and H-4 (recurring
-- billing silently downgraded missing profiles to `per_booking`).
--
-- Live evidence at deploy time
--   * 101 active rows in `auth.users`
--   * 59 of those have NO matching `public.user_profiles` row
--     (35 customers + 24 cleaners; cleaners listed for visibility only)
--   *  0 active recurring plans currently belong to an orphan auth user
--   *  0 bookings currently reference an orphan `user_id`
--
-- Repair scope
--   Insert a default `user_profiles` row for every NON-deleted auth user
--   that does not already have one. Cleaners are intentionally INCLUDED:
--   the row is created with `billing_type='per_booking'`, `schedule_type=
--   'on_demand'` (the same values written by the new server-side helpers
--   in `apps/web/app/api/auth/create-from-guest/route.ts`,
--   `apps/web/app/api/bookings/link-user/route.ts`, and
--   `apps/web/app/api/auth/link-guest-bookings/route.ts`). Owning a row
--   does not grant any new capability — it only stops the recurring cron
--   from silently routing the user under the wrong billing rail if they
--   ever become a recurring customer.
--
-- Idempotency
--   `ON CONFLICT (id) DO NOTHING` makes this migration safe to re-run.
--   Existing profile rows are NEVER overwritten — the ON CONFLICT clause
--   short-circuits the entire INSERT for that id. This is critical because
--   the `trg_user_profiles_billing_model_lock` BEFORE-UPDATE trigger
--   (`user_profiles_prevent_customer_billing_change`) only blocks UPDATEs
--   anyway, but the `DO NOTHING` clause additionally protects against a
--   future trigger firing on INSERT-into-existing.
--
-- Trigger interactions
--   `trg_user_profiles_billing_model_lock` is a BEFORE UPDATE trigger;
--   we only INSERT here, so it never fires.
--
-- Idempotent re-run safety
--   * Insert is guarded by `where … not exists in user_profiles`
--   * INSERT itself uses `ON CONFLICT (id) DO NOTHING`
--   * No UPDATEs to existing rows
--   * `auth.users.deleted_at IS NULL` filter excludes soft-deleted users
--
-- Out of scope (per the H-6/H-4 audit instruction "auth/profile convergence only")
--   * No billing formula changes
--   * No recurring schedule generation changes
--   * No RLS / policy changes
--   * No new columns on `user_profiles`
-- ============================================================================

with orphan_auth_users as (
  select
    au.id,
    -- Try the most specific name field first; fall back through the
    -- common Supabase metadata shapes; coalesce to NULL so the column
    -- nullability constraint (`full_name` is YES nullable) holds.
    nullif(
      btrim(
        coalesce(
          au.raw_user_meta_data ->> 'full_name',
          au.raw_user_meta_data ->> 'name',
          ''
        )
      ),
      ''
    ) as full_name
  from auth.users au
  where au.deleted_at is null
    and not exists (
      select 1 from public.user_profiles up where up.id = au.id
    )
)
insert into public.user_profiles (
  id,
  full_name,
  tier,
  booking_count,
  total_spent_cents,
  credit_balance_zar,
  billing_type,
  schedule_type,
  account_billing_risk,
  updated_at
)
select
  o.id,
  o.full_name,
  'regular',
  0,
  0,
  0,
  'per_booking',
  'on_demand',
  'ok',
  now()
from orphan_auth_users o
on conflict (id) do nothing;
