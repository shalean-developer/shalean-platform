import { describe, expect, it } from "vitest";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { isOpenCleanerJobRow } from "@/lib/cleaner/cleanerJobsListDerived";

function row(p: Partial<CleanerBookingRow>): CleanerBookingRow {
  return {
    id: "b1",
    service: "Deep",
    date: "2026-05-08",
    time: "09:00",
    location: null,
    status: "assigned",
    total_paid_zar: null,
    customer_name: null,
    customer_phone: null,
    assigned_at: null,
    en_route_at: null,
    started_at: null,
    completed_at: null,
    created_at: null,
    ...p,
  };
}

describe("isOpenCleanerJobRow", () => {
  it("treats empty or whitespace status as open (shows in Jobs list)", () => {
    expect(isOpenCleanerJobRow(row({ status: null }))).toBe(true);
    expect(isOpenCleanerJobRow(row({ status: "" }))).toBe(true);
    expect(isOpenCleanerJobRow(row({ status: "   " }))).toBe(true);
  });

  it("excludes completed and cancelled only", () => {
    expect(isOpenCleanerJobRow(row({ status: "completed" }))).toBe(false);
    expect(isOpenCleanerJobRow(row({ status: "cancelled" }))).toBe(false);
    expect(isOpenCleanerJobRow(row({ status: "assigned" }))).toBe(true);
    expect(isOpenCleanerJobRow(row({ status: "confirmed" }))).toBe(true);
  });
});
