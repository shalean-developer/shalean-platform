/** Governed opt-in staging fixture. Never creates a batch, transfer or real recipient. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

export const TAG = 'AUDIT951-PAIRED-UI';
export const ids = {
  booking: '95110000-0000-4000-8000-000000000001',
  lead: '95110000-0000-4000-8000-000000000002',
  member: '95110000-0000-4000-8000-000000000003',
};
const people = [
  { id: ids.lead, email: 'audit951.lead@example.com', name: 'Audit951 Lead', phone: '+270000009511' },
  { id: ids.member, email: 'audit951.member@example.com', name: 'Audit951 Member', phone: '+270000009512' },
];

export function assertTarget(env, health) {
  const ref = env.AUDIT_STAGING_REF;
  assert(/^[a-z]{20}$/.test(ref ?? '') && /^[a-z]{20}$/.test(env.SUPABASE_PROD_REF ?? '') && ref !== env.SUPABASE_PROD_REF, 'Distinct staging/production references required');
  assert.equal(env.SHALEAN_APP_ENV, 'staging');
  assert.equal(new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin, `https://${ref}.supabase.co`);
  assert.equal(health.deployment, 'staging');
  assert.equal(health.shaleanAppEnv, 'staging');
  assert.equal(health.supabase?.configuredRef, ref);
  assert.equal(health.supabase?.expectedRef, ref);
  assert.equal(health.paystack?.secretMode, 'test');
  assert.equal(health.paystack?.publicMode, 'test');
  assert.equal(health.messaging?.outboundDisabled, true);
  assert.deepEqual(health.issues, []);
}

export function fixturePlan(now = new Date()) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  assert(date >= '2026-10-01', 'October boundary');
  const summary = {
    model_version: 'v3_2026_earnings_rules', service_type: 'standard', customer_total_cents: 65000,
    eligible_amount_cents: 65000, payout_mode: 'individual_cleaners', cleaner_count: 2,
    assigned_cleaner_ids: [ids.lead, ids.member], assigned_team_id: null, team_leader_id: ids.lead,
    cleaner_tenure_months: null, cleaner_percentage: null, minimum_earning_cents: 25000,
    maximum_earning_cents: 30000, fixed_service_payout_applied: true,
    per_cleaner_earnings: people.map((p, i) => ({ cleaner_id: p.id, role: i ? 'member' : 'lead', base_earning_cents: 25000, bonus_cents: 0, deduction_cents: 0, total_cents: 25000 })),
    team_leader_earning_cents: 25000, bonus: { items: [], total_cents: 0 }, deductions: { items: [], total_cents: 0 },
    total_cleaner_earnings_cents: 50000, costs_cents: 0, company_revenue_cents: 15000, computed_at: now.toISOString(),
  };
  return { id: ids.booking, paystack_reference: TAG, customer_name: 'Audit951 Synthetic Customer',
    customer_email: 'audit951.customer@example.com', customer_phone: '+270000009513',
    service_slug: 'standard', service: 'Standard', date, time: '09:00', currency: 'ZAR',
    // Reporting deliberately excludes is_test=true. This opt-in fixture is staging-only,
    // namespaced and synthetic; never run the payout actions while it is present.
    is_test: false, is_team_job: false, status: 'completed', dispatch_status: 'assigned',
    amount_paid_cents: 0, total_paid_zar: 650, payment_status: 'pending', billing_type: 'pay_later',
    cleaner_id: ids.lead, payout_owner_cleaner_id: ids.lead, cleaner_payout_cents: 25000,
    cleaner_bonus_cents: 0, display_earnings_cents: 50000, cleaner_earnings_total_cents: 50000,
    company_revenue_cents: 15000, payout_status: 'pending', completed_at: now.toISOString(),
    cleaner_line_earnings_finalized_at: now.toISOString(), earnings_summary: summary,
    price_snapshot: { total: 650 }, booking_snapshot: { selectedCleanerIds: [ids.lead, ids.member] },
    metadata: { audit_fixture: TAG, synthetic: true, no_payment_execution: true },
  };
}

async function checked(request, label) {
  const result = await request;
  if (result.error) throw new Error(`${label} failed`); // never log provider payloads or credentials
  return result.data;
}

async function identity(admin, person) {
  for (let page = 1; ; page++) {
    const data = await checked(admin.auth.admin.listUsers({ page, perPage: 200 }), 'Identity lookup');
    const found = data.users.find(u => u.email?.toLowerCase() === person.email);
    if (found) {
      assert.equal(found.app_metadata?.audit_fixture, TAG, 'Identity collision');
      assert.equal(found.app_metadata?.is_test, true);
      assert.equal(found.app_metadata?.role, 'cleaner');
      return found.id;
    }
    if (data.users.length < 200) break;
  }
  const data = await checked(admin.auth.admin.createUser({ email: person.email,
    password: `Audit-${randomBytes(24).toString('base64url')}!`, email_confirm: true,
    app_metadata: { role: 'cleaner', is_test: true, audit_fixture: TAG },
    user_metadata: { full_name: person.name, is_test: true },
  }), 'Create synthetic identity');
  return data.user.id;
}

export async function applyFixture(admin, plan) {
  const existing = await checked(admin.from('bookings').select('id').or(`id.eq.${ids.booking},paystack_reference.eq.${TAG}`), 'Booking preflight');
  assert.equal(existing.length, 0, 'Fixture already exists or collides; verify/cleanup before reseeding');
  for (const p of people) {
    const existingCleaner = await checked(admin.from('cleaners').select('id,email,auth_user_id').eq('id', p.id), 'Cleaner preflight');
    const authId = await identity(admin, p);
    if (existingCleaner.length) {
      assert.equal(existingCleaner[0].email, p.email, 'Cleaner collision');
      assert.equal(existingCleaner[0].auth_user_id, authId);
    } else {
      await checked(admin.from('cleaners').insert({ id: p.id, auth_user_id: authId, full_name: p.name,
        email: p.email, phone: p.phone, payment_id: p.id === ids.lead ? 'SHL-CL-951001' : 'SHL-CL-951002', is_active: true, is_available: false }), 'Create synthetic cleaner');
    }
  }
  // Prepare reporting state only. This fixture does not claim application finalization coverage.
  await checked(admin.from('bookings').insert({ ...plan, status: 'assigned', completed_at: null,
    cleaner_line_earnings_finalized_at: null, payout_status: 'pending' }), 'Create fixture booking');
  await checked(admin.from('booking_cleaners').insert(people.map((p, i) => ({ booking_id: ids.booking,
    cleaner_id: p.id, role: i ? 'member' : 'lead', source: 'admin' }))), 'Create paired roster');
  await checked(admin.from('bookings').update(plan).eq('id', ids.booking).select('id').single(), 'Complete fixture');
  await checked(admin.from('booking_roster_member_payouts').insert({ booking_id: ids.booking, cleaner_id: ids.member, payout_cents: 25000, bonus_cents: 0, status: 'pending' }), 'Create synthetic member earnings');
  const rows = await checked(admin.from('booking_roster_member_payouts').select('cleaner_id,payout_cents,status').eq('booking_id', ids.booking), 'Read member earnings');
  assert(rows.some(r => r.cleaner_id === ids.member && r.payout_cents === 25000 && r.status === 'pending'), 'Member fixture mismatch; no acceptance');
  const ledger = await checked(admin.from('cleaner_earnings').select('id').eq('booking_id', ids.booking), 'Read solo ledger');
  assert.equal(ledger.length, 0, 'Paired booking unexpectedly has solo ledger; no acceptance');
  return { booking: ids.booking, date: plan.date, expectedBookings: 1, expectedCleanerVisits: 2, expectedEarnedCents: 50000, browserVerified: false };
}


export async function retireFixture(admin) {
  const booking = await checked(admin.from('bookings').select('id,metadata,paystack_reference,payout_id,payout_run_id,payout_paid_at,payout_status').eq('id', ids.booking).single(), 'Retirement preflight');
  assert.equal(booking.metadata?.audit_fixture, TAG);
  assert.equal(booking.paystack_reference, TAG);
  assert(!booking.payout_id && !booking.payout_run_id && !booking.payout_paid_at && booking.payout_status === 'pending', 'Settlement evidence blocks retirement');
  for (const table of ['booking_roster_member_payouts', 'team_job_member_payouts']) {
    const rows = await checked(admin.from(table).select('status,cleaner_payout_id').eq('booking_id', ids.booking), 'Member retirement preflight');
    assert(rows.every(r => r.status === 'pending' && !r.cleaner_payout_id), 'Locked member blocks retirement');
  }
  const ledger = await checked(admin.from('cleaner_earnings').select('id').eq('booking_id', ids.booking), 'Ledger retirement preflight');
  assert.equal(ledger.length, 0, 'Unexpected ledger blocks retirement');
  // Retain immutable synthetic evidence; the production reporting predicate excludes it.
  await checked(admin.from('bookings').update({ is_test: true }).eq('id', ids.booking).select('id').single(), 'Retire fixture from reports');
  return { booking: ids.booking, retiredFromReports: true, historyRetained: true };
}

async function main() {
  const plan = fixturePlan();
  if (process.argv.includes('--plan')) { console.log(JSON.stringify({ tag: TAG, booking: plan, createsBatches: false }, null, 2)); return; }
  assert(process.argv.includes('--apply') !== process.argv.includes('--retire'), 'Use --plan, --apply or --retire');
  const site = new URL(process.env.AUDIT_STAGING_SITE_URL);
  assert(site.protocol === 'https:' && site.pathname === '/' && !site.search && !site.hash && !site.username && !site.password, 'Canonical HTTPS staging origin required');
  const response = await fetch(new URL('/api/health/environment', site), { signal: AbortSignal.timeout(15000) });
  assert(response.ok, 'Staging health unavailable');
  assertTarget(process.env, await response.json());
  assert(process.env.SUPABASE_SERVICE_ROLE_KEY, 'Server-only staging key must be configured securely in environment');
  const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
  const { createClient } = require('@supabase/supabase-js');
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  console.log(JSON.stringify(process.argv.includes('--retire') ? await retireFixture(admin) : await applyFixture(admin, plan)));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch(() => {
  console.error('Paired UI fixture failed; do not accept. Partial synthetic records may remain; inspect namespaced records before retrying.');
  process.exitCode = 1;
});
