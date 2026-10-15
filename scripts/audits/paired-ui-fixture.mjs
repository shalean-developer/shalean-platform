/** Governed opt-in staging fixture. Never creates a batch, transfer or real recipient. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

export function createPairedUiFixture({ fixedLegacy = false } = {}) {
  const namespace = fixedLegacy ? '956' : '951';
  const rate = fixedLegacy ? 26000 : 25000;
  const TAG = `AUDIT${namespace}-PAIRED-UI`;
  const ids = {
    booking: `${namespace}10000-0000-4000-8000-000000000001`,
    lead: `${namespace}10000-0000-4000-8000-000000000002`,
    member: `${namespace}10000-0000-4000-8000-000000000003`,
    recurring: `${namespace}10000-0000-4000-8000-000000000004`,
  };
  const people = [
    { id: ids.lead, email: `audit${namespace}.lead@example.com`, name: `Audit${namespace} Lead`, phone: `+27000000${namespace}1` },
    { id: ids.member, email: `audit${namespace}.member@example.com`, name: `Audit${namespace} Member`, phone: `+27000000${namespace}2` },
  ];

  function assertTarget(env, health) {
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

  function fixturePlan(now = new Date()) {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    assert(date >= '2026-10-01', 'October boundary');
    const summary = {
      model_version: fixedLegacy ? 'legacy_july_locked_v1' : 'v3_2026_earnings_rules', service_type: 'standard', customer_total_cents: 65000,
      eligible_amount_cents: 65000, payout_mode: 'individual_cleaners', cleaner_count: 2,
      assigned_cleaner_ids: [ids.lead, ids.member], assigned_team_id: null, team_leader_id: ids.lead,
      cleaner_tenure_months: null, cleaner_percentage: null, minimum_earning_cents: rate,
      maximum_earning_cents: 30000, fixed_service_payout_applied: true,
      per_cleaner_earnings: people.map((p, i) => ({ cleaner_id: p.id, role: i ? 'member' : 'lead', base_earning_cents: rate, bonus_cents: 0, deduction_cents: 0, total_cents: rate })),
      team_leader_earning_cents: rate, bonus: { items: [], total_cents: 0 }, deductions: { items: [], total_cents: 0 },
      total_cleaner_earnings_cents: 2 * rate, costs_cents: 0, company_revenue_cents: 65000 - 2 * rate, computed_at: now.toISOString(),
    };
    return { ...(fixedLegacy ? { recurring_id: ids.recurring } : {}), id: ids.booking, paystack_reference: TAG, customer_name: `Audit${namespace} Synthetic Customer`,
      customer_email: `audit${namespace}.customer@example.com`, customer_phone: `+27000000${namespace}3`,
      service_slug: 'standard', service: 'Standard', date, time: '09:00', currency: 'ZAR',
      // Reporting deliberately excludes is_test=true. This opt-in fixture is staging-only,
      // namespaced and synthetic; never run the payout actions while it is present.
      is_test: false, is_team_job: false, status: 'completed', dispatch_status: 'assigned',
      amount_paid_cents: 0, total_paid_zar: 650, payment_status: 'pending', billing_type: 'pay_later',
      cleaner_id: ids.lead, payout_owner_cleaner_id: ids.lead, cleaner_payout_cents: rate,
      cleaner_bonus_cents: 0, display_earnings_cents: rate, cleaner_earnings_total_cents: 2 * rate,
      company_revenue_cents: 65000 - 2 * rate, payout_status: 'pending', completed_at: now.toISOString(),
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
        assert.equal(found.app_metadata?.role, person.role ?? 'cleaner');
        return found.id;
      }
      if (data.users.length < 200) break;
    }
    const data = await checked(admin.auth.admin.createUser({ email: person.email,
      password: `Audit-${randomBytes(24).toString('base64url')}!`, email_confirm: true,
      app_metadata: { role: person.role ?? 'cleaner', is_test: true, audit_fixture: TAG },
      user_metadata: { full_name: person.name, is_test: true },
    }), 'Create synthetic identity');
    return data.user.id;
  }

  async function applyFixture(admin, plan) {
    const existing = await checked(admin.from('bookings').select('*').or(`id.eq.${ids.booking},paystack_reference.eq.${TAG}`), 'Booking preflight');
    assert(existing.length <= 1, 'Booking/reference collision');
    const booking = existing[0];
    if (booking) {
      assert.equal(booking.id, ids.booking, 'Booking collision');
      assert.equal(booking.metadata?.audit_fixture, TAG, 'Booking collision');
      assert.equal(booking.paystack_reference, TAG, 'Booking collision');
      assert(['assigned', 'completed'].includes(booking.status), 'Unexpected fixture lifecycle');
      assert.equal(booking.payout_status, 'pending', 'Locked fixture');
      assert.equal(booking.payment_status, 'pending', 'Customer payment blocks retirement');
    assert([booking.amount_paid_cents, booking.total_paid_cents, booking.deposit_paid_cents].every(v => v == null || Number(v) === 0), 'Captured amount blocks retirement');
    assert(!booking.payment_completed_at && !booking.paid_at && !booking.payment_transaction_id && !booking.payment_reference_external && !booking.marked_paid_by_admin_id && !booking.monthly_invoice_id && !booking.zoho_invoice_id && !booking.sales_document_id, 'Payment linkage blocks retirement');
    assert(!booking.payout_id && !booking.payout_run_id && !booking.payout_paid_at && !booking.payment_transaction_id && !booking.monthly_invoice_id && !booking.zoho_invoice_id, 'Linked financial evidence');
      for (const key of ['amount_paid_cents', 'payment_status', 'billing_type', 'cleaner_id', 'payout_owner_cleaner_id', 'cleaner_payout_cents', 'display_earnings_cents', 'cleaner_earnings_total_cents', 'total_paid_zar', 'company_revenue_cents', 'is_team_job']) assert.equal(booking[key], plan[key], `Changed fixture ${key}`);
      assert.deepEqual(booking.earnings_summary?.per_cleaner_earnings, plan.earnings_summary.per_cleaner_earnings, 'Changed fixture summary');
      assert(/^\d{4}-\d{2}-\d{2}$/.test(booking.date) && booking.date >= '2026-10-01' && booking.date <= plan.date, 'Unexpected fixture date');
      plan = { ...plan, date: booking.date }; // retry never moves financial history to a later date
    }
    const roster = await checked(admin.from('booking_cleaners').select('*').eq('booking_id', ids.booking), 'Roster preflight');
    assert(roster.length <= 2 && new Set(roster.map(r => r.cleaner_id)).size === roster.length, 'Duplicate roster');
    for (const row of roster) assert(people.some((p, i) => p.id === row.cleaner_id && row.role === (i ? 'member' : 'lead')), 'Foreign roster');
    const members = await checked(admin.from('booking_roster_member_payouts').select('*').eq('booking_id', ids.booking), 'Member preflight');
    assert(members.length <= 1 && members.every(r => r.cleaner_id === ids.member && r.payout_cents === rate && r.bonus_cents === 0 && r.status === 'pending' && !r.cleaner_payout_id), 'Changed or locked member');
    const team = await checked(admin.from('team_job_member_payouts').select('id').eq('booking_id', ids.booking), 'Team preflight');
    const ledger = await checked(admin.from('cleaner_earnings').select('id').eq('booking_id', ids.booking), 'Ledger preflight');
    assert.equal(team.length + ledger.length, 0, 'Unexpected team/solo ledger evidence');
    for (const p of people) {
      const existingCleaner = await checked(admin.from('cleaners').select('id,email,auth_user_id').eq('id', p.id), 'Cleaner preflight');
      if (existingCleaner.length) assert.equal(existingCleaner[0].email, p.email, 'Cleaner collision');
      const authId = await identity(admin, p);
      if (existingCleaner.length) assert.equal(existingCleaner[0].auth_user_id, authId);
      else await checked(admin.from('cleaners').insert({ id: p.id, auth_user_id: authId, full_name: p.name,
        email: p.email, phone: p.phone, is_active: true, is_available: false }), 'Create synthetic cleaner');
    }
    if (fixedLegacy) {
      const customerId = await identity(admin, { email: plan.customer_email, name: plan.customer_name, role: 'customer' });
      const schedule = { id: ids.recurring, customer_id: customerId, frequency: 'weekly', days_of_week: [4],
        start_date: '2026-10-01', next_run_date: '2099-01-01', price: 650, status: 'paused',
        earnings_policy: 'legacy_july', legacy_earnings_cents: rate,
        booking_snapshot_template: { audit_fixture: TAG, synthetic: true, service_slug: 'standard' } };
      const existingSchedules = await checked(admin.from('recurring_bookings').select('*').eq('id', ids.recurring), 'Fixed schedule preflight');
      assert(existingSchedules.length <= 1, 'Schedule collision');
      if (existingSchedules.length) {
        const old = existingSchedules[0];
        for (const key of ['customer_id','frequency','status','earnings_policy','legacy_earnings_cents','price']) assert.equal(old[key], schedule[key], `Changed fixed schedule ${key}`);
        assert.equal(old.booking_snapshot_template?.audit_fixture, TAG, 'Schedule ownership');
      } else await checked(admin.from('recurring_bookings').insert(schedule), 'Create paused fixed schedule');
      if (booking) { assert.equal(booking.recurring_id, ids.recurring); assert.equal(booking.customer_id, customerId); }
      plan = { ...plan, customer_id: customerId };
    }
    // Partial state stays excluded from reports. Resume only missing owned rows.
    if (!booking) await checked(admin.from('bookings').insert({ ...plan, is_test: true, status: 'assigned', completed_at: null,
      cleaner_line_earnings_finalized_at: null, payout_status: 'pending' }), 'Create fixture booking');
    for (const [i, p] of people.entries()) {
      if (!roster.some(r => r.cleaner_id === p.id)) await checked(admin.from('booking_cleaners').insert({ booking_id: ids.booking,
        cleaner_id: p.id, role: i ? 'member' : 'lead', source: 'admin' }), 'Create paired roster');
    }
    if (!members.length) await checked(admin.from('booking_roster_member_payouts').insert({ booking_id: ids.booking, cleaner_id: ids.member, payout_cents: rate, bonus_cents: 0, status: 'pending' }), 'Create synthetic member earnings');
    if (booking?.status !== 'completed') await checked(admin.from('bookings').update({ status: 'completed', completed_at: plan.completed_at,
      cleaner_line_earnings_finalized_at: plan.cleaner_line_earnings_finalized_at }).eq('id', ids.booking).select('id').single(), 'Complete fixture');
    await checked(admin.from('bookings').update({ is_test: false }).eq('id', ids.booking).select('id').single(), 'Publish complete fixture');
    return { booking: ids.booking, date: plan.date, expectedBookings: 1, expectedCleanerVisits: 2, expectedEarnedCents: 2 * rate, browserVerified: false };
  }


  async function retireFixture(admin) {
    const booking = await checked(admin.from('bookings').select('id,metadata,paystack_reference,payout_id,payout_run_id,payout_paid_at,payout_status,payment_status,amount_paid_cents,total_paid_cents,deposit_paid_cents,payment_completed_at,paid_at,payment_transaction_id,payment_reference_external,marked_paid_by_admin_id,monthly_invoice_id,zoho_invoice_id,sales_document_id').eq('id', ids.booking).single(), 'Retirement preflight');
    assert.equal(booking.metadata?.audit_fixture, TAG);
    assert.equal(booking.paystack_reference, TAG);
    assert.equal(booking.payment_status, 'pending', 'Customer payment blocks retirement');
    assert([booking.amount_paid_cents, booking.total_paid_cents, booking.deposit_paid_cents].every(v => v == null || Number(v) === 0), 'Captured amount blocks retirement');
    assert(!booking.payment_completed_at && !booking.paid_at && !booking.payment_transaction_id && !booking.payment_reference_external && !booking.marked_paid_by_admin_id && !booking.monthly_invoice_id && !booking.zoho_invoice_id && !booking.sales_document_id, 'Payment linkage blocks retirement');
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

  /** Called only by seed-dev.mjs after its common non-production guard. */
  async function runPairedUiSeed(admin, env, reset = false) {
    const allowed = String(env.SEED_ALLOWED_PROJECT_REFS ?? '').split(',').map(s => s.trim()).filter(Boolean);
    assert.deepEqual(allowed, [env.AUDIT_STAGING_REF], 'Exactly the approved staging ref must be allowlisted');
    const site = new URL(env.AUDIT_STAGING_SITE_URL);
    assert(site.protocol === 'https:' && site.pathname === '/' && !site.search && !site.hash && !site.username && !site.password, 'Canonical HTTPS staging origin required');
    const response = await fetch(new URL('/api/health/environment', site), { signal: AbortSignal.timeout(15000) });
    assert(response.ok, 'Staging health unavailable');
    assertTarget(env, await response.json());
    return reset ? retireFixture(admin) : applyFixture(admin, fixturePlan());
  }

  return { TAG, ids, assertTarget, fixturePlan, applyFixture, retireFixture, runPairedUiSeed };
}
export const { TAG, ids, assertTarget, fixturePlan, applyFixture, retireFixture, runPairedUiSeed } = createPairedUiFixture();
export const lockedFixture = createPairedUiFixture({ fixedLegacy: true });
