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
-- pricing_services — canonical Booking V2 rates (aligned with production catalog)
-- ---------------------------------------------------------------------------
INSERT INTO public.pricing_services (
  slug, name, base_price,
  price_per_bedroom, price_per_bathroom, price_per_extra_room,
  service_fee_zar,
  min_hours, max_hours,
  duration_base, duration_per_bedroom, duration_per_bathroom, duration_per_extra_room,
  is_active, sort_order
) VALUES
  ('office',   'Office Cleaning',   300,  35,  45,  25, NULL, 3.5, 8.0, 3.5, 0.50, 0.50, 0.30, true, 10),
  ('standard', 'Standard Cleaning', 250,  30,  35,  35,   30, 3.5, 8.0, 3.5, 0.50, 0.50, 0.30, true, 20),
  ('airbnb',   'Airbnb Cleaning',   250,  30,  35,  40,   30, 3.5, 8.0, 3.5, 0.50, 0.50, 0.30, true, 30),
  ('deep',     'Deep Cleaning',    1200, 150, 200, 120,   60, 5.0, 8.0, 4.0, 0.75, 0.75, 0.50, true, 40),
  ('move',     'Move in / out',    1200, 150, 200, 100,   60, 5.0, 8.0, 4.0, 0.75, 0.75, 0.50, true, 50),
  ('carpet',   'Carpet Cleaning',   500, 350,   0,  70,   50, 3.5, 8.0, 4.0, 0.65, 0.65, 0.45, true, 60)
ON CONFLICT (slug) DO UPDATE SET
  name                    = EXCLUDED.name,
  base_price              = EXCLUDED.base_price,
  price_per_bedroom       = EXCLUDED.price_per_bedroom,
  price_per_bathroom      = EXCLUDED.price_per_bathroom,
  price_per_extra_room    = EXCLUDED.price_per_extra_room,
  service_fee_zar         = EXCLUDED.service_fee_zar,
  min_hours               = EXCLUDED.min_hours,
  max_hours               = EXCLUDED.max_hours,
  duration_base           = EXCLUDED.duration_base,
  duration_per_bedroom    = EXCLUDED.duration_per_bedroom,
  duration_per_bathroom   = EXCLUDED.duration_per_bathroom,
  duration_per_extra_room = EXCLUDED.duration_per_extra_room,
  is_active               = true,
  sort_order              = EXCLUDED.sort_order,
  updated_at              = now();

-- ---------------------------------------------------------------------------
-- pricing_extras — exact Booking V2 customer add-on contract
-- ---------------------------------------------------------------------------
INSERT INTO public.pricing_extras (
  slug, name, description, price, service_type, is_popular, is_active, sort_order, service_slugs
) VALUES
  ('inside-fridge',       'Inside Fridge',      'Interior fridge clean',                         15, 'light', true,  true,  10, ARRAY['regular-cleaning']::text[]),
  ('inside-oven',         'Inside Oven',        'Deep clean inside the oven',                    20, 'light', true,  true,  20, ARRAY['regular-cleaning','airbnb-cleaning']::text[]),
  ('laundry',             'Laundry',            'Wash and hang up to 1 load',                    35, 'light', false, true,  30, ARRAY['regular-cleaning','airbnb-cleaning']::text[]),
  ('ironing',             'Ironing',            'Ironing up to 1 load',                          40, 'light', false, true,  40, ARRAY['regular-cleaning']::text[]),
  ('interior-windows',    'Interior Windows',   'Clean all interior windows',                    30, 'light', false, true,  50, ARRAY['regular-cleaning','airbnb-cleaning']::text[]),
  ('inside-cabinets',     'Cupboards',          'Clean inside kitchen and bathroom cupboards',   25, 'heavy', false, true,  60, ARRAY['deep-cleaning','moving-cleaning']::text[]),
  ('interior-walls',      'Walls',              'Wipe down interior walls',                      35, 'heavy', false, true,  80, ARRAY['deep-cleaning']::text[]),
  ('garage-cleaning',     'Garage',             'Sweep and clean the garage',                    100, 'heavy', false, true, 140, ARRAY['moving-cleaning']::text[]),
  ('mattress-cleaning',   'Mattress',           'Clean and sanitise one mattress',               250, 'heavy', false, true, 150, ARRAY['carpet-cleaning']::text[]),
  ('pet-odour-treatment', 'Pet Odour',          'Enzyme-based odour neutraliser',                180, 'heavy', false, true, 220, ARRAY['carpet-cleaning']::text[]),
  ('fabric-protector',    'Fabric Protector',   'Scotchgard-style protection spray',             220, 'heavy', false, true, 230, ARRAY['carpet-cleaning']::text[]),
  ('welcome-setup',       'Welcome Setup',      'Arrange towels, toiletries, staging',           150, 'light', false, true, 310, ARRAY['airbnb-cleaning']::text[]),
  ('inspection-photos',   'Post-clean Photos',  'Timestamped photos for your records',           100, 'light', false, true, 320, ARRAY['airbnb-cleaning']::text[]),
  ('office-kitchen',      'Kitchen',            'Clean shared office kitchenette',               200, 'light', false, true, 410, ARRAY['office-cleaning']::text[]),
  ('office-sanitisation', 'Sanitisation',       'High-touch sanitisation of desks and common areas', 180, 'light', false, true, 420, ARRAY['office-cleaning']::text[]),
