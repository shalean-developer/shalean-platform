-- Forward follow-up to staging advisor findings; earlier receipts remain immutable.
-- Helpers are callable only as current-user predicates from RLS, not public RPCs.
create schema blog_security;
revoke all on schema blog_security from public, anon;
grant usage on schema blog_security to authenticated, service_role;
alter function public.blog_is_admin() set schema blog_security;
alter function public.blog_can_read_editorial() set schema blog_security;

-- Explicit service-only policies document the private editorial audit stores.
create policy blog_save_receipts_service on public.blog_editor_save_receipts
  for all to service_role using (true) with check (true);
create policy blog_revisions_service on public.blog_post_revisions
  for all to service_role using (true) with check (true);
alter function public.blog_touch_updated_at() set search_path = pg_catalog;
