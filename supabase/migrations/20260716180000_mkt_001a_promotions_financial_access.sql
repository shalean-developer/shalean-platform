-- MKT-001A / WS5 — Promotion financial-data access control
-- Source audit: docs/audits/marketing/MKT-001-marketing-platform-engineering-audit.md (§6.4, R-02/financials)
--
-- Problem: `promotions` had `GRANT ALL ... TO anon/authenticated` plus the policy
-- `promotions_public_read_active` (SELECT USING status='active'), allowing any
-- browser client (with the public anon key) to run
--   GET /rest/v1/promotions?status=eq.active&select=*
-- and read commercially sensitive columns: budget_zar, budget_spent_zar,
-- revenue_generated_zar, usage_limit_*, *_count, created_by, eligibility JSON.
--
-- App reality (verified): promotions are ONLY read server-side via the
-- service-role client (/api/promotions, /api/account/rewards, campaign landing
-- page). No browser code queries `promotions` directly. Both public APIs already
-- return explicit DTOs without financial fields.
--
-- Remediation:
--   1. Revoke anon/authenticated table grants (defense-in-depth); keep service_role.
--   2. Drop the broad anon public-read policy.
--   3. Provide a safe, column-restricted public projection view for any future
--      client-side need (active promotions, non-sensitive fields only).
--
-- Forward-only, idempotent. Does not modify historical migrations.

BEGIN;

-- 1. Remove client-role privilege surface on the base table.
REVOKE ALL ON TABLE public.promotions FROM anon;
REVOKE ALL ON TABLE public.promotions FROM authenticated;
GRANT ALL ON TABLE public.promotions TO service_role;

-- 2. Drop the policy that exposed all columns of active promotions to anon.
--    (Redundant once grants are revoked, but removed for clarity/defense.)
DROP POLICY IF EXISTS promotions_public_read_active ON public.promotions;

-- 3. Safe public projection — non-sensitive campaign fields only, active rows only.
--    security_invoker = false: the view runs as its owner so anon receives ONLY
--    these columns without any table grant/RLS on `promotions` itself.
CREATE OR REPLACE VIEW public.public_active_promotions
WITH (security_invoker = false) AS
SELECT
  id,
  slug,
  name,
  description,
  promotion_type,
  status,
  starts_at,
  ends_at,
  banner_image_url,
  hero_image_url,
  logo_url,
  landing_page_path,
  promo_code,
  auto_apply,
  discount_type,
  discount_value,
  max_discount_zar,
  min_booking_amount_zar,
  cta_label,
  terms_html,
  display_config,
  qr_code_data_url,
  content_generated_at,
  template_key,
  stackable,
  stack_priority,
  show_on_homepage,
  show_on_booking,
  show_on_pricing,
  show_announcement_bar,
  show_popup,
  show_featured_card,
  show_dashboard_card,
  show_booking_banner,
  created_at,
  updated_at
FROM public.promotions
WHERE status = 'active';

COMMENT ON VIEW public.public_active_promotions IS
  'MKT-001A: safe public projection of active promotions. Excludes budget_zar, budget_spent_zar, revenue_generated_zar, usage_limit_*, *_count, created_by, updated_by, duplicated_from_id, and eligibility JSON. security_invoker=false so anon gets only these columns.';

REVOKE ALL ON public.public_active_promotions FROM anon;
REVOKE ALL ON public.public_active_promotions FROM authenticated;
GRANT SELECT ON public.public_active_promotions TO anon;
GRANT SELECT ON public.public_active_promotions TO authenticated;

COMMIT;
