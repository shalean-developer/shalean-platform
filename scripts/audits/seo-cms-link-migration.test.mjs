// Isolated PostgreSQL only; never connects to a remote database.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildApplySql, migrationUrl, version, name } from './seo-cms-migration-apply.mjs';

const { PGlite } = await import(process.env.AUDIT_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const source = JSON.parse(await readFile(new URL('./fixtures/seo-unpublished-link-source.json', import.meta.url), 'utf8'));
const migration = await readFile(migrationUrl, 'utf8');
const apply = buildApplySql(migration);
const sourceSlug = 'cleaning-mistakes-cape-town-homeowners';
const targetSlug = 'remove-kitchen-grease-without-damaging-surfaces';
const beforeHash = '67c205926d0be799d7d31e92d888005f';
const afterHash = 'bde0cf46162b57b84b221cd066e29f52';
const removedLink = source.blocks[3].links[4];
let checks = 0;

async function snapshot() {
  return (await db.query(`select
    (select jsonb_agg(to_jsonb(b) order by slug) from blog_posts b) as articles,
    (select jsonb_agg(to_jsonb(m) order by version) from supabase_migrations.schema_migrations m) as ledger`)).rows[0];
}
async function reset({ content = source, sourceStatus = 'published', targetStatus = 'draft', missingSource = false, missingTarget = false } = {}) {
  await db.exec('truncate blog_posts, supabase_migrations.schema_migrations;');
  await db.exec(`insert into supabase_migrations.schema_migrations values ('20260101000000','historical_sentinel',array['select 1;']);`);
  if (!missingSource) await db.query('insert into blog_posts values ($1,$2,$3,$4,$5,$6,$7)',
    [sourceSlug, sourceStatus, content, 'Original title', 'Original excerpt', `/blog/${sourceSlug}`, '2026-08-05T10:05:03Z']);
  if (!missingTarget) await db.query('insert into blog_posts values ($1,$2,$3,$4,$5,$6,$7)',
    [targetSlug, targetStatus, { blocks: [{ type: 'paragraph', text: 'Unpublished draft fixture' }] }, 'Draft title', 'Draft excerpt', `/blog/${targetSlug}`, '2026-08-05T10:05:03Z']);
  await db.query('insert into blog_posts values ($1,$2,$3,$4,$5,$6,$7)',
    ['unrelated-article', 'published', { blocks: [] }, 'Other title', 'Other excerpt', '/blog/unrelated-article', '2026-08-05T10:05:03Z']);
}
async function expectFailure(options, pattern) {
  await reset(options);
  const before = await snapshot();
  await assert.rejects(db.exec(apply), pattern);
  await db.exec('rollback;');
  assert.deepEqual(await snapshot(), before, 'Rejected correction must change neither articles nor ledger');
  checks++;
}

try {
  await db.exec(`
    create table blog_posts (slug text primary key, status text, content_json jsonb,
      title text, excerpt text, canonical_url text, updated_at timestamptz);
    create function blog_touch_updated_at() returns trigger language plpgsql as $$
      begin new.updated_at = now(); return new; end; $$;
    create trigger trg_blog_posts_updated_at before update on blog_posts
      for each row execute function blog_touch_updated_at();
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations (version text primary key, name text, statements text[]);
  `);
  await reset();
  assert.equal((await db.query('select md5($1::jsonb::text) as hash', [source])).rows[0].hash, beforeHash);
  const before = await snapshot();
  await db.exec(apply.replace(/\nCOMMIT;\n$/, '\nROLLBACK;\n'));
  assert.deepEqual(await snapshot(), before, 'Rehearsal rolls back article and migration receipt');
  checks++;

  await db.exec(apply);
  const after = await snapshot();
  const expected = structuredClone(before);
  const changed = expected.articles.find(a => a.slug === sourceSlug);
  changed.content_json.blocks[3].links.splice(4, 1);
  changed.updated_at = after.articles.find(a => a.slug === sourceSlug).updated_at;
  assert.deepEqual(after.articles, expected.articles, 'Only the one link and normal updated_at trigger may change');
  assert.notEqual(changed.updated_at, before.articles.find(a => a.slug === sourceSlug).updated_at);
  assert.equal((await db.query('select md5(content_json::text) as hash from blog_posts where slug=$1', [sourceSlug])).rows[0].hash, afterHash);
  assert.deepEqual(after.ledger.find(m => m.version === version), { version, name, statements: [migration] });
  assert.deepEqual(after.ledger.find(m => m.version !== version), before.ledger[0]);
  checks++;

  await db.exec(apply);
  assert.deepEqual(await snapshot(), after, 'Applying the same tracked migration twice is a no-op');
  await db.exec(migration);
  assert.deepEqual(await snapshot(), after, 'The forward migration itself is idempotent');
  checks++;

  await db.query(`update blog_posts set content_json=jsonb_insert(content_json,'{blocks,3,links,4}',$1::jsonb)
    where slug=$2 and md5(content_json::text)=$3`, [removedLink, sourceSlug, afterHash]);
  assert.equal((await db.query('select md5(content_json::text) as hash from blog_posts where slug=$1', [sourceSlug])).rows[0].hash, beforeHash);
  checks++;

  await reset({ missingSource: true });
  const absent = await snapshot();
  await db.exec(apply);
  assert.deepEqual((await snapshot()).articles, absent.articles);
  assert.equal((await snapshot()).ledger.length, 2, 'Absent staging content still records the forward migration');
  checks++;

  const stale = structuredClone(source);
  stale.blocks[3].links[0].label += ' editorial revision';
  await expectFailure({ content: stale }, /SEO source changed/);
  await expectFailure({ content: null }, /SEO source changed/);
  await expectFailure({ sourceStatus: 'draft' }, /SEO source is no longer published/);
  await expectFailure({ targetStatus: 'published' }, /SEO destination is no longer the reviewed draft/);
  await expectFailure({ missingTarget: true }, /SEO destination is no longer the reviewed draft/);

  await reset();
  await db.query('insert into supabase_migrations.schema_migrations values ($1,$2,$3)', [version, name, ['different SQL']]);
  const conflict = await snapshot();
  await assert.rejects(db.exec(apply), /SEO migration receipt differs/);
  await db.exec('rollback;');
  assert.deepEqual(await snapshot(), conflict, 'Do not rewrite a conflicting migration receipt');
  checks++;

  console.log(`SEO CMS forward migration: ${checks} isolated PostgreSQL checks passed.`);
} finally {
  await db.close();
}
