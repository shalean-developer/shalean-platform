import { describe, expect, it } from "vitest";
import {
  bookingAppointmentIsoUtc,
  calendarMonthsBetweenCleanerJoinedAndAppointment,
  clampStandardEarningCents,
  isFixedPayoutSpecial,
  MAX_STANDARD_BASE_PAYOUT_CENTS,
  MIN_STANDARD_BASE_PAYOUT_CENTS,
  normalizeBookingServiceIdForPayout,
  resolveCanonicalCleanerPayout,
  TEAM_LEADER_FIXED_PAYOUT_CENTS,
  TEAM_MEMBER_FIXED_PAYOUT_CENTS,
} from "@/lib/payout/canonicalCleanerPayout";

describe("normalizeBookingServiceIdForPayout", () => {
  it("maps type keys and catalog ids from snapshot", () => {
    expect(
      normalizeBookingServiceIdForPayout({ locked: { service: "deep_cleaning" } }, null),
    ).toBe("deep");
    expect(normalizeBookingServiceIdForPayout({ locked: { service: "move" } }, null)).toBe("move");
    expect(normalizeBookingServiceIdForPayout({ locked: { service: "carpet_cleaning" } }, null)).toBe("carpet");
  });

  it("falls back to label heuristics", () => {
    expect(normalizeBookingServiceIdForPayout(null, "Move In/Out Cleaning")).toBe("move");
    expect(normalizeBookingServiceIdForPayout(null, "Deep clean today")).toBe("deep");
    expect(normalizeBookingServiceIdForPayout(null, "Quick clean")).toBe("standard");
  });
});

describe("isFixedPayoutSpecial", () => {
  it("detects fixed services by id and label", () => {
    expect(isFixedPayoutSpecial("deep", null)).toBe(true);
    expect(isFixedPayoutSpecial(null, "Carpet refresh")).toBe(true);
    expect(isFixedPayoutSpecial("standard", "Standard")).toBe(false);
  });
});

describe("calendarMonthsBetweenCleanerJoinedAndAppointment", () => {
  it("uses calendar month boundaries (UTC parse)", () => {
    const m = calendarMonthsBetweenCleanerJoinedAndAppointment(
      "2026-01-15T10:00:00.000Z",
      "2026-05-14T10:00:00.000Z",
    );
    expect(m).toBe(3);
  });

  it("returns 4+ months at threshold edge", () => {
    const m = calendarMonthsBetweenCleanerJoinedAndAppointment(
      "2026-01-01T12:00:00.000Z",
      "2026-05-01T12:00:00.000Z",
    );
    expect(m).toBe(4);
  });
});

describe("bookingAppointmentIsoUtc", () => {
  it("builds Z appointment from date and time", () => {
    expect(bookingAppointmentIsoUtc("2026-06-10", "09:30")).toBe("2026-06-10T09:30:00.000Z");
    expect(bookingAppointmentIsoUtc("2026-06-10", null)).toBe("2026-06-10T12:00:00.000Z");
  });

  it("returns null for invalid date", () => {
    expect(bookingAppointmentIsoUtc("06-10-2026", "09:30")).toBeNull();
  });
});

describe("clampStandardEarningCents", () => {
  it("clamps to R250 minimum and R300 maximum", () => {
    expect(clampStandardEarningCents(10_000)).toBe(MIN_STANDARD_BASE_PAYOUT_CENTS);
    expect(clampStandardEarningCents(280_00)).toBe(28_000);
    expect(clampStandardEarningCents(500_00)).toBe(MAX_STANDARD_BASE_PAYOUT_CENTS);
  });
});

