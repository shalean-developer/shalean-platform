import { describe, expect, it } from "vitest";
import { ASSIGNED_ACCEPT_GRACE_MS, assignedOfferPastAcceptanceDeadline } from "@/lib/cleaner/cleanerAssignedOfferExpiry";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";

function row(over: Partial<CleanerBookingRow>): Pick<CleanerBookingRow, "status" | "cleaner_response_status" | "date" | "time"> {
  return {
    status: "assigned",
    cleaner_response_status: "pending",
    date: "2026-04-30",
    time: "09:00",
    ...over,
  };
}

describe("assignedOfferPastAcceptanceDeadline", () => {
  it("is false before start + grace", () => {
    const startMs = Date.parse("2026-04-30T07:00:00.000Z");
    const nowMs = startMs + ASSIGNED_ACCEPT_GRACE_MS - 60_000;
    expect(assignedOfferPastAcceptanceDeadline(row({}), nowMs)).toBe(false);
  });

  it("is true after start + grace when still not accepted", () => {
    const startMs = Date.parse("2026-04-30T07:00:00.000Z");
    const nowMs = startMs + ASSIGNED_ACCEPT_GRACE_MS + 60_000;
    expect(assignedOfferPastAcceptanceDeadline(row({}), nowMs)).toBe(true);
  });

  it("is false once accepted", () => {
    const nowMs = Date.now();
    expect(assignedOfferPastAcceptanceDeadline(row({ cleaner_response_status: "accepted" }), nowMs)).toBe(false);
  });

  it("is false for non-assigned status", () => {
    const nowMs = Date.parse("2099-01-01T00:00:00.000Z");
    expect(assignedOfferPastAcceptanceDeadline(row({ status: "in_progress" }), nowMs)).toBe(false);
  });

  it("is false when date cannot be parsed to start", () => {
    const nowMs = Date.parse("2099-01-01T00:00:00.000Z");
    expect(assignedOfferPastAcceptanceDeadline(row({ date: "not-a-date" }), nowMs)).toBe(false);
  });
});
