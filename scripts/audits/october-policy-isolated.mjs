import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.AUDIT_PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();let checks=0;
try {
 await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);
 insert into auth.users values('00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000099');
 create function auth.role() returns text language sql as $$ select coalesce(current_setting('request.jwt.claim.role',true),'service_role') $$;
 create table recurring_bookings(id uuid, earnings_policy text, legacy_earnings_cents integer);
 create table customer_earnings_policies(customer_id uuid, earnings_policy text, legacy_earnings_cents integer, applies_to_services text[]);
 create table cleaner_earnings_adjustments(id integer generated always as identity,booking_id uuid,cleaner_id uuid,amount_cents integer,reason text,dispute_id uuid,created_by uuid references auth.users(id) on delete set null,created_by_email text);
 create table cleaner_earnings_disputes(id uuid primary key,booking_id uuid,cleaner_id uuid,status text,admin_response text,reviewed_by uuid,reviewed_by_email text,reviewed_at timestamptz,resolved_by uuid,resolved_by_email text,resolved_at timestamptz);
 create table cleaner_earnings(booking_id uuid,status text,disbursement_id uuid,paid_at timestamptz);
 create table booking_roster_member_payouts(booking_id uuid,cleaner_id uuid,payout_cents integer,bonus_cents integer,status text,cleaner_payout_id uuid,unique(booking_id,cleaner_id));
 create table team_job_member_payouts(booking_id uuid,cleaner_id uuid,status text,cleaner_payout_id uuid);
 create table bookings(id uuid primary key,recurring_id uuid,customer_id uuid,service_slug text,service text,date text,is_team_job boolean,
 earnings_summary jsonb,company_revenue_cents integer,cleaner_bonus_cents integer,metadata jsonb,cleaner_id uuid,payout_owner_cleaner_id uuid,earnings_policy text,display_earnings_cents integer,internal_earnings_cents integer,
 billing_type text,is_monthly_billing_booking boolean,payment_status text,monthly_invoice_id uuid,total_paid_cents integer,total_paid_zar integer,amount_paid_cents integer,
 cleaner_payout_cents integer,payout_earnings_cents integer,payout_status text,payout_frozen_cents integer,earnings_model_version text,earnings_percentage_applied numeric,
 earnings_cap_cents_applied integer,earnings_tenure_months_at_assignment numeric,earnings_policy_locked_at timestamptz,
payout_id uuid,payout_run_id uuid,payout_paid_at timestamptz,base_amount_cents integer);
create table booking_cleaners(booking_id uuid references bookings(id),cleaner_id uuid,role text);
 insert into recurring_bookings values('00000000-0000-4000-8000-000000000001','legacy_july',26000);`);
 await db.exec(await readFile(new URL('../../supabase/migrations/20261015215500_october_locked_recurring_basis.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../supabase/migrations/20261016081753_october_locked_adjustment_payables.sql',import.meta.url),'utf8'));
 await db.exec(`create trigger policy before insert or update of recurring_id,customer_id,service,service_slug,display_earnings_cents,cleaner_payout_cents,payout_earnings_cents,internal_earnings_cents,payout_frozen_cents,payout_status on bookings for each row execute function apply_booking_earnings_policy_lock();`);
 for(const [date,paired,cap,expected] of [['2026-10-15',true,66000,52000],['2026-10-15',false,66000,26000],['2026-09-30',true,66000,26000],['2026-10-15',true,40000,52000]]){
  await db.exec('truncate bookings,booking_cleaners,cleaner_earnings_adjustments,booking_roster_member_payouts;');
  await db.query(`insert into bookings(id,recurring_id,service,date,is_team_job,total_paid_cents,payout_status,cleaner_id) values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','standard',$1,false,$2,'pending','00000000-0000-4000-8000-000000000003')`,[date,cap]);
  if(paired)await db.exec(`insert into booking_cleaners(booking_id,cleaner_id) values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004');`);
  const {rows}=await db.query('select display_earnings_cents,internal_earnings_cents,cleaner_payout_cents from bookings');
  assert.equal(rows[0].display_earnings_cents,26000);assert.equal(rows[0].internal_earnings_cents,expected);
  assert.equal(rows[0].cleaner_payout_cents,cap<expected?null:26000);checks+=3;
 }
 // The FK enforces production order: booking first, roster second.