ON CONFLICT (slug) DO UPDATE SET
  name          = EXCLUDED.name,
  description   = EXCLUDED.description,
  price         = EXCLUDED.price,
  is_popular    = EXCLUDED.is_popular,
  is_active     = true,
  sort_order    = EXCLUDED.sort_order,
  service_slugs = EXCLUDED.service_slugs,
  updated_at    = now();

-- ---------------------------------------------------------------------------
-- services — marketing/homepage lines (NOT the checkout catalog)
-- ---------------------------------------------------------------------------
INSERT INTO public.services (
  id, slug, title, description, starting_price, features, sort_order, is_active
) VALUES
  ('22222222-aaaa-4000-8000-000000000001', 'regular-cleaning',
    'Regular Cleaning',  'Keep your home fresh and comfortable with a reliable weekly or once-off clean.',
    250, ARRAY['Bedrooms & bathrooms','Kitchen & living areas','Vacuuming & mopping'], 10, true),
  ('22222222-aaaa-4000-8000-000000000002', 'deep-cleaning',
    'Deep Cleaning', 'A thorough top-to-bottom clean of every surface, corner, and room.',
    1200, ARRAY['All regular areas','Walls, skirting, blinds','Oven & fridge interior'], 20, true),
  ('22222222-aaaa-4000-8000-000000000003', 'moving-cleaning',
    'Moving Cleaning', 'Move-in or move-out clean for a smooth handover and full deposit return.',
    1200, ARRAY['Full property deep clean','Deposit-ready standard','Furnished or empty'], 30, true),
  ('22222222-aaaa-4000-8000-000000000004', 'office-cleaning',
    'Office Cleaning', 'Professional cleaning for offices and workspaces.',
    300, ARRAY['Desks & workstations','Kitchenette & bathrooms','Vacuuming & bins'], 40, true),
  ('22222222-aaaa-4000-8000-000000000005', 'carpet-cleaning',
    'Carpet Cleaning', 'Steam and shampoo carpets, rugs and upholstery.',
    500, ARRAY['Hot-water extraction','Stain pre-treatment','Rugs & upholstery'], 50, true),
  ('22222222-aaaa-4000-8000-000000000006', 'airbnb-cleaning',
    'Airbnb Cleaning', 'Fast, reliable turnovers that keep your listing sparkling.',
    250, ARRAY['Linen changeover','Restocking & welcome setup','Photo-ready result'], 60, true)
ON CONFLICT (id) DO UPDATE SET
  title         = EXCLUDED.title,
  description   = EXCLUDED.description,
  starting_price = EXCLUDED.starting_price,
  is_active     = true;

-- ---------------------------------------------------------------------------
-- pricing_booking_config — fees, recurring discounts, property factors
-- Uses the runtime JSON keys consumed by parseBookingV2FeesConfig().
-- ---------------------------------------------------------------------------
INSERT INTO public.pricing_booking_config (id, config, updated_at)
VALUES (
  'default',
  '{
    "service_fee_rule": "flat",
    "service_fee_flat_cents": 3000,
    "service_fee_percent": 5,
    "extra_cleaner_fee_zar": 299,
    "supplies_equipment_fee_zar": 0,
    "supplies_equipment_cost_zar": 150,
    "recurring_discounts": {
      "weekly":      {"type": "percent", "value": 10},
      "fortnightly": {"type": "percent", "value": 5},
      "monthly":     {"type": "percent", "value": 0},
      "custom":      {"type": "percent", "value": 0}
    },
    "property_factor_rates": {
      "propertyType":  {"house": 0, "apartment": 0, "townhouse": 0},
      "officeSize":    {"small": 0, "medium": 50, "large": 120, "enterprise": 250},
      "lastCleaned":   {"never": 100, "6_months_plus": 80, "3_6_months": 40, "1_3_months": 0},
      "furnished":     {"yes": 50, "no": 0},
      "carpetType":    {"standard": 0, "thick_pile": 50, "berber": 30, "persian_rug": 80},
      "stains":        {"yes": 80, "no": 0},
      "carpetRooms_per_room_zar": 0,
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
