-- Marketing homepage: service cards + FAQ (Next.js `getHomePageData` reads via anon + RLS).
-- Service slugs must match HomeWidgetServiceKey: standard | airbnb | deep | move | carpet (see apps/web/lib/home/data.ts).

CREATE TABLE IF NOT EXISTS public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL,
  starting_price integer,
  badge text,
  image_url text,
  features text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS services_active_sort_idx ON public.services (is_active, sort_order);

COMMENT ON TABLE public.services IS 'Marketing homepage service lines for structured data; not the checkout pricing_services catalog.';

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS services_select_public ON public.services;
CREATE POLICY services_select_public ON public.services FOR SELECT USING (is_active = true);

INSERT INTO public.services (slug, title, description, starting_price, sort_order)
VALUES
  (
    'standard',
    'Standard Cleaning',
    'Regular upkeep for busy households. Floors, kitchen, bathrooms, bedrooms — all refreshed.',
    350,
    1
  ),
  (
    'deep',
    'Deep Cleaning',
    'Top-to-bottom, inside-out. Every corner, surface, and appliance treated with precision.',
    650,
    2
  ),
  (
    'airbnb',
    'Airbnb Turnover',
    'Fast, guest-ready results between check-ins. Linen changes, sanitisation, restocking.',
    450,
    3
  ),
  (
    'move',
    'Move-Out Clean',
    'Leave your property spotless. Ideal for tenants, landlords, and property handovers.',
    750,
    4
  ),
  (
    'carpet',
    'Carpet Cleaning',
    'Steam-clean carpets and rugs to remove stains, allergens, and odours effectively.',
    400,
    5
  )
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- FAQs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  question text NOT NULL,
  answer text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS faqs_active_sort_idx ON public.faqs (is_active, sort_order);

COMMENT ON TABLE public.faqs IS 'Marketing FAQ content for homepage + JSON-LD FAQPage.';

ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS faqs_select_public ON public.faqs;
CREATE POLICY faqs_select_public ON public.faqs FOR SELECT USING (is_active = true);

INSERT INTO public.faqs (slug, question, answer, sort_order)
VALUES
  (
    'what-included-standard',
    'What is included in standard home cleaning?',
    'Standard cleaning includes reachable dusting, vacuuming, floor mopping, kitchen wipe-downs, bathroom sanitisation, and general room refreshes across all selected bedrooms and living areas.',
    1
  ),
  (
    'how-much-standard-cape-town',
    'How much is standard cleaning in Cape Town?',
    'Standard cleaning starts from R350 for a 1-bedroom home. Prices depend on property size, number of bathrooms, and optional extras. Your exact quote is shown before checkout — no surprises.',
    2
  ),
  (
    'recurring-standard',
    'Can I book recurring standard cleaning?',
    'Yes. Standard cleaning is designed for weekly, bi-weekly, and monthly maintenance. Recurring customers get priority slot access and can manage bookings from their dashboard.',
    3
  ),
  (
    'cleaners-bring-supplies',
    'Do cleaners bring supplies?',
    'Yes. All cleaners arrive with professional-grade supplies and equipment. If you prefer eco-friendly or specific products, you can request this when booking.',
    4
  ),
  (
    'same-day-available',
    'Is same-day cleaning available?',
    'Same-day slots are available depending on cleaner availability in your area. Book early in the morning for the best chance of securing a same-day slot in Cape Town.',
    5
  )
ON CONFLICT (slug) DO NOTHING;