describe("resolveCanonicalCleanerPayout", () => {
  const base = {
    bookingValueCents: 50_000,
    customerTotalCents: 50_000,
    billingType: "prepaid" as const,
    isTeamJob: false,
    serviceFeeCents: 0,
    soloCleanerId: "11111111-1111-1111-1111-111111111111",
    computedAtIso: "2026-04-20T10:00:00.000Z",
  };

  it("fixed deep cleaning solo: always R250", () => {
    const r = resolveCanonicalCleanerPayout({
      ...base,
      serviceId: "deep",
      cleanerJoinedAtIso: "2020-01-01T00:00:00.000Z",
      bookingAppointmentIsoUtc: "2026-04-20T10:00:00.000Z",
    });
    expect(r.fixedServiceOverride).toBe(true);
    expect(r.displayEarningsCents).toBe(25_000);
    expect(r.cleanerPayoutCents).toBe(25_000);
    expect(r.cleanerBonusCents).toBe(0);
    expect(r.payoutType).toBe("fixed_special");
  });

  it("junior standard: 60% clamped", () => {
    const r = resolveCanonicalCleanerPayout({
      ...base,
      serviceId: "standard",
      cleanerJoinedAtIso: "2026-03-01T00:00:00.000Z",
      bookingAppointmentIsoUtc: "2026-04-20T10:00:00.000Z",
    });
    expect(r.tenureMonths).toBeLessThan(4);
    expect(r.payoutPercentage).toBe(0.6);
    expect(r.cleanerPayoutCents).toBe(30_000);
    expect(r.cleanerBonusCents).toBe(0);
    expect(r.displayEarningsCents).toBe(30_000);
  });

  it("senior standard: 70% capped at R300", () => {
    const r = resolveCanonicalCleanerPayout({
      ...base,
      serviceId: "standard",
      cleanerJoinedAtIso: "2025-01-01T00:00:00.000Z",
      bookingAppointmentIsoUtc: "2026-04-20T10:00:00.000Z",
    });
    expect(r.tenureMonths).toBeGreaterThanOrEqual(4);
    expect(r.payoutPercentage).toBe(0.7);
    expect(r.cleanerPayoutCents).toBe(30_000);
    expect(r.cleanerBonusCents).toBe(0);
    expect(r.displayEarningsCents).toBe(30_000);
  });

  it("does not auto-bonus when raw % exceeds R300 cap", () => {
    const r = resolveCanonicalCleanerPayout({
      serviceId: "standard",
      cleanerJoinedAtIso: "2025-01-01T00:00:00.000Z",
      bookingAppointmentIsoUtc: "2026-04-20T10:00:00.000Z",
      bookingValueCents: 100_000,
      customerTotalCents: 100_000,
      isTeamJob: false,
      soloCleanerId: base.soloCleanerId,
      computedAtIso: base.computedAtIso,
    });
    expect(r.cleanerPayoutCents).toBe(30_000);
    expect(r.cleanerBonusCents).toBe(0);
    expect(r.displayEarningsCents).toBe(30_000);
  });

  it("fixed team deep: leader R270, member R250", () => {
    const leader = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const member = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const r = resolveCanonicalCleanerPayout({
      serviceId: "deep",
      bookingValueCents: 90_000,
      customerTotalCents: 90_000,
      isTeamJob: true,
      teamLeaderId: leader,
      participantCleanerIds: [leader, member],
      rosterRoles: [
        { cleaner_id: leader, role: "lead" },
        { cleaner_id: member, role: "member" },
      ],
      bookingAppointmentIsoUtc: "2026-06-01T12:00:00.000Z",
      cleanerJoinedAtIso: null,
      computedAtIso: base.computedAtIso,
    });
    expect(r.payoutType).toBe("team_fixed_with_leader");
    expect(r.earningsSummary?.total_cleaner_earnings_cents).toBe(
      TEAM_LEADER_FIXED_PAYOUT_CENTS + TEAM_MEMBER_FIXED_PAYOUT_CENTS,
    );
    const leadRow = r.earningsSummary?.per_cleaner_earnings.find((x) => x.cleaner_id === leader);
    const memberRow = r.earningsSummary?.per_cleaner_earnings.find((x) => x.cleaner_id === member);
    expect(leadRow?.base_earning_cents).toBe(TEAM_LEADER_FIXED_PAYOUT_CENTS);
    expect(memberRow?.base_earning_cents).toBe(TEAM_MEMBER_FIXED_PAYOUT_CENTS);
  });

  it("standard team: same percentage earning for every member", () => {
    const lead = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const member = "dddddddd-dddd-dddd-dddd-dddddddddddd";
    const r = resolveCanonicalCleanerPayout({
      serviceId: "standard",
      bookingValueCents: 50_000,
      customerTotalCents: 50_000,
      isTeamJob: true,
      teamLeaderId: lead,
      teamLeaderJoinedAtIso: "2025-01-01T00:00:00.000Z",
      participantCleanerIds: [lead, member],
      bookingAppointmentIsoUtc: "2026-06-01T12:00:00.000Z",
      cleanerJoinedAtIso: "2025-01-01T00:00:00.000Z",
      computedAtIso: base.computedAtIso,
    });
    expect(r.payoutType).toBe("team_percentage_parity");
    const amounts = r.earningsSummary?.per_cleaner_earnings.map((x) => x.base_earning_cents) ?? [];
    expect(amounts).toEqual([30_000, 30_000]);
  });

  it("null appointment → junior tenure (0 months)", () => {
    const r = resolveCanonicalCleanerPayout({
      serviceId: "standard",
      cleanerJoinedAtIso: "2010-01-01T00:00:00.000Z",
      bookingAppointmentIsoUtc: null,
      bookingValueCents: 50_000,
      customerTotalCents: 50_000,
      isTeamJob: false,
      soloCleanerId: base.soloCleanerId,
      computedAtIso: base.computedAtIso,
    });
    expect(r.tenureMonths).toBe(0);
    expect(r.payoutPercentage).toBe(0.6);
  });
});
