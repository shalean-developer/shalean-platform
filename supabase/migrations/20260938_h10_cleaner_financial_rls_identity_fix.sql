-- ============================================================================
-- H-10 — Cleaner financial RLS identity convergence.
-- ----------------------------------------------------------------------------
-- Production Readiness Audit H-10.
--
-- Symptom
--   Several RLS policies on cleaner-financial / booking-financial tables
--   incorrectly compare `cleaner_id = auth.uid()`. `cleaner_id` is the
--   `cleaners.id` surrogate UUID; the auth linkage is `cleaners.auth_user_id`
--   (or, for legacy rows pre-`20260462_cleaners_rls_surrogate_auth.sql`,
--   `cleaners.id` happened to equal the auth uid). Today the app survives
--   because every read goes through the service-role client, but a cleaner
--   JWT or PostgREST query against these tables silently returns zero rows.
--   This is a latent privilege-bypass-by-omission and a future-feature
--   blocker (any move toward direct cleaner JWT reads would silently fail).
--
-- Drifted policies (live `pg_policies` audit before this migration)
--   A. public.cleaner_payouts                     — cleaner_payouts_select_own
--   B. public.cleaner_earnings                    — cleaner_earnings_select_assigned
--   C. public.cleaner_earnings_disbursements      — cleaner_earnings_disbursements_select_own
--   D. public.booking_cleaner_earnings_snapshot   — bces_cleaner_select
--   E. public.booking_cleaner_earnings_snapshot_lines — bcesl_cleaner_select
--   F. public.booking_totals                      — booking_totals_cleaner_select_assigned
--   G. public.reviews                             — reviews_select_owner_or_cleaner
--
-- Canonical pattern (source: `20260462_cleaners_rls_surrogate_auth.sql`)
--   exists (
--     select 1 from public.cleaners c
--     where c.id = <table>.cleaner_id
--       and (c.auth_user_id = auth.uid() or c.id = auth.uid())
--   )
--   The `or c.id = auth.uid()` branch keeps backwards compatibility for any
--   legacy cleaner row whose surrogate id was minted equal to its auth uid
--   (the convention used everywhere else in the codebase since 20260462).
--
-- Scope
--   * Identity check ONLY. The set of rows a given cleaner can see is
--     unchanged: e.g. `cleaner_earnings_select_assigned` still requires the
--     row's `bookings.cleaner_id` to be the calling cleaner — we do not
--     widen to `payout_owner_cleaner_id` or to the `booking_cleaners` roster
--     here. (Doing so is an additive policy decision out of scope for H-10.)
--   * Service-role bypass behaviour is unchanged: every CREATE POLICY below
--     is `to authenticated`, which leaves the `service_role` superuser path
--     untouched.
--   * No table is newly opened to anonymous reads. Each policy is a
--     drop-and-recreate within the same `to authenticated` scope.
--   * No payout formulas, no payout state, no schema columns changed.
--
-- Idempotency
--   Each policy is dropped via `drop policy if exists` then recreated. Safe
--   to re-run. Existing data unaffected.
-- ============================================================================

-- A. cleaner_payouts ---------------------------------------------------------
drop policy if exists cleaner_payouts_select_own on public.cleaner_payouts;
create policy cleaner_payouts_select_own on public.cleaner_payouts
  for select to authenticated
  using (
    exists (
      select 1 from public.cleaners c
      where c.id = cleaner_payouts.cleaner_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  );

-- B. cleaner_earnings --------------------------------------------------------
drop policy if exists cleaner_earnings_select_assigned on public.cleaner_earnings;
create policy cleaner_earnings_select_assigned on public.cleaner_earnings
  for select to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      join public.cleaners c on c.id = b.cleaner_id
      where b.id = cleaner_earnings.booking_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  );

-- C. cleaner_earnings_disbursements ------------------------------------------
drop policy if exists cleaner_earnings_disbursements_select_own on public.cleaner_earnings_disbursements;
create policy cleaner_earnings_disbursements_select_own on public.cleaner_earnings_disbursements
  for select to authenticated
  using (
    exists (
      select 1 from public.cleaners c
      where c.id = cleaner_earnings_disbursements.cleaner_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  );

-- D. booking_cleaner_earnings_snapshot ---------------------------------------
drop policy if exists bces_cleaner_select on public.booking_cleaner_earnings_snapshot;
create policy bces_cleaner_select on public.booking_cleaner_earnings_snapshot
  for select to authenticated
  using (
    exists (
      select 1 from public.cleaners c
      where c.id = booking_cleaner_earnings_snapshot.cleaner_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  );

-- E. booking_cleaner_earnings_snapshot_lines ---------------------------------
drop policy if exists bcesl_cleaner_select on public.booking_cleaner_earnings_snapshot_lines;
create policy bcesl_cleaner_select on public.booking_cleaner_earnings_snapshot_lines
  for select to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      join public.cleaners c on c.id = b.cleaner_id
      where b.id = booking_cleaner_earnings_snapshot_lines.booking_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  );

-- F. booking_totals ----------------------------------------------------------
drop policy if exists booking_totals_cleaner_select_assigned on public.booking_totals;
create policy booking_totals_cleaner_select_assigned on public.booking_totals
  for select to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      join public.cleaners c on c.id = b.cleaner_id
      where b.id = booking_totals.booking_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  );

-- G. reviews -----------------------------------------------------------------
-- Customer (owner) path is preserved as `user_id = auth.uid()`. Cleaner path
-- moves from surrogate-id misuse to the canonical EXISTS-cleaners pattern.
drop policy if exists reviews_select_owner_or_cleaner on public.reviews;
create policy reviews_select_owner_or_cleaner on public.reviews
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.cleaners c
      where c.id = reviews.cleaner_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  );
