import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertPreviewSeedTarget, buildPreviewSoloSeedPlan } from './office-preview-solo-fixture.mjs';

const ref = 'aaaaaaaaaaaaaaaaaaaa';
const sha = '1'.repeat(40);
const env = {
  SHALEAN_APP_ENV: 'staging', AUDIT_STAGING_REF: ref,
  SUPABASE_PROD_REF: 'bbbbbbbbbbbbbbbbbbbb',
  NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
  NEXT_PUBLIC_SITE_URL: 'https://staging.example.com',
  SEED_ALLOWED_PROJECT_REFS: ref, AUDIT_EXPECTED_RELEASE_SHA: sha,
};
const health = () => ({ status: 'ok', deployment: 'staging', shaleanAppEnv: 'staging',
  releaseSha: sha, timestamp: new Date().toISOString(), issues: [],
  supabase: { configuredRef: ref, expectedRef: ref },
  paystack: { secretMode: 'test', publicMode: 'test' }, messaging: { outboundDisabled: true },
});
const fetchImpl = async () => ({ ok: true, json: async () => health() });

test('target guard rejects production, wrong refs, live payments and messaging', () => {
  assertPreviewSeedTarget(env, health());
  for (const change of [
    { SHALEAN_APP_ENV: 'production' }, { SUPABASE_PROD_REF: ref },
    { NEXT_PUBLIC_SUPABASE_URL: 'https://wrong.supabase.co' },
    { SEED_ALLOWED_PROJECT_REFS: '' }, { SEED_ALLOWED_PROJECT_REFS: 'cccccccccccccccccccc' },
    { AUDIT_EXPECTED_RELEASE_SHA: '' }, { AUDIT_EXPECTED_RELEASE_SHA: '2'.repeat(40) },
  ]) assert.throws(() => assertPreviewSeedTarget({ ...env, ...change }, health()));
  for (const change of [
    { status: 'degraded' }, { deployment: 'production' }, { shaleanAppEnv: 'production' },
    { supabase: { configuredRef: env.SUPABASE_PROD_REF, expectedRef: ref } },
    { paystack: { secretMode: 'live', publicMode: 'test' } },
    { paystack: { secretMode: 'test', publicMode: 'live' } },
    { messaging: { outboundDisabled: false } }, { issues: ['unsafe'] },
    { timestamp: 'invalid' }, { timestamp: new Date(Date.now() - 121000).toISOString() },
  ]) assert.throws(() => assertPreviewSeedTarget(env, { ...health(), ...change }));
});

test('health is fetched fresh and errors fail before emitting a plan', async () => {
  const p = await buildPreviewSoloSeedPlan(env, 'r252', { fetchImpl: async (url, options) => {
    assert.equal(url.origin, env.NEXT_PUBLIC_SITE_URL);
    assert.equal(url.pathname, '/api/health/environment');
    assert.equal(options.cache, 'no-store');
    return { ok: true, json: async () => health() };
  } });
  assert.equal(p.projectRef, ref);
  await assert.rejects(buildPreviewSoloSeedPlan(env, 'r252', { fetchImpl: async () => ({ ok: false }) }));
  await assert.rejects(buildPreviewSoloSeedPlan(env, 'unknown', { fetchImpl }));
  await assert.rejects(buildPreviewSoloSeedPlan({ ...env, NEXT_PUBLIC_SITE_URL: 'http://example.com' }, 'r252', { fetchImpl }));
});

