alter table public.blog_posts add column scheduled_by uuid references auth.users(id);
alter table public.blog_posts add column last_schedule_error text;

-- BLOG-AUDIT-05/06/09: revision-checked, idempotent, all-or-nothing saves.
create table public.blog_editor_save_receipts (
  actor_id uuid not null references auth.users(id), request_id uuid not null,
  payload_hash text not null, response jsonb not null, created_at timestamptz not null default now(),
  primary key (actor_id, request_id)
);
create table public.blog_post_revisions (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.blog_posts(id), actor_id uuid not null references auth.users(id),
  snapshot jsonb not null, tag_ids uuid[] not null, created_at timestamptz not null default now()
);
create index blog_post_revisions_post_idx on public.blog_post_revisions(post_id, id desc);
alter table public.blog_editor_save_receipts enable row level security;
alter table public.blog_post_revisions enable row level security;
revoke all on public.blog_editor_save_receipts, public.blog_post_revisions from public, anon, authenticated;
grant all on public.blog_editor_save_receipts, public.blog_post_revisions to service_role;
grant usage, select on sequence public.blog_post_revisions_id_seq to service_role;

create function public.blog_save_post(
  p_actor_id uuid, p_request_id uuid, p_payload_hash text, p_row jsonb,
  p_post_id uuid default null, p_expected_updated_at timestamptz default null, p_tag_ids uuid[] default null
) returns jsonb language plpgsql security invoker set search_path = pg_catalog as $$
declare
  v_old public.blog_posts; v_next public.blog_posts; v_tags uuid[];
  v_receipt public.blog_editor_save_receipts; v_response jsonb; v_permission text;
begin
  if p_actor_id is null or p_request_id is null or nullif(p_payload_hash,'') is null then
    raise exception 'blog_save_identity_required';
  end if;
  -- A retry may arrive after a client timeout. Serialize that exact request.
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text || p_request_id::text, 0));
  select * into v_receipt from public.blog_editor_save_receipts where actor_id=p_actor_id and request_id=p_request_id;
  if found then
    if v_receipt.payload_hash <> p_payload_hash then raise exception 'blog_request_reused'; end if;
    return v_receipt.response;
  end if;
  if p_post_id is not null then
    select * into v_old from public.blog_posts where id=p_post_id for update;
    if not found then raise exception 'blog_post_not_found'; end if;
    if p_expected_updated_at is null or v_old.updated_at <> p_expected_updated_at then
      raise exception 'blog_revision_conflict';
    end if;
    -- Keep published URLs stable. A governed redirect change is a separate operation.
    if p_row->>'slug' is distinct from v_old.slug and (
      v_old.status <> 'draft' or v_old.published_at is not null or exists (
        select 1 from public.blog_post_revisions where post_id=p_post_id and snapshot->>'status' <> 'draft'
      )
    ) then raise exception 'blog_published_slug_locked'; end if;
  end if;
  v_permission := case when p_row->>'status' <> 'draft' or (p_post_id is not null and v_old.status <> 'draft')
    then 'content.publish' else 'content.draft' end;
  if not public.admin_has_permission(p_actor_id, v_permission, null, null, now()) then
    raise exception 'blog_permission_denied' using errcode='42501';
  end if;
  if p_post_id is null then
    v_next := jsonb_populate_record(null::public.blog_posts, p_row);
    v_next.id := gen_random_uuid(); v_next.created_at := clock_timestamp(); v_next.updated_at := v_next.created_at;
    insert into public.blog_posts select v_next.*;
  else
    select coalesce(array_agg(tag_id order by tag_id), '{}'::uuid[]) into v_tags from public.blog_post_tags where post_id=p_post_id;
    insert into public.blog_post_revisions(post_id,actor_id,snapshot,tag_ids) values(p_post_id,p_actor_id,to_jsonb(v_old),v_tags);
    v_next := jsonb_populate_record(v_old, p_row);
    update public.blog_posts set
    slug = v_next.slug,
    title = v_next.title,
    h1 = v_next.h1,
    excerpt = v_next.excerpt,
    status = v_next.status,
    source = v_next.source,
    content_json = v_next.content_json,
    meta_title = v_next.meta_title,
    meta_description = v_next.meta_description,
    canonical_url = v_next.canonical_url,
    featured_image_url = v_next.featured_image_url,
    featured_image_alt = v_next.featured_image_alt,
    category_id = v_next.category_id,
    reading_time_minutes = v_next.reading_time_minutes,
    published_at = v_next.published_at,
    noindex = v_next.noindex,
    primary_keyword = v_next.primary_keyword,
    secondary_keywords = v_next.secondary_keywords,
    search_intent = v_next.search_intent,
    seo_internal_link_context = v_next.seo_internal_link_context,
    semantic_cluster = v_next.semantic_cluster,
    related_guide_override_slugs = v_next.related_guide_override_slugs,
    scheduled_by = v_next.scheduled_by, last_schedule_error = v_next.last_schedule_error,
    updated_at = clock_timestamp()
    where id=p_post_id returning * into v_next;
  end if;
  if p_tag_ids is not null then
    delete from public.blog_post_tags where post_id=v_next.id;
    insert into public.blog_post_tags(post_id,tag_id) select v_next.id, x from (select distinct unnest(p_tag_ids) x) tags;
  end if;
  select coalesce(array_agg(tag_id order by tag_id), '{}'::uuid[]) into v_tags from public.blog_post_tags where post_id=v_next.id;
  v_response := jsonb_build_object('post',to_jsonb(v_next) || jsonb_build_object('tag_ids',to_jsonb(v_tags)),
    'receipt',jsonb_build_object('request_id',p_request_id,'saved_at',v_next.updated_at));
  insert into public.blog_editor_save_receipts(actor_id,request_id,payload_hash,response) values(p_actor_id,p_request_id,p_payload_hash,v_response);
  return v_response;
end $$;
revoke all on function public.blog_save_post(uuid,uuid,text,jsonb,uuid,timestamptz,uuid[]) from public, anon, authenticated;
grant execute on function public.blog_save_post(uuid,uuid,text,jsonb,uuid,timestamptz,uuid[]) to service_role;
