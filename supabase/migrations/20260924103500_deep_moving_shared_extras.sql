-- Align Deep Cleaning and Moving Cleaning to the approved shared Booking V2 extras.
-- Prices match the currently approved catalog in the active Shalean Supabase project.

BEGIN;

INSERT INTO public.pricing_extras (
  slug, name, description, price, service_type, is_popular, is_active, sort_order, service_slugs
) VALUES
  ('balcony-cleaning',     'Balcony cleaning',  'Clean balcony surfaces',                     50,  'deep', false, true, 10, ARRAY['deep-cleaning','moving-cleaning']::text[]),
  ('deep-carpet-cleaning', 'Carpet cleaning',   'Deep clean carpeted areas',                 350, 'deep', false, true, 20, ARRAY['deep-cleaning','moving-cleaning']::text[]),
  ('ceiling-cleaning',     'Ceiling cleaning',  'Dust and wipe accessible ceiling surfaces',100, 'deep', false, true, 30, ARRAY['deep-cleaning','moving-cleaning']::text[]),
  ('garage-cleaning',      'Garage cleaning',   'Sweep and clean the garage',                100, 'deep', false, true, 40, ARRAY['deep-cleaning','moving-cleaning']::text[]),
  ('mattress-cleaning',    'Mattress cleaning', 'Clean and sanitise one mattress',           250, 'deep', false, true, 50, ARRAY['deep-cleaning','moving-cleaning']::text[]),
  ('outside-windows',      'Outside windows',   'Clean accessible exterior windows',         350, 'deep', false, true, 60, ARRAY['deep-cleaning','moving-cleaning']::text[])
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  service_type = EXCLUDED.service_type,
  is_active = true,
  sort_order = EXCLUDED.sort_order,
  service_slugs = EXCLUDED.service_slugs,
  updated_at = now();

DO $$
DECLARE
  bad_count integer;
BEGIN
  SELECT count(*)
  INTO bad_count
  FROM (
    VALUES
      ('balcony-cleaning', 50),
      ('deep-carpet-cleaning', 350),
      ('ceiling-cleaning', 100),
      ('garage-cleaning', 100),
      ('mattress-cleaning', 250),
      ('outside-windows', 350)
  ) AS expected(slug, price)
  LEFT JOIN public.pricing_extras p ON p.slug = expected.slug
  WHERE p.id IS NULL
     OR p.price <> expected.price
     OR p.is_active IS NOT TRUE
     OR p.service_slugs IS DISTINCT FROM ARRAY['deep-cleaning','moving-cleaning']::text[];

  IF bad_count <> 0 THEN
    RAISE EXCEPTION 'Deep/Moving shared extras convergence failed: % mismatches', bad_count;
  END IF;
END $$;

COMMIT;
