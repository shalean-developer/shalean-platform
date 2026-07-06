import { describe, expect, it } from "vitest";
import {
  cleanerEarningsRulesSummaryText,
  cleanerEarningsTierFromJoinedAt,
  cleanerTenureSummary,
  formatJoinedAtForAdminInput,
  parseAdminJoinedAtInput,
} from "@/lib/admin/cleanerTenureDisplay";

describe("cleanerTenureSummary", () => {
  it("classifies junior cleaners under 4 months", () => {
    const s = cleanerTenureSummary({
      joined_at: "2026-04-01T00:00:00.000Z",
      referenceAppointmentIsoUtc: "2026-05-12T10:00:00.000Z",
    });
    expect(s.tier).toBe("junior");
    expect(s.payoutPercentage).toBe(0.6);
    expect(s.minZar).toBe(250);
    expect(s.maxZar).toBe(300);
  });

  it("classifies experienced cleaners at 4+ months", () => {
    const s = cleanerTenureSummary({
      joined_at: "2024-01-01T00:00:00.000Z",
      referenceAppointmentIsoUtc: "2026-05-12T10:00:00.000Z",
    });
    expect(s.tier).toBe("experienced");
    expect(s.payoutPercentage).toBe(0.7);
  });

  it("flags missing joined date", () => {
    const s = cleanerTenureSummary({
      joined_at: null,
      created_at: null,
      referenceAppointmentIsoUtc: "2026-05-12T10:00:00.000Z",
    });
    expect(s.tier).toBe("missing_joined");
    expect(s.payoutPercentage).toBe(0.6);
  });
});

describe("parseAdminJoinedAtInput", () => {
  it("parses YYYY-MM-DD", () => {
    expect(parseAdminJoinedAtInput("2024-06-15")).toBe("2024-06-15T00:00:00.000Z");
  });

  it("rejects empty", () => {
    expect(parseAdminJoinedAtInput("")).toBeNull();
  });
});

describe("formatJoinedAtForAdminInput", () => {
  it("round-trips date input", () => {
    expect(formatJoinedAtForAdminInput("2024-06-15T00:00:00.000Z")).toBe("2024-06-15");
  });
});

describe("cleanerEarningsRulesSummaryText", () => {
  it("matches canonical junior and experienced rates", () => {
    const rules = cleanerEarningsRulesSummaryText();
    expect(rules.minZar).toBe(250);
    expect(rules.maxZar).toBe(300);
    expect(rules.tenureMonthsThreshold).toBe(4);
    expect(rules.juniorRateLabel).toBe("60%");
    expect(rules.experiencedRateLabel).toBe("70%");
  });
});

describe("cleanerEarningsTierFromJoinedAt", () => {
  it("uses threshold at exactly 4 months", () => {
    expect(
      cleanerEarningsTierFromJoinedAt("2026-01-01T12:00:00.000Z", "2026-05-01T12:00:00.000Z"),
    ).toBe("experienced");
    expect(
      cleanerEarningsTierFromJoinedAt("2026-01-15T12:00:00.000Z", "2026-05-14T12:00:00.000Z"),
    ).toBe("junior");
  });
});