test('rollback plans are disjoint, synthetic and do not allocate customer identities or references', async () => {
  const a = await buildPreviewSoloSeedPlan(env, 'r252', { fetchImpl });
  const b = await buildPreviewSoloSeedPlan(env, 'r280', { fetchImpl });
  for (const [p, namespace, reference, cents, basis] of [
    [a, '96310000', 'AUDIT963-R252', '25200', '36000'],
    [b, '96320000', 'AUDIT963-R280', '28000', '40000'],
  ]) {
    assert.equal(p.phase, 'rollback-rehearsal');
    assert(p.sql.includes('\nROLLBACK;\nSELECT jsonb_build_object('));
    assert(p.sql.includes(namespace));
    assert(p.sql.includes(reference));
    assert(p.sql.includes(`display_earnings_cents=${cents}`));
    assert(p.sql.includes(`total_price_cents=${basis}`));
    assert(p.sql.includes("AND customer_email IS NULL AND customer_phone IS NULL"));
    assert(p.sql.includes('crm_customer_id=v_crm'));
    assert(p.sql.includes("'reference_sequence'"));
    assert(p.sql.includes("'customers'"));
    assert(p.sql.includes("'customer_identity_aliases'"));
    assert(p.sql.includes('v_before IS DISTINCT FROM v_after'));
    assert(!/\b(?:DELETE|TRUNCATE|UPDATE|nextval|setval)\b/i.test(p.sql));
  }
  assert(!a.sql.includes('96320000'));
  assert(!b.sql.includes('96310000'));
  assert.notEqual(a.rehearsalBinding, b.rehearsalBinding);
});

test('apply requires a fresh successful executor receipt for the exact scenario, target, release and SQL', async () => {
  const rehearsal = await buildPreviewSoloSeedPlan(env, 'r252', { fetchImpl });
  await assert.rejects(buildPreviewSoloSeedPlan(env, 'r252', { apply: true, fetchImpl }));
  // Copying metadata from a plan cannot replace an execution result.
  await assert.rejects(buildPreviewSoloSeedPlan({ ...env,
    AUDIT_PREVIEW_REHEARSAL_BINDING: rehearsal.rehearsalBinding }, 'r252', { apply: true, fetchImpl }));
  const dir = await mkdtemp(join(tmpdir(), 'audit963-'));
  try {
    const path = join(dir, 'receipt.json');
    const boundEnv = { ...env, AUDIT_PREVIEW_REHEARSAL_RECEIPT_PATH: path };
    const attestation = { phase: 'rollback-rehearsal', project_ref: ref, release_sha: sha,
      scenario: 'r252', rehearsal_binding: rehearsal.rehearsalBinding, completed_at: new Date().toISOString() };
    const save = async (data, error = false) => writeFile(path, JSON.stringify({ isError: error,
      content: [{ type: 'text', text: JSON.stringify({ result:
        '\n<untrusted-data-test>\n' + JSON.stringify([{ audit963_execution: data }]) + '\n</untrusted-data-test>' }) }] }));
    await writeFile(path, JSON.stringify(rehearsal));
    await assert.rejects(buildPreviewSoloSeedPlan(boundEnv, 'r252', { apply: true, fetchImpl }));
    await save(attestation);
    const applied = await buildPreviewSoloSeedPlan(boundEnv, 'r252', { apply: true, fetchImpl });
    assert(applied.sql.includes('\nCOMMIT;\nSELECT jsonb_build_object('));
    assert.equal(applied.sql.replace('COMMIT;\n', 'ROLLBACK;\n').replace("'phase','apply'", "'phase','rollback-rehearsal'"), rehearsal.sql);
    assert.notEqual(applied.sqlSha256, rehearsal.sqlSha256);
    await assert.rejects(buildPreviewSoloSeedPlan(boundEnv, 'r280', { apply: true, fetchImpl }));
    assert(!JSON.stringify(applied).includes('SERVICE_ROLE'));
    for (const change of [{ phase: 'apply' }, { scenario: 'r280' },
      { project_ref: env.SUPABASE_PROD_REF }, { release_sha: '2'.repeat(40) },
      { rehearsal_binding: 'invalid' }, { completed_at: new Date(Date.now() - 601000).toISOString() },
    ]) {
      await save({ ...attestation, ...change });
      await assert.rejects(buildPreviewSoloSeedPlan(boundEnv, 'r252', { apply: true, fetchImpl }));
    }
    await save(attestation, true);
    await assert.rejects(buildPreviewSoloSeedPlan(boundEnv, 'r252', { apply: true, fetchImpl }));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('orphan commit flag fails closed in the real root command', () => {
  const result = spawnSync(process.execPath, ['scripts/seed-dev.mjs', '--commit-preview-fixture'],
    { encoding: 'utf8', env: { ...process.env, SHALEAN_APP_ENV: 'staging',
      NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: 'test-not-a-secret' } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Commit preview fixture requires/);
  assert(!result.stdout.includes('Seeding'));
});
