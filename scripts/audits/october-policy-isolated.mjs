import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.AUDIT_PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();let checks=0;
try {
 await db.exec(`create role anon; create role authenticated;
 create table recurring_bookings(id uuid, earnings_policy text, legacy_earnings_cents integer);
 create table customer_earnings_policies(customer_id uuid, earnings_policy text, legacy_earnings_cents integer, applies_to_services text[]);
 create table booking_cleaners(booking_id uuid,cleaner_id uuid);
 create table bookings(id uuid,recurring_id uuid,customer_id uuid,service_slug text,service text,date text,is_team_job boolean,
 metadata jsonb,cleaner_id uuid,payout_owner_cleaner_id uuid,earnings_policy text,display_earnings_cents integer,internal_earnings_cents integer,
 billing_type text,is_monthly_billing_booking boolean,payment_status text,monthly_invoice_id uuid,total_paid_cents integer,total_paid_zar integer,amount_paid_cents integer,
 cleaner_payout_cents integer,payout_earnings_cents integer,payout_status text,payout_frozen_cents integer,earnings_model_version text,earnings_percentage_applied numeric,
 earnings_cap_cents_applied integer,earnings_tenure_months_at_assignment numeric,earnings_policy_locked_at timestamptz);
 insert into recurring_bookings values('00000000-0000-4000-8000-000000000001','legacy_july',26000);`);
 await db.exec(await readFile(new URL('../../supabase/migrations/20261015215500_october_locked_recurring_basis.sql',import.meta.url),'utf8'));
 await db.exec(`create trigger policy before insert or update on bookings for each row execute function apply_booking_earnings_policy_lock();`);
 for(const [date,paired,cap,expected] of [['2026-10-15',true,66000,52000],['2026-10-15',false,66000,26000],['2026-09-30',true,66000,26000],['2026-10-15',true,40000,52000]]){
  await db.exec('truncate bookings,booking_cleaners;');
  if(paired)await db.exec(`insert into booking_cleaners values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004');`);
  await db.query(`insert into bookings(id,recurring_id,service,date,is_team_job,total_paid_cents,payout_status) values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','standard',$1,false,$2,'pending')`,[date,cap]);
  const {rows}=await db.query('select display_earnings_cents,internal_earnings_cents,cleaner_payout_cents from bookings');
  assert.equal(rows[0].display_earnings_cents,26000);assert.equal(rows[0].internal_earnings_cents,expected);
  assert.equal(rows[0].cleaner_payout_cents,cap<expected?null:26000);checks+=3;
 }
 console.log(`${checks} isolated October policy checks passed; no remote connection.`);
}finally{await db.close();}
