-- ENV-03 synthetic seed (idempotent). Staging/development only.
-- All fixtures marked TEST / ENV-03. No production data.
-- Reset cleanup: DELETE FROM bookings WHERE paystack_reference LIKE 'ENV-03-%';
--                plus auth users created by scripts/env/seed-nonprod.mjs

BEGIN;

-- The marketing homepage reads these two catalog tables through the anonymous
-- Supabase server client. Current local migrations do not carry the legacy
-- public-read policies, so make this non-production seed self-contained.
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS services_select_public ON public.services;
CREATE POLICY services_select_public
  ON public.services
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);
GRANT SELECT ON public.services TO anon, authenticated;

ALTER TABLE public.pricing_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pricing_services_select_public_nonprod ON public.pricing_services;
CREATE POLICY pricing_services_select_public_nonprod
  ON public.pricing_services
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);
GRANT SELECT ON public.pricing_services TO anon, authenticated;

-- Normalize the two legacy ENV-03 catalogue rows when this seed is reapplied to an
-- existing local database. If a canonical row already exists under another id,
-- remove only the stale ENV-03 fixture so the canonical row remains authoritative.
DELETE FROM public.pricing_services legacy
WHERE legacy.id IN (
  '11111111-1111-4111-8111-111111111101',
  '11111111-1111-4111-8111-111111111102'
)
AND legacy.slug IN ('standard-cleaning', 'deep-cleaning')
AND EXISTS (
  SELECT 1
  FROM public.pricing_services canonical
  WHERE canonical.slug = CASE legacy.slug
    WHEN 'standard-cleaning' THEN 'standard'
    WHEN 'deep-cleaning' THEN 'deep'
  END
  AND canonical.id <> legacy.id
);

UPDATE public.pricing_services
SET slug = CASE slug
  WHEN 'standard-cleaning' THEN 'standard'
  WHEN 'deep-cleaning' THEN 'deep'
END
WHERE id IN (
  '11111111-1111-4111-8111-111111111101',
  '11111111-1111-4111-8111-111111111102'
)
AND slug IN ('standard-cleaning', 'deep-cleaning');

INSERT INTO public.pricing_services (
  id, slug, name, base_price, price_per_bedroom, price_per_bathroom,
  min_hours, max_hours, is_active, sort_order
)
VALUES
  ('11111111-1111-4111-8111-111111111101', 'standard', 'TEST Regular Cleaning', 350, 80, 60, 2, 8, true, 10),
  ('11111111-1111-4111-8111-111111111102', 'deep', 'TEST Deep Cleaning', 950, 100, 80, 3, 10, true, 20),
  ('11111111-1111-4111-8111-111111111103', 'move', 'TEST Moving Cleaning', 1100, 120, 90, 4, 12, true, 30),
  ('11111111-1111-4111-8111-111111111104', 'airbnb', 'TEST Airbnb Cleaning', 400, 80, 60, 2, 8, true, 40),
  ('11111111-1111-4111-8111-111111111105', 'quick', 'TEST Office Cleaning', 450, 60, 50, 2, 8, true, 50),
  ('11111111-1111-4111-8111-111111111106', 'carpet', 'TEST Carpet Cleaning', 500, 120, 0, 2, 8, true, 60)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  base_price = EXCLUDED.base_price,
  price_per_bedroom = EXCLUDED.price_per_bedroom,
  price_per_bathroom = EXCLUDED.price_per_bathroom,
  min_hours = EXCLUDED.min_hours,
  max_hours = EXCLUDED.max_hours,
  is_active = true,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

DELETE FROM public.services legacy
WHERE legacy.id IN (
  '22222222-2222-4222-8222-222222222201',
  '22222222-2222-4222-8222-222222222202'
)
AND legacy.slug IN ('standard-cleaning', 'deep-cleaning')
AND EXISTS (
  SELECT 1
  FROM public.services canonical
  WHERE canonical.slug = CASE legacy.slug
    WHEN 'standard-cleaning' THEN 'standard'
    WHEN 'deep-cleaning' THEN 'deep'
  END
  AND canonical.id <> legacy.id
);

UPDATE public.services
SET slug = CASE slug
  WHEN 'standard-cleaning' THEN 'standard'
  WHEN 'deep-cleaning' THEN 'deep'
END
WHERE id IN (
  '22222222-2222-4222-8222-222222222201',
  '22222222-2222-4222-8222-222222222202'
)
AND slug IN ('standard-cleaning', 'deep-cleaning');

INSERT INTO public.services (
  id, slug, title, description, starting_price, features, sort_order, is_active
)
VALUES
  (
    '22222222-2222-4222-8222-222222222201',
    'standard',
    'TEST Regular Cleaning',
    'ENV-03 synthetic regular home cleaning service.',
    350,
    ARRAY['TEST fixture']::text[],
    10,
    true
  ),
  (
    '22222222-2222-4222-8222-222222222202',
    'deep',
    'TEST Deep Cleaning',
    'ENV-03 synthetic deep cleaning service.',
    950,
    ARRAY['TEST fixture']::text[],
    20,
    true
  ),
  (
    '22222222-2222-4222-8222-222222222203',
    'move',
    'TEST Moving Cleaning',
    'ENV-03 synthetic move-in and move-out cleaning service.',
    1100,
    ARRAY['TEST fixture']::text[],
    30,
    true
  ),
  (
    '22222222-2222-4222-8222-222222222204',
    'airbnb',
    'TEST Airbnb Cleaning',
    'ENV-03 synthetic Airbnb turnover cleaning service.',
    400,
    ARRAY['TEST fixture']::text[],
    40,
    true
  ),
  (
    '22222222-2222-4222-8222-222222222205',
    'office',
    'TEST Office Cleaning',
    'ENV-03 synthetic office and workspace cleaning service.',
    450,
    ARRAY['TEST fixture']::text[],
    50,
    true
  ),
  (
    '22222222-2222-4222-8222-222222222206',
    'carpet',
    'TEST Carpet Cleaning',
    'ENV-03 synthetic carpet and upholstery cleaning service.',
    500,
    ARRAY['TEST fixture']::text[],
    60,
    true
  )
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  starting_price = EXCLUDED.starting_price,
  features = EXCLUDED.features,
  sort_order = EXCLUDED.sort_order,
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
