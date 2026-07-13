-- Claremont neighbourhood blog: refreshed editorial title/meta for /blog/cleaning-services-claremont-cape-town
-- Body content_json: apply via supabase/seed/update_blog_posts_location_hubs_content_json.sql (generated from TS) or CMS publish.

UPDATE public.blog_posts
SET
  title = 'Cleaning Services in Claremont Cape Town: What to Expect & How to Choose',
  h1 = 'Cleaning Services in Claremont Cape Town: What to Expect & How to Choose',
  excerpt =
    'What to expect from cleaning services in Claremont—pricing, local context, popular services, and how to book vetted cleaners online.',
  meta_title = 'Claremont Cleaning Services Cape Town | Guide | Shalean Blog',
  meta_description =
    'Cleaning services in Claremont, Cape Town: what to expect, typical pricing from R400–R500+, links to services and the Claremont hub. Book online.',
  updated_at = now()
WHERE slug = 'cleaning-services-claremont-cape-town';
