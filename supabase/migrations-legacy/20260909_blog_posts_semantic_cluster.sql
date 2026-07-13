-- Internal governance primitive: canonical topical cluster (not editorial tags).
ALTER TABLE public.blog_posts
ADD COLUMN IF NOT EXISTS semantic_cluster text NULL;

COMMENT ON COLUMN public.blog_posts.semantic_cluster IS 'Governance cluster key (e.g. service-selection, booking-confidence). Nullable during rollout; pair with taxonomy tags.';

CREATE INDEX IF NOT EXISTS blog_posts_semantic_cluster_idx
  ON public.blog_posts (semantic_cluster)
  WHERE semantic_cluster IS NOT NULL;
