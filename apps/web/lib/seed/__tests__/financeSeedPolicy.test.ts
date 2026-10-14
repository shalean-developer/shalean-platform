import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const policy=()=>import(pathToFileURL(resolve(process.cwd(),'../../scripts/lib/financeSeedPolicy.mjs')).href);
async function plan(now:string,date='2026-10-07') {
 const {buildFinanceSeedPlan}=await policy();
 return buildFinanceSeedPlan({earnings:[{id:'e',booking_id:'b',status:'paid',approved_at:'2026-09-01',paid_at:'2026-09-02'}],payouts:[{id:'p',payout_run_id:'run',paid_at:'2026-09-02'}],bookingDates:new Map([['b',date]]),now:new Date(now)});
}
describe('finance seed closure and confirmed writes',()=>{
 it.each(['2026-10-14T12:00:00Z','2026-10-31T21:59:59Z'])('defers payouts before closure %s',async(now)=>{
  const p=await plan(now);expect(p.earnings[0]).toMatchObject({status:'pending',approved_at:null,paid_at:null});expect(p.payouts).toEqual([]);expect(p.runs).toEqual([]);expect(p.deferredReason).toContain('deferred');
 });
 it.each([['2026-10-31T22:00:00Z','2026-10-01','2026-10-31'],['2026-12-01T00:00:00Z','2026-10-01','2026-10-31']])('uses the fixed October fixture month once closed in Johannesburg %s',async(now,start,end)=>{
  const p=await plan(now,start.slice(0,8)+'07');expect(p.payouts[0]).toMatchObject({period_start:start,period_end:end,paid_at:end+'T12:00:00Z'});expect(p.payouts[0]).not.toHaveProperty('payout_run_id');expect(p.earnings[0].status).toBe('paid');
  const {paidSeedBookingDate}=await policy();expect(paidSeedBookingDate(4,-14,new Date(now))).toBe(start.slice(0,8)+'04');
 });
 it('keeps paid visit dates, payout periods and frozen timestamps stable across rollovers',async()=>{
  const {paidSeedBookingDate,buildFinanceSeedPlan}=await policy();
  expect(['2026-10-14','2026-11-01','2026-12-01'].map(now=>paidSeedBookingDate(4,-14,new Date(now)))).toEqual(['2026-10-04','2026-10-04','2026-10-04']);
  const plans=['2026-11-01','2026-12-01'].map(now=>buildFinanceSeedPlan({earnings:[],payouts:[{id:'p',frozen_at:new Date(now).toISOString()}],bookingDates:new Map(),now:new Date(now)}));
  expect(plans[0].payouts).toEqual(plans[1].payouts);
 });
 it('downgrades open-month paid earnings',async()=>{expect((await plan('2026-11-14T00:00:00Z','2026-11-04')).earnings[0].status).toBe('pending');});
 it.each(['2026-09-30','2026-10-32','2026-02-30','bad'])('rejects unsafe date %s',async(date)=>{await expect(plan('2026-11-01T00:00:00Z',date)).rejects.toThrow('no forward date');});
 function client(fail?:string,short=false) {
  const calls:string[]=[];
  return { calls, from(table:string) {
   calls.push(table);
   return { upsert(rows:unknown[]) {
    return { select:async()=>table===fail ? {error:{message:'write denied'}} : {data:short?[]:rows.map((_,i)=>({id:i})),error:null} };
   } };
  } };
 }
 it.each(['cleaner_earnings','cleaner_payouts'])('fails on %s write errors',async(table)=>{const {writeFinanceSeedPlan}=await policy();const db=client(table);await expect(writeFinanceSeedPlan(db,await plan('2026-11-01T00:00:00Z'))).rejects.toThrow(table+': write denied');if(table==='cleaner_earnings')expect(db.calls).toEqual(['cleaner_earnings']);});
 it('rejects unconfirmed rows',async()=>{const {writeFinanceSeedPlan}=await policy();await expect(writeFinanceSeedPlan(client(undefined,true),await plan('2026-11-01T00:00:00Z'))).rejects.toThrow('expected 1 confirmed rows, got 0');});
 it('counts confirmed rows and skips deferred payouts and runs',async()=>{const {writeFinanceSeedPlan}=await policy();const db=client();expect(await writeFinanceSeedPlan(db,await plan('2026-10-14T00:00:00Z'))).toMatchObject({earningsCount:1,payoutsCount:0,runsCount:0});expect(db.calls).toEqual(['cleaner_earnings']);expect(await writeFinanceSeedPlan(client(),await plan('2026-11-01T00:00:00Z'))).toMatchObject({earningsCount:1,payoutsCount:1,runsCount:0});});
});
