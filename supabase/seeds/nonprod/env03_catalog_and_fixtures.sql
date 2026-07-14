-- ENV-03 synthetic seed (idempotent). Staging/development only.
-- All fixtures marked TEST / ENV-03. No production data.
-- Reset cleanup: DELETE FROM bookings WHERE paystack_reference LIKE 'ENV-03-%';
--                plus auth users created by scripts/env/seed-nonprod.mjs

BEGIN;

INSERT INTO public.pricing_services (
  id, slug, name, base_price, price_per_bedroom, price_per_bathroom,
  min_hours, max_hours, is_active, sort_order
)
VALUES
  ('11111111-1111-4111-8111-111111111101', 'standard-cleaning', 'TEST Standard Cleaning', 450, 80, 60, 2, 8, true, 1),
  ('11111111-1111-4111-8111-111111111102', 'deep-cleaning', 'TEST Deep Cleaning', 750, 100, 80, 3, 10, true, 2)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  base_price = EXCLUDED.base_price,
  is_active = true,
  updated_at = now();

INSERT INTO public.services (
  id, slug, title, description, starting_price, features, sort_order, is_active
)
VALUES
  (
    '22222222-2222-4222-8222-222222222201',
    'standard-cleaning',
    'TEST Standard Cleaning',
    'ENV-03 synthetic catalog service',
    450,
    ARRAY['TEST fixture']::text[],
    1,
    true
  ),
  (
    '22222222-2222-4222-8222-222222222202',
    'deep-cleaning',
    'TEST Deep Cleaning',
    'ENV-03 synthetic catalog service',
    750,
    ARRAY['TEST fixture']::text[],
    2,
    true
  )
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  is_active = true;

INSERT INTO public.promotions (
  id, slug, name, description, promotion_type, status,
  starts_at, ends_at, promo_code, auto_apply,
  discount_type, discount_value, min_booking_amount_zar,
  customer_eligibility, booking_eligibility,
  budget_spent_zar, stackable, stack_priority,
  show_on_homepage, show_on_booking, show_on_pricing, show_announcement_bar,
  display_config
)
VALUES (
  '33333333-3333-4333-8333-333333333301',
  'env03-test-10',
  'TEST ENV-03 Promo 10%',
  'ENV-03 synthetic promotion — not for production customers',
  'promo_code',
  'active',
  now() - interval '1 day',
  now() + interval '365 days',
  'ENV03TEST10',
  false,
  'percent',
  10,
  0,
  '{}'::jsonb,
  '{}'::jsonb,
  0,
  false,
  100,
  false,
  true,
  false,
  false,
  '{}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  status = 'active',
  name = EXCLUDED.name,
  updated_at = now();

COMMIT;
