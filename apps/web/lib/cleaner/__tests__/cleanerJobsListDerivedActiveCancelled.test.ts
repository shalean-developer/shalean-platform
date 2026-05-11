import { describe, it, expect } from "vitest";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import {
  isActiveCleanerJobRow,
  isCancelledCleanerJobRow,
  isCompletedCleanerJobRow,
  isOpenCleanerJobRow,
  isPastCleanerJobRow,
} from "@/lib/cleaner/cleanerJobsListDerived";

function row(overrides: Partial<CleanerBookingRow>): CleanerBookingRow {
  return {
    id: "b",
    date: "2026-05-20",
    time: "09:00",
    location: "Claremont",
    status: "assigned",
    rooms: 2,
    bathrooms: 1,
    extras: [],
    customer_name: "Test",
    customer_phone: null,
    completed_at: null,
    cleaner_response_status: null,
    ...overrides,
  } as CleanerBookingRow;
}

describe("isActiveCleanerJobRow", () => {
  it("returns true for in_progress and en_route rows", () => {
    expect(isActiveCleanerJobRow(row({ status: "in_progress" }))).toBe(true);
    expect(isActiveCleanerJobRow(row({ status: "en_route" }))).toBe(true);
  });

  it("returns false for assigned / completed / cancelled / failed / unknown", () => {
    expect(isActiveCleanerJobRow(row({ status: "assigned" }))).toBe(false);
    expect(isActiveCleanerJobRow(row({ status: "completed" }))).toBe(false);
    expect(isActiveCleanerJobRow(row({ status: "cancelled" }))).toBe(false);
    expect(isActiveCleanerJobRow(row({ status: "failed" }))).toBe(false);
    expect(isActiveCleanerJobRow(row({ status: "" }))).toBe(false);
  });

  it("never overlaps with the past bucket", () => {
    const r = row({ status: "in_progress" });
    expect(isActiveCleanerJobRow(r) && isPastCleanerJobRow(r)).toBe(false);
  });
});

describe("isCancelledCleanerJobRow", () => {
  it("matches cancelled and failed", () => {
    expect(isCancelledCleanerJobRow(row({ status: "cancelled" }))).toBe(true);
    expect(isCancelledCleanerJobRow(row({ status: "failed" }))).toBe(true);
  });

  it("does not match completed / open / active", () => {
    expect(isCancelledCleanerJobRow(row({ status: "completed" }))).toBe(false);
    expect(isCancelledCleanerJobRow(row({ status: "assigned" }))).toBe(false);
    expect(isCancelledCleanerJobRow(row({ status: "in_progress" }))).toBe(false);
  });

  it("is a strict subset of the past bucket and never of the open bucket", () => {
    const r = row({ status: "cancelled" });
    expect(isCancelledCleanerJobRow(r)).toBe(true);
    expect(isPastCleanerJobRow(r)).toBe(true);
    expect(isOpenCleanerJobRow(r)).toBe(false);
    expect(isCompletedCleanerJobRow(r)).toBe(false);
  });
});
