-- BLOG-AUDIT-01/02: public reads stay public; all content writes use the Office
-- API (live RBAC + session-bound Office verification), never JWT user_metadata.
create or replace function public.blog_is_admin()
returns boolean language sql stable security definer set search_path = pg_catalog
as $$
  select public.admin_has_permission(auth.uid(), 'system.settings', null, null, now());
$$;

create or replace function public.blog_can_read_editorial()
returns boolean language sql stable security definer set search_path = pg_catalog
as $$
  select public.admin_has_permission(auth.uid(), 'content.draft', null, null, now())
      or public.admin_has_permission(auth.uid(), 'content.publish', null, null, now());
$$;
revoke all on function public.blog_is_admin() from public, anon;
revoke all on function public.blog_can_read_editorial() from public, anon;
grant execute on function public.blog_is_admin(), public.blog_can_read_editorial() to authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array['blog_authors','blog_categories','blog_tags','blog_posts','blog_post_tags'] loop
    execute format('drop policy if exists %I on public.%I', t || '_all_admin', t);
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon, authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.blog_can_read_editorial()))', t || '_select_editorial', t);
  end loop;
end $$;
comment on function public.blog_is_admin() is 'Server-owned current RBAC authority. Never trusts mutable JWT user_metadata. Shared legacy policies remain owner-only.';
