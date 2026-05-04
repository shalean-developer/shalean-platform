-- Blog SEO engine: keyword fields, optional internal-link context JSON, seed taxonomy.

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS primary_keyword text,
  ADD COLUMN IF NOT EXISTS secondary_keywords text[],
  ADD COLUMN IF NOT EXISTS search_intent text,
  ADD COLUMN IF NOT EXISTS seo_internal_link_context jsonb;

COMMENT ON COLUMN public.blog_posts.primary_keyword IS 'Primary SEO keyword phrase for the post.';
COMMENT ON COLUMN public.blog_posts.secondary_keywords IS 'Supporting keyword phrases.';
COMMENT ON COLUMN public.blog_posts.search_intent IS 'informational | transactional | commercial | navigational';
COMMENT ON COLUMN public.blog_posts.seo_internal_link_context IS 'Optional JSON matching InjectInternalLinksContext for injectInternalLinks() at render/publish.';

CREATE INDEX IF NOT EXISTS blog_posts_primary_keyword_idx
  ON public.blog_posts (primary_keyword)
  WHERE primary_keyword IS NOT NULL;

CREATE INDEX IF NOT EXISTS blog_posts_search_intent_idx
  ON public.blog_posts (search_intent)
  WHERE search_intent IS NOT NULL;

-- Seed categories (idempotent by slug)
INSERT INTO public.blog_categories (slug, name, description, sort_order, is_active)
VALUES
  ('local-guides', 'Local guides', 'Area and suburb cleaning guides', 10, true),
  ('comparisons', 'Comparisons', 'Service comparisons and decision guides', 20, true),
  ('tips', 'Tips & how-to', 'General cleaning tips and checklists', 30, true)
ON CONFLICT (slug) DO NOTHING;

-- Seed common tags
INSERT INTO public.blog_tags (slug, name)
VALUES
  ('claremont', 'Claremont'),
  ('sea-point', 'Sea Point'),
  ('rondebosch', 'Rondebosch'),
  ('deep-cleaning', 'Deep cleaning'),
  ('standard-cleaning', 'Standard cleaning'),
  ('airbnb', 'Airbnb'),
  ('pricing', 'Pricing'),
  ('cape-town', 'Cape Town')
ON CONFLICT (slug) DO NOTHING;
