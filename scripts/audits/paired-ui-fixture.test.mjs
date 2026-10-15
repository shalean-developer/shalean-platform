import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTarget, fixturePlan, applyFixture, retireFixture, runPairedUiSeed, ids, TAG, lockedFixture } from './paired-ui-fixture.mjs';
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
  await assert.rejects(applyFixture(c, fixturePlan()), /Booking collision/);
  assert.deepEqual(c.writes, []);
});
const booking = { id: ids.booking, metadata: { audit_fixture: TAG }, paystack_reference: TAG, payout_status: 'pending', payout_id: null, payout_run_id: null, payout_paid_at: null, payment_status: 'pending', amount_paid_cents: 0 };
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
test('new cleaner inserts leave payment ID allocation to the database', async () => {
  const c = client((table, operation) => {
    if (table === 'bookings' && operation === 'select') return { data: [] };
    if (operation === 'select') return { data: [] };
    if (table === 'cleaners' && operation === 'insert') return { data: null };
    return { error: { message: 'stop after cleaner creation' } };
  });
  c.auth = { admin: {
    listUsers: async () => ({ data: { users: [] } }),
    createUser: async () => ({ data: { user: { id: '95110000-0000-4000-8000-000000000099' } } }),
  } };
  await assert.rejects(applyFixture(c, fixturePlan()));
  const cleaners = c.writes.filter(w => w.table === 'cleaners');
  assert.equal(cleaners.length, 2);
  assert(cleaners.every(w => !Object.hasOwn(w.value, 'payment_id')));
});
function resumableClient(initial, fixture = { ids, TAG }) {
  const { ids: fixtureIds, TAG: fixtureTag } = fixture;
  const ids = fixtureIds; const TAG = fixtureTag;
  const namespace = TAG.includes("956") ? "956" : "951";
  const state = { bookings: [initial], booking_cleaners: [{ booking_id: ids.booking, cleaner_id: ids.lead, role: 'lead' }], booking_roster_member_payouts: [], team_job_member_payouts: [], cleaner_earnings: [], recurring_bookings: [],
    cleaners: [ids.lead,ids.member].map((id,i) => ({ id, email: `audit${namespace}.${i ? 'member':'lead'}@example.com`, auth_user_id: id })) };
  let failTable = '';
  const writes = [];
  const admin = { state, writes, fail(table) { failTable=table; }, auth: { admin: { listUsers: async () => ({ data: { users: [...state.cleaners.map(c => ({id:c.auth_user_id,email:c.email,app_metadata:{audit_fixture:TAG,is_test:true,role:'cleaner'}})), {id:'95610000-0000-4000-8000-000000000099',email:`audit${namespace}.customer@example.com`,app_metadata:{audit_fixture:TAG,is_test:true,role:'customer'}}] } }) } },
    from(table) {
      let operation='select', value, filter, single=false;
      const q={ select(){return q;}, or(){return q;}, eq(key,v){filter=[key,v];return q;}, single(){single=true;return q;},
        insert(v){operation='insert';value=v;return q;},update(v){operation='update';value=v;return q;},
        then(resolve,reject){return Promise.resolve().then(()=>{
          if(operation!=='select' && failTable===table){failTable='';return {error:{message:'interrupted'}};}
          let rows=state[table].filter(r=>!filter || r[filter[0]]===filter[1]);
          if(operation==='insert'){state[table].push(value);writes.push({table,operation});rows=[value];}
          if(operation==='update'){for(const r of rows)Object.assign(r,value);writes.push({table,operation});}
          return {data:single?rows[0]:rows};
        }).then(resolve,reject);},
      };return q;
    },
  }; return admin;
}
test('partial financially material fixture resumes without delete or duplicate, including rerun and reset', async () => {
  const plan=fixturePlan(new Date('2026-10-15T12:00:00Z'));
  const c=resumableClient({...plan,status:'assigned',is_test:true});
  c.fail('booking_roster_member_payouts');
  await assert.rejects(applyFixture(c,plan), /Create synthetic member earnings failed/);
  assert.equal(c.state.bookings[0].is_test,true);
  await applyFixture(c,plan);
  await applyFixture(c,fixturePlan(new Date('2026-10-16T12:00:00Z')));
  assert.equal(c.state.bookings.length,1);assert.equal(c.state.booking_cleaners.length,2);assert.equal(c.state.booking_roster_member_payouts.length,1);
  assert.equal(c.state.bookings[0].date,'2026-10-15');
  assert.equal(c.state.bookings[0].is_test,false);
  await retireFixture(c);assert.equal(c.state.bookings[0].is_test,true);
  await applyFixture(c,plan);assert.equal(c.state.bookings[0].is_test,false);
  assert.equal(c.state.booking_roster_member_payouts.length,1);
});
test('resuming a settled or modified fixture fails before any mutation', async () => {
  const plan=fixturePlan();
  for(const patch of [{payout_run_id:'run'},{cleaner_payout_cents:999},{earnings_summary:{per_cleaner_earnings:[]}}]) {
    const c=resumableClient({...plan,...patch});await assert.rejects(applyFixture(c,plan));assert.deepEqual(c.writes,[]);
  }
});

