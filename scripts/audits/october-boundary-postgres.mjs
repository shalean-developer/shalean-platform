// Isolated PostgreSQL regression harness. Requires @electric-sql/pglite externally;
// AUDIT_PGLITE_MODULE may name an installed module URL. No network or remote DB access.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite }=await import(process.env.AUDIT_PGLITE_MODULE ?? '@electric-sql/pglite');
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
create table bookings(id uuid primary key,date date,cleaner_id uuid,payout_owner_cleaner_id uuid,team_id uuid,is_team_job boolean,cleaner_count int,team_member_count_snapshot int,
status text,payout_id uuid,payout_status text,payout_paid_at timestamptz,payout_frozen_cents int,
cleaner_payout_cents int,cleaner_bonus_cents int,display_earnings_cents int,internal_earnings_cents int,payout_earnings_cents int,cleaner_earnings_total_cents int,company_revenue_cents int,
earnings_summary jsonb,cleaner_line_earnings_finalized_at timestamptz,earnings_model_version text,payout_percentage numeric,payout_type text,
earnings_percentage_applied numeric,earnings_cap_cents_applied int,earnings_tenure_months_at_assignment int,service text,booking_snapshot jsonb);
create table cleaner_payouts(id uuid primary key,period_start date,period_end date);
create table cleaner_earnings(id uuid primary key,booking_id uuid references bookings on delete cascade,cleaner_id uuid,amount_cents int,status text,disbursement_id uuid,paid_at timestamptz,updated_at timestamptz);
create table booking_roster_member_payouts(id uuid primary key,booking_id uuid references bookings on delete cascade,cleaner_id uuid,payout_cents int,bonus_cents int,status text,cleaner_payout_id uuid);
create table team_job_member_payouts(id uuid primary key,booking_id uuid references bookings on delete cascade,cleaner_id uuid,team_id uuid,payout_cents int,status text,cleaner_payout_id uuid);
create table booking_cleaners(booking_id uuid references bookings on delete cascade,cleaner_id uuid,role text,payout_weight numeric,lead_bonus_cents int,source text,completed_at timestamptz);
create table booking_line_items(id uuid primary key,booking_id uuid references bookings on delete cascade,cleaner_earnings_cents int,total_price_cents int,unit_price_cents int,quantity int,earns_cleaner boolean,name text);
create table booking_cleaner_earnings_snapshot(booking_id uuid references bookings on delete cascade,cleaner_id uuid,display_earnings_cents int,updated_at timestamptz);
create table booking_cleaner_earnings_snapshot_lines(booking_id uuid references bookings on delete cascade,booking_line_item_id uuid references booking_line_items on delete cascade,allocated_display_earnings_cents int);
create function audit_03c02_has_verified_outcome(uuid,text,text,text default null) returns boolean language sql as 'select false';`);
const old='aaaaaaaa-0000-4000-8000-000000000001', forward='aaaaaaaa-0000-4000-8000-000000000002', cid='bbbbbbbb-0000-4000-8000-000000000001', other='bbbbbbbb-0000-4000-8000-000000000002';
await db.query(`insert into bookings(id,date,status,cleaner_id) values($1,'2026-09-30','pending',$3),($2,'2026-10-01','pending',$3)`,[old,forward,cid]);
for(const [i,t] of ['cleaner_earnings','booking_roster_member_payouts','team_job_member_payouts'].entries()) await db.exec(`insert into ${t}(id,booking_id,cleaner_id,status) values ('cccccccc-0000-4000-8000-00000000000${i+1}','${old}','${cid}','pending')`);
await db.exec(`insert into booking_cleaners(booking_id,cleaner_id,role) values('${old}','${cid}','lead'),('${forward}','${cid}','lead');
insert into booking_line_items(id,booking_id,cleaner_earnings_cents) values('${old}','${old}',100),('${forward}','${forward}',100);
insert into booking_cleaner_earnings_snapshot(booking_id,cleaner_id) values('${old}','${cid}'),('${forward}','${cid}');
insert into booking_cleaner_earnings_snapshot_lines values('${old}','${old}',100),('${forward}','${forward}',100)`);
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
await reject(`update booking_cleaner_earnings_snapshot set cleaner_id=$1 where booking_id=$2`,[other,old]);
await db.query(`update booking_cleaners set completed_at=now() where booking_id=$1`,[old]);checks++;
await db.query(`update bookings set booking_snapshot='{"admin_notes":"allowed"}' where id=$1`,[old]);checks++;
// A later BEFORE policy writer cannot bypass the AFTER validation.
await db.exec(`create function audit_policy_probe() returns trigger language plpgsql as $$begin NEW.display_earnings_cents:=999;return NEW;end;$$;create trigger zz_policy_probe before update of service on bookings for each row execute function audit_policy_probe()`);
await reject(`update bookings set service='airbnb' where id=$1`,[old]);
await reject(`update booking_cleaner_earnings_snapshot_lines set allocated_display_earnings_cents=200 where booking_id=$1`,[old]);
await reject(`delete from booking_cleaner_earnings_snapshot_lines where booking_id=$1`,[old]);
await reject(`insert into booking_cleaner_earnings_snapshot_lines values($1,$2,100)`,[forward,old]);
await db.query(`update booking_cleaner_earnings_snapshot_lines set allocated_display_earnings_cents=200 where booking_id=$1`,[forward]);checks++;
await db.query(`delete from bookings where id=$1`,[forward]);checks++;
assert.equal((await db.query(`select count(*)::int n from booking_cleaners where booking_id=$1`,[forward])).rows[0].n,0);checks++;
for(const role of ['anon','authenticated','service_role']){const r=await db.query(`select has_function_privilege($1,'audit_03c02_guard_final_booking_financials()','execute') permitted`,[role]);assert.equal(r.rows[0].permitted,false);checks++;}
// Missing parents fail closed outside a genuine FK cascade.
await reject(`insert into booking_cleaners(booking_id,cleaner_id) values('ffffffff-0000-4000-8000-000000000001',$1)`,[cid]);
// The final booking guard evaluates values written by a later BEFORE trigger.
assert.equal((await db.query(`select display_earnings_cents from bookings where id=$1`,[old])).rows[0].display_earnings_cents,null);
checks++;
console.log(`PASS ${checks} isolated PostgreSQL boundary checks (minimal schema; not live staging proof)`);
await db.close();
