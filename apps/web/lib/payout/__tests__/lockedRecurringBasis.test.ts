import { describe, expect, it } from "vitest";
import { resolveCanonicalCleanerPayout } from "@/lib/payout/canonicalCleanerPayout";
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
  it.each([0,-1,NaN,28000.5])("rejects an invalid fixed basis %s", basis=>{
    expect(()=>applyLockedRecurringBasis(calculated(),basis,[])).toThrow("locked_recurring_earnings_basis_invalid");
  });
});
