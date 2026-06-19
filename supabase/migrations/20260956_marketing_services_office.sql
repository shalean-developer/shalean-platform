-- Homepage + JSON-LD: office cleaning (booking v2 base R450 — see serviceConfig).

INSERT INTO public.services (slug, title, description, starting_price, sort_order)
VALUES (
  'office',
  'Office Cleaning',
  'Professional cleaning for small offices, studios, and hybrid workspaces — kitchens, bathrooms, desks, and client-facing areas.',
  450,
  5
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  starting_price = EXCLUDED.starting_price,
  sort_order = EXCLUDED.sort_order,
  is_active = true;

-- Keep carpet after office in homepage order.
UPDATE public.services SET sort_order = 6 WHERE slug = 'carpet';
