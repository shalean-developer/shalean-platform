-- Phase 1.11B — P1: Admin referral/economics views → security_invoker
-- Audit: F-SEC-004
--
-- job_offers already uses security_invoker=true in baseline.
-- These 12 admin views previously used default security_definer semantics
-- (bypass underlying RLS if SELECT were ever granted to client roles).
-- Application access is via service_role; invoker mode is defense-in-depth.

BEGIN;

ALTER VIEW public.admin_booking_promo_costs SET (security_invoker = true);
ALTER VIEW public.admin_global_monthly_referral_economics SET (security_invoker = true);
ALTER VIEW public.admin_referral_checkout_redemption_summary SET (security_invoker = true);
ALTER VIEW public.admin_referral_reconciliation_queue SET (security_invoker = true);
ALTER VIEW public.admin_referrer_conversion_rollups SET (security_invoker = true);
ALTER VIEW public.admin_referrer_event_rollups SET (security_invoker = true);
ALTER VIEW public.admin_referrer_monthly_profitability_rollups SET (security_invoker = true);
ALTER VIEW public.admin_referrer_profitability_rollups SET (security_invoker = true);
ALTER VIEW public.admin_referrer_quality_signals SET (security_invoker = true);
ALTER VIEW public.admin_referrer_redemption_rollups SET (security_invoker = true);
ALTER VIEW public.admin_referrer_redemption_spike_flags SET (security_invoker = true);
ALTER VIEW public.admin_referrer_reward_rollups SET (security_invoker = true);

-- Ensure client roles cannot SELECT (service_role retains access via existing GRANTs).
REVOKE ALL ON TABLE public.admin_booking_promo_costs FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_global_monthly_referral_economics FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_referral_checkout_redemption_summary FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_referral_reconciliation_queue FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_referrer_conversion_rollups FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_referrer_event_rollups FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_referrer_monthly_profitability_rollups FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_referrer_profitability_rollups FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_referrer_quality_signals FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_referrer_redemption_rollups FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_referrer_redemption_spike_flags FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_referrer_reward_rollups FROM anon, authenticated;

GRANT SELECT ON TABLE public.admin_booking_promo_costs TO service_role;
GRANT SELECT ON TABLE public.admin_global_monthly_referral_economics TO service_role;
GRANT SELECT ON TABLE public.admin_referral_checkout_redemption_summary TO service_role;
GRANT SELECT ON TABLE public.admin_referral_reconciliation_queue TO service_role;
GRANT SELECT ON TABLE public.admin_referrer_conversion_rollups TO service_role;
GRANT SELECT ON TABLE public.admin_referrer_event_rollups TO service_role;
GRANT SELECT ON TABLE public.admin_referrer_monthly_profitability_rollups TO service_role;
GRANT SELECT ON TABLE public.admin_referrer_profitability_rollups TO service_role;
GRANT SELECT ON TABLE public.admin_referrer_quality_signals TO service_role;
GRANT SELECT ON TABLE public.admin_referrer_redemption_rollups TO service_role;
GRANT SELECT ON TABLE public.admin_referrer_redemption_spike_flags TO service_role;
GRANT SELECT ON TABLE public.admin_referrer_reward_rollups TO service_role;

COMMENT ON VIEW public.admin_booking_promo_costs IS
  'Phase 1.11B: security_invoker=true; service_role SELECT only.';
COMMENT ON VIEW public.admin_global_monthly_referral_economics IS
  'Phase 1.11B: security_invoker=true; service_role SELECT only.';
COMMENT ON VIEW public.admin_referral_checkout_redemption_summary IS
  'Phase 1.11B: security_invoker=true; service_role SELECT only.';
COMMENT ON VIEW public.admin_referral_reconciliation_queue IS
  'Phase 1.11B: security_invoker=true; service_role SELECT only.';
COMMENT ON VIEW public.admin_referrer_conversion_rollups IS
  'Phase 1.11B: security_invoker=true; service_role SELECT only.';
COMMENT ON VIEW public.admin_referrer_event_rollups IS
  'Phase 1.11B: security_invoker=true; service_role SELECT only.';
COMMENT ON VIEW public.admin_referrer_monthly_profitability_rollups IS
  'Phase 1.11B: security_invoker=true; service_role SELECT only.';
COMMENT ON VIEW public.admin_referrer_profitability_rollups IS
  'Phase 1.11B: security_invoker=true; service_role SELECT only.';
COMMENT ON VIEW public.admin_referrer_quality_signals IS
  'Phase 1.11B: security_invoker=true; service_role SELECT only.';
COMMENT ON VIEW public.admin_referrer_redemption_rollups IS
  'Phase 1.11B: security_invoker=true; service_role SELECT only.';
COMMENT ON VIEW public.admin_referrer_redemption_spike_flags IS
  'Phase 1.11B: security_invoker=true; service_role SELECT only.';
COMMENT ON VIEW public.admin_referrer_reward_rollups IS
  'Phase 1.11B: security_invoker=true; service_role SELECT only.';

COMMIT;
