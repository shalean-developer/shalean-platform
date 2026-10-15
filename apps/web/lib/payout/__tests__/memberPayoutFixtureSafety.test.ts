import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertStagingTarget, isMemberPayoutFixtureEntrypoint, postgresClientExport } from '../../../../../scripts/audits/member-payout-fixture';
const stage = 'abcdefghijklmnopqrst';
const prod = 'zyxwvutsrqponmlkjihg';
const target = `postgres://postgres:fixture@db.${stage}.supabase.co/postgres`;
beforeEach(() => {
 vi.stubEnv('SHALEAN_APP_ENV','staging'); vi.stubEnv('AUDIT_STAGING_REF',stage); vi.stubEnv('SUPABASE_PROD_REF',prod);
});
afterEach(() => vi.unstubAllEnvs());
describe('member payout fixture target guard', () => {
 it('requires staging', () => { vi.stubEnv('SHALEAN_APP_ENV','production'); expect(() => assertStagingTarget(target)).toThrow(); });
 it.each(['AUDIT_STAGING_REF','SUPABASE_PROD_REF'])('requires private %s', key => { vi.stubEnv(key,''); expect(() => assertStagingTarget(target)).toThrow(); });
 it('rejects the production reference as staging', () => { vi.stubEnv('AUDIT_STAGING_REF',prod); expect(() => assertStagingTarget(target)).toThrow(); });
 it.each([`postgres://postgres@db.${prod}.supabase.co/postgres`,'postgres://postgres@localhost/postgres',`postgres://postgres@db.${stage}.supabase.co.attacker.test/postgres`,target.replace('postgres:','https:'),target.replace('/postgres','/other')])('rejects unapproved target %s', url => { expect(() => assertStagingTarget(url)).toThrow(); });
 it.each(['host=db.attacker.test','sslmode=disable','sslmode=no-verify','sslcert=x','user=other','database=other','%68ost=db.attacker.test'])('rejects driver override %s', query => { expect(() => assertStagingTarget(`${target}?${query}`)).toThrow(); });
 it('rejects fragments', () => { expect(() => assertStagingTarget(`${target}#fragment`)).toThrow(); });
 it('returns explicit validated fields with mandatory TLS', () => {
  expect(assertStagingTarget(target)).toEqual({host:`db.${stage}.supabase.co`,user:'postgres',password:'fixture',database:'postgres',port:5432,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
  expect(assertStagingTarget(target)).not.toHaveProperty('connectionString');
 });
 it('allows the configured staging pooler identity', () => { expect(assertStagingTarget(`postgres://postgres.${stage}:fixture@aws-0.pooler.supabase.com:6543/postgres`).port).toBe(6543); });
});

describe('fixture CLI startup', () => {
 it.each(['/repo/scripts/audits/member-payout-fixture.ts', String.raw`C:\Users\info\repo\scripts\audits\member-payout-fixture.ts`, 'member-payout-fixture.ts'])('runs CLI path %s', path => { expect(isMemberPayoutFixtureEntrypoint(path)).toBe(true); });
 it.each([undefined, '/repo/vitest.mjs', '/repo/member-payout-fixture.ts.bak'])('does not run on import %s', path => { expect(isMemberPayoutFixtureEntrypoint(path)).toBe(false); });
});

describe('PostgreSQL driver module compatibility', () => {
 class Client {}
 it('loads ESM named exports', () => { expect(postgresClientExport({ Client })).toBe(Client); });
 it('loads a CommonJS default export', () => { expect(postgresClientExport({ default: { Client } })).toBe(Client); });
 it('rejects missing constructors', () => { expect(() => postgresClientExport({})).toThrow('constructor export'); });
});
