import {describe,it,expect,vi} from "vitest";
import {resolveBookingCanonicalPayout} from "@/lib/payout/resolveBookingCanonicalPayout";
const cid="bbbbbbbb-0000-4000-8000-000000000001";
function db(roster:unknown[],members:unknown[]) {
 const from=vi.fn((table:string)=>{
  const data=table==='booking_cleaners'?roster:table==='team_members'?members:table==='cleaners'?{joined_at:'2026-01-01'}:[];
  const q={select:()=>q,eq:()=>q,not:()=>q,order:()=>q,maybeSingle:async()=>({data,error:null}),then:(done:(v:unknown)=>unknown)=>Promise.resolve({data,error:null}).then(done)};return q;
 });return {from};
}
describe('historical canonical roster',()=>{
 it.each(['2026-09-30',null])('defers missing historical roster dated %s without consulting live membership',async(date)=>{
  for(const members of [[{cleaner_id:cid}],[]]){
   const admin=db([],members);
   await expect(resolveBookingCanonicalPayout(admin as never,{bookingId:'booking',row:{date,is_team_job:true,team_id:'team',service:'deep',base_amount_cents:100000}})).rejects.toThrow('historical_payout_roster_missing');
   expect(admin.from).not.toHaveBeenCalledWith('team_members');
  }
 });
 it('keeps a protected historical roster independent of later membership changes',async()=>{
  const results=[];
  for(const members of [[{cleaner_id:cid}],[]]){
   const admin=db([{cleaner_id:cid,role:'lead'}],members);
   results.push(await resolveBookingCanonicalPayout(admin as never,{bookingId:'booking',row:{date:'2026-09-30',is_team_job:true,team_id:'team',service:'deep',base_amount_cents:100000},computedAtIso:'2026-10-14T12:00:00Z'}));
   expect(admin.from).not.toHaveBeenCalledWith('team_members');
  }
  expect(results[0]).toEqual(results[1]);
 });
 it('keeps forward membership fallback available',async()=>{
  const admin=db([],[{cleaner_id:cid}]);
  await resolveBookingCanonicalPayout(admin as never,{bookingId:'booking',row:{date:'2026-10-02',is_team_job:true,team_id:'team',service:'deep',base_amount_cents:100000}});
  expect(admin.from).toHaveBeenCalledWith('team_members');
 });
});
