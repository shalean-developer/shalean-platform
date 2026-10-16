import { describe, expect, it } from "vitest";
import type { BookingEarningsPreview } from "@/lib/admin/buildBookingEarningsPreview";
import { buildBookingEarningsSummary } from "@/lib/payout/bookingEarningsSummary";
import { bookingEarningsPreviewComparison } from "@/lib/admin/bookingEarningsPreviewComparison";

function summary(amounts: number[]) {
  const ids=amounts.map((_,i)=>`cleaner-${i}`);
  return buildBookingEarningsSummary({serviceType:"standard",customerTotalCents:65000,eligibleAmountCents:65000,
    isTeamJob:amounts.length>1,teamId:null,teamLeaderId:ids[0],participantCleanerIds:ids,
    rosterRoles:ids.map((id,i)=>({cleaner_id:id,role:i?"member":"lead"})),
    perCleanerBaseCents:new Map(ids.map((id,i)=>[id,amounts[i]])),adjustments:[],tenureMonths:null,
    cleanerPercentage:null,fixedServicePayoutApplied:false,minimumEarningCents:0,maximumEarningCents:30000,
    costsCents:0,computedAtIso:"2026-10-16T00:00:00Z"});
}
function preview(before: number[],after: number[]): BookingEarningsPreview {
  return {current:{is_team_job:false,display_earnings_cents:before[0],cleaner_earnings_total_cents:before.reduce((a,b)=>a+b,0),earnings_summary:summary(before)},
    computed_preview:summary(after),earnings_display:null};
}
describe("reset preview booking-wide comparison",()=>{
  it("uses real API summary fields and compares paired totals instead of the lead header",()=>{
    expect(bookingEarningsPreviewComparison(preview([26000,26000],[26000,26000]))).toEqual({currentTotalCents:52000,projectedTotalCents:52000,diffCents:0});
  });
  it.each([[[25000,25000],[26000,26000],2000],[[30000],[28000],-2000],[[25000],[25200],200]])("shows the signed correction",(before,after,delta)=>{
    expect(bookingEarningsPreviewComparison(preview(before as number[],after as number[]))?.diffCents).toBe(delta);
  });
  it("uses the booking-wide paired policy without a summary",()=>{
    const p=preview([26000,26000],[26000,26000]);p.current.earnings_summary=null;
    expect(bookingEarningsPreviewComparison(p)?.currentTotalCents).toBe(52000);
  });
  it.each([52500, 51700])("uses actual paired obligation %i without a stored summary", total => {
    const p=preview([26000,26000],[26000,total-26000]);
    p.current.earnings_summary=null;
    p.current.roster_cleaner_count=2;
    p.current.internal_earnings_cents=total;
    p.current.cleaner_earnings_total_cents=52000; // old line total is not current cost
    expect(bookingEarningsPreviewComparison(p)).toEqual({currentTotalCents:total,projectedTotalCents:total,diffCents:0});
  });
  it("does not trust a stale solo internal total",()=>{
    const p=preview([25000],[28000]);p.current.earnings_summary=null;
    p.current.roster_cleaner_count=1;p.current.internal_earnings_cents=99999;
    expect(bookingEarningsPreviewComparison(p)?.currentTotalCents).toBe(25000);
  });
  it("uses a qualified solo payable without a stored summary",()=>{
    const p=preview([26000],[26500]);p.current.earnings_summary=null;
    Object.assign(p.current,{date:"2026-10-16",earnings_policy:"legacy_july",roster_cleaner_count:1,cleaner_payout_cents:26000,cleaner_bonus_cents:500});
    expect(bookingEarningsPreviewComparison(p)).toEqual({currentTotalCents:26500,projectedTotalCents:26500,diffCents:0});
  });
  it("keeps a real zero instead of falling through to the display amount",()=>{
    const p=preview([26000],[26000]);p.current.earnings_summary=null;p.current.cleaner_earnings_total_cents=0;p.current.display_earnings_cents=0;
    expect(bookingEarningsPreviewComparison(p)?.diffCents).toBe(26000);
  });
  it("does not turn failed or malformed previews into R0",()=>{
    expect(bookingEarningsPreviewComparison(null)).toBeNull();
    const missing=preview([26000],[26000]);missing.current.earnings_summary=null;missing.current.display_earnings_cents=null;missing.current.cleaner_earnings_total_cents=null;
    expect(bookingEarningsPreviewComparison(missing)).toBeNull();
    const p=preview([26000],[26000]);p.computed_preview=null;
    expect(bookingEarningsPreviewComparison(p)).toBeNull();
    p.computed_preview={...summary([26000]),total_cleaner_earnings_cents:NaN};
    expect(bookingEarningsPreviewComparison(p)).toBeNull();
  });
});

describe("current solo and team policy",()=>{
  it("keeps a solo display lock when its aggregate is stale and summary absent",()=>{
    const p=preview([25000],[28000]);p.current.earnings_summary=null;p.current.cleaner_earnings_total_cents=99999;
    expect(bookingEarningsPreviewComparison(p)).toEqual({currentTotalCents:25000,projectedTotalCents:28000,diffCents:3000});
  });
  it("also keeps the solo display lock over a stale stored solo summary",()=>{
    const p=preview([30000],[28000]);p.current.display_earnings_cents=28000;
    expect(bookingEarningsPreviewComparison(p)?.currentTotalCents).toBe(28000);
  });
  it("does not substitute a lead display for incomplete formal team earnings",()=>{
    const p=preview([26000,26000],[26000,26000]);p.current.is_team_job=true;p.current.earnings_summary=null;p.current.cleaner_earnings_total_cents=null;
    expect(bookingEarningsPreviewComparison(p)).toBeNull();
  });
});
