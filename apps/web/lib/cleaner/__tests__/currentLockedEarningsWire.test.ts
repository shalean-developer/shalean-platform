import { resolveCleanerJobDetailEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import { describe,expect,it,vi } from "vitest";
vi.mock("@/lib/payout/persistCleanerPayout",()=>({previewDisplayEarningsCentsForCleanerJob:vi.fn(async()=>null)}));
import { cleanerEarningsReadInputs,CLEANER_EARNINGS_READ_SELECT } from "@/lib/cleaner/cleanerEarningsReadInputs";
import { applyPreviewEarningsToCleanerJobRows } from "@/lib/cleaner/applyPreviewEarningsToCleanerJobRows";
import { todayCentsAndBreakdownFromBookings } from "@/lib/cleaner/cleanerDashboardTodayCents";
import { sumCleanerAllTimeEarningsFromRows } from "@/lib/cleaner/fetchCleanerAllTimeEarningsCents";
import { perCleanerAllocationsForBooking } from "@/lib/admin/payouts/officePayoutPeriodReport";
const lead="00000000-0000-4000-8000-000000000001",member="00000000-0000-4000-8000-000000000002",id="00000000-0000-4000-8000-000000000003";
function wire() {
 const raw={earnings_policy:"legacy_july",internal_earnings_cents:52200,cleaner_payout_cents:null,cleaner_bonus_cents:0,payout_owner_cleaner_id:lead,
  booking_cleaners:[{cleaner_id:lead},{cleaner_id:member}],booking_roster_member_payouts:[{cleaner_id:member,payout_cents:25700,bonus_cents:0}]};
 return {id,date:"2026-10-16",status:"completed",completed_at:"2026-10-16T07:00:00Z",cleaner_id:lead,
  display_earnings_cents:26000,cleaner_earnings_total_cents:52000,earnings_summary:null,payout_frozen_cents:null,metadata:{},...cleanerEarningsReadInputs(raw)};
}
function admin(viewer:string,payout=25700) {
 return {from:(table:string)=>{const q={select:()=>q,eq:()=>q,in:async()=>({data:table==="booking_roster_member_payouts"&&viewer===member?[{booking_id:id,payout_cents:payout,bonus_cents:0}]:[],error:null})};return q;}} as never;
}
describe("current fixed earning read pipeline",()=>{
 it("loads one shared projection for summary-absent dashboard/job inputs",()=>{
  for(const name of ["earnings_policy","internal_earnings_cents","cleaner_bonus_cents","booking_roster_member_payouts"])
   expect(CLEANER_EARNINGS_READ_SELECT).toContain(name);
 });
 it.each([[lead,26500],[member,25700]])("keeps %s earned totals while the visit is unfunded",async(viewer,earned)=>{
  const b=wire();const jobs=await applyPreviewEarningsToCleanerJobRows(admin(String(viewer)),{cleanerId:String(viewer),rows:[b],maxPreviews:0});
  expect(jobs[0].displayEarningsCents).toBe(earned);expect(jobs[0].earnings_basis_pending).toBe(false);
  const override=viewer===member?new Map([[id,25700]]):new Map<string,number>();
  expect(sumCleanerAllTimeEarningsFromRows([b],String(viewer),override)).toBe(earned);
  expect(todayCentsAndBreakdownFromBookings([{...b,viewer_payout_cents:override.get(id)}],new Date("2026-10-16T10:00:00Z"),String(viewer)).today_cents).toBe(earned);
 });
 it("uses the net summary amount on job details after a lead deduction",()=>{
  const b={...wire(),earnings_summary:{model_version:"test",cleaner_count:2,team_leader_id:lead,total_cleaner_earnings_cents:51700,
   per_cleaner_earnings:[{cleaner_id:lead,role:"lead",base_earning_cents:26000,bonus_cents:0,deduction_cents:300,total_cents:25700},
    {cleaner_id:member,role:"member",base_earning_cents:26000,bonus_cents:0,deduction_cents:0,total_cents:26000}]}};
  expect(resolveCleanerJobDetailEarningsCents(b,lead,26000)).toBe(25700);
  expect(resolveCleanerJobDetailEarningsCents({...b,date:"2026-09-30"},lead,26000)).toBe(26000);
 });
 it.each([0,null])("retains a runtime estimate when persisted basis is %s",basis=>{
  const empty={...wire(),display_earnings_cents:basis,cleaner_earnings_total_cents:basis,earnings_policy:null,internal_earnings_cents:null,booking_roster_member_payouts:[]};
  expect(resolveCleanerJobDetailEarningsCents(empty,lead,31500)).toBe(31500);
  expect(resolveCleanerJobDetailEarningsCents(empty,lead,null)).toBeNull();
 });
 it("does not revive a fully deducted member allocation with a preview",()=>{
  expect(resolveCleanerJobDetailEarningsCents({...wire(),viewer_payout_cents:0},member,26000)).toBe(0);
 });
 it("does not request an estimate for a fully deducted current member card",async()=>{
  const rows=await applyPreviewEarningsToCleanerJobRows(admin(member,0),{cleanerId:member,rows:[wire()],maxPreviews:0});
  expect(rows[0].displayEarningsCents).toBe(0);
  expect(rows[0].earnings_basis_pending).toBe(false);
 });
 it("keeps a fully deducted member at zero in Office allocations",()=>{
  const b={...wire(),internal_earnings_cents:26000};
  expect(perCleanerAllocationsForBooking(b,b.booking_cleaners!,[{cleaner_id:member,payout_cents:0}]).map(r=>r.cents)).toEqual([26000,0]);
 });
 it("keeps Office allocations aligned with the cleaner earning pipeline",()=>{
  const b=wire();
  expect(perCleanerAllocationsForBooking(b,b.booking_cleaners!,[{cleaner_id:member,payout_cents:25700}]).map(r=>r.cents)).toEqual([26500,25700]);
 });
});
