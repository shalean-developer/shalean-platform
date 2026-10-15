// Isolated PostgreSQL only. No remote connection or provider calls.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.AUDIT_PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const sql = await fs.readFile('supabase/migrations/20261015102230_audit_05a01_recurring_prepayment_schema_convergence.sql', 'utf8');
let checks = 0;
await db.exec(`create role anon; create role authenticated; create role service_role;
create table bookings(id uuid primary key); create table recurring_bookings(id uuid primary key);
insert into bookings values ('11111111-1111-4111-8111-111111111111');
insert into recurring_bookings values ('22222222-2222-4222-8222-222222222222');`);
await db.exec(sql);
for (const table of ['recurring_prepaid_packages', 'recurring_prepaid_allocations']) {
  const r = (await db.query(`select relrowsecurity from pg_class where oid=$1::regclass`, [table])).rows[0];
  assert.equal(r.relrowsecurity, true); checks++;
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await db.query(`select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') allowed`, [role, table])).rows[0].allowed, false); checks++;
  }
  assert.equal((await db.query(`select has_table_privilege('service_role',$1,'INSERT') allowed`, [table])).rows[0].allowed, true); checks++;
}
await db.exec(`insert into recurring_prepaid_packages(id,source_booking_id,recurring_id,customer_id,paystack_reference,coverage_start_date,coverage_end_date,occurrence_dates,visit_count,per_visit_price_zar,gross_package_zar,paid_package_zar,status,payment_completed_at)
values('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444','synthetic-reference','2026-10-04','2026-11-02',array['2026-10-04','2026-10-11']::date[],2,250,500,500,'active','2026-10-03T08:00:00Z');
insert into recurring_prepaid_allocations(package_id,booking_id,occurrence_date,allocated_zar,status)
values('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','2026-10-04',250,'applied'),('33333333-3333-4333-8333-333333333333',null,'2026-10-11',250,'reserved');`);
const snapshot = async () => JSON.stringify((await db.query(`select (select jsonb_agg(p order by p.id) from recurring_prepaid_packages p) packages,(select jsonb_agg(a order by a.id) from recurring_prepaid_allocations a) allocations`)).rows);
const before = await snapshot();
await db.exec(sql);
assert.equal(await snapshot(), before); checks++;
await assert.rejects(db.exec(`update recurring_prepaid_packages set visit_count=3`), e => e.code === '23514'); checks++;
await assert.rejects(db.exec(`update recurring_prepaid_packages set paid_package_zar=501`), e => e.code === '23514'); checks++;
await assert.rejects(db.exec(`update recurring_prepaid_allocations set allocated_zar=-1`), e => e.code === '23514'); checks++;
await assert.rejects(db.exec(`delete from bookings`), e => ['23001', '23503'].includes(e.code) && e.constraint === 'recurring_prepaid_packages_source_booking_id_fkey'); checks++;
assert.equal(await snapshot(), before); checks++;
await db.close();
console.log(`${checks} isolated PostgreSQL schema checks passed`);
