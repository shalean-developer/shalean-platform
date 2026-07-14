-- Marketing homepage: pricing tier cards (Next.js `getHomePageData` reads via anon + RLS).

CREATE TABLE IF NOT EXISTS public.pricing_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  price integer,
  cadence text,
  features text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pricing_tiers_active_sort_idx
  ON public.pricing_tiers (is_active, sort_order);

COMMENT ON TABLE public.pricing_tiers IS 'CMS rows for marketing pricing cards; anon may read active tiers only.';

ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pricing_tiers_select_public ON public.pricing_tiers;
CREATE POLICY pricing_tiers_select_public ON public.pricing_tiers FOR SELECT USING (is_active = true);

INSERT INTO public.pricing_tiers (slug, title, description, price, cadence, features, sort_order)
VALUES
  (
    'standard',
    'Standard Cleaning',
    'Regular upkeep for busy households.',
    350,
    NULL,
    ARRAY[
      'Dusting & vacuuming',
      'Kitchen wipe-down',
      'Bathroom sanitise',
      'Floor mop & polish'
    ],
    1
  ),
  (
    'deep',
    'Deep Cleaning',
    'Top-to-bottom refresh for a move-in or seasonal reset.',
    650,
    NULL,
    ARRAY[
      'Everything in Standard',
      'Inside oven & fridge',
      'Interior windows',
      'Restock essentials'
    ],
    2
  ),
  (
    'airbnb',
    'Airbnb Turnover',
    'Guest-ready turnover between check-ins.',
    450,
    NULL,
    ARRAY[
      'Linen & towel change',
      'Full bathroom reset',
      'Kitchen clean-down',
      'Restock essentials'
    ],
    3
  )
ON CONFLICT (slug) DO NOTHING;
