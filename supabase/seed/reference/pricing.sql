-- =============================================================================
-- Reference pricing seed — safe to commit; no personal data.
-- Derived from @shalean/pricing static config (SERVICE_CONFIG) and
-- apps/web/src/features/booking-v2/config/serviceConfig.ts.
-- NOT exported from production (no production credentials required).
--
-- Run via: npm run db:seed:reference
-- Apply with: supabase db query --linked -f supabase/seed/reference/pricing.sql
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- pricing_services — canonical engine slugs used by loadBookingV2Catalog
-- ---------------------------------------------------------------------------
INSERT INTO public.pricing_services (
  slug, name, base_price,
  price_per_bedroom, price_per_bathroom, price_per_extra_room,
  min_hours, max_hours,
  duration_base, duration_per_bedroom, duration_per_bathroom, duration_per_extra_room,
  is_active, sort_order
) VALUES
  -- standard → regular-cleaning / office-cleaning
  ('standard',  'Regular Cleaning',  350, 80, 60, 30, 2.0,  8.0, 3.5, 0.75, 0.50, 0.30, true,  10),
  ('deep',      'Deep Cleaning',     950, 100, 80, 40, 3.0, 10.0, 5.0, 1.00, 0.75, 0.50, true,  20),
  ('move',      'Moving Cleaning',  1100, 120, 90, 45, 4.0, 12.0, 6.0, 1.00, 0.75, 0.50, true,  30),
  ('office',    'Office Cleaning',   450, 60,  50, 30, 2.0,  8.0, 3.5, 0.50, 0.50, 0.30, true,  40),
  ('carpet',    'Carpet Cleaning',   500, 120, 0,  0,  2.0,  8.0, 2.0, 0.75, 0.00, 0.00, true,  50),
  ('airbnb',    'Airbnb Cleaning',   400, 80,  60, 30, 2.0,  8.0, 3.0, 0.75, 0.50, 0.30, true,  60)
ON CONFLICT (slug) DO UPDATE SET
  name                   = EXCLUDED.name,
  base_price             = EXCLUDED.base_price,
  price_per_bedroom      = EXCLUDED.price_per_bedroom,
  price_per_bathroom     = EXCLUDED.price_per_bathroom,
  price_per_extra_room   = EXCLUDED.price_per_extra_room,
  min_hours              = EXCLUDED.min_hours,
  max_hours              = EXCLUDED.max_hours,
  duration_base          = EXCLUDED.duration_base,
  duration_per_bedroom   = EXCLUDED.duration_per_bedroom,
  duration_per_bathroom  = EXCLUDED.duration_per_bathroom,
  duration_per_extra_room = EXCLUDED.duration_per_extra_room,
  is_active              = true,
  updated_at             = now();

-- ---------------------------------------------------------------------------
-- pricing_extras — keyed on slug; service_type: light | heavy | all
-- ---------------------------------------------------------------------------
INSERT INTO public.pricing_extras (
  slug, name, description, price, service_type, is_popular, is_active, sort_order
) VALUES
  -- light extras (available on regular/office/airbnb)
  ('inside-fridge',     'Inside Fridge',       'Interior fridge clean',                          150, 'light', true,  true,  10),
  ('inside-oven',       'Inside Oven',         'Deep clean inside the oven',                     200, 'light', true,  true,  20),
  ('laundry',           'Laundry',             'Wash and hang up to 1 load',                     150, 'light', false, true,  30),
  ('ironing',           'Ironing',             'Ironing up to 1 load',                           150, 'light', false, true,  40),
  ('interior-windows',  'Interior Windows',    'Clean all interior windows',                     180, 'light', false, true,  50),
  ('inside-cabinets',   'Cupboards',           'Clean inside kitchen and bathroom cupboards',    180, 'light', false, true,  60),
  ('water-plants',      'Water Plants',        'Water indoor plants',                             80, 'light', false, true,  70),
  ('interior-walls',    'Walls',               'Wipe down interior walls',                       150, 'light', false, true,  80),
  -- heavy extras (available on deep/moving/carpet)
  ('balcony-cleaning',  'Balcony',             'Sweep and clean balcony or patio',               200, 'heavy', false, true, 110),
  ('carpet-cleaning',   'Carpet clean',        'Steam clean carpeted rooms',                     350, 'heavy', false, true, 120),
  ('ceiling-cleaning',  'Ceilings',            'Dust and wipe ceilings',                         300, 'heavy', false, true, 130),
  ('garage-cleaning',   'Garage',              'Sweep and clean the garage',                     200, 'heavy', false, true, 140),
  ('mattress-cleaning', 'Mattress',            'Clean and sanitise one mattress',                250, 'heavy', false, true, 150),
  ('outside-windows',   'Outside Windows',     'Clean accessible exterior windows',              250, 'heavy', false, true, 160),
  ('inside-wardrobes',  'Wardrobes',           'Clean inside wardrobes and shelving',            180, 'heavy', false, true, 170),
  ('blinds-cleaning',   'Blinds',              'Dust and wipe blinds',                           200, 'heavy', false, true, 180),
  -- carpet-cleaning service extras
  ('stain-treatment',   'Stain Treatment',     'Professional stain removal',                     200, 'heavy', true,  true, 210),
  ('pet-odour-treatment','Pet Odour',          'Enzyme-based odour neutraliser',                 220, 'heavy', false, true, 220),
  ('fabric-protector',  'Fabric Protector',    'Scotchgard-style protection spray',              180, 'heavy', false, true, 230),
  ('sofa-upholstery',   'Sofa / Upholstery',   'Clean one sofa or upholstered seat',             250, 'heavy', false, true, 240),
  -- airbnb extras
  ('welcome-setup',     'Welcome Setup',       'Arrange towels, toiletries, staging',            150, 'light', false, true, 310),
  ('inspection-photos', 'Post-clean Photos',   'Timestamped photos for your records',            100, 'light', false, true, 320),
  -- office extras
  ('office-kitchen',    'Office Kitchen',      'Clean shared office kitchenette',                200, 'light', false, true, 410),
  ('office-sanitisation','Sanitisation',       'High-touch sanitisation of desks and areas',     250, 'light', false, true, 420),
  -- moving extras
  ('deposit-preparation','Deposit Prep',       'Extra detail for rental deposit inspection',     250, 'heavy', false, true, 510),
  ('appliances-cleaning','Appliances',         'Clean major kitchen appliances inside and out',  220, 'heavy', false, true, 520)
