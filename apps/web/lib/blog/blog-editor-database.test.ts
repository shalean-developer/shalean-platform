import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repo = resolve(process.cwd(), "../..");
const read = (name: string) => readFileSync(resolve(repo, "supabase/migrations", name), "utf8");
const owner = "00000000-0000-4000-8000-000000000001";
const author = "00000000-0000-4000-8000-000000000002";
const customer = "00000000-0000-4000-8000-000000000003";
const publisher = "00000000-0000-4000-8000-000000000004";
const unrelated = "00000000-0000-4000-8000-000000000005";
const tag = "00000000-0000-4000-8000-000000000006";
let db: PGlite;
let requestNumber = 100;
const requestId = () => `00000000-0000-4000-8000-${String(++requestNumber).padStart(12,"0")}`;
const row = (slug: string, status = "draft") => ({ slug, title: slug, status, source: "editorial", published_at: status === "draft" ? null : "2026-01-01T00:00:00Z", noindex: false, content_json: { schema_version: 1, blocks: [] } });
async function save(actor: string, data: Record<string,unknown>, id: string | null = null, revision: string | null = null, tags: string[] = [], key = requestId()) {
  await db.exec("reset role; set role service_role");
  return (await db.query<{ result: { post: Record<string,unknown>; receipt: Record<string,unknown> } }>("select public.blog_save_post($1,$2,$3,$4::jsonb,$5,$6,$7::uuid[]) as result", [actor,key,JSON.stringify(data),JSON.stringify(data),id,revision,tags])).rows[0].result;
}
async function identity(id: string | null, metaRole = "admin") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: id, user_metadata: { role: metaRole } })]);
  await db.exec(`set role ${id ? "authenticated" : "anon"}`);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema auth; create table auth.users(id uuid primary key);
    create function public.blog_touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema auth, public to anon, authenticated, service_role;
    create table public.admin_roles(id uuid primary key, is_active boolean default true);
    create table public.admin_permissions(id uuid primary key, code text, is_active boolean default true);
    create table public.admin_role_permissions(role_id uuid, permission_id uuid);
    create table public.admin_user_roles(user_id uuid, role_id uuid, revoked_at timestamptz, starts_at timestamptz default now(), expires_at timestamptz, branch_id uuid, team_id uuid);
    grant select on public.admin_roles, public.admin_permissions, public.admin_role_permissions, public.admin_user_roles to service_role;`);
  const foundation = read("20260803070000_admin_rbac_phase_1_foundation.sql");
  const permissionFn = foundation.match(/create or replace function public\.admin_has_permission\([\s\S]*?\$\$;/i)?.[0];
  if (!permissionFn) throw new Error("RBAC definition missing");
  await db.exec(permissionFn);
  const baseline = read("20260714010000_production_baseline.sql");
  for (const name of ["blog_post_status","blog_post_source"]) {
    const ddl = baseline.match(new RegExp(`CREATE TYPE "?public"?\\."?${name}"? AS ENUM \\([\\s\\S]*?\\);`))?.[0];
    if (!ddl) throw new Error(`Missing ${name}`); await db.exec(ddl);
  }
  for (const name of ["blog_authors","blog_categories","blog_tags","blog_posts","blog_post_tags"]) {
    const ddl = baseline.match(new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?"?public"?\\."?${name}"? \\([\\s\\S]*?\\n\\);`))?.[0];
    if (!ddl) throw new Error(`Missing ${name}`); await db.exec(ddl);
    await db.exec(`alter table public.${name} enable row level security; grant all on public.${name} to anon, authenticated, service_role; create policy ${name}_all_admin on public.${name} using (true) with check (true);`);
  }
  // The baseline carries constraints in a later pg_dump section.
  await db.exec(`alter table public.blog_posts add primary key(id); create unique index on public.blog_posts(slug);
    alter table public.blog_tags add primary key(id); alter table public.blog_post_tags add primary key(post_id,tag_id);
    alter table public.blog_post_tags add foreign key(tag_id) references public.blog_tags(id);
    create policy blog_posts_select_public on public.blog_posts for select using(status='published' and published_at<=now());
    insert into auth.users values ('${owner}'),('${author}'),('${customer}'),('${publisher}'),('${unrelated}');
    insert into public.admin_roles(id) values ('${owner}'),('${author}'),('${publisher}'),('${unrelated}');
    insert into public.admin_permissions(id,code) values ('${owner}','system.settings'),('${author}','content.draft'),('${publisher}','content.publish');
    insert into public.admin_role_permissions values ('${owner}','${owner}'),('${owner}','${author}'),('${owner}','${publisher}'),('${author}','${author}'),('${publisher}','${publisher}');
    insert into public.admin_user_roles(user_id,role_id) values ('${owner}','${owner}'),('${author}','${author}'),('${publisher}','${publisher}'),('${unrelated}','${unrelated}');
    insert into public.blog_tags(id,slug,name) values ('${tag}','fixture','Fixture');`);
  await db.exec(read("20261020155014_blog_cms_permission_boundary.sql"));
  await db.exec(read("20261020155213_blog_atomic_editor_save.sql"));
  await db.exec(read("20261020162025_blog_editor_security_advisor_followup.sql"));
}, 30000);
afterAll(async () => { await db?.close(); });

