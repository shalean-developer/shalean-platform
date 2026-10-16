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
function admin(viewer:string) {
 return {from:(table:string)=>{const q={select:()=>q,eq:()=>q,in:async()=>({data:table==="booking_roster_member_payouts"&&viewer===member?[{booking_id:id,payout_cents:25700,bonus_cents:0}]:[],error:null})};return q;}} as never;
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
 it("keeps Office allocations aligned with the cleaner earning pipeline",()=>{
  const b=wire();
  expect(perCleanerAllocationsForBooking(b,b.booking_cleaners!,[{cleaner_id:member,payout_cents:25700}]).map(r=>r.cents)).toEqual([26500,25700]);
 });
});
