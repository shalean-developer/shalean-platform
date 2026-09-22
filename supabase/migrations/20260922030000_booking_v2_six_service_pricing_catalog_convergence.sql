-- PRICING-01/02: converge Booking V2 six-service add-on catalog.
-- Prepared from the customer-facing SERVICE_CONFIG/SERVICE_EXTRA_SLUGS contract.
-- PRICING-04B: existing add-on prices are preserved; new/unpriced concepts stay inactive.
-- This migration intentionally leaves historical bookings and frozen snapshots unchanged.

BEGIN;

-- First remove all six Booking V2 service assignments. Rows can stay active for
-- legacy/admin use, but they must not leak into a customer flow by stale assignment.
UPDATE public.pricing_extras
SET
  service_slugs = ARRAY(
    SELECT service_slug
    FROM unnest(service_slugs) AS service_slug
    WHERE service_slug <> ALL (
      ARRAY[
        'regular-cleaning',
        'deep-cleaning',
        'moving-cleaning',
        'office-cleaning',
        'carpet-cleaning',
        'airbnb-cleaning'
      ]::text[]
    )
  ),
  updated_at = now()
WHERE service_slugs && ARRAY[
  'regular-cleaning',
  'deep-cleaning',
  'moving-cleaning',
  'office-cleaning',
  'carpet-cleaning',
  'airbnb-cleaning'
]::text[];

-- Canonical Booking V2 add-ons. Existing rows keep their legacy service_type
-- classification to avoid changing the legacy pricing engine; Booking V2 is
-- scoped by service_slugs + the application allowlist.
INSERT INTO public.pricing_extras (
  slug,
  name,
  description,
  price,
  service_type,
  is_popular,
  is_active,
  sort_order,
  service_slugs
) VALUES
  ('inside-fridge',       'Inside Fridge',      'Interior fridge clean',                         15, 'light', true,  true,  10, ARRAY['regular-cleaning']::text[]),
  ('inside-oven',         'Inside Oven',        'Deep clean inside the oven',                    20, 'light', true,  true,  20, ARRAY['regular-cleaning','airbnb-cleaning']::text[]),
  ('laundry',             'Laundry',            'Wash and hang up to 1 load',                    35, 'light', false, true,  30, ARRAY['regular-cleaning','airbnb-cleaning']::text[]),
  ('ironing',             'Ironing',            'Ironing up to 1 load',                          40, 'light', false, true,  40, ARRAY['regular-cleaning']::text[]),
  ('interior-windows',    'Interior Windows',   'Clean all interior windows',                    30, 'light', false, true,  50, ARRAY['regular-cleaning','airbnb-cleaning']::text[]),

  ('inside-cabinets',     'Cupboards',          'Clean inside kitchen and bathroom cupboards',   25, 'heavy', false, true,  60, ARRAY['deep-cleaning','moving-cleaning']::text[]),
  ('interior-walls',      'Walls',              'Wipe down interior walls',                      35, 'heavy', false, true,  80, ARRAY['deep-cleaning']::text[]),

  ('garage-cleaning',     'Garage',             'Sweep and clean the garage',                    100, 'heavy', false, true, 140, ARRAY['moving-cleaning']::text[]),

  ('office-kitchen',      'Kitchen',            'Clean shared office kitchenette',               200, 'light', false, true, 410, ARRAY['office-cleaning']::text[]),
  ('office-sanitisation', 'Sanitisation',       'High-touch sanitisation of desks and common areas', 180, 'light', false, true, 420, ARRAY['office-cleaning']::text[]),

  ('pet-odour-treatment', 'Pet Odour',          'Enzyme-based odour neutraliser',                180, 'heavy', false, true, 220, ARRAY['carpet-cleaning']::text[]),
  ('fabric-protector',    'Fabric Protector',   'Scotchgard-style protection spray',             220, 'heavy', false, true, 230, ARRAY['carpet-cleaning']::text[]),
  ('mattress-cleaning',   'Mattress',           'Clean and sanitise one mattress',               250, 'heavy', false, true, 150, ARRAY['carpet-cleaning']::text[]),

  ('welcome-setup',       'Welcome Setup',      'Arrange towels, toiletries, staging',           150, 'light', false, true, 310, ARRAY['airbnb-cleaning']::text[]),
  ('inspection-photos',   'Post-clean Photos',  'Timestamped photos for your records',           100, 'light', false, true, 320, ARRAY['airbnb-cleaning']::text[])
ON CONFLICT (slug) DO UPDATE SET
  name          = EXCLUDED.name,
  description   = EXCLUDED.description,
  is_active     = true,
  sort_order    = EXCLUDED.sort_order,
  service_slugs = EXCLUDED.service_slugs,
  updated_at    = now();