test('governed paired runner requires exact staging allowlist before any request', async () => {
  for (const allow of ['', env.SUPABASE_PROD_REF, `${ref},${env.SUPABASE_PROD_REF}`]) await assert.rejects(runPairedUiSeed({}, {...env,SEED_ALLOWED_PROJECT_REFS:allow}), /allowlisted/);
});

test('retirement rejects customer payment, captured cash and invoice linkage before hiding any row', async () => {
  const cases=[{payment_status:'success'}, {amount_paid_cents:65000}, {total_paid_cents:65000}, {deposit_paid_cents:100}, {payment_completed_at:'2026-10-15'}, {paid_at:'2026-10-15'}, {payment_transaction_id:'txn'}, {payment_reference_external:'eft'}, {marked_paid_by_admin_id:'admin'}, {monthly_invoice_id:'invoice'}, {zoho_invoice_id:'zoho'}, {sales_document_id:'sales'}];
  for(const patch of cases){const c=client(()=>({data:{...booking,...patch}})); await assert.rejects(retireFixture(c));assert.deepEqual(c.writes,[]);}
});

test('fixed fixture is separate, R260 per participant and has no collected payment', () => {
  const p = lockedFixture.fixturePlan(new Date('2026-10-15T22:30:00Z'));
  assert.notEqual(p.id, ids.booking);
  assert.equal(p.date, '2026-10-16');
  assert.equal(p.recurring_id, lockedFixture.ids.recurring);
  assert.equal(p.earnings_summary.model_version, 'legacy_july_locked_v1');
  assert.deepEqual(p.earnings_summary.per_cleaner_earnings.map(r=>r.total_cents), [26000,26000]);
  assert.equal(p.earnings_summary.total_cleaner_earnings_cents, 52000);
  assert.equal(p.amount_paid_cents, 0); assert.equal(p.payment_status, 'pending');
});
test('fixed fixture resumes owned partial state and retains paused schedule on retirement', async () => {
  const p={...lockedFixture.fixturePlan(),customer_id:'95610000-0000-4000-8000-000000000099',is_test:true,status:'assigned'};
  const c=resumableClient(p,lockedFixture);
  c.fail('booking_roster_member_payouts');
  await assert.rejects(lockedFixture.applyFixture(c,p));
  assert.equal(c.state.bookings[0].is_test,true);
  await lockedFixture.applyFixture(c,p);
  await lockedFixture.applyFixture(c,p);
  assert.equal(c.state.recurring_bookings.length,1);
  assert.equal(c.state.recurring_bookings[0].status,'paused');
  assert.equal(c.state.recurring_bookings[0].legacy_earnings_cents,26000);
  assert.equal(c.state.booking_roster_member_payouts[0].payout_cents,26000);
  await lockedFixture.retireFixture(c);
  assert.equal(c.state.bookings[0].is_test,true);
  assert.equal(c.state.recurring_bookings.length,1);
});
test('fixed fixture rejects changed schedule instead of overwriting its policy', async () => {
  const p={...lockedFixture.fixturePlan(),customer_id:'95610000-0000-4000-8000-000000000099',is_test:true};
  const c=resumableClient(p,lockedFixture);
  c.state.recurring_bookings.push({id:lockedFixture.ids.recurring,customer_id:p.customer_id,frequency:'weekly',status:'active',earnings_policy:'legacy_july',legacy_earnings_cents:26000,price:650});
  await assert.rejects(lockedFixture.applyFixture(c,p),/Changed fixed schedule status/);
  assert.equal(c.state.bookings[0].is_test,true);
  assert(!c.writes.some(w=>w.table==='recurring_bookings'));
});