describe("blog database permission boundary", () => {
  it("rejects forged user metadata and every direct browser write", async () => {
    for (const id of [customer, unrelated, author, publisher, owner]) {
      await identity(id);
      await expect(db.query("insert into public.blog_posts(slug,title) values('forged','Forged')")).rejects.toThrow(/permission denied/);
      expect((await db.query<{ allowed: boolean }>("select blog_security.blog_is_admin() allowed")).rows[0].allowed).toBe(id === owner);
    }
  });
  it("keeps public live reads while hiding drafts and future posts", async () => {
    await save(author,row("private-post"));
    await save(owner,{...row("public-post","published"),published_at:"2026-01-01T00:00:00Z"});
    await save(owner,{...row("future-post","published"),published_at:"2099-01-01T00:00:00Z"});
    await identity(null);
    expect((await db.query<{ slug: string }>("select slug from public.blog_posts")).rows.map(r=>r.slug)).toEqual(["public-post"]);
    await identity(author);
    expect((await db.query("select slug from public.blog_posts")).rows).toHaveLength(3);
    await identity(unrelated);
    expect((await db.query("select slug from public.blog_posts")).rows).toHaveLength(1);
  });
  it("requires publish permission for publishing and editing/unpublishing live content", async () => {
    await expect(save(author,row("not-publisher","published"))).rejects.toThrow("blog_permission_denied");
    await expect(save(customer,row("not-author"))).rejects.toThrow("blog_permission_denied");
    const live=await save(owner,row("live-edit","published"));
    await expect(save(author,row("live-edit"),String(live.post.id),String(live.post.updated_at))).rejects.toThrow("blog_permission_denied");
  });
  it("checks revocation, expiry and scope from the database rather than stale claims", async () => {
    await db.exec(`reset role; update public.admin_user_roles set revoked_at=now() where user_id='${author}'`);
    await identity(author); expect((await db.query<{ allowed: boolean }>("select blog_security.blog_can_read_editorial() allowed")).rows[0].allowed).toBe(false);
    await db.exec(`reset role; update public.admin_user_roles set revoked_at=null,expires_at=now()-interval '1 second' where user_id='${author}'`);
    await expect(save(author,row("expired"))).rejects.toThrow("blog_permission_denied");
    await db.exec(`reset role; update public.admin_user_roles set expires_at=null,branch_id='${tag}' where user_id='${author}'`);
    await expect(save(author,row("scoped"))).rejects.toThrow("blog_permission_denied");
    await db.exec(`reset role; update public.admin_user_roles set branch_id=null where user_id='${author}'`);
  });
});

describe("atomic versioned post saves", () => {
  it("returns the same receipt on retry without creating a second article", async () => {
    const key=requestId(); const data=row("retry-post"); const first=await save(author,data,null,null,[tag],key);
    expect(await save(author,data,null,null,[tag],key)).toEqual(first);
    await expect(save(author,{...data,title:"Changed"},null,null,[tag],key)).rejects.toThrow("blog_request_reused");
  });
  it("rolls back content, status, tags and revisions if a tag insert fails", async () => {
    const original=await save(owner,row("atomic-post"),null,null,[tag]);
    await expect(save(owner,{...row("atomic-post","published"),title:"Must roll back"},String(original.post.id),String(original.post.updated_at),[customer])).rejects.toThrow(/foreign key/);
    await db.exec("reset role");
    const current=(await db.query<{ title:string;status:string }>("select title,status from blog_posts where id=$1",[original.post.id])).rows[0];
    expect(current).toEqual({title:"atomic-post",status:"draft"});
    expect((await db.query("select * from blog_post_revisions where post_id=$1",[original.post.id])).rows).toHaveLength(0);
    expect((await db.query("select * from blog_post_tags where post_id=$1",[original.post.id])).rows).toHaveLength(1);
  });
  it("rejects a stale editor without overwriting the newer article", async () => {
    const original=await save(author,row("concurrent-post"));
    const next=await save(author,{...row("concurrent-post"),title:"Newer edit"},String(original.post.id),String(original.post.updated_at));
    expect(next.post.title).toBe("Newer edit");
    await expect(save(author,{...row("concurrent-post"),title:"Stale edit"},String(original.post.id),String(original.post.updated_at))).rejects.toThrow("blog_revision_conflict");
  });
  it("preserves omitted metadata, order, block IDs and non-prose blocks", async () => {
    const content={schema_version:1,blocks:[{type:"section",id:"stable",title:"First",content:"Body"},{type:"image",url:"/images/one.jpg",alt:"Mid"},{type:"service_area",locations:["Cape Town"]},{type:"paragraph",content:"Last"}]};
    const original=await save(author,{...row("ordered-post"),content_json:content,seo_internal_link_context:{suburb:"Claremont"}});
    const next=await save(author,{...row("ordered-post"),title:"Metadata edit",content_json:content},String(original.post.id),String(original.post.updated_at));
    expect(next.post.content_json).toEqual(content); expect(next.post.seo_internal_link_context).toEqual({suburb:"Claremont"});
  });
  it("locks a published slug even after it has been unpublished", async () => {
    const original=await save(owner,row("stable-public-url","published"));
    await expect(save(owner,row("broken-rename","published"),String(original.post.id),String(original.post.updated_at))).rejects.toThrow("blog_published_slug_locked");
    const draft=await save(owner,row("stable-public-url"),String(original.post.id),String(original.post.updated_at));
    await expect(save(owner,row("broken-rename"),String(draft.post.id),String(draft.post.updated_at))).rejects.toThrow("blog_published_slug_locked");
  });
});