await db.exec("truncate bookings,booking_cleaners,cleaner_earnings_adjustments,booking_roster_member_payouts;");
await db.exec(`insert into bookings(id,recurring_id,service,date,is_team_job,total_paid_cents,payment_status,base_amount_cents,payout_status,cleaner_id)
values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','standard','2026-10-15',false,0,'success',66000,'pending','00000000-0000-4000-8000-000000000003');
insert into booking_cleaners(booking_id,cleaner_id) values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004');`);
let row=(await db.query('select * from bookings')).rows[0];
assert.equal(row.internal_earnings_cents,52000);assert.equal(row.cleaner_payout_cents,26000);checks+=2;
await db.exec(`insert into cleaner_earnings_adjustments(booking_id,cleaner_id,amount_cents) values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003',500),('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004',-300);`);
row=(await db.query('select * from bookings')).rows[0];
assert.equal(row.internal_earnings_cents,52200);assert.equal(row.cleaner_payout_cents,26000);checks+=2;
await db.exec("delete from booking_cleaners where cleaner_id='00000000-0000-4000-8000-000000000004';");
assert.equal((await db.query('select internal_earnings_cents from bookings')).rows[0].internal_earnings_cents,26500);checks++;
await db.exec("update bookings set date='2026-09-30';");
const before=(await db.query('select internal_earnings_cents from bookings')).rows[0].internal_earnings_cents;
await db.exec("insert into booking_cleaners(booking_id,cleaner_id) values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004');");
assert.equal((await db.query('select internal_earnings_cents from bookings')).rows[0].internal_earnings_cents,before);checks++;
// Standalone adjustment update/delete refreshes, with no booking write by caller.
await db.exec("update bookings set date='2026-10-15'; update cleaner_earnings_adjustments set amount_cents=700 where amount_cents=500;");
assert.equal((await db.query('select internal_earnings_cents from bookings')).rows[0].internal_earnings_cents,52400);checks++;
await db.exec('delete from cleaner_earnings_adjustments;');
assert.equal((await db.query('select internal_earnings_cents from bookings')).rows[0].internal_earnings_cents,52000);checks++;
await db.exec("update bookings set payout_run_id='00000000-0000-4000-8000-000000000099';");
await assert.rejects(db.exec("insert into cleaner_earnings_adjustments(booking_id,cleaner_id,amount_cents) values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003',500);"),/booking_payout_locked/);checks++;
assert.equal((await db.query('select internal_earnings_cents from bookings')).rows[0].internal_earnings_cents,52000);checks++;
await db.exec("update bookings set payout_run_id=null; insert into cleaner_earnings values('00000000-0000-4000-8000-000000000002','paid',null,now());");
await assert.rejects(db.exec("insert into cleaner_earnings_adjustments(booking_id,cleaner_id,amount_cents) values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003',900);"),/booking_payout_locked/);checks++;
assert.equal((await db.query('select internal_earnings_cents from bookings')).rows[0].internal_earnings_cents,52000);checks++;
// Payable columns, participant summary and member rows must change with the
// adjustment statement, including insert/update/delete and rollback on failure.
await db.exec("truncate bookings,booking_cleaners,cleaner_earnings_adjustments,cleaner_earnings,booking_roster_member_payouts;");
const bid='00000000-0000-4000-8000-000000000002';
const lead='00000000-0000-4000-8000-000000000003';
const member='00000000-0000-4000-8000-000000000004';
await db.query(`insert into bookings(id,recurring_id,service,date,is_team_job,total_paid_cents,payment_status,base_amount_cents,payout_status,cleaner_id,earnings_summary)
 values($1,'00000000-0000-4000-8000-000000000001','standard','2026-10-16',false,66000,'success',66000,'pending',$2,$3)`,[bid,lead,{customer_total_cents:66000,costs_cents:0,per_cleaner_earnings:[],total_cleaner_earnings_cents:0}]);
