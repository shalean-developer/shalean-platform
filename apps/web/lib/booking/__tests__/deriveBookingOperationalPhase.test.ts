import { describe, expect, it } from "vitest";
import {
  deriveBookingOperationalPhase,
  isAuthoritativeBookingCompleted,
} from "@/lib/booking/deriveBookingOperationalPhase";

describe("isAuthoritativeBookingCompleted", () => {
  it("is true only for status completed or non-null completed_at", () => {
    expect(isAuthoritativeBookingCompleted({ status: "completed", completed_at: null })).toBe(true);
    expect(isAuthoritativeBookingCompleted({ status: "in_progress", completed_at: "2026-04-30T12:00:00.000Z" })).toBe(true);
    expect(isAuthoritativeBookingCompleted({ status: "in_progress", completed_at: null })).toBe(false);
    expect(isAuthoritativeBookingCompleted({ status: "in_progress", completed_at: "  " })).toBe(false);
  });
});

describe("deriveBookingOperationalPhase", () => {
  it("maps terminal and pending statuses", () => {
    expect(deriveBookingOperationalPhase({ status: "completed" })).toBe("completed");
    expect(deriveBookingOperationalPhase({ status: "cancelled" })).toBe("cancelled");
    expect(deriveBookingOperationalPhase({ status: "failed" })).toBe("failed");
    expect(deriveBookingOperationalPhase({ status: "pending" })).toBe("pending");
  });

  it("treats completed_at alone as completed (authoritative)", () => {
    expect(
      deriveBookingOperationalPhase({
        status: "in_progress",
        completed_at: "2026-04-30T12:00:00.000Z",
        cleaner_response_status: "started",
      }),
    ).toBe("completed");
  });

  it("does NOT infer completed from cleaner_response_status alone", () => {
    expect(
      deriveBookingOperationalPhase({
        status: "in_progress",
        cleaner_response_status: "completed",
        completed_at: null,
      }),
    ).toBe("active");
  });

  it("detects drift: assignable status + started response → active", () => {
    expect(
      deriveBookingOperationalPhase({
        status: "assigned",
        cleaner_response_status: "started",
      }),
    ).toBe("active");
  });

  it("treats assigned + on_my_way as travelling", () => {
    expect(
      deriveBookingOperationalPhase({
        status: "assigned",
        cleaner_response_status: "on_my_way",
      }),
    ).toBe("travelling");
  });

  it("treats in_progress + started + null completed_at as active (never completed)", () => {
    expect(
      deriveBookingOperationalPhase({
        status: "in_progress",
        cleaner_response_status: "started",
        completed_at: null,
      }),
    ).toBe("active");
  });

  it("returns expired for dispatch_status expired on open statuses", () => {
    expect(
      deriveBookingOperationalPhase({
        status: "pending",
        dispatch_status: "expired",
      }),
    ).toBe("expired");
  });
});
