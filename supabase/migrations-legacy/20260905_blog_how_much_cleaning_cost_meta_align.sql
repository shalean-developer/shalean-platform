-- Align pricing guide metadata with other programmatic Cape Town guides (20260891–20260898).
-- Body + content_json: run `npx tsx scripts/seed-how-much-cleaning-cost-cape-town-post.ts` from apps/web.

UPDATE public.blog_posts
SET
  source = 'programmatic'::public.blog_post_source,
  search_intent = 'informational',
  updated_at = now()
WHERE slug = 'how-much-does-cleaning-cost-cape-town';