await db.query('insert into booking_cleaners(booking_id,cleaner_id) values($1,$2),($1,$3)',[bid,lead,member]);
async function assertPayable(leadTotal,memberTotal) {
 const b=(await db.query('select * from bookings where id=$1',[bid])).rows[0];
 const m=(await db.query('select * from booking_roster_member_payouts where booking_id=$1 and cleaner_id=$2',[bid,member])).rows[0];
 assert.equal(b.cleaner_payout_cents+b.cleaner_bonus_cents,leadTotal);checks++;
 assert.equal(m.payout_cents+m.bonus_cents,memberTotal);checks++;
 assert.equal(b.internal_earnings_cents,leadTotal+memberTotal);checks++;
 assert.equal(b.earnings_summary.total_cleaner_earnings_cents,leadTotal+memberTotal);checks++;
 assert.equal(b.earnings_summary.per_cleaner_earnings.find(r=>r.cleaner_id===member).total_cents,memberTotal);checks++;
 assert.equal(b.earnings_summary.company_revenue_cents,66000-leadTotal-memberTotal);checks++;
}
await db.query(`insert into cleaner_earnings_adjustments(booking_id,cleaner_id,amount_cents,reason) values($1,$2,500,'bonus'),($1,$3,-300,'deduction')`,[bid,lead,member]);
await assertPayable(26500,25700);
await db.query('update cleaner_earnings_adjustments set amount_cents=-700 where cleaner_id=$1',[lead]);
await assertPayable(25300,25700);
await db.query('delete from cleaner_earnings_adjustments where cleaner_id=$1',[member]);
await assertPayable(25300,26000);
await db.query('delete from cleaner_earnings_adjustments where cleaner_id=$1',[lead]);
await assertPayable(26000,26000);
await db.query('insert into cleaner_earnings_adjustments(booking_id,cleaner_id,amount_cents) values($1,$2,500)',[bid,member]);
await assertPayable(26000,26500);
// Linked/non-pending member history is never refreshed by a new adjustment.
const lockedBefore=(await db.query('select earnings_summary,internal_earnings_cents,cleaner_payout_cents,cleaner_bonus_cents from bookings')).rows[0];
await db.exec("update booking_roster_member_payouts set status='batched';");
await assert.rejects(db.query('update cleaner_earnings_adjustments set amount_cents=900 where cleaner_id=$1',[member]),/booking_payout_locked/);checks++;
await assert.rejects(db.query('delete from cleaner_earnings_adjustments where cleaner_id=$1',[member]),/booking_payout_locked/);checks++;
assert.deepEqual((await db.query('select earnings_summary,internal_earnings_cents,cleaner_payout_cents,cleaner_bonus_cents from bookings')).rows[0],lockedBefore);checks++;
assert.equal((await db.query('select payout_cents+bonus_cents as total from booking_roster_member_payouts')).rows[0].total,26500);checks++;
await db.exec("update booking_roster_member_payouts set status='pending';");
await db.query('update cleaner_earnings_adjustments set amount_cents=500 where cleaner_id=$1',[member]);
// Child write failures cannot commit an adjustment with stale payable rows.
await db.exec(`create function reject_member_update() returns trigger language plpgsql as $$ begin raise exception 'injected member write failure'; end; $$;
create trigger fail_member before update on booking_roster_member_payouts for each row execute function reject_member_update();`);
await assert.rejects(db.query('update cleaner_earnings_adjustments set amount_cents=900 where cleaner_id=$1',[member]),/injected member write failure/);checks++;
assert.equal((await db.query('select amount_cents from cleaner_earnings_adjustments')).rows[0].amount_cents,500);checks++;
await assertPayable(26000,26500);
await db.exec('drop trigger fail_member on booking_roster_member_payouts;');
// Solo negative adjustments remain a nonnegative payable; over-deduction floors at zero.
await db.query('delete from booking_cleaners where cleaner_id=$1',[member]);
await db.query('delete from cleaner_earnings_adjustments where cleaner_id=$1',[member]);
await db.query('insert into cleaner_earnings_adjustments(booking_id,cleaner_id,amount_cents) values($1,$2,-30000)',[bid,lead]);
row=(await db.query('select * from bookings')).rows[0];
assert.equal(row.cleaner_payout_cents+row.cleaner_bonus_cents,0);checks++;
assert.equal(row.earnings_summary.total_cleaner_earnings_cents,0);checks++;
assert.equal((await db.query('select count(*)::integer as n from booking_roster_member_payouts')).rows[0].n,0);checks++;
// Roster changes rebuild both rails without requiring a later adjustment/reset.
await db.query('delete from cleaner_earnings_adjustments where cleaner_id=$1',[lead]);
await db.query('insert into booking_cleaners(booking_id,cleaner_id) values($1,$2)',[bid,member]);
await assertPayable(26000,26000);
await db.query('delete from booking_cleaners where cleaner_id=$1',[lead]);
row=(await db.query('select * from bookings')).rows[0];
assert.equal(row.cleaner_id,member);checks++;
assert.equal(row.payout_owner_cleaner_id,member);checks++;
assert.equal(row.internal_earnings_cents,26000);checks++;
assert.equal(row.earnings_summary.cleaner_count,1);checks++;
assert.equal((await db.query('select count(*)::integer n from booking_roster_member_payouts')).rows[0].n,0);checks++;
await db.query('delete from booking_cleaners where cleaner_id=$1',[member]);
row=(await db.query('select * from bookings')).rows[0];
assert.equal(row.cleaner_id,null);checks++;
assert.equal(row.payout_owner_cleaner_id,null);checks++;
assert.equal(row.internal_earnings_cents,0);checks++;
assert.equal(row.earnings_summary.total_cleaner_earnings_cents,0);checks++;
await db.query('insert into booking_cleaners(booking_id,cleaner_id) values($1,$2),($1,$3)',[bid,lead,member]);
await assertPayable(26000,26000);
// Roster replacement may insert the member before its declared lead. Rebuild
// identity, roles and net payable rails from the final lead, not a transient owner.
await db.query('insert into cleaner_earnings_adjustments(booking_id,cleaner_id,amount_cents) values($1,$2,500),($1,$3,-300)',[bid,lead,member]);
await db.query('delete from booking_cleaners where booking_id=$1',[bid]);
await db.query("insert into booking_cleaners(booking_id,cleaner_id,role) values($1,$2,'member')",[bid,member]);
await db.query("insert into booking_cleaners(booking_id,cleaner_id,role) values($1,$2,'lead')",[bid,lead]);
row=(await db.query('select * from bookings')).rows[0];
assert.equal(row.cleaner_id,lead);checks++;
assert.equal(row.payout_owner_cleaner_id,lead);checks++;
assert.equal(row.earnings_summary.team_leader_id,lead);checks++;
assert.equal(row.earnings_summary.per_cleaner_earnings.find(r=>r.cleaner_id===lead).role,'lead');checks++;
await assertPayable(26500,25700);
await db.query('delete from cleaner_earnings_adjustments where booking_id=$1',[bid]);
await assertPayable(26000,26000);
// A bonus cannot create an independently batchable member amount over the cap.
await db.exec('update bookings set total_paid_cents=52000,base_amount_cents=52000;');
await assert.rejects(db.query('insert into cleaner_earnings_adjustments(booking_id,cleaner_id,amount_cents) values($1,$2,500)',[bid,member]),/payout_exceeds_financial_cap/);checks++;
assert.equal((await db.query('select count(*)::integer n from cleaner_earnings_adjustments')).rows[0].n,0);checks++;
await assertPayable(26000,26000);
await db.exec('update bookings set total_paid_cents=66000,base_amount_cents=66000;');
await db.query('insert into cleaner_earnings_adjustments(booking_id,cleaner_id,amount_cents) values($1,$2,500)',[bid,member]);
// Unpaid roster writes retain member earned amounts; the null booking basis blocks batching;
// recording customer settlement refreshes those rails without a roster rewrite.
await db.exec("update bookings set billing_type='recurring_invoice',payment_status='pending_monthly',total_paid_cents=0,base_amount_cents=66000;");
assert.equal((await db.query('select cleaner_payout_cents from bookings')).rows[0].cleaner_payout_cents,null);checks++;
assert.equal((await db.query('select payout_cents+bonus_cents total from booking_roster_member_payouts')).rows[0].total,26500);checks++;
assert.equal((await db.query('select internal_earnings_cents from bookings')).rows[0].internal_earnings_cents,52500);checks++;
const unpaidDispute='00000000-0000-4000-8000-000000000087';
await db.query("insert into cleaner_earnings_disputes(id,booking_id,cleaner_id,status) values($1,$2,$3,'open')",[unpaidDispute,bid,member]);
await db.query("select public.resolve_cleaner_dispute_with_adjustment($1,-300,'Earned deduction','Reviewed',$2,'admin@example.com')",[unpaidDispute,lead]);
assert.equal((await db.query('select status from cleaner_earnings_disputes where id=$1',[unpaidDispute])).rows[0].status,'resolved');checks++;
assert.equal((await db.query('select internal_earnings_cents from bookings')).rows[0].internal_earnings_cents,52200);checks++;
assert.equal((await db.query('select cleaner_payout_cents from bookings')).rows[0].cleaner_payout_cents,null);checks++;
assert.equal((await db.query('select payout_cents+bonus_cents total from booking_roster_member_payouts')).rows[0].total,26200);checks++;
// A decrease remains possible even if the pre-write header/summary was stale.
await db.exec('alter table bookings disable trigger policy; update bookings set internal_earnings_cents=1; alter table bookings enable trigger policy;');
await db.query('update cleaner_earnings_adjustments set amount_cents=-400 where amount_cents=-300');
assert.equal((await db.query('select internal_earnings_cents from bookings')).rows[0].internal_earnings_cents,52100);checks++;
// Actual invoice settlement changes payment and payout eligibility together.
await db.exec("update bookings set payment_status='success',total_paid_cents=66000,payout_status='eligible';");
await assertPayable(26000,26100);
assert.equal((await db.query('select payout_status from bookings')).rows[0].payout_status,'eligible');checks++;
await db.exec("update bookings set payout_status='pending';");
await assertPayable(26000,26100);
// Summary-absent adjustments and roster changes preserve the original margin basis.
await db.exec('update bookings set earnings_summary=null,company_revenue_cents=13900;');
await db.query('insert into cleaner_earnings_adjustments(booking_id,cleaner_id,amount_cents) values($1,$2,500)',[bid,lead]);
assert.equal((await db.query('select company_revenue_cents from bookings')).rows[0].company_revenue_cents,13400);checks++;
await db.query('delete from cleaner_earnings_adjustments where booking_id=$1 and cleaner_id=$2',[bid,lead]);
assert.equal((await db.query('select company_revenue_cents from bookings')).rows[0].company_revenue_cents,13900);checks++;
await db.query('delete from booking_cleaners where booking_id=$1 and cleaner_id=$2',[bid,member]);
assert.equal((await db.query('select company_revenue_cents from bookings')).rows[0].company_revenue_cents,40000);checks++;
await db.query('insert into booking_cleaners(booking_id,cleaner_id) values($1,$2)',[bid,member]);
assert.equal((await db.query('select company_revenue_cents from bookings')).rows[0].company_revenue_cents,13900);checks++;
await db.exec('update bookings set company_revenue_cents=100;');
await db.query('insert into cleaner_earnings_adjustments(booking_id,cleaner_id,amount_cents) values($1,$2,500)',[bid,lead]);
assert.equal((await db.query('select company_revenue_cents from bookings')).rows[0].company_revenue_cents,-400);checks++;
await db.query('delete from cleaner_earnings_adjustments where booking_id=$1 and cleaner_id=$2',[bid,lead]);
assert.equal((await db.query('select company_revenue_cents from bookings')).rows[0].company_revenue_cents,100);checks++;
await db.exec("update bookings set company_revenue_cents=13900,earnings_summary=jsonb_build_object('customer_total_cents',66000,'costs_cents',0);");
// Dispute closure, adjustment insertion and payable refresh are one transaction.
await db.query('delete from cleaner_earnings_adjustments where cleaner_id=$1',[member]);
const dispute='00000000-0000-4000-8000-000000000088';
const actor='00000000-0000-4000-8000-000000000099';
await db.query("insert into cleaner_earnings_disputes(id,booking_id,cleaner_id,status) values($1,$2,$3,'open')",[dispute,bid,member]);
const resolve=()=>db.query("select public.resolve_cleaner_dispute_with_adjustment($1,15000,'Audit correction','Reviewed',$2,'admin@example.com')",[dispute,actor]);
await assert.rejects(resolve(),/payout_exceeds_financial_cap/);checks++;
assert.equal((await db.query('select status from cleaner_earnings_disputes where id=$1',[dispute])).rows[0].status,'open');checks++;
assert.equal((await db.query('select count(*)::integer n from cleaner_earnings_adjustments')).rows[0].n,0);checks++;
await db.exec("update booking_roster_member_payouts set status='batched';");
await assert.rejects(resolve(),/booking_payout_locked/);checks++;
assert.equal((await db.query('select status from cleaner_earnings_disputes where id=$1',[dispute])).rows[0].status,'open');checks++;
await db.exec("update booking_roster_member_payouts set status='pending';");
await db.query("select public.resolve_cleaner_dispute_with_adjustment($1,500,'Audit correction','Reviewed',$2,'admin@example.com')",[dispute,actor]);
row=(await db.query('select * from cleaner_earnings_disputes where id=$1',[dispute])).rows[0];
assert.equal(row.status,'resolved');checks++;
assert.equal(row.resolved_by,actor);checks++;
assert.equal(row.reviewed_by_email,'admin@example.com');checks++;
assert.equal((await db.query('select created_by from cleaner_earnings_adjustments')).rows[0].created_by,actor);checks++;
await assertPayable(26000,26500);
await assert.rejects(resolve(),/dispute_already_closed/);checks++;
assert.equal((await db.query('select count(*)::integer n from cleaner_earnings_adjustments')).rows[0].n,1);checks++;
assert.equal((await db.query("select has_function_privilege('anon','public.resolve_cleaner_dispute_with_adjustment(uuid,integer,text,text,uuid,text)','execute') allowed")).rows[0].allowed,false);checks++;
const financial=async()=> (await db.query('select display_earnings_cents,internal_earnings_cents,cleaner_payout_cents,cleaner_bonus_cents,earnings_summary from bookings')).rows[0];
await db.exec("update bookings set date='2026-09-30';");
let preserved=await financial();
await db.query('update cleaner_earnings_adjustments set amount_cents=-100 where cleaner_id=$1',[member]);
assert.deepEqual(await financial(),preserved);checks++;
await db.exec("update bookings set date='2026-10-16',is_team_job=true;");
preserved=await financial();
await db.query('update cleaner_earnings_adjustments set amount_cents=500 where cleaner_id=$1',[member]);
assert.deepEqual(await financial(),preserved);checks++;
await db.exec(`update bookings set is_team_job=false,metadata='{"payout_attribution_removal_v1":{"active":true,"cleaner_id":"00000000-0000-4000-8000-000000000003"}}';`);
preserved=await financial();
await assert.rejects(db.query('update cleaner_earnings_adjustments set amount_cents=700 where cleaner_id=$1',[member]),/payout_attribution_removed/);checks++;
assert.deepEqual(await financial(),preserved);checks++;
// An intentional removal remains suppressed, but a real replacement cleaner
// must not inherit the old cleaner's removal marker.
await db.query('delete from booking_cleaners where cleaner_id=$1',[lead]);
row=(await db.query('select * from bookings')).rows[0];
assert.equal(row.cleaner_id,member);checks++;
assert.equal(row.cleaner_payout_cents+row.cleaner_bonus_cents,26500);checks++;
assert.equal(row.earnings_summary.cleaner_count,1);checks++;
assert.equal(row.metadata.payout_attribution_removal_v1.active,true);checks++;
assert.equal((await db.query("select has_function_privilege('anon','public.refresh_current_locked_booking_policy()','execute') as allowed")).rows[0].allowed,false);checks++;
assert.equal((await db.query("select has_function_privilege('authenticated','public.apply_booking_earnings_policy_lock()','execute') as allowed")).rows[0].allowed,false);checks++;
// Unsupported dispute policies fail before adjustment insertion or closure.
const unsupportedDispute='00000000-0000-4000-8000-000000000091';
await db.query("insert into cleaner_earnings_disputes(id,booking_id,cleaner_id,status) values($1,$2,$3,'open')",[unsupportedDispute,bid,lead]);
for(const patch of ["earnings_policy='current_v1'","earnings_policy='legacy_july',is_team_job=true","is_team_job=false,service='unsupported'"]) {
 await db.exec('alter table bookings disable trigger policy; update bookings set '+patch+'; alter table bookings enable trigger policy;');
 const countBefore=(await db.query('select count(*)::integer n from cleaner_earnings_adjustments')).rows[0].n;
 await assert.rejects(db.query("select public.resolve_cleaner_dispute_with_adjustment($1,500,'Unsupported','Reviewed',$2,'admin@example.com')",[unsupportedDispute,lead]),/unsupported_dispute_adjustment_policy/);checks++;
 assert.equal((await db.query('select status from cleaner_earnings_disputes where id=$1',[unsupportedDispute])).rows[0].status,'open');checks++;
 assert.equal((await db.query('select count(*)::integer n from cleaner_earnings_adjustments')).rows[0].n,countBefore);checks++;
}
await db.exec("alter table bookings disable trigger policy; update bookings set earnings_policy='legacy_july',is_team_job=false,service='standard'; alter table bookings enable trigger policy;");
await db.exec("update bookings set payout_run_id='00000000-0000-4000-8000-000000000077';");
const beforeAuthDelete=(await db.query('select to_jsonb(b) value from bookings b')).rows;
await db.query('delete from auth.users where id=$1',[actor]);
assert.equal((await db.query('select created_by from cleaner_earnings_adjustments')).rows[0].created_by,null);checks++;
assert.equal((await db.query('select created_by_email from cleaner_earnings_adjustments')).rows[0].created_by_email,'admin@example.com');checks++;
assert.deepEqual((await db.query('select to_jsonb(b) value from bookings b')).rows,beforeAuthDelete);checks++;
console.log(`${checks} isolated October policy checks passed; no remote connection.`);
}finally{await db.close();}
