import { describe, expect, it } from "vitest";
import { resolveCanonicalCleanerPayout } from "@/lib/payout/canonicalCleanerPayout";
import { resolveBookingProfitabilityCleanerCost } from "@/lib/admin/expenses/bookingProfitabilityCleanerCost";
import { perCleanerAllocationsForBooking } from "@/lib/admin/payouts/officePayoutPeriodReport";
import { resolveCleanerDashboardEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import { buildBookingRosterMemberPayoutRows } from "@/lib/payout/pairedRosterPayout";
import { applyLockedRecurringBasis } from "@/lib/payout/applyLockedRecurringBasis";

const lead = "796e3ad7-07f3-44eb-b4cf-bed439a59f8b";
const member = "cd36e0a6-10f9-452c-99fd-cc7318c76901";
function calculated(team = false) {
  return resolveCanonicalCleanerPayout({
    serviceId: "standard", cleanerJoinedAtIso: "2025-01-01T00:00:00Z",
    bookingAppointmentIsoUtc: "2026-10-15T07:00:00Z", bookingValueCents: 66000,
    customerTotalCents: 66000, isTeamJob: team, soloCleanerId: lead,
    teamLeaderId: team ? lead : null, participantCleanerIds: team ? [lead, member] : undefined,
  });
}
describe("locked October recurring earning basis", () => {
  it.each([28000,25200,26000])("keeps all solo representations on %i cents", basis => {
    const result = applyLockedRecurringBasis(calculated(), basis, []);
    expect(result.displayEarningsCents).toBe(basis);
    expect(result.payoutEarningsCents).toBe(basis);
    expect(result.internalEarningsCents).toBe(basis);
    expect(result.earningsSummary?.per_cleaner_earnings[0].total_cents).toBe(basis);
    expect(result.companyRevenueFromServiceCents).toBe(66000-basis);
  });
  it("pays both approved paired participants R260 without changing roster or customer price", () => {
    const original=calculated(true);
    const result=applyLockedRecurringBasis(original,26000,[]);
    expect(result.earningsSummary?.per_cleaner_earnings.map(r=>[r.cleaner_id,r.total_cents])).toEqual([[lead,26000],[member,26000]]);
    expect(result.internalEarningsCents).toBe(52000);
    expect(result.earningsSummary?.customer_total_cents).toBe(66000);
    expect(result.companyRevenueFromServiceCents).toBe(14000);
    expect(original.internalEarningsCents).not.toBe(result.internalEarningsCents);
    expect(applyLockedRecurringBasis(result,26000,[]).earningsSummary).toEqual(result.earningsSummary);
  });
  it("retains explicit participant adjustments rather than silently deleting them",()=>{
    const result=applyLockedRecurringBasis(calculated(true),26000,[{cleaner_id:member,amount_cents:500}]);
    expect(result.earningsSummary?.per_cleaner_earnings[1].bonus_cents).toBe(500);
    expect(result.earningsSummary?.per_cleaner_earnings[1].total_cents).toBe(26500);
    expect(result.internalEarningsCents).toBe(52500);
  });
  it.each([500,-300,-30000])("keeps solo payable columns on the net signed adjustment %i", amount => {
    const result=applyLockedRecurringBasis(calculated(),26000,[{cleaner_id:lead,amount_cents:amount}]);
    const total=Math.max(0,26000+amount);
    expect(result.cleanerPayoutCents+result.cleanerBonusCents).toBe(total);
    expect(result.payoutEarningsCents).toBe(total);
    expect(result.earningsSummary?.total_cleaner_earnings_cents).toBe(total);
  });
  it("rebuilds pending member payable columns from net earnings",()=>{
    const result=applyLockedRecurringBasis(calculated(true),26000,[{cleaner_id:member,amount_cents:-300},{cleaner_id:member,amount_cents:500}]);
    expect(buildBookingRosterMemberPayoutRows({bookingId:"test",summary:result.earningsSummary!,leaderId:lead})).toEqual([
      {booking_id:"test",cleaner_id:member,payout_cents:26000,bonus_cents:200,status:"pending"}
    ]);
  });
  it.each([500,-300])("keeps October reports and cleaner display on net participant amounts %i", amount=>{
    const result=applyLockedRecurringBasis(calculated(true),26000,[{cleaner_id:lead,amount_cents:amount}]);
    const b={date:"2026-10-16",earnings_summary:result.earningsSummary,cleaner_id:lead,payout_owner_cleaner_id:lead,
      display_earnings_cents:26000,cleaner_payout_cents:result.cleanerPayoutCents,
      cleaner_earnings_total_cents:52000,payout_frozen_cents:null,metadata:{}};
    expect(perCleanerAllocationsForBooking(b,[{cleaner_id:lead},{cleaner_id:member}]).map(r=>r.cents)).toEqual([26000+amount,26000]);
    expect(resolveCleanerDashboardEarningsCents(b,lead)).toBe(26000+amount);
    expect(resolveBookingProfitabilityCleanerCost(b).cleaner_cost_cents).toBe(52000+amount);
    expect(resolveCleanerDashboardEarningsCents({...b,date:"2026-09-30"},lead)).toBe(26000);
  });
  it("accounts for a signed solo adjustment in finance without replacing the fixed basis",()=>{
    const result=applyLockedRecurringBasis(calculated(),26000,[{cleaner_id:lead,amount_cents:500}]);
    const b={date:"2026-10-16",display_earnings_cents:26000,earnings_summary:result.earningsSummary};
    expect(resolveBookingProfitabilityCleanerCost(b).cleaner_cost_cents).toBe(26500);
    expect(resolveCleanerDashboardEarningsCents(b,lead)).toBe(26500);
  });
  it.each([500,-300])("uses direct solo payables when the current locked summary is absent %i",amount=>{
    const b={date:"2026-10-16",earnings_policy:"legacy_july",cleaner_id:lead,payout_owner_cleaner_id:lead,
      display_earnings_cents:26000,cleaner_payout_cents:Math.min(26000,26000+amount),cleaner_bonus_cents:Math.max(0,amount),
      cleaner_earnings_total_cents:26000,payout_frozen_cents:null,earnings_summary:null,metadata:{},roster_cleaner_count:1};
    expect(resolveBookingProfitabilityCleanerCost(b).cleaner_cost_cents).toBe(26000+amount);
    expect(resolveCleanerDashboardEarningsCents(b,lead)).toBe(26000+amount);
    expect(perCleanerAllocationsForBooking(b,[{cleaner_id:lead}])[0].cents).toBe(26000+amount);
    expect(resolveCleanerDashboardEarningsCents({...b,date:"2026-09-30"},lead)).toBe(26000);
  });
  it.each([0,-1,NaN,28000.5])("rejects an invalid fixed basis %s", basis=>{
    expect(()=>applyLockedRecurringBasis(calculated(),basis,[])).toThrow("locked_recurring_earnings_basis_invalid");
  });
});
