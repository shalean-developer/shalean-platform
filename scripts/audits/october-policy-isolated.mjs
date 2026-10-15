import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.AUDIT_PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();let checks=0;
try {
 await db.exec(`create role anon; create role authenticated;
 create table recurring_bookings(id uuid, earnings_policy text, legacy_earnings_cents integer);
 create table customer_earnings_policies(customer_id uuid, earnings_policy text, legacy_earnings_cents integer, applies_to_services text[]);
 create table cleaner_earnings_adjustments(booking_id uuid,cleaner_id uuid,amount_cents integer);
 create table cleaner_earnings(booking_id uuid,status text,disbursement_id uuid,paid_at timestamptz);
 create table booking_roster_member_payouts(booking_id uuid,status text,cleaner_payout_id uuid);
 create table team_job_member_payouts(booking_id uuid,status text,cleaner_payout_id uuid);
 create table bookings(id uuid primary key,recurring_id uuid,customer_id uuid,service_slug text,service text,date text,is_team_job boolean,
 metadata jsonb,cleaner_id uuid,payout_owner_cleaner_id uuid,earnings_policy text,display_earnings_cents integer,internal_earnings_cents integer,
 billing_type text,is_monthly_billing_booking boolean,payment_status text,monthly_invoice_id uuid,total_paid_cents integer,total_paid_zar integer,amount_paid_cents integer,
 cleaner_payout_cents integer,payout_earnings_cents integer,payout_status text,payout_frozen_cents integer,earnings_model_version text,earnings_percentage_applied numeric,
 earnings_cap_cents_applied integer,earnings_tenure_months_at_assignment numeric,earnings_policy_locked_at timestamptz,
payout_id uuid,payout_run_id uuid,payout_paid_at timestamptz,base_amount_cents integer);
create table booking_cleaners(booking_id uuid references bookings(id),cleaner_id uuid);
 insert into recurring_bookings values('00000000-0000-4000-8000-000000000001','legacy_july',26000);`);
 await db.exec(await readFile(new URL('../../supabase/migrations/20261015215500_october_locked_recurring_basis.sql',import.meta.url),'utf8'));
 await db.exec(`create trigger policy before insert or update of recurring_id,customer_id,service,service_slug,display_earnings_cents,cleaner_payout_cents,payout_earnings_cents,internal_earnings_cents,payout_frozen_cents,payout_status on bookings for each row execute function apply_booking_earnings_policy_lock();`);
 for(const [date,paired,cap,expected] of [['2026-10-15',true,66000,52000],['2026-10-15',false,66000,26000],['2026-09-30',true,66000,26000],['2026-10-15',true,40000,52000]]){
  await db.exec('truncate bookings,booking_cleaners,cleaner_earnings_adjustments;');
  await db.query(`insert into bookings(id,recurring_id,service,date,is_team_job,total_paid_cents,payout_status) values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','standard',$1,false,$2,'pending')`,[date,cap]);
  if(paired)await db.exec(`insert into booking_cleaners values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004');`);
  const {rows}=await db.query('select display_earnings_cents,internal_earnings_cents,cleaner_payout_cents from bookings');
  assert.equal(rows[0].display_earnings_cents,26000);assert.equal(rows[0].internal_earnings_cents,expected);
  assert.equal(rows[0].cleaner_payout_cents,cap<expected?null:26000);checks+=3;
 }
 // The FK enforces production order: booking first, roster second.
await db.exec("truncate bookings,booking_cleaners,cleaner_earnings_adjustments;");
await db.exec(`insert into bookings(id,recurring_id,service,date,is_team_job,total_paid_cents,payment_status,base_amount_cents,payout_status,cleaner_id)
values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','standard','2026-10-15',false,0,'success',66000,'pending','00000000-0000-4000-8000-000000000003');
insert into booking_cleaners values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004');`);
let row=(await db.query('select * from bookings')).rows[0];
assert.equal(row.internal_earnings_cents,52000);assert.equal(row.cleaner_payout_cents,26000);checks+=2;
await db.exec(`insert into cleaner_earnings_adjustments values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003',500),('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004',-300);`);
row=(await db.query('select * from bookings')).rows[0];
assert.equal(row.internal_earnings_cents,52200);assert.equal(row.cleaner_payout_cents,26000);checks+=2;
await db.exec("delete from booking_cleaners where cleaner_id='00000000-0000-4000-8000-000000000004';");
assert.equal((await db.query('select internal_earnings_cents from bookings')).rows[0].internal_earnings_cents,26500);checks++;
await db.exec("update bookings set date='2026-09-30';");
const before=(await db.query('select internal_earnings_cents from bookings')).rows[0].internal_earnings_cents;
await db.exec("insert into booking_cleaners values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004');");
assert.equal((await db.query('select internal_earnings_cents from bookings')).rows[0].internal_earnings_cents,before);checks++;
// Standalone adjustment update/delete refreshes, with no booking write by caller.
await db.exec("update bookings set date='2026-10-15'; update cleaner_earnings_adjustments set amount_cents=700 where amount_cents=500;");
assert.equal((await db.query('select internal_earnings_cents from bookings')).rows[0].internal_earnings_cents,52400);checks++;
await db.exec('delete from cleaner_earnings_adjustments;');
assert.equal((await db.query('select internal_earnings_cents from bookings')).rows[0].internal_earnings_cents,52000);checks++;
await db.exec("update bookings set payout_run_id='00000000-0000-4000-8000-000000000099'; insert into cleaner_earnings_adjustments values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003',500);");
assert.equal((await db.query('select internal_earnings_cents from bookings')).rows[0].internal_earnings_cents,52000);checks++;
await db.exec("update bookings set payout_run_id=null; insert into cleaner_earnings values('00000000-0000-4000-8000-000000000002','paid',null,now()); update cleaner_earnings_adjustments set amount_cents=900;");
assert.equal((await db.query('select internal_earnings_cents from bookings')).rows[0].internal_earnings_cents,52000);checks++;
console.log(`${checks} isolated October policy checks passed; no remote connection.`);
}finally{await db.close();}
