import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTarget, fixturePlan, applyFixture, retireFixture, ids, TAG } from './paired-ui-fixture.mjs';
const ref = 'aaaaaaaaaaaaaaaaaaaa';
const env = { SHALEAN_APP_ENV: 'staging', AUDIT_STAGING_REF: ref, SUPABASE_PROD_REF: 'bbbbbbbbbbbbbbbbbbbb', NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co` };
const health = { deployment: 'staging', shaleanAppEnv: 'staging', supabase: { configuredRef: ref, expectedRef: ref }, paystack: { secretMode: 'test', publicMode: 'test' }, messaging: { outboundDisabled: true }, issues: [] };
test('reject production, wrong database, live payments and enabled messaging', () => {
  assertTarget(env, health);
  for (const changed of [{ deployment: 'production' }, { supabase: { configuredRef: env.SUPABASE_PROD_REF, expectedRef: ref } }, { paystack: { secretMode: 'live', publicMode: 'test' } }, { messaging: { outboundDisabled: false } }, { issues: ['unsafe'] }]) assert.throws(() => assertTarget(env, { ...health, ...changed }));
});
test('paired plan uses Johannesburg date and allocates R250 per cleaner without real payment', () => {
  const plan = fixturePlan(new Date('2026-10-15T22:30:00Z'));
  assert.equal(plan.date, '2026-10-16');
  assert.equal(plan.is_team_job, false);
  assert.equal(plan.amount_paid_cents, 0);
  assert.equal(plan.payment_status, 'pending');
  assert.equal(plan.payout_status, 'pending');
  assert.deepEqual(plan.earnings_summary.per_cleaner_earnings.map(r => r.total_cents), [25000, 25000]);
  assert.equal(plan.earnings_summary.total_cleaner_earnings_cents, 50000);
  assert.throws(() => fixturePlan(new Date('2026-09-30T12:00:00Z')));
});
function client(answer) {
  const writes = [];
  return { writes, from(table) {
    let operation = 'select';
    const q = { select() { return q; }, eq() { return q; }, or() { return q; }, single() { return q; },
      insert(value) { operation = 'insert'; writes.push({ table, value }); return q; },
      update(value) { operation = 'update'; writes.push({ table, value }); return q; },
      then(resolve, reject) { return Promise.resolve(answer(table, operation)).then(resolve, reject); },
    }; return q;
  } };
}
test('database lookup failures stop before any identity or data writes', async () => {
  const c = client(() => ({ error: { message: 'private payload' } }));
  await assert.rejects(applyFixture(c, fixturePlan()), /Booking preflight failed/);
  assert.deepEqual(c.writes, []);
});
test('existing booking collision fails closed without overwriting it', async () => {
  const c = client(() => ({ data: [{ id: ids.booking }] }));
  await assert.rejects(applyFixture(c, fixturePlan()), /already exists or collides/);
  assert.deepEqual(c.writes, []);
});
const booking = { id: ids.booking, metadata: { audit_fixture: TAG }, paystack_reference: TAG, payout_status: 'pending', payout_id: null, payout_run_id: null, payout_paid_at: null };
test('retirement blocks settled booking or locked member evidence before mutation', async () => {
  for (const change of [{ payout_id: 'linked' }, { payout_run_id: 'run' }, { payout_paid_at: '2026-10-15' }, { payout_status: 'paid' }, { metadata: {} }]) {
    const c = client(() => ({ data: { ...booking, ...change } }));
    await assert.rejects(retireFixture(c)); assert.deepEqual(c.writes, []);
  }
  const c = client(t => ({ data: t === 'bookings' ? booking : [{ status: 'approved', cleaner_payout_id: null }] }));
  await assert.rejects(retireFixture(c), /Locked member/); assert.deepEqual(c.writes, []);
});
test('retirement preserves history and only excludes the owned fixture from reports', async () => {
  const c = client(t => ({ data: t === 'bookings' ? booking : [] }));
  assert.equal((await retireFixture(c)).historyRetained, true);
  assert.deepEqual(c.writes, [{ table: 'bookings', value: { is_test: true } }]);
});
test('fixture respects live assigned-status and unpaid earnings-cap SQL constraints', async () => {
  const { PGlite } = await import(process.env.AUDIT_PGLITE_MODULE ?? '@electric-sql/pglite');
  const db = new PGlite();
  try {
    // Exact relevant predicates read from staging pg_constraint, not relaxed fixture rules.
    await db.exec(`create table bookings(status text,cleaner_id uuid,selected_cleaner_id uuid,
      cleaner_payout_cents integer,cleaner_bonus_cents integer,billing_type text,
      is_monthly_billing_booking boolean,payment_status text,monthly_invoice_id uuid,
      total_paid_cents integer,total_paid_zar numeric,amount_paid_cents integer,base_amount_cents integer,
      check(not(((cleaner_id is not null) or (selected_cleaner_id is not null)) and lower(trim(coalesce(status,'')))='pending')),
      check(cleaner_payout_cents is null or coalesce(cleaner_payout_cents,0)+coalesce(cleaner_bonus_cents,0) <=
        case when lower(trim(coalesce(billing_type,''))) in ('recurring_invoice','monthly_contract','pay_later') or coalesce(is_monthly_billing_booking,false) or lower(trim(coalesce(payment_status,'')))='pending_monthly' or monthly_invoice_id is not null
        then coalesce(total_paid_cents,case when total_paid_zar>0 then round(total_paid_zar*100)::bigint end,nullif(amount_paid_cents,0),0)
        else case when lower(trim(coalesce(payment_status,'')))='success' then greatest(coalesce(total_paid_cents,amount_paid_cents,case when total_paid_zar>0 then round(total_paid_zar*100)::bigint end,0),coalesce(base_amount_cents,0))
        else coalesce(total_paid_cents,amount_paid_cents,case when total_paid_zar>0 then round(total_paid_zar*100)::bigint end,0) end end));`);
    const p = fixturePlan();
    const insert = (status, billing) => db.query('insert into bookings(status,cleaner_id,cleaner_payout_cents,cleaner_bonus_cents,billing_type,payment_status,total_paid_zar,amount_paid_cents) values ($1,$2,$3,$4,$5,$6,$7,$8)', [status,p.cleaner_id,p.cleaner_payout_cents,0,billing,p.payment_status,p.total_paid_zar,p.amount_paid_cents]);
    await insert('assigned',p.billing_type); await insert('completed',p.billing_type);
    await assert.rejects(insert('pending',p.billing_type), e => e.code === '23514');
    await assert.rejects(insert('assigned','prepaid'), e => e.code === '23514');
  } finally { await db.close(); }
});