ON CONFLICT (slug) DO UPDATE SET
  name         = EXCLUDED.name,
  description  = EXCLUDED.description,
  price        = EXCLUDED.price,
  service_type = EXCLUDED.service_type,
  is_popular   = EXCLUDED.is_popular,
  is_active    = true,
  updated_at   = now();

-- ---------------------------------------------------------------------------
-- services — marketing/homepage lines (NOT the checkout catalog)
-- ---------------------------------------------------------------------------
INSERT INTO public.services (
  id, slug, title, description, starting_price, features, sort_order, is_active
) VALUES
  ('22222222-aaaa-4000-8000-000000000001', 'regular-cleaning',
    'Regular Cleaning',  'Keep your home fresh and comfortable with a reliable weekly or once-off clean.',
    350, ARRAY['Bedrooms & bathrooms','Kitchen & living areas','Vacuuming & mopping'], 10, true),
  ('22222222-aaaa-4000-8000-000000000002', 'deep-cleaning',
    'Deep Cleaning', 'A thorough top-to-bottom clean of every surface, corner, and room.',
    950, ARRAY['All regular areas','Walls, skirting, blinds','Oven & fridge interior'], 20, true),
  ('22222222-aaaa-4000-8000-000000000003', 'moving-cleaning',
    'Moving Cleaning', 'Move-in or move-out clean for a smooth handover and full deposit return.',
    1100, ARRAY['Full property deep clean','Deposit-ready standard','Furnished or empty'], 30, true),
  ('22222222-aaaa-4000-8000-000000000004', 'office-cleaning',
    'Office Cleaning', 'Professional cleaning for offices and workspaces.',
    450, ARRAY['Desks & workstations','Kitchenette & bathrooms','Vacuuming & bins'], 40, true),
  ('22222222-aaaa-4000-8000-000000000005', 'carpet-cleaning',
    'Carpet Cleaning', 'Steam and shampoo carpets, rugs and upholstery.',
    500, ARRAY['Hot-water extraction','Stain pre-treatment','Rugs & upholstery'], 50, true),
  ('22222222-aaaa-4000-8000-000000000006', 'airbnb-cleaning',
    'Airbnb Cleaning', 'Fast, reliable turnovers that keep your listing sparkling.',
    400, ARRAY['Linen changeover','Restocking & welcome setup','Photo-ready result'], 60, true)
ON CONFLICT (id) DO UPDATE SET
  title         = EXCLUDED.title,
  description   = EXCLUDED.description,
  starting_price = EXCLUDED.starting_price,
  is_active     = true;

-- ---------------------------------------------------------------------------
-- pricing_booking_config — fees, recurring discounts, property factors
-- Matches defaultBookingV2FeesConfig() in apps/web/lib/booking-v2/bookingV2FeesConfig.ts
-- ---------------------------------------------------------------------------
INSERT INTO public.pricing_booking_config (id, config, updated_at)
VALUES (
  'default',
  '{
    "serviceFeeRule": "flat",
    "serviceFeeFlatCents": 3000,
    "serviceFeePercent": 5,
    "extraCleanerFeeZar": 299,
    "suppliesEquipmentFeeZar": 0,
    "suppliesEquipmentCostZar": 150,
    "recurringDiscounts": {
      "weekly":      {"type": "percent", "value": 10},
      "fortnightly": {"type": "percent", "value": 5},
      "monthly":     {"type": "percent", "value": 0},
      "custom":      {"type": "percent", "value": 0}
    },
    "propertyFactorRates": {
      "propertyType":  {"house": 0, "apartment": 0, "townhouse": 0},
      "officeSize":    {"small": 0, "medium": 50, "large": 120, "enterprise": 250},
      "lastCleaned":   {"never": 100, "6_months_plus": 80, "3_6_months": 40, "1_3_months": 0},
      "furnished":     {"yes": 50, "no": 0},
      "carpetType":    {"standard": 0, "thick_pile": 50, "berber": 30, "persian_rug": 80},
      "stains":        {"yes": 80, "no": 0},
      "carpetRooms_per_room_zar": 150,
      "rugs_per_unit_zar": 180,
      "sofa_per_unit_zar": 250
    }
  }'::jsonb,
  now()
)
ON CONFLICT (id) DO UPDATE SET
  config     = EXCLUDED.config,
  updated_at = now();

COMMIT;
