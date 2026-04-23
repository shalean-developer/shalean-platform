-- Engine fields on services (duration curve + extra-room line), bundle table, extras UX copy, public read RLS.

ALTER TABLE public.pricing_services
  ADD COLUMN IF NOT EXISTS price_per_extra_room INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS duration_base NUMERIC(6, 3) NOT NULL DEFAULT 3.5,
  ADD COLUMN IF NOT EXISTS duration_per_bedroom NUMERIC(6, 3) NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS duration_per_bathroom NUMERIC(6, 3) NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS duration_per_extra_room NUMERIC(6, 3) NOT NULL DEFAULT 0.3;

UPDATE public.pricing_services SET
  price_per_extra_room = 25,
  duration_base = 3.5, duration_per_bedroom = 0.5, duration_per_bathroom = 0.5, duration_per_extra_room = 0.3
WHERE slug = 'quick';

UPDATE public.pricing_services SET
  price_per_extra_room = 35,
  duration_base = 3.5, duration_per_bedroom = 0.5, duration_per_bathroom = 0.5, duration_per_extra_room = 0.3
WHERE slug = 'standard';

UPDATE public.pricing_services SET
  price_per_extra_room = 40,
  duration_base = 3.5, duration_per_bedroom = 0.5, duration_per_bathroom = 0.5, duration_per_extra_room = 0.3
WHERE slug = 'airbnb';

UPDATE public.pricing_services SET
  price_per_extra_room = 120,
  duration_base = 4, duration_per_bedroom = 0.75, duration_per_bathroom = 0.75, duration_per_extra_room = 0.5
WHERE slug = 'deep';

UPDATE public.pricing_services SET
  price_per_extra_room = 70,
  duration_base = 4, duration_per_bedroom = 0.65, duration_per_bathroom = 0.65, duration_per_extra_room = 0.45
WHERE slug = 'carpet';

UPDATE public.pricing_services SET
  price_per_extra_room = 100,
  duration_base = 4, duration_per_bedroom = 0.75, duration_per_bathroom = 0.75, duration_per_extra_room = 0.5
WHERE slug = 'move';

ALTER TABLE public.pricing_extras
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';

UPDATE public.pricing_extras SET description = 'Wipe shelves and doors — great before guests.' WHERE slug = 'inside-cabinets';
UPDATE public.pricing_extras SET description = 'Degrease racks and glass — our most-booked add-on.' WHERE slug = 'inside-oven';
UPDATE public.pricing_extras SET description = 'Empty shelves cleaned and sanitised.' WHERE slug = 'inside-fridge';
UPDATE public.pricing_extras SET description = 'Spot-clean marks and scuffs in main rooms.' WHERE slug = 'interior-walls';
UPDATE public.pricing_extras SET description = 'Up to one basket — pressed and hung.' WHERE slug = 'ironing';
UPDATE public.pricing_extras SET description = 'One load washed, dried, and folded.' WHERE slug = 'laundry';
UPDATE public.pricing_extras SET description = 'Streak-free glass on reachable panes.' WHERE slug = 'interior-windows';
UPDATE public.pricing_extras SET description = 'Light watering for indoor pots.' WHERE slug = 'water-plants';
UPDATE public.pricing_extras SET description = 'Sweep, mop, and tidy outdoor floors.' WHERE slug = 'balcony-cleaning';
UPDATE public.pricing_extras SET description = 'Deep extraction for high-traffic areas.' WHERE slug = 'carpet-cleaning';
UPDATE public.pricing_extras SET description = 'Dust and cobweb removal where reachable.' WHERE slug = 'ceiling-cleaning';
UPDATE public.pricing_extras SET description = 'Sweep out dust, leaves, and clutter edges.' WHERE slug = 'garage-cleaning';
UPDATE public.pricing_extras SET description = 'Sanitise and refresh mattresses in situ.' WHERE slug = 'mattress-cleaning';
UPDATE public.pricing_extras SET description = 'Ground-floor exterior glass where safely reachable.' WHERE slug = 'outside-windows';
UPDATE public.pricing_extras SET description = 'Second pro for large homes or tight deadlines.' WHERE slug = 'extra-cleaner';
UPDATE public.pricing_extras SET description = 'Premium consumables left for your next clean.' WHERE slug = 'supplies-kit';

CREATE TABLE IF NOT EXISTS public.pricing_extra_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  blurb TEXT NOT NULL DEFAULT '',
  bundle_price INTEGER NOT NULL,
  items TEXT[] NOT NULL,
  service_scope TEXT NOT NULL DEFAULT 'light',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pricing_extra_bundles_active_idx ON public.pricing_extra_bundles (is_active, sort_order);

INSERT INTO public.pricing_extra_bundles (bundle_id, label, blurb, bundle_price, items, service_scope, is_active, sort_order)
VALUES
  ('kitchen', 'Kitchen deep clean', 'Oven + fridge', 79, ARRAY['inside-oven', 'inside-fridge']::text[], 'light', true, 10),
  ('full_home', 'Full home refresh', 'Windows + cabinets', 89, ARRAY['interior-windows', 'inside-cabinets']::text[], 'light', true, 20),
  ('deep_refresh_bundle', 'Deep refresh bundle', 'Carpet + mattress', 599, ARRAY['carpet-cleaning', 'mattress-cleaning']::text[], 'heavy', true, 30),
  ('outdoor_bundle', 'Outdoor bundle', 'Balcony + outside windows', 449, ARRAY['balcony-cleaning', 'outside-windows']::text[], 'heavy', true, 40)
ON CONFLICT (bundle_id) DO NOTHING;

ALTER TABLE public.pricing_extra_bundles ENABLE ROW LEVEL SECURITY;

CREATE POLICY pricing_services_select_active ON public.pricing_services
  FOR SELECT TO anon, authenticated USING (is_active = true);

CREATE POLICY pricing_extras_select_active ON public.pricing_extras
  FOR SELECT TO anon, authenticated USING (is_active = true);

CREATE POLICY pricing_extra_bundles_select_active ON public.pricing_extra_bundles
  FOR SELECT TO anon, authenticated USING (is_active = true);

COMMENT ON COLUMN public.pricing_services.price_per_extra_room IS 'ZAR per billable extra room (beyond standard room lines).';
COMMENT ON TABLE public.pricing_extra_bundles IS 'Discount bundles over pricing_extras; mirrored into pricing_versions.rules.bundles.';
