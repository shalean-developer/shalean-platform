/** Non-paying candidate integration harness. Remote mode: staging only, TEMP tables, ROLLBACK. */
import assert from 'node:assert/strict';
import { listRosterMemberWeeklyPayoutCandidates as roster } from '../../apps/web/lib/payout/rosterMemberWeeklyPayoutCandidates';
import { listTeamJobMemberWeeklyPayoutCandidates as team } from '../../apps/web/lib/payout/teamJobMemberWeeklyPayoutCandidates';
import { BOOKING_SELECT_FIELDS_FOR_WEEKLY_BATCH_ELIGIBILITY as fields } from '../../apps/web/lib/payout/bookingPayableForWeeklyBatch';
import { payoutGenerationAvailability } from '../../apps/web/lib/payout/payoutGenerationAvailability';
type SupabaseClient = Parameters<typeof roster>[0]['admin'];

type DB = { query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>; close(): Promise<void> };
const tables = ['bookings', 'monthly_invoices', 'booking_roster_member_payouts', 'team_job_member_payouts'];
const id = (n: number) => `94600000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export function assertStagingTarget(value: string) {
  assert(process.env.SHALEAN_APP_ENV === 'staging', 'SHALEAN_APP_ENV must be staging');
  const ref = process.env.AUDIT_STAGING_REF ?? '';
  const productionRef = process.env.SUPABASE_PROD_REF ?? '';
  assert(/^[a-z]{20}$/.test(ref) && /^[a-z]{20}$/.test(productionRef) && ref !== productionRef,
    'Distinct private staging and production references are required');
  const url = new URL(value);
  assert(!url.search && !url.hash, 'Connection query parameters and fragments are forbidden');
  const user = decodeURIComponent(url.username);
  const direct = url.hostname === `db.${ref}.supabase.co` && user === 'postgres';
  const pooler = url.hostname.endsWith('.pooler.supabase.com') && user === `postgres.${ref}`;
  assert(['postgres:', 'postgresql:'].includes(url.protocol) && (direct || pooler), 'Only the approved staging database is allowed');
  const port = Number(url.port || 5432);
  assert([5432,6543].includes(port) && url.pathname === '/postgres', 'Unexpected database or port');
  // Pass explicit validated fields: never let the driver reparse a connection string.
  return { host: url.hostname, user, password: decodeURIComponent(url.password), database: 'postgres', port,
    ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 10_000 };
}

type PostgresConnection = {
  connect(): Promise<void>;
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
};
type PostgresClientConstructor = new (config: ReturnType<typeof assertStagingTarget>) => PostgresConnection;

export function postgresClientExport(driver: { Client?: unknown; default?: { Client?: unknown } }): PostgresClientConstructor {
  const client = driver.Client ?? driver.default?.Client;
  assert(typeof client === 'function', 'PostgreSQL Client constructor export is missing');
  return client as PostgresClientConstructor;
}

async function main() {
  const isolated = process.argv.includes('--isolated');
  let db: DB;
  if (isolated) {
    const { PGlite } = await import(process.env.AUDIT_PGLITE_MODULE ?? '@electric-sql/pglite');
    db = new PGlite() as DB;
    await db.query(`create table public.bookings (id uuid, status text, cleaner_id uuid, cleaner_payout_cents integer,
      cleaner_bonus_cents integer, is_test boolean, completed_at timestamptz, date text, billing_type text,
      is_monthly_billing_booking boolean, monthly_invoice_id uuid, payment_status text, payout_status text,
      payout_frozen_cents integer, refunded_at timestamptz, refund_status text, metadata jsonb)`);
    await db.query('create table public.monthly_invoices (id uuid, status text)');
    await db.query('create table public.booking_roster_member_payouts (id uuid, booking_id uuid, cleaner_id uuid, payout_cents integer, bonus_cents integer, cleaner_payout_id uuid, status text)');
    await db.query('create table public.team_job_member_payouts (id uuid, booking_id uuid, cleaner_id uuid, payout_cents integer, cleaner_payout_id uuid, status text)');
  } else {
    const url = process.env.AUDIT_STAGING_DATABASE_URL ?? '';
    const connection = assertStagingTarget(url);
    const driver = await import(process.env.AUDIT_PG_MODULE ?? 'pg');
    const Client = postgresClientExport(driver);
    const client = new Client(connection);
    await client.connect();
    db = { query: (sql, values) => client.query(sql, values), close: () => client.end() };
  }
  let checks = 0;
  let begun = false;
  try {
    await db.query('begin'); begun = true;
    await db.query("set local statement_timeout = '10s'");
    // Copy column types only: operational triggers, foreign keys and payment side effects never run.
    for (const table of tables) {
      const columns = table === 'bookings' ? fields : table === 'monthly_invoices' ? 'id,status'
        : table === 'booking_roster_member_payouts' ? 'id,booking_id,cleaner_id,payout_cents,bonus_cents,cleaner_payout_id,status'
        : 'id,booking_id,cleaner_id,payout_cents,cleaner_payout_id,status';
      await db.query(`create temporary table audit946_${table} on commit drop as select ${columns} from public.${table} where false`);
    }
    await db.query('insert into pg_temp.audit946_monthly_invoices values ($1,$2)', [id(1), 'paid']);
    for (const [table, bookingId, basis] of [
      ['booking_roster_member_payouts',id(2),25000],
      ['team_job_member_payouts',id(6),0],
    ] as const) {
      await db.query(`insert into pg_temp.audit946_bookings
        (id,status,cleaner_id,cleaner_payout_cents,cleaner_bonus_cents,is_test,completed_at,date,billing_type,
         is_monthly_billing_booking,monthly_invoice_id,payment_status,payout_status,payout_frozen_cents,metadata)
        values ($1,'completed',$2,$4,0,false,'2026-10-05T12:00:00Z','2026-10-05','recurring_invoice',true,$3,'success','eligible',$4,'{}')`,
        [bookingId,id(3),id(1),basis]);
      const bonus = table === 'booking_roster_member_payouts' ? ',bonus_cents' : '';
      await db.query(`insert into pg_temp.audit946_${table} (id,booking_id,cleaner_id,payout_cents,status${bonus})
        values ($1,$2,$3,25000,'pending'${bonus ? ',0' : ''})`, [id(4),bookingId,id(5)]);
    }
    let fail = '';
    const admin = { from(table: string) {
      assert(tables.includes(table), 'Unexpected table');
      let projection = '*'; const where: string[] = []; const values: unknown[] = []; let offset = 0; let limit = 500;
      function column(name: string) { assert(/^[a-z_]+$/.test(name), 'Invalid column'); return `"${name}"`; }
      const q = {
        select(cols: string) { projection = cols.split(',').map(s => column(s.trim())).join(','); return q; },
        eq(name: string, value: unknown) { values.push(value); where.push(`${column(name)}=$${values.length}`); return q; },
        is(name: string, value: unknown) { assert.equal(value, null); where.push(`${column(name)} is null`); return q; },
        in(name: string, entries: unknown[]) { const placeholders = entries.map(v => { values.push(v); return `$${values.length}`; }); where.push(`${column(name)} in (${placeholders.join(',')})`); return q; },
        order(name: string) { assert.equal(name, 'id'); return q; },
        range(from: number, to: number) { offset = from; limit = to - from + 1; return q; },
        async then(resolve: (result: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          try {
            if (table === fail) return resolve({ data: null, error: { message: 'injected read failure' } });
            const result = await db.query(`select ${projection} from pg_temp.audit946_${table}${where.length ? ' where '+where.join(' and ') : ''} order by id offset ${offset} limit ${limit}`, values);
            return resolve({ data: result.rows, error: null });
          } catch (error) { if (reject) return reject(error); throw error; }
        },
      }; return q;
    } } as unknown as SupabaseClient;
    const params = { admin, cleanerId: id(5), periodStart: '2026-10-01', periodEnd: '2026-10-31', invoiceStatusById: new Map<string,string>() };
    for (const list of [roster, team]) {
      const candidates = await list(params);
      assert.equal(candidates.length, 1); checks++;
      assert.equal(candidates[0].payout_cents,25000); checks++;
      assert.equal(candidates[0].booking.cleaner_payout_cents,list === team ? 0 : 25000); checks++;
      await db.query("update pg_temp.audit946_monthly_invoices set status='sent'");
      assert.equal((await list(params)).length, 0); checks++;
      await db.query("update pg_temp.audit946_monthly_invoices set status='paid'");
      await db.query("update pg_temp.audit946_bookings set refund_status='refunded'");
      assert.equal((await list(params)).length, 0); checks++;
      await db.query('update pg_temp.audit946_bookings set refund_status=null');
      fail = 'monthly_invoices'; await assert.rejects(list(params), /lookup failed/); checks++; fail = '';
    }
    assert.equal(payoutGenerationAvailability('2026-10-01','2026-10-31',new Date('2026-10-15T12:00:00Z')).hasClosedProcessingMonth, false); checks++;
    await db.query('rollback'); begun = false;
    const remaining = await db.query("select count(*)::int as count from pg_class where relnamespace=pg_my_temp_schema() and relname like 'audit946_%'");
    assert.equal(remaining.rows[0].count, 0); checks++;
    console.log(`${checks} ${isolated ? 'isolated PostgreSQL' : 'staging PostgreSQL'} candidate checks passed; temporary fixtures rolled back; no batches or transfers created.`);
  } finally {
    try { if (begun) await db.query('rollback'); } finally { await db.close(); }
  }
}
export function isMemberPayoutFixtureEntrypoint(value: string | undefined): boolean {
  return (value ?? '').replaceAll('\\','/').split('/').at(-1) === 'member-payout-fixture.ts';
}
if (isMemberPayoutFixtureEntrypoint(process.argv[1])) main().catch(() => { console.error('Candidate fixture verification failed; no acceptance recorded. Inspect locally without sharing credentials.'); process.exitCode = 1; });
