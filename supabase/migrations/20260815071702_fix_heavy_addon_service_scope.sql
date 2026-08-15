-- Keep regular/light add-ons out of heavy service catalogs.
-- Production had interior-walls scoped to `all`, which made the R35 light add-on
-- eligible for Deep / Move / Carpet cleaning. Inside cabinets is already `light`.

UPDATE public.pricing_extras
SET service_type = 'light',
    updated_at = now()
WHERE slug = 'interior-walls'
  AND service_type <> 'light';
