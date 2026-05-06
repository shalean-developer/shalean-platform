-- Optional editorial ordering for cluster-native "related guides" footer (blog article only).
alter table public.blog_posts
  add column if not exists related_guide_override_slugs text[] null;

comment on column public.blog_posts.related_guide_override_slugs is
  'Ordered blog post slugs to pin in the cluster related-guides footer; remaining slots filled from same-cluster peers.';
