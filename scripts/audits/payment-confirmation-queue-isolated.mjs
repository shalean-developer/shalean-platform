// Executes the actual migration in isolated PostgreSQL. No remote connection or message provider.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.AUDIT_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
let checks = 0;
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.failed_jobs (id uuid primary key default gen_random_uuid(), type text not null,
      payload jsonb not null, attempts integer default 0, created_at timestamptz default now());
    alter table public.failed_jobs enable row level security;
    grant select, insert, update, delete on public.failed_jobs to service_role;`);
  const migration = await readFile(new URL('../../supabase/migrations/20261016155032_payment_confirmation_retry_idempotency.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration); checks++;
  const payload = { bookingId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', paymentReference: 'bps_synthetic',
    amountCents: 45800, customerEmail: 'customer@example.com', snapshot: null };
  const enqueue = async (data = payload) => (await db.query('select public.enqueue_payment_confirmation_notification($1::jsonb) as id', [JSON.stringify(data)])).rows[0].id;
  await db.exec('set role service_role');
  const ids = await Promise.all(Array.from({ length: 20 }, () => enqueue()));
  assert.equal(new Set(ids).size, 1); checks++;
  assert.equal((await db.query('select count(*)::int as n from public.failed_jobs')).rows[0].n, 1); checks++;
  await db.query(`update public.failed_jobs set attempts=7, payload=payload || '{"notification_retry_at":"2099-01-01T00:00:00.000Z"}'::jsonb where id=$1`, [ids[0]]);
  assert.equal(await enqueue({ ...payload, customerEmail: 'replacement@example.com' }), ids[0]); checks++;
  const existing = (await db.query('select attempts,payload from public.failed_jobs')).rows[0];
  assert.equal(existing.attempts, 7); checks++;
  assert.equal(existing.payload.notification_retry_at, '2099-01-01T00:00:00.000Z'); checks++;
  assert.equal(existing.payload.customerEmail, payload.customerEmail); checks++;
  assert.equal(await enqueue({ ...payload, bookingId: payload.bookingId.toUpperCase() }), ids[0]); checks++;
  assert.notEqual(await enqueue({ ...payload, paymentReference: 'bps_another_synthetic' }), ids[0]); checks++;
  await db.query(`insert into public.failed_jobs(type,payload) values ('booking_insert',$1::jsonb),('booking_insert',$1::jsonb)`, [JSON.stringify(payload)]);
  assert.equal((await db.query(`select count(*)::int as n from public.failed_jobs where type='booking_insert'`)).rows[0].n, 2); checks++;
  await assert.rejects(() => enqueue({ ...payload, bookingId: 'invalid' })); checks++;
  await assert.rejects(() => enqueue({ ...payload, paymentReference: '' })); checks++;
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await db.query(`select has_function_privilege($1,'public.enqueue_payment_confirmation_notification(jsonb)','EXECUTE') as allowed`, [role])).rows[0].allowed, false); checks++;
    await db.exec(`reset role; set role ${role}`);
    await assert.rejects(() => enqueue(), error => error.code === '42501'); checks++;
  }
  await db.exec('reset role');
  const privileges = (await db.query(`select prosecdef,proconfig from pg_proc where oid='public.enqueue_payment_confirmation_notification(jsonb)'::regprocedure`)).rows[0];
  assert.equal(privileges.prosecdef, false); checks++;
  assert(privileges.proconfig.some(value => value.startsWith('search_path='))); checks++;
  console.log(`${checks} isolated payment-confirmation queue checks passed; no remote connection.`);
} finally { await db.close(); }
