import { describe, expect, it } from "vitest";
import {
  cleanerIsExperiencedFourMonths,
  cleanerUxEstimatedPayZar,
  jobTotalZarFromCleanerBookingLike,
} from "@/lib/cleaner/cleanerUxEstimatedPayZar";

describe("jobTotalZarFromCleanerBookingLike", () => {
  it("prefers total_paid_zar", () => {
    expect(jobTotalZarFromCleanerBookingLike({ total_paid_zar: 500 })).toBe(500);
  });
  it("parses total_price string", () => {
    expect(jobTotalZarFromCleanerBookingLike({ total_price: "1,234.50" })).toBe(1234.5);
  });
  it("uses amount_paid_cents", () => {
    expect(jobTotalZarFromCleanerBookingLike({ amount_paid_cents: 45_000 })).toBe(450);
  });
});

describe("cleanerIsExperiencedFourMonths", () => {
  it("is false when unknown created_at", () => {
    expect(cleanerIsExperiencedFourMonths(null, new Date("2026-06-01"))).toBe(false);
  });
  it("is true after four calendar months", () => {
    expect(cleanerIsExperiencedFourMonths("2025-01-01T12:00:00Z", new Date("2026-06-01"))).toBe(true);
  });
  it("is false before four months", () => {
    expect(cleanerIsExperiencedFourMonths("2026-03-01T12:00:00Z", new Date("2026-06-01"))).toBe(false);
  });
});

describe("cleanerUxEstimatedPayZar", () => {
  it("returns range when job total missing", () => {
    const r = cleanerUxEstimatedPayZar("2026-01-01", null, new Date("2026-06-01"));
    expect(r).toEqual({ kind: "range", lowZar: 250, highZar: 350 });
  });
  it("new cleaner clamps 60% to caps", () => {
    const r = cleanerUxEstimatedPayZar("2026-05-01", 1000, new Date("2026-06-01"));
    expect(r).toEqual({ kind: "exact", zar: 350 });
  });
  it("new cleaner lifts low share to 250", () => {
    const r = cleanerUxEstimatedPayZar("2026-05-01", 300, new Date("2026-06-01"));
    expect(r).toEqual({ kind: "exact", zar: 250 });
  });
  it("old cleaner uses 70%", () => {
    const r = cleanerUxEstimatedPayZar("2020-01-01", 400, new Date("2026-06-01"));
    expect(r).toEqual({ kind: "exact", zar: 280 });
  });
});
