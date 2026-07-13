-- =============================================================================
-- RLS hardening: admin referral views + referral table policies
-- =============================================================================
--
-- 1. Admin referral views: revoke SELECT from anon/authenticated (these views
--    aggregate cross-user data — no row-level filter is possible; service_role
--    is the only appropriate consumer via getSupabaseAdmin()).
--
-- 2. referrals: enable RLS (missing) + referrer-scoped SELECT policies so
--    customers and cleaners can read their own rows via a JWT session.
--
-- 3. referral_discount_redemptions: add authenticated SELECT policy so the
--    redeemed_by user can see their own redemption rows.
--
-- 4. referral_events: add referrer-scoped SELECT policies (customer + cleaner)
--    so referrers can inspect their own attribution events.
--
-- Cleaner identity canonical pattern (from 20260462 / H-10):
--   exists (select 1 from public.cleaners c
--           where c.id = <referrer_id>
--             and (c.auth_user_id = auth.uid() or c.id = auth.uid()))
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Admin referral views — block anon/authenticated; service_role only
-- ---------------------------------------------------------------------------

-- admin_referral_checkout_redemption_summary (20260860)
revoke select on public.admin_referral_checkout_redemption_summary from anon, authenticated;
grant  select on public.admin_referral_checkout_redemption_summary to service_role;

-- admin_referrer_redemption_rollups (20260919)
revoke select on public.admin_referrer_redemption_rollups from anon, authenticated;
grant  select on public.admin_referrer_redemption_rollups to service_role;

-- admin_referrer_event_rollups (20260919)
revoke select on public.admin_referrer_event_rollups from anon, authenticated;
grant  select on public.admin_referrer_event_rollups to service_role;

-- admin_referrer_reward_rollups (20260922)
revoke select on public.admin_referrer_reward_rollups from anon, authenticated;
grant  select on public.admin_referrer_reward_rollups to service_role;

-- admin_referrer_conversion_rollups (20260922)
revoke select on public.admin_referrer_conversion_rollups from anon, authenticated;
grant  select on public.admin_referrer_conversion_rollups to service_role;

-- admin_referrer_profitability_rollups (20260923)
revoke select on public.admin_referrer_profitability_rollups from anon, authenticated;
grant  select on public.admin_referrer_profitability_rollups to service_role;

-- admin_referrer_monthly_profitability_rollups (20260924)
revoke select on public.admin_referrer_monthly_profitability_rollups from anon, authenticated;
grant  select on public.admin_referrer_monthly_profitability_rollups to service_role;

-- admin_global_monthly_referral_economics (20260924)
revoke select on public.admin_global_monthly_referral_economics from anon, authenticated;
grant  select on public.admin_global_monthly_referral_economics to service_role;

-- admin_referrer_quality_signals (20260924)
revoke select on public.admin_referrer_quality_signals from anon, authenticated;
grant  select on public.admin_referrer_quality_signals to service_role;

-- admin_referrer_redemption_spike_flags (20260924)
revoke select on public.admin_referrer_redemption_spike_flags from anon, authenticated;
grant  select on public.admin_referrer_redemption_spike_flags to service_role;

-- ---------------------------------------------------------------------------
-- 2. referrals — enable RLS (was never enabled) + referrer-scoped policies
-- ---------------------------------------------------------------------------

alter table public.referrals enable row level security;

-- Explicit grants: authenticated may SELECT their own rows (RLS enforces scope);
-- mutations remain service_role only.
revoke all  on public.referrals from public;
grant select on public.referrals to authenticated;
grant all    on public.referrals to service_role;

-- Customer referrer: rows where referrer_type = 'customer' and referrer_id is
-- the calling user's auth uid.
drop policy if exists referrals_select_customer_own on public.referrals;
create policy referrals_select_customer_own on public.referrals
  for select to authenticated
  using (
    referrer_type = 'customer'
    and referrer_id = auth.uid()
  );

-- Cleaner referrer: rows where referrer_type = 'cleaner' and the cleaners row
-- for referrer_id is linked to the calling user (auth_user_id or legacy id match).
drop policy if exists referrals_select_cleaner_own on public.referrals;
create policy referrals_select_cleaner_own on public.referrals
  for select to authenticated
  using (
    referrer_type = 'cleaner'
    and exists (
      select 1 from public.cleaners c
      where c.id = referrals.referrer_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 3. referral_discount_redemptions — SELECT policy for redeemed_by user
-- ---------------------------------------------------------------------------

-- Grant SELECT to authenticated (RLS already enabled; INSERT/UPDATE/DELETE
-- remain service_role only via the existing revoke-all-from-public pattern).
grant select on public.referral_discount_redemptions to authenticated;

drop policy if exists referral_discount_redemptions_select_own on public.referral_discount_redemptions;
create policy referral_discount_redemptions_select_own on public.referral_discount_redemptions
  for select to authenticated
  using (redeemed_by_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. referral_events — referrer-scoped SELECT policies
-- ---------------------------------------------------------------------------

-- Grant SELECT to authenticated (RLS already enabled; writes are service_role only).
grant select on public.referral_events to authenticated;

-- Customer referrer: events where referrer_type = 'customer' and referrer_id
-- is the calling user's auth uid.
drop policy if exists referral_events_select_customer_referrer on public.referral_events;
create policy referral_events_select_customer_referrer on public.referral_events
  for select to authenticated
  using (
    referrer_type = 'customer'
    and referrer_id = auth.uid()
  );

-- Cleaner referrer: events where the cleaners row for referrer_id belongs to
-- the calling user.
drop policy if exists referral_events_select_cleaner_referrer on public.referral_events;
create policy referral_events_select_cleaner_referrer on public.referral_events
  for select to authenticated
  using (
    referrer_type = 'cleaner'
    and exists (
      select 1 from public.cleaners c
      where c.id = referral_events.referrer_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  );
