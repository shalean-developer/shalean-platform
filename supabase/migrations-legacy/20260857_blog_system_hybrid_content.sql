-- Hybrid blog: programmatic drafts, editorial, high-conversion; structured JSONB body; SEO + RLS.
-- Admin detection: JWT app_metadata.role = 'admin' OR user_metadata.role = 'admin' (set via Supabase Dashboard or Auth Hook).
-- Public reads: blog_posts only when status = published, published_at <= now(), not noindex-gated in RLS (noindex is for HTML meta; still listable unless you filter in app).

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'blog_post_status') THEN
    CREATE TYPE public.blog_post_status AS ENUM ('draft', 'published', 'scheduled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'blog_post_source') THEN
    CREATE TYPE public.blog_post_source AS ENUM ('editorial', 'programmatic', 'high_conversion');
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- blog_authors
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.blog_authors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  bio text,
  avatar_url text,
  website_url text,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blog_authors_user_id_idx ON public.blog_authors (user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON TABLE public.blog_authors IS 'Blog bylines; optional link to auth.users for dashboard editors.';

-- ---------------------------------------------------------------------------
-- blog_categories
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.blog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blog_categories_active_sort_idx
  ON public.blog_categories (is_active, sort_order);

COMMENT ON TABLE public.blog_categories IS 'Blog taxonomy for URLs, hubs, and internal linking.';

-- ---------------------------------------------------------------------------
-- blog_tags
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.blog_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.blog_tags IS 'Flat tags; join via blog_post_tags.';

-- ---------------------------------------------------------------------------
-- blog_posts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  h1 text,
  excerpt text NOT NULL,
  status public.blog_post_status NOT NULL DEFAULT 'draft',
  source public.blog_post_source NOT NULL DEFAULT 'editorial',
  content_json jsonb NOT NULL DEFAULT '{"schema_version":1,"blocks":[]}'::jsonb,
  meta_title text,
  meta_description text,
  canonical_url text,
  featured_image_url text,
  featured_image_alt text,
  author_id uuid REFERENCES public.blog_authors (id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.blog_categories (id) ON DELETE SET NULL,
  reading_time_minutes integer,
  published_at timestamptz,
  noindex boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blog_posts_reading_time_nonneg CHECK (
    reading_time_minutes IS NULL OR reading_time_minutes >= 0
  ),
  CONSTRAINT blog_posts_scheduled_has_publish_at CHECK (
    status <> 'scheduled' OR published_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS blog_posts_status_idx ON public.blog_posts (status);

CREATE INDEX IF NOT EXISTS blog_posts_published_at_idx
  ON public.blog_posts (published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS blog_posts_category_id_idx ON public.blog_posts (category_id)
  WHERE category_id IS NOT NULL;

-- Listing published posts by recency (common query)
CREATE INDEX IF NOT EXISTS blog_posts_public_list_idx
  ON public.blog_posts (status, published_at DESC NULLS LAST)
  WHERE status = 'published';

COMMENT ON TABLE public.blog_posts IS 'Hybrid blog: content_json is block tree (no raw HTML in DB).';
COMMENT ON COLUMN public.blog_posts.h1 IS 'Optional display H1; UI falls back to title when null.';
COMMENT ON COLUMN public.blog_posts.content_json IS 'Structured blocks: schema_version + blocks[]. See apps/web/lib/blog/content-json.ts';
COMMENT ON COLUMN public.blog_posts.noindex IS 'When true, emit robots noindex; does not affect RLS visibility of published rows.';

-- ---------------------------------------------------------------------------
-- blog_post_tags
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.blog_post_tags (
  post_id uuid NOT NULL REFERENCES public.blog_posts (id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.blog_tags (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, tag_id)
);

CREATE INDEX IF NOT EXISTS blog_post_tags_tag_id_idx ON public.blog_post_tags (tag_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.blog_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_blog_authors_updated_at ON public.blog_authors;
CREATE TRIGGER trg_blog_authors_updated_at
  BEFORE UPDATE ON public.blog_authors
  for each row execute function public.blog_touch_updated_at();

DROP TRIGGER IF EXISTS trg_blog_categories_updated_at ON public.blog_categories;
CREATE TRIGGER trg_blog_categories_updated_at
  BEFORE UPDATE ON public.blog_categories
  for each row execute function public.blog_touch_updated_at();

DROP TRIGGER IF EXISTS trg_blog_posts_updated_at ON public.blog_posts;
CREATE TRIGGER trg_blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  for each row execute function public.blog_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Admin helper (JWT role = admin)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.blog_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  )
  OR coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin',
    false
  );
$$;

COMMENT ON FUNCTION public.blog_is_admin IS 'True when JWT claims include role=admin (app_metadata or user_metadata).';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.blog_authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_post_tags ENABLE ROW LEVEL SECURITY;

-- blog_authors: public read; admin write
DROP POLICY IF EXISTS blog_authors_select_public ON public.blog_authors;
CREATE POLICY blog_authors_select_public ON public.blog_authors
  FOR SELECT USING (true);

DROP POLICY IF EXISTS blog_authors_all_admin ON public.blog_authors;
CREATE POLICY blog_authors_all_admin ON public.blog_authors
  FOR ALL USING (public.blog_is_admin()) WITH CHECK (public.blog_is_admin());

-- blog_categories: public read active; admin all
DROP POLICY IF EXISTS blog_categories_select_public ON public.blog_categories;
CREATE POLICY blog_categories_select_public ON public.blog_categories
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS blog_categories_all_admin ON public.blog_categories;
CREATE POLICY blog_categories_all_admin ON public.blog_categories
  FOR ALL USING (public.blog_is_admin()) WITH CHECK (public.blog_is_admin());

-- blog_tags: public read; admin all
DROP POLICY IF EXISTS blog_tags_select_public ON public.blog_tags;
CREATE POLICY blog_tags_select_public ON public.blog_tags
  FOR SELECT USING (true);

DROP POLICY IF EXISTS blog_tags_all_admin ON public.blog_tags;
CREATE POLICY blog_tags_all_admin ON public.blog_tags
  FOR ALL USING (public.blog_is_admin()) WITH CHECK (public.blog_is_admin());

-- blog_posts: public read published only; admin all
DROP POLICY IF EXISTS blog_posts_select_public ON public.blog_posts;
CREATE POLICY blog_posts_select_public ON public.blog_posts
  FOR SELECT
  USING (
    status = 'published'
    AND published_at IS NOT NULL
    AND published_at <= now()
  );

DROP POLICY IF EXISTS blog_posts_all_admin ON public.blog_posts;
CREATE POLICY blog_posts_all_admin ON public.blog_posts
  FOR ALL USING (public.blog_is_admin()) WITH CHECK (public.blog_is_admin());

-- blog_post_tags: public read rows attached to a publicly visible post; admin all
DROP POLICY IF EXISTS blog_post_tags_select_public ON public.blog_post_tags;
CREATE POLICY blog_post_tags_select_public ON public.blog_post_tags
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.blog_posts p
      WHERE p.id = post_id
        AND p.status = 'published'
        AND p.published_at IS NOT NULL
        AND p.published_at <= now()
    )
  );

DROP POLICY IF EXISTS blog_post_tags_all_admin ON public.blog_post_tags;
CREATE POLICY blog_post_tags_all_admin ON public.blog_post_tags
  FOR ALL USING (public.blog_is_admin()) WITH CHECK (public.blog_is_admin());

-- ---------------------------------------------------------------------------
-- API grants (RLS still enforces row access)
-- ---------------------------------------------------------------------------

grant select on public.blog_authors to anon, authenticated;
grant insert, update, delete on public.blog_authors to authenticated;

grant select on public.blog_categories to anon, authenticated;
grant insert, update, delete on public.blog_categories to authenticated;

grant select on public.blog_tags to anon, authenticated;
grant insert, update, delete on public.blog_tags to authenticated;

grant select on public.blog_posts to anon, authenticated;
grant insert, update, delete on public.blog_posts to authenticated;

grant select on public.blog_post_tags to anon, authenticated;
grant insert, update, delete on public.blog_post_tags to authenticated;
