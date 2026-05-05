-- Normalize historical blog canonical_url values to apex (non-www).
-- `blog_posts` has no `og_url` column; Open Graph URLs come from Next metadata + SITE_ORIGIN.

UPDATE public.blog_posts
SET canonical_url = regexp_replace(
  canonical_url,
  '^https?://www\.shalean\.co\.za',
  'https://shalean.co.za',
  'i'
)
WHERE canonical_url IS NOT NULL
  AND canonical_url ~* '^https?://www\.shalean\.co\.za';
