import { describe, expect, it } from "vitest";
import {
  buildBookingRosterMemberPayoutRows,
  computePairedRosterPerCleanerBaseCents,
  isPairedRosterSoloJob,
  leadEarningsRowFromSummary,
  resolvePairedRosterCanonicalPayout,
  resolvePairedRosterLeaderId,
  rosterMemberRowsFromSummary,
} from "@/lib/payout/pairedRosterPayout";
import { buildBookingEarningsSummary } from "@/lib/payout/bookingEarningsSummary";

const nyasha = "796e3ad7-07f3-44eb-b4cf-bed439a59f8b";
const ethel = "914b3acf-40e8-4ad5-a5a2-9e2de711849a";

describe("pairedRosterPayout", () => {
  it("detects paired solo roster jobs", () => {
    expect(
      isPairedRosterSoloJob({
        isTeamJob: false,
        rosterRows: [
          { cleaner_id: nyasha, role: "lead" },
          { cleaner_id: ethel, role: "member" },
        ],
      }),
    ).toBe(true);
    expect(
      isPairedRosterSoloJob({
        isTeamJob: false,
        rosterRows: [{ cleaner_id: nyasha, role: "lead" }],
      }),
    ).toBe(false);
  });

  it("splits Lynne-style R610 jobs equally at R250 each", () => {
    const { perCleanerBase } = computePairedRosterPerCleanerBaseCents({
      eligibleCents: 61_000,
      percentage: 0.7,
      participantIds: [nyasha, ethel],
    });
    expect(perCleanerBase.get(ethel)).toBe(25_000);
    expect(perCleanerBase.get(nyasha)).toBe(25_000);
  });

  it("caps high-value paired jobs at R280 per cleaner", () => {
    const { perCleanerBase } = computePairedRosterPerCleanerBaseCents({
      eligibleCents: 100_000,
      percentage: 0.7,
      participantIds: [nyasha, ethel],
    });
    expect(perCleanerBase.get(ethel)).toBe(28_000);
    expect(perCleanerBase.get(nyasha)).toBe(28_000);
  });

  it("builds paired roster canonical payout with equal pay and R110 company on R610", () => {
    const result = resolvePairedRosterCanonicalPayout({
      serviceId: "standard",
      bookingValueCents: 61_000,
      customerTotalCents: 61_000,
      isTeamJob: true,
      teamLeaderId: nyasha,
      teamLeaderJoinedAtIso: "2025-01-01T00:00:00.000Z",
      participantCleanerIds: [nyasha, ethel],
      rosterRoles: [
        { cleaner_id: nyasha, role: "lead" },
        { cleaner_id: ethel, role: "member" },
      ],
      bookingAppointmentIsoUtc: "2026-06-01T12:00:00.000Z",
      cleanerJoinedAtIso: "2025-01-01T00:00:00.000Z",
      computedAtIso: "2026-06-01T12:00:00.000Z",
    });
    expect(result.payoutType).toBe("paired_roster_pool_split");
    expect(result.earningsSummary?.per_cleaner_earnings.map((r) => r.total_cents)).toEqual([25_000, 25_000]);
    expect(result.internalEarningsCents).toBe(50_000);
    expect(result.companyRevenueFromServiceCents).toBe(11_000);
  });

  it("uses leader premium only on fixed specials (deep / move)", () => {
    const result = resolvePairedRosterCanonicalPayout({
      serviceId: "deep",
      bookingValueCents: 90_000,
      customerTotalCents: 90_000,
      isTeamJob: true,
      teamLeaderId: nyasha,
      participantCleanerIds: [nyasha, ethel],
      rosterRoles: [
        { cleaner_id: nyasha, role: "lead" },
        { cleaner_id: ethel, role: "member" },
      ],
      bookingAppointmentIsoUtc: "2026-06-01T12:00:00.000Z",
      cleanerJoinedAtIso: "2025-01-01T00:00:00.000Z",
      computedAtIso: "2026-06-01T12:00:00.000Z",
    });
    expect(result.payoutType).toBe("team_fixed_with_leader");
    expect(result.earningsSummary?.per_cleaner_earnings.map((r) => r.total_cents).sort()).toEqual([
      25_000, 27_000,
    ]);
  });

  it("builds roster member payout rows excluding the lead", () => {
    const summary = buildBookingEarningsSummary({
      serviceType: "standard",
      customerTotalCents: 61_000,
      eligibleAmountCents: 61_000,
      isTeamJob: true,
      teamLeaderId: nyasha,
      participantCleanerIds: [nyasha, ethel],
      rosterRoles: [
        { cleaner_id: nyasha, role: "lead" },
        { cleaner_id: ethel, role: "member" },
      ],
      perCleanerBaseCents: new Map([
        [nyasha, 25_000],
        [ethel, 25_000],
      ]),
      tenureMonths: 4,
      cleanerPercentage: 0.7,
      fixedServicePayoutApplied: false,
      minimumEarningCents: 25_000,
      maximumEarningCents: 28_000,
      computedAtIso: "2026-06-01T12:00:00.000Z",
    });
    const leaderId = resolvePairedRosterLeaderId({
      rosterRows: [
        { cleaner_id: nyasha, role: "lead" },
        { cleaner_id: ethel, role: "member" },
      ],
      participantIds: [nyasha, ethel],
      bookingCleanerId: nyasha,
    });
    expect(leaderId).toBe(nyasha);
    expect(leadEarningsRowFromSummary(summary, leaderId)?.total_cents).toBe(25_000);
    expect(rosterMemberRowsFromSummary(summary, leaderId).map((r) => r.cleaner_id)).toEqual([ethel]);
    expect(buildBookingRosterMemberPayoutRows({ bookingId: "b1", summary, leaderId })).toEqual([
      {
        booking_id: "b1",
        cleaner_id: ethel,
        payout_cents: 25_000,
        bonus_cents: 0,
        status: "pending",
      },
    ]);
  });
});
