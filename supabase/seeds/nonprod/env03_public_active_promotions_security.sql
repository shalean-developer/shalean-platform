-- ENV-03 convergence for the public promotions projection.

BEGIN;

DROP POLICY IF EXISTS promotions_public_read_active ON public.promotions;
CREATE POLICY promotions_public_read_active
  ON public.promotions FOR SELECT TO anon, authenticated
  USING (status = 'active');

GRANT SELECT (
  id, slug, name, description, promotion_type, status, starts_at, ends_at,
  banner_image_url, hero_image_url, logo_url, landing_page_path, promo_code,
  auto_apply, discount_type, discount_value, max_discount_zar,
  min_booking_amount_zar, cta_label, terms_html, display_config,
  qr_code_data_url, content_generated_at, template_key, stackable,
  stack_priority, show_on_homepage, show_on_booking, show_on_pricing,
  show_announcement_bar, show_popup, show_featured_card, show_dashboard_card,
  show_booking_banner, created_at, updated_at
) ON TABLE public.promotions TO anon, authenticated;

ALTER VIEW public.public_active_promotions SET (security_invoker = true);

COMMENT ON VIEW public.public_active_promotions IS
  'MKT-001A: security-invoker public projection of active promotions. Base-table column grants and RLS exclude financial/internal fields and inactive rows.';

COMMIT;
