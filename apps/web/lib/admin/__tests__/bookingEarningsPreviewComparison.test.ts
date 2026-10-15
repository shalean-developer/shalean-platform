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
  return {current:{display_earnings_cents:before[0],cleaner_earnings_total_cents:before.reduce((a,b)=>a+b,0),earnings_summary:summary(before)},
    computed_preview:summary(after),earnings_display:null};
}
describe("reset preview booking-wide comparison",()=>{
  it("uses real API summary fields and compares paired totals instead of the lead header",()=>{
    expect(bookingEarningsPreviewComparison(preview([26000,26000],[26000,26000]))).toEqual({currentTotalCents:52000,projectedTotalCents:52000,diffCents:0});
  });
  it.each([[[25000,25000],[26000,26000],2000],[[30000],[28000],-2000],[[25000],[25200],200]])("shows the signed correction",(before,after,delta)=>{
    expect(bookingEarningsPreviewComparison(preview(before as number[],after as number[]))?.diffCents).toBe(delta);
  });
  it("falls back to the current aggregate before its lead-only display",()=>{
    const p=preview([26000,26000],[26000,26000]);p.current.earnings_summary=null;
    expect(bookingEarningsPreviewComparison(p)?.currentTotalCents).toBe(52000);
  });
  it("keeps a real zero instead of falling through to the display amount",()=>{
    const p=preview([26000],[26000]);p.current.earnings_summary=null;p.current.cleaner_earnings_total_cents=0;
    expect(bookingEarningsPreviewComparison(p)?.diffCents).toBe(26000);
  });
  it("does not turn failed or malformed previews into R0",()=>{
    expect(bookingEarningsPreviewComparison(null)).toBeNull();
    const p=preview([26000],[26000]);p.computed_preview=null;
    expect(bookingEarningsPreviewComparison(p)).toBeNull();
    p.computed_preview={...summary([26000]),total_cleaner_earnings_cents:NaN};
    expect(bookingEarningsPreviewComparison(p)).toBeNull();
  });
});