-- New/unpriced concepts remain inactive and unassigned until explicit commercial approval.
INSERT INTO public.pricing_extras (
  slug, name, description, price, service_type, is_popular, is_active, sort_order, service_slugs
) VALUES
  ('inside-wardrobes', 'Wardrobes', 'Clean inside wardrobes and shelving', 0, 'heavy', false, false, 170, ARRAY[]::text[]),
  ('blinds-cleaning', 'Blinds', 'Dust and wipe blinds', 0, 'heavy', false, false, 180, ARRAY[]::text[]),
  ('sofa-upholstery', 'Sofa / Upholstery', 'Clean one sofa or upholstered seat', 0, 'heavy', false, false, 240, ARRAY[]::text[]),
  ('waste-removal', 'Waste Removal', 'Remove bagged office waste', 0, 'light', false, false, 430, ARRAY[]::text[]),
  ('appliances-cleaning', 'Appliances', 'Clean major kitchen appliances inside and out', 0, 'heavy', false, false, 520, ARRAY[]::text[])
ON CONFLICT (slug) DO UPDATE SET
  is_active = false,
  service_slugs = ARRAY[]::text[],
  updated_at = now();

-- Guard the exact contract before commit.
DO $$
DECLARE
  bad_count integer;
BEGIN
  WITH expected(slug, price, service_slugs) AS (
    VALUES
      ('inside-fridge',        15, ARRAY['regular-cleaning']::text[]),
      ('inside-oven',          20, ARRAY['regular-cleaning','airbnb-cleaning']::text[]),
      ('laundry',              35, ARRAY['regular-cleaning','airbnb-cleaning']::text[]),
      ('ironing',              40, ARRAY['regular-cleaning']::text[]),
      ('interior-windows',     30, ARRAY['regular-cleaning','airbnb-cleaning']::text[]),
      ('inside-cabinets',      25, ARRAY['deep-cleaning','moving-cleaning']::text[]),
      ('interior-walls',       35, ARRAY['deep-cleaning']::text[]),
      ('garage-cleaning',     100, ARRAY['moving-cleaning']::text[]),
      ('office-kitchen',      200, ARRAY['office-cleaning']::text[]),
      ('office-sanitisation', 180, ARRAY['office-cleaning']::text[]),
      ('pet-odour-treatment', 180, ARRAY['carpet-cleaning']::text[]),
      ('fabric-protector',    220, ARRAY['carpet-cleaning']::text[]),
      ('mattress-cleaning',   250, ARRAY['carpet-cleaning']::text[]),
      ('welcome-setup',       150, ARRAY['airbnb-cleaning']::text[]),
      ('inspection-photos',   100, ARRAY['airbnb-cleaning']::text[])
  )
  SELECT count(*)
  INTO bad_count
  FROM expected e
  LEFT JOIN public.pricing_extras p ON p.slug = e.slug
  WHERE p.id IS NULL
     OR p.is_active IS NOT TRUE
     OR p.price <> e.price
     OR NOT (p.service_slugs @> e.service_slugs AND p.service_slugs <@ e.service_slugs);

  IF bad_count <> 0 THEN
    RAISE EXCEPTION 'Booking V2 canonical extras failed verification: % row(s)', bad_count;
  END IF;

  SELECT count(*)
  INTO bad_count
  FROM public.pricing_extras p
  WHERE p.slug IN ('inside-wardrobes','blinds-cleaning','appliances-cleaning','waste-removal','sofa-upholstery')
    AND (p.is_active IS TRUE OR cardinality(p.service_slugs) <> 0);

  IF bad_count <> 0 THEN
    RAISE EXCEPTION 'Unapproved new extras must remain inactive and unassigned: % row(s)', bad_count;
  END IF;

  SELECT count(*)
  INTO bad_count
  FROM public.pricing_extras p
  WHERE p.service_slugs && ARRAY[
    'regular-cleaning',
    'deep-cleaning',
    'moving-cleaning',
    'office-cleaning',
    'carpet-cleaning',
    'airbnb-cleaning'
  ]::text[]
  AND p.slug NOT IN (
    'inside-fridge',
    'inside-oven',
    'laundry',
    'ironing',
    'interior-windows',
    'inside-cabinets',
    'inside-wardrobes',
    'blinds-cleaning',
    'interior-walls',
    'appliances-cleaning',
    'garage-cleaning',
    'office-kitchen',
    'office-sanitisation',
    'waste-removal',
    'sofa-upholstery',
    'pet-odour-treatment',
    'fabric-protector',
    'mattress-cleaning',
    'welcome-setup',
    'inspection-photos'
  );

  IF bad_count <> 0 THEN
    RAISE EXCEPTION 'Unexpected extras remain assigned to Booking V2 services: % row(s)', bad_count;
  END IF;
END
$$;

COMMIT;
