import { describe, expect, it } from "vitest";
import {
  bookingAppointmentIsoUtc,
  calendarMonthsBetweenCleanerJoinedAndAppointment,
  isFixedPayoutSpecial,
  normalizeBookingServiceIdForPayout,
  resolveCanonicalCleanerPayout,
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

describe("resolveCanonicalCleanerPayout", () => {
  const base = {
    bookingValueCents: 50_000,
    billingType: "prepaid" as const,
    isTeamJob: false,
    serviceFeeCents: 0,
  };

  it("fixed deep cleaning: always R250, no tenure", () => {
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
    expect(r.tenureMonths).toBe(0);
    expect(r.companyRevenueFromServiceCents).toBe(25_000);
  });

  it("junior standard: 60% then min/max; display = payout + bonus", () => {
    const r = resolveCanonicalCleanerPayout({
      ...base,
      serviceId: "standard",
      cleanerJoinedAtIso: "2026-03-01T00:00:00.000Z",
      bookingAppointmentIsoUtc: "2026-04-20T10:00:00.000Z",
    });
    expect(r.tenureMonths).toBeLessThan(4);
    expect(r.payoutPercentage).toBe(0.6);
    expect(r.internalEarningsCents).toBe(30_000);
    expect(r.cleanerPayoutCents).toBe(30_000);
    expect(r.displayEarningsCents).toBe(30_000);
  });

  it("senior standard: 70%", () => {
    const r = resolveCanonicalCleanerPayout({
      ...base,
      serviceId: "standard",
      cleanerJoinedAtIso: "2025-01-01T00:00:00.000Z",
      bookingAppointmentIsoUtc: "2026-04-20T10:00:00.000Z",
    });
    expect(r.tenureMonths).toBeGreaterThanOrEqual(4);
    expect(r.payoutPercentage).toBe(0.7);
    expect(r.cleanerPayoutCents).toBe(35_000);
    expect(r.cleanerBonusCents).toBe(0);
    expect(r.displayEarningsCents).toBe(35_000);
  });

  it("bonus when raw % exceeds R350 cap base", () => {
    const r = resolveCanonicalCleanerPayout({
      serviceId: "standard",
      cleanerJoinedAtIso: "2025-01-01T00:00:00.000Z",
      bookingAppointmentIsoUtc: "2026-04-20T10:00:00.000Z",
      bookingValueCents: 100_000,
      isTeamJob: false,
    });
    expect(r.cleanerPayoutCents).toBe(35_000);
    expect(r.cleanerBonusCents).toBe(35_000);
    expect(r.displayEarningsCents).toBe(70_000);
  });

  it("team job: R250 per cleaner; internal = N × R250 (any service incl. deep/move/carpet)", () => {
    const r = resolveCanonicalCleanerPayout({
      serviceId: "deep",
      cleanerJoinedAtIso: "2026-01-01T00:00:00.000Z",
      bookingAppointmentIsoUtc: "2026-06-01T12:00:00.000Z",
      bookingValueCents: 90_000,
      isTeamJob: true,
      teamCleanerCount: 3,
    });
    expect(r.payoutType).toBe("team_per_cleaner_fixed");
    expect(r.displayEarningsCents).toBe(25_000);
    expect(r.internalEarningsCents).toBe(75_000);
    expect(r.diagnostics.payout_mode).toBe("team_per_cleaner_fixed");
    expect(r.diagnostics.team_rule_applied).toBe(true);
    expect(r.diagnostics.booking_total_team_payout_cents).toBe(75_000);
    expect(r.cleanerPayoutCents).toBe(0);
  });

  it("null appointment → junior tenure (0 months)", () => {
    const r = resolveCanonicalCleanerPayout({
      serviceId: "standard",
      cleanerJoinedAtIso: "2010-01-01T00:00:00.000Z",
      bookingAppointmentIsoUtc: null,
      bookingValueCents: 50_000,
      isTeamJob: false,
    });
    expect(r.tenureMonths).toBe(0);
    expect(r.payoutPercentage).toBe(0.6);
  });
});
