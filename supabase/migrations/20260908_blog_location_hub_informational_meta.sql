-- Informational SERP titles for suburb `cleaning-services-*-cape-town` guides — avoids overlapping
-- commercial phrasing on `/services/*` and `/locations/*` money pages.
-- Explicit slug→title mapping (safer than INITCAP on hyphenated slug fragments).

UPDATE public.blog_posts AS b
SET
  meta_title = v.meta_title,
  title = v.meta_title,
  h1 = v.meta_title,
  search_intent = 'informational',
  updated_at = now()
FROM (
  VALUES
    ('cleaning-services-durbanville-cape-town', 'Cleaning Services in Durbanville Cape Town (2026 Guide & Prices)'),
    ('cleaning-services-gardens-cape-town', 'Cleaning Services in Gardens Cape Town (2026 Guide & Prices)'),
    ('cleaning-services-green-point-cape-town', 'Cleaning Services in Green Point Cape Town (2026 Guide & Prices)'),
    ('cleaning-services-rondebosch-cape-town', 'Cleaning Services in Rondebosch Cape Town (2026 Guide & Prices)'),
    ('cleaning-services-sea-point-cape-town', 'Cleaning Services in Sea Point Cape Town (2026 Guide & Prices)'),
    ('cleaning-services-wynberg-cape-town', 'Cleaning Services in Wynberg Cape Town (2026 Guide & Prices)')
) AS v(slug, meta_title)
WHERE b.slug = v.slug;
