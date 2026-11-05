// Marketing-only isolated PostgreSQL regression. No remote connections or credentials.
// Uses the same pinned PGlite module installed by web-test CI.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { PGlite } = await import(process.env.AUDIT_PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const migration = await readFile(new URL("../../supabase/migrations/20261104210000_marketing_email_consent_ledger.sql", import.meta.url), "utf8");
const security = await readFile(new URL("../../supabase/tests/marketing_email_consent_security.sql", import.meta.url), "utf8");
const customerId = "00000000-0000-4000-8000-000000000777";
let checks = 0;
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create table public.user_profiles (id uuid primary key);
    insert into public.user_profiles(id) values ('${customerId}');
  `);
  await db.exec(migration);
  await db.exec(security);
  checks++;
  const queryOne = async (sql, values = []) => (await db.query(sql, values)).rows[0];
  const ledger = await queryOne(`select relrowsecurity from pg_class
    where oid='public.marketing_email_consent_events'::regclass`);
  assert.equal(ledger.relrowsecurity, true); checks++;
  const queue = await queryOne(`select relrowsecurity from pg_class
    where oid='public.marketing_email_reconciliation_jobs'::regclass`);
  assert.equal(queue.relrowsecurity, true); checks++;
  for (const table of ["marketing_email_consent_events", "marketing_email_reconciliation_jobs"]) {
    for (const role of ["anon", "authenticated"]) {
      for (const verb of ["select", "insert", "update", "delete"]) {
        const row = await queryOne("select has_table_privilege($1,$2,$3) as allowed", [role, "public."+table, verb]);
        assert.equal(row.allowed, false, role+" "+verb+" on "+table); checks++;
      }
    }
  }
  const insertLedger = `insert into public.marketing_email_consent_events
    (customer_id,email,decision,source,policy_version,evidence_reference)
    values ($1,$2,$3,$4,$5,$6)`;
  await db.query(insertLedger,[customerId,"synthetic@example.test","granted","authenticated_preferences","v1","synthetic-1"]); checks++;
  await assert.rejects(db.query(`update public.marketing_email_consent_events
    set email='changed@example.test' where customer_id=$1`,[customerId]),
    /marketing consent evidence is append-only/); checks++;
  await assert.rejects(db.query(`delete from public.marketing_email_consent_events where customer_id=$1`,[customerId]),
    /marketing consent evidence is append-only/); checks++;
  await assert.rejects(db.query(insertLedger,[customerId,"UPPER@EXAMPLE.TEST","granted","authenticated_preferences","v1","synthetic-2"])); checks++;
  await assert.rejects(db.query(insertLedger,[customerId,"synthetic@example.test","granted","authenticated_preferences","","synthetic-3"])); checks++;
  await db.query(insertLedger,[customerId,"synthetic@example.test","withdrawn","resend_contact_webhook","v1","evt-synthetic-1"]); checks++;
  await assert.rejects(db.query(insertLedger,[customerId,"synthetic@example.test","withdrawn","resend_contact_webhook","v1","evt-synthetic-1"])); checks++;
  await db.query(`insert into public.marketing_email_reconciliation_jobs
    (customer_id,email,action) values($1,$2,'unsubscribe')`,[customerId,"synthetic@example.test"]); checks++;
  await assert.rejects(db.query(`insert into public.marketing_email_reconciliation_jobs
    (customer_id,email,action) values($1,$2,'subscribe')`,[customerId,"different@example.test"])); checks++;
  console.log("PASS: "+checks+" isolated native PostgreSQL security and immutable-ledger checks; synthetic records only, no remote database.");
} finally {
  await db.close();
}
