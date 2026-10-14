// Isolated PostgreSQL regression harness. Requires @electric-sql/pglite externally;
// AUDIT_PGLITE_MODULE may name an installed module URL. No network or remote DB access.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite }=await import(process.env.AUDIT_PGLITE_MODULE ?? '@electric-sql/pglite');
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
create table audit_users(id uuid primary key);
create table bookings(currency text, paystack_reference text,customer_email text,customer_id uuid,selected_cleaner_id uuid,assignment_type text,payment_status text,payment_completed_at timestamptz,created_at timestamptz,updated_at timestamptz,refund_status text,id uuid primary key,check(not((cleaner_id is not null or selected_cleaner_id is not null) and status='pending')),date date,time text,assigned_at timestamptz,service_slug text,base_amount_cents int,service_fee_cents int,total_paid_zar numeric,total_paid_cents int,amount_paid_cents int,price_snapshot jsonb,cleaner_id uuid,payout_owner_cleaner_id uuid,team_id uuid,is_team_job boolean,cleaner_count int,team_member_count_snapshot int,
status text,payout_id uuid,payout_status text,payout_paid_at timestamptz,payout_frozen_cents int,
cleaner_payout_cents int,cleaner_bonus_cents int,display_earnings_cents int,internal_earnings_cents int,payout_earnings_cents int,cleaner_earnings_total_cents int,company_revenue_cents int,
cleaner_share_percentage numeric,earnings_summary jsonb,cleaner_line_earnings_finalized_at timestamptz,earnings_model_version text,payout_percentage numeric,payout_type text,
earnings_percentage_applied numeric,earnings_cap_cents_applied int,earnings_tenure_months_at_assignment int,service text,booking_snapshot jsonb);
create table cleaner_payouts(id uuid primary key,period_start date,period_end date);
create table cleaner_earnings(id uuid primary key,booking_id uuid references bookings on delete cascade,cleaner_id uuid,amount_cents int,status text,disbursement_id uuid,paid_at timestamptz,updated_at timestamptz);
create table booking_roster_member_payouts(id uuid primary key,booking_id uuid references bookings on delete cascade,cleaner_id uuid,payout_cents int,bonus_cents int,status text,cleaner_payout_id uuid);
create table team_job_member_payouts(id uuid primary key,booking_id uuid references bookings on delete cascade,cleaner_id uuid,team_id uuid,payout_cents int,status text,cleaner_payout_id uuid);
create table booking_cleaners(booking_id uuid references bookings on delete cascade,cleaner_id uuid,role text,payout_weight numeric,lead_bonus_cents int,source text,completed_at timestamptz);
create table booking_line_items(id uuid primary key,booking_id uuid references bookings on delete cascade,cleaner_earnings_cents int,total_price_cents int,unit_price_cents int,quantity int,earns_cleaner boolean,name text,item_type text,slug text,metadata jsonb);
create table booking_cleaner_earnings_snapshot(booking_id uuid references bookings on delete cascade,cleaner_id uuid,display_earnings_cents int,updated_at timestamptz);
create table cleaner_earnings_adjustments(created_by uuid references audit_users on delete set null,created_by_email text,id uuid primary key,booking_id uuid references bookings on delete cascade,cleaner_id uuid,amount_cents int,reason text);
create table booking_cleaner_earnings_snapshot_lines(booking_id uuid references bookings on delete cascade,booking_line_item_id uuid references booking_line_items on delete cascade,allocated_display_earnings_cents int);
create function audit_03c02_has_verified_outcome(uuid,text,text,text default null) returns boolean language sql as 'select false';`);
const old='aaaaaaaa-0000-4000-8000-000000000001', forward='aaaaaaaa-0000-4000-8000-000000000002', cid='bbbbbbbb-0000-4000-8000-000000000001', other='bbbbbbbb-0000-4000-8000-000000000002';
await db.query(`insert into bookings(id,date,status,cleaner_id) values($1,'2026-09-30','pending_assignment',$3),($2,'2026-10-01','pending_assignment',$3)`,[old,forward,cid]);
for(const [i,t] of ['cleaner_earnings','booking_roster_member_payouts','team_job_member_payouts'].entries()) await db.exec(`insert into ${t}(id,booking_id,cleaner_id,status) values ('cccccccc-0000-4000-8000-00000000000${i+1}','${old}','${cid}','pending')`);
await db.exec(`insert into booking_cleaners(booking_id,cleaner_id,role) values('${old}','${cid}','lead'),('${forward}','${cid}','lead');
insert into booking_line_items(id,booking_id,cleaner_earnings_cents) values('${old}','${old}',100),('${forward}','${forward}',100);
insert into booking_cleaner_earnings_snapshot(booking_id,cleaner_id) values('${old}','${cid}'),('${forward}','${cid}');
insert into booking_cleaner_earnings_snapshot_lines values('${old}','${old}',100),('${forward}','${forward}',100)`);
await db.query(`insert into cleaner_earnings_adjustments(id,booking_id,cleaner_id,amount_cents) values($1,$1,$2,100)`,[old,cid]);
await db.query(`insert into audit_users values($1)`,[cid]);
await db.query(`update cleaner_earnings_adjustments set created_by=$1,created_by_email='retained@example.com' where booking_id=$2`,[cid,old]);
const convergence=await fs.readFile('supabase/migrations/20261014145923_audit_03c02_verified_provider_convergence.sql','utf8');
await db.exec(convergence.slice(convergence.indexOf('create or replace function public.audit_03c02_guard_payout_item()'),convergence.indexOf('create or replace function public.audit_03c02_guard_payout_run()')));
for(const t of ['bookings','cleaner_earnings','booking_roster_member_payouts','team_job_member_payouts']) await db.exec(`create trigger audit_03c02_existing_boundary before insert or update on ${t} for each row execute function audit_03c02_guard_payout_item()`);
for(const name of ['20261014155906_audit_03c02_protect_historical_item_deletes.sql','20261014173544_audit_03c02_complete_historical_boundaries.sql'])await db.exec(await fs.readFile('supabase/migrations/'+name,'utf8'));
let checks=0;
async function reject(sql,args=[]){await assert.rejects(db.query(sql,args),e=>e.code==='23514');checks++;}
for(const field of ['cleaner_id','payout_owner_cleaner_id','team_id']) await reject(`update bookings set ${field}=$1 where id=$2`,[other,old]);
for(const field of ['display_earnings_cents','internal_earnings_cents','payout_earnings_cents','cleaner_earnings_total_cents','company_revenue_cents','payout_frozen_cents','cleaner_payout_cents','cleaner_bonus_cents'])await reject(`update bookings set ${field}=100 where id=$1`,[old]);
await reject(`update bookings set earnings_summary='{"x":1}' where id=$1`,[old]);
await reject(`update bookings set date='2026-10-01' where id=$1`,[old]);
await reject(`delete from bookings where id=$1`,[old]);
for(const t of ['cleaner_earnings','booking_roster_member_payouts','team_job_member_payouts']){
 await reject(`update ${t} set cleaner_id=$1 where booking_id=$2`,[other,old]);
 await reject(`update ${t} set booking_id=$1 where booking_id=$2`,[forward,old]);
 await reject(`delete from ${t} where booking_id=$1`,[old]);
 await reject(`insert into ${t}(id,booking_id,cleaner_id,status) values('dddddddd-0000-4000-8000-000000000001',$1,$2,'pending')`,[old,cid]);
}
await reject(`update booking_cleaners set cleaner_id=$1 where booking_id=$2`,[other,old]);
await reject(`update booking_line_items set cleaner_earnings_cents=200 where booking_id=$1`,[old]);
for(const field of ['item_type','slug','name']) await reject(`update booking_line_items set ${field}='adjustment' where booking_id=$1`,[old]);
await reject(`update booking_line_items set metadata='{"exclude_from_cleaner_earnings":true}' where booking_id=$1`,[old]);
await reject(`update booking_cleaner_earnings_snapshot set cleaner_id=$1 where booking_id=$2`,[other,old]);
await db.query(`update booking_cleaners set completed_at=now() where booking_id=$1`,[old]);checks++;
await db.query(`update bookings set booking_snapshot='{"admin_notes":"allowed"}' where id=$1`,[old]);checks++;
// A later BEFORE policy writer cannot bypass the AFTER validation.
await db.exec(`create function audit_policy_probe() returns trigger language plpgsql as $$begin NEW.display_earnings_cents:=999;return NEW;end;$$;create trigger zz_policy_probe before update of booking_snapshot on bookings for each row execute function audit_policy_probe()`);
await reject(`update bookings set booking_snapshot='{"admin_notes":"policy probe"}' where id=$1`,[old]);
await reject(`update booking_cleaner_earnings_snapshot_lines set allocated_display_earnings_cents=200 where booking_id=$1`,[old]);
await reject(`delete from booking_cleaner_earnings_snapshot_lines where booking_id=$1`,[old]);
await reject(`insert into booking_cleaner_earnings_snapshot_lines values($1,$2,100)`,[forward,old]);
await db.query(`update booking_cleaner_earnings_snapshot_lines set allocated_display_earnings_cents=200 where booking_id=$1`,[forward]);checks++;
await reject(`update bookings set cleaner_share_percentage=50 where id=$1`,[old]);
for(const field of ['base_amount_cents','service_fee_cents','total_paid_zar','total_paid_cents','amount_paid_cents'])await reject(`update bookings set ${field}=100 where id=$1`,[old]);
await reject(`update bookings set time='09:00' where id=$1`,[old]);
await reject(`update bookings set price_snapshot='{"base":100}' where id=$1`,[old]);
await reject(`update bookings set booking_snapshot='{"locked":{"service":"deep"}}' where id=$1`,[old]);
await reject(`update bookings set service_slug='deep' where id=$1`,[old]);
await reject(`insert into cleaner_earnings_adjustments(id,booking_id,cleaner_id,amount_cents) values($1,$2,$3,200)`,[forward,old,cid]);
await reject(`update cleaner_earnings_adjustments set amount_cents=200 where booking_id=$1`,[old]);
await reject(`delete from cleaner_earnings_adjustments where booking_id=$1`,[old]);
await reject(`update cleaner_earnings_adjustments set booking_id=$1 where booking_id=$2`,[forward,old]);
await db.query(`update bookings set cleaner_share_percentage=50 where id=$1`,[forward]);checks++;
await db.query(`insert into cleaner_earnings_adjustments(id,booking_id,cleaner_id,amount_cents) values($1,$1,$2,200)`,[forward,cid]);checks++;
await db.query(`delete from bookings where id=$1`,[forward]);checks++;
assert.equal((await db.query(`select count(*)::int n from booking_cleaners where booking_id=$1`,[forward])).rows[0].n,0);checks++;
for(const role of ['anon','authenticated','service_role']){const r=await db.query(`select has_function_privilege($1,'audit_03c02_guard_final_booking_financials()','execute') permitted`,[role]);assert.equal(r.rows[0].permitted,false);checks++;}
// Missing parents fail closed outside a genuine FK cascade.
await reject(`insert into booking_cleaners(booking_id,cleaner_id) values('ffffffff-0000-4000-8000-000000000001',$1)`,[cid]);
// The final booking guard evaluates values written by a later BEFORE trigger.
assert.equal((await db.query(`select display_earnings_cents from bookings where id=$1`,[old])).rows[0].display_earnings_cents,null);
checks++;
// A real FK SET NULL keeps creator email and all entitlement fields intact.
await reject(`update cleaner_earnings_adjustments set created_by=null where booking_id=$1`,[old]);
await reject(`update cleaner_earnings_adjustments set created_by_email='changed' where booking_id=$1`,[old]);
await db.query(`delete from audit_users where id=$1`,[cid]);checks++;
assert.equal((await db.query(`select created_by,created_by_email from cleaner_earnings_adjustments where booking_id=$1`,[old])).rows[0].created_by_email,'retained@example.com');checks++;
// Set up a previously submitted refund intent with no amount mutation.
await db.exec('drop trigger zz_policy_probe on bookings');
const priorRefund={version:1,captured_cents:1000,refunded_cents:0,currency:'ZAR',records:[{id:'refund-1',amount_cents:200,currency:'ZAR',record_only:false,provider_state:'submitted_to_provider'}]};
await db.query(`update bookings set paystack_reference='charge-1',booking_snapshot=$1 where id=$2`,[JSON.stringify({refund_workflow:priorRefund}),old]);
const succeeded={...priorRefund,refunded_cents:200,records:[{...priorRefund.records[0],provider_state:'succeeded',provider_reference:'provider-refund-1',succeeded_at:'2026-10-14T12:00:00Z'}]};
const refundSql=`update bookings set booking_snapshot=$1,refund_status='partial',amount_paid_cents=800,total_paid_cents=800,total_paid_zar=8 where id=$2`;
await reject(refundSql,[JSON.stringify({refund_workflow:{...succeeded,refunded_cents:201}}),old]);
await reject(refundSql,[JSON.stringify({refund_workflow:{...succeeded,records:[{...succeeded.records[0],record_only:true}]}}),old]);
await reject(refundSql,[JSON.stringify({refund_workflow:succeeded}),old]);
await db.exec(`select set_config('request.jwt.claim.role','service_role',false)`);
await db.query(refundSql,[JSON.stringify({refund_workflow:succeeded}),old]);checks++;
await reject(`update bookings set amount_paid_cents=700,total_paid_cents=700,total_paid_zar=7 where id=$1`,[old]);
// Historical charge convergence uses only the service-role RPC and original identity.
await db.query(`update bookings set status='pending_payment',currency='ZAR' where id=$1`,[old]);
const expected={customer_id:null,status:'pending_payment',paystack_reference:'charge-1',customer_email:null,cleaner_id:cid,selected_cleaner_id:null,assignment_type:null};
const captureSql=`select audit_03c02_record_historical_capture($1,$2,$3,'ZAR','2026-10-14T12:00:00Z',$4)`;
await reject(captureSql,[old,'wrong-reference',1000,JSON.stringify(expected)]);
await reject(captureSql,[old,'charge-1',-1,JSON.stringify(expected)]);
await reject(captureSql,[old,'charge-1',1000,JSON.stringify({...expected,cleaner_id:other})]);
await db.query(captureSql,[old,'charge-1',1000,JSON.stringify(expected)]);checks++;
assert.equal((await db.query(`select status from bookings where id=$1`,[old])).rows[0].status,'pending_assignment');checks++;
assert.equal((await db.query(`select amount_paid_cents from bookings where id=$1`,[old])).rows[0].amount_paid_cents,1000);checks++;
await reject(`update bookings set total_paid_cents=999 where id=$1`,[old]);
for(const role of ['anon','authenticated','service_role']){
 const r=await db.query(`select has_function_privilege($1,'audit_03c02_record_historical_capture(uuid,text,bigint,text,timestamptz,jsonb)','execute') permitted`,[role]);assert.equal(r.rows[0].permitted,role==='service_role');checks++;
}
console.log(`PASS ${checks} isolated PostgreSQL boundary checks (minimal schema; not live staging proof)`);
await db.close();
