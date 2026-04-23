-- Admin-managed pricing catalog (read/write via Next.js admin API + service role).
-- Note: live checkout still uses code paths until wired to these tables.

CREATE TABLE IF NOT EXISTS public.pricing_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  base_price INTEGER NOT NULL DEFAULT 0,
  price_per_bedroom INTEGER NOT NULL DEFAULT 0,
  price_per_bathroom INTEGER NOT NULL DEFAULT 0,
  min_hours NUMERIC(5, 2) NOT NULL DEFAULT 2,
  max_hours NUMERIC(5, 2) NOT NULL DEFAULT 8,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pricing_extras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  service_type TEXT NOT NULL DEFAULT 'all',
  is_popular BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pricing_services_active_idx ON public.pricing_services (is_active, sort_order);
CREATE INDEX IF NOT EXISTS pricing_extras_active_idx ON public.pricing_extras (is_active, sort_order);

COMMENT ON TABLE public.pricing_services IS 'Service line pricing (ZAR integers); admin UI source of truth.';
COMMENT ON TABLE public.pricing_extras IS 'Add-on pricing; service_type: light | heavy | all';

ALTER TABLE public.pricing_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_extras ENABLE ROW LEVEL SECURITY;

-- Seed defaults (ZAR placeholders — edit in Admin → Pricing)
INSERT INTO public.pricing_services (slug, name, base_price, price_per_bedroom, price_per_bathroom, min_hours, max_hours, is_active, sort_order)
VALUES
  ('quick', 'Quick clean', 299, 35, 45, 1.5, 4, true, 10),
  ('standard', 'Standard clean', 399, 45, 55, 2, 6, true, 20),
  ('airbnb', 'Airbnb / turnover', 449, 50, 60, 2.5, 7, true, 30),
  ('deep', 'Deep clean', 899, 65, 75, 3, 10, true, 40),
  ('move', 'Move in / out', 1299, 80, 90, 4, 12, true, 50),
  ('carpet', 'Carpet care', 499, 55, 60, 2, 8, true, 60)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.pricing_extras (slug, name, price, service_type, is_popular, is_active, sort_order)
VALUES
  ('inside-cabinets', 'Inside cabinets', 39, 'light', false, true, 10),
  ('inside-oven', 'Inside oven', 59, 'light', true, true, 20),
  ('inside-fridge', 'Inside fridge', 39, 'light', false, true, 30),
  ('interior-walls', 'Interior walls', 59, 'light', false, true, 40),
  ('ironing', 'Ironing', 49, 'light', false, true, 50),
  ('laundry', 'Laundry', 49, 'light', false, true, 60),
  ('interior-windows', 'Interior windows', 59, 'light', false, true, 70),
  ('water-plants', 'Water plants', 25, 'light', false, true, 80),
  ('balcony-cleaning', 'Balcony cleaning', 249, 'heavy', false, true, 90),
  ('carpet-cleaning', 'Carpet cleaning', 349, 'heavy', true, true, 100),
  ('ceiling-cleaning', 'Ceiling cleaning', 199, 'heavy', false, true, 110),
  ('garage-cleaning', 'Garage cleaning', 199, 'heavy', false, true, 120),
  ('mattress-cleaning', 'Mattress cleaning', 349, 'heavy', false, true, 130),
  ('outside-windows', 'Outside windows', 249, 'heavy', false, true, 140),
  ('extra-cleaner', 'Extra cleaner', 299, 'all', false, true, 150),
  ('supplies-kit', 'Supplies kit', 399, 'all', false, true, 160)
ON CONFLICT (slug) DO NOTHING;
