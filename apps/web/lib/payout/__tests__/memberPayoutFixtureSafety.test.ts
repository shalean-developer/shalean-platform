import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertStagingTarget } from '../../../../../scripts/audits/member-payout-fixture';
afterEach(() => vi.unstubAllEnvs());
describe('member payout fixture target guard', () => {
 it('requires staging', () => {
  vi.stubEnv('SHALEAN_APP_ENV','production');
  expect(() => assertStagingTarget('postgres://postgres@db.uwvnmluiqbczeduzjgse.supabase.co/postgres')).toThrow();
 });
 it.each(['postgres://postgres@db.paqjwfulwywtsyyvdxrq.supabase.co/postgres','postgres://postgres@localhost/postgres','postgres://postgres@db.uwvnmluiqbczeduzjgse.supabase.co.attacker.test/postgres','https://postgres@db.uwvnmluiqbczeduzjgse.supabase.co/postgres'])('rejects unapproved target %s', url => {
  vi.stubEnv('SHALEAN_APP_ENV','staging'); expect(() => assertStagingTarget(url)).toThrow();
 });
 it('allows exact staging identity', () => {
  vi.stubEnv('SHALEAN_APP_ENV','staging'); expect(() => assertStagingTarget('postgres://postgres@db.uwvnmluiqbczeduzjgse.supabase.co/postgres')).not.toThrow();
 });
});
