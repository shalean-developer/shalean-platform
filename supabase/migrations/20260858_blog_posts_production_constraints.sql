-- blog_posts hardening: published rows require published_at; excerpt nullable; SEO fallbacks documented.

ALTER TABLE public.blog_posts
  ALTER COLUMN excerpt DROP NOT NULL;

ALTER TABLE public.blog_posts DROP CONSTRAINT IF EXISTS published_requires_date;

ALTER TABLE public.blog_posts
  ADD CONSTRAINT published_requires_date CHECK (
    (status <> 'published') OR (published_at IS NOT NULL)
  );

COMMENT ON COLUMN public.blog_posts.reading_time_minutes IS
  'Derived field: compute from content_json (word count / blocks) at save or publish time in app code; not enforced in DB.';

COMMENT ON COLUMN public.blog_posts.h1 IS
  'Optional display H1. App fallback: coalesce(h1, title).';

COMMENT ON COLUMN public.blog_posts.canonical_url IS
  'Optional absolute or site-relative canonical. App fallback: ''/blog/'' || slug (when column null).';

COMMENT ON COLUMN public.blog_posts.excerpt IS
  'Optional card/listing excerpt. App fallback: first intro block in content_json, trimmed to ~160 characters.';
