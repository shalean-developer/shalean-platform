import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20261020190530_blog_scheduler_isolated_vault_target.sql"), "utf8");
const command = "select blog_security.invoke_publish_blog_posts();";
let db: PGlite;
let unrelatedJobs: unknown[];
let sharedTarget: unknown[];
let queueAcl: unknown[];

async function configure(base = "https://pricing-test.shalean.co.za", secret = "isolated-blog-test-secret") {
  await db.query("insert into vault.decrypted_secrets(name,decrypted_secret) values ('blog_scheduler_base_url',$1),('blog_scheduler_cron_secret',$2)", [base, secret]);
}
async function readiness() {
  return (await db.query<{ enabled: boolean }>("select public.blog_scheduler_is_enabled() enabled")).rows[0].enabled;
}

beforeAll(async () => {
  db = new PGlite();
  // Replace only external extension boundaries. The reviewed migration itself
  // executes unchanged, including actual PostgreSQL permissions and functions.
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create role migration_owner; create role extension_owner;
    create schema blog_security; create schema cron; create schema vault; create schema net;
    grant usage on schema public, blog_security, net to anon, authenticated, service_role;
    grant usage on schema vault to service_role;
    grant usage on schema cron, vault, net to migration_owner;
    grant create on schema public to migration_owner;
    alter schema blog_security owner to migration_owner;
    create table cron.job(jobid bigint primary key, jobname text, command text,
      active boolean, schedule text, database text default current_database(), username text default current_user);
    insert into cron.job(jobid,jobname,command,active,schedule,username)
      values (1,'publish-blog-posts','select public.invoke_nextjs_cron(''/api/cron/publish-blog-posts'');',true,'*/5 * * * *','migration_owner');
    grant select,update on cron.job to migration_owner;
    insert into cron.job(jobid,jobname,command,active,schedule)
      select n,'unrelated-'||n,'select public.invoke_nextjs_cron(''/api/cron/unrelated-'||n||''');',true,'*/10 * * * *'
      from generate_series(2,10) n;
    create table public.cron_http_targets(singleton boolean,app_base_url text,cron_secret text);
    insert into public.cron_http_targets values(true,'https://unrelated.example','unrelated-test-secret');
    create table vault.decrypted_secrets(name text unique,decrypted_secret text);
    grant select on vault.decrypted_secrets to service_role,migration_owner;
    create table net.http_request_queue(id bigint generated always as identity,url text,headers jsonb,body jsonb,timeout_milliseconds integer);
    alter table net.http_request_queue owner to extension_owner;
    grant all on net.http_request_queue to public;
    create function cron.alter_job(job_id bigint,schedule text default null,command text default null,
      database text default null,username text default null,active boolean default null)
      returns void language plpgsql as $$ begin
        update cron.job j set command=coalesce(alter_job.command,j.command),active=coalesce(alter_job.active,j.active)
        where j.jobid=job_id;
      end $$;
    create function net.http_post(url text,body jsonb default '{}',params jsonb default '{}',
      headers jsonb default '{}',timeout_milliseconds integer default 5000)
      returns bigint language plpgsql as $$ declare request_id bigint; begin
        insert into net.http_request_queue(url,headers,body,timeout_milliseconds)
          values(http_post.url,http_post.headers,http_post.body,http_post.timeout_milliseconds)
          returning id into request_id;
        return request_id;
      end $$;
    create function public.blog_scheduler_is_enabled() returns boolean language sql security definer as $$ select true $$;
    alter function public.blog_scheduler_is_enabled() owner to migration_owner;
  `);
  unrelatedJobs = (await db.query("select * from cron.job where jobid<>1 order by jobid")).rows;
  sharedTarget = (await db.query("select * from public.cron_http_targets")).rows;
  queueAcl = (await db.query("select relacl::text from pg_class where oid='net.http_request_queue'::regclass")).rows;
  await db.exec("set role migration_owner");
  expect((await db.query<{ can_grant: boolean }>("select has_table_privilege(current_user,'net.http_request_queue','SELECT WITH GRANT OPTION') can_grant")).rows[0].can_grant).toBe(false);
  await db.exec(sql);
  await db.exec("reset role");
}, 30000);
beforeEach(async () => {
  await db.exec("reset role; truncate vault.decrypted_secrets,net.http_request_queue;");
  await db.query("update cron.job set active=false,command=$1 where jobid=1", [command]);
});
afterAll(async () => { await db?.close(); });

describe("isolated blog scheduler configuration", () => {
  it("preserves all unrelated job settings and the shared credential target", async () => {
    expect((await db.query("select * from cron.job where jobid<>1 order by jobid")).rows).toEqual(unrelatedJobs);
    expect((await db.query("select * from public.cron_http_targets")).rows).toEqual(sharedTarget);
    expect((await db.query("select active,command from cron.job where jobid=1")).rows).toEqual([{ active: false, command }]);
  });
  it("preserves the platform-owned request queue grants", async () => {
    expect((await db.query("select relacl::text from pg_class where oid='net.http_request_queue'::regclass")).rows).toEqual(queueAcl);
  });
  it("keeps scheduling paused until both protected settings and the correct job are active", async () => {
    expect(await readiness()).toBe(false);
    await configure();
    expect(await readiness()).toBe(false);
    await db.exec("update cron.job set active=true where jobid=1");
    expect(await readiness()).toBe(true);
    await db.exec("update cron.job set command='select 1' where jobid=1");
    expect(await readiness()).toBe(false);
  });
  it("fails closed with missing credentials without queuing a request", async () => {
    await expect(db.query("select blog_security.invoke_publish_blog_posts()")).rejects.toThrow("protected configuration is missing or invalid");
    expect((await db.query("select * from net.http_request_queue")).rows).toHaveLength(0);
  });
  it.each(["https://attacker.example", "http://shalean.co.za", "https://shalean.co.za/other", "https://shalean.co.za.attacker.example"])("rejects an unapproved target %s", async base => {
    await configure(base);
    await db.exec("update cron.job set active=true where jobid=1");
    expect(await readiness()).toBe(false);
    await expect(db.query("select blog_security.invoke_publish_blog_posts()")).rejects.toThrow("protected configuration is missing or invalid");
    expect((await db.query("select * from net.http_request_queue")).rows).toHaveLength(0);
  });
  it.each(["", "   ", "test\nheader"])("rejects empty or multiline credentials", async secret => {
    await configure("https://pricing-test.shalean.co.za", secret);
    await db.exec("update cron.job set active=true where jobid=1");
    expect(await readiness()).toBe(false);
    await expect(db.query("select blog_security.invoke_publish_blog_posts()")).rejects.toThrow("protected configuration is missing or invalid");
  });
  it.each(["https://pricing-test.shalean.co.za", "https://shalean.co.za/"])("queues only the fixed blog endpoint for %s and returns an ID", async base => {
    await configure(base);
    const result = await db.query<{ request_id: number }>("select blog_security.invoke_publish_blog_posts() request_id");
    expect(Object.keys(result.rows[0])).toEqual(["request_id"]);
    expect(Number(result.rows[0].request_id)).toBeGreaterThan(0);
    const sent = (await db.query<{ url: string; headers: Record<string, string>; body: object; timeout_milliseconds: number }>("select url,headers,body,timeout_milliseconds from net.http_request_queue")).rows[0];
    expect(sent).toEqual({ url: `${base.replace(/\/$/, "")}/api/cron/publish-blog-posts`, headers: { "Content-Type": "application/json", Authorization: "Bearer isolated-blog-test-secret" }, body: {}, timeout_milliseconds: 60000 });
  });
  it.each(["anon", "authenticated", "service_role"])("denies %s direct execution of the private invoker", async role => {
    await configure();
    await db.exec(`set role ${role}`);
    await expect(db.query("select blog_security.invoke_publish_blog_posts()")).rejects.toThrow(/permission denied/);
    if (role !== "service_role") await expect(db.query("select * from vault.decrypted_secrets")).rejects.toThrow(/permission denied/);
  });
  it("retains the existing server role's queue access", async () => {
    await configure();
    await db.query("select blog_security.invoke_publish_blog_posts()");
    await db.exec("set role service_role");
    expect((await db.query("select id from net.http_request_queue")).rows).toHaveLength(1);
  });
  it.each(["anon", "authenticated"])("retains normal %s HTTP enqueueing and request-ID returns", async role => {
    await db.exec(`set role ${role}`);
    const queued = await db.query<{ id: number }>("select net.http_post(url := 'https://example.com', body := '{}'::jsonb) id");
    expect(Number(queued.rows[0].id)).toBeGreaterThan(0);
  });
  it.each(["anon", "authenticated"])("denies %s the readiness RPC", async role => {
    await db.exec(`set role ${role}`);
    await expect(readiness()).rejects.toThrow(/permission denied/);
  });
  it("allows the server role only the readiness boolean", async () => {
    await configure();
    await db.exec("update cron.job set active=true where jobid=1; set role service_role");
    expect(await readiness()).toBe(true);
  });
});
