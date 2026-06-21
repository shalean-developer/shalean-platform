import { describe, expect, it } from "vitest";
import type { DashboardBooking } from "@/lib/dashboard/types";
import {
  isBookingPendingCustomerReview,
  leaveReviewHrefForBooking,
} from "@/lib/dashboard/customerBookingReviewUi";

function booking(overrides: Partial<DashboardBooking["raw"]> & { id?: string }): DashboardBooking {
  const id = overrides.id ?? "bk-1";
  return {
    id,
    status: "completed",
    serviceName: "Standard clean",
    date: "2026-06-15",
    time: "09:00",
    scheduledAt: "2026-06-15T09:00:00+02:00",
    durationHours: 3,
    priceZar: 450,
    addressLine: "1 Main Rd",
    suburb: "Sandton",
    scheduleConfirmed: true,
    createdAt: "2026-06-01T10:00:00.000Z",
    raw: {
      id,
      status: "completed",
      completed_at: "2026-06-15T12:00:00.000Z",
      ...overrides,
    } as DashboardBooking["raw"],
  } as DashboardBooking;
}

describe("customerBookingReviewUi", () => {
  it("treats team jobs with payout_owner_cleaner_id as reviewable", () => {
    const b = booking({
      cleaner_id: null,
      is_team_job: true,
      payout_owner_cleaner_id: "11111111-1111-1111-1111-111111111111",
    });
    expect(isBookingPendingCustomerReview(b, new Set())).toBe(true);
  });

  it("returns null review href when already reviewed", () => {
    const b = booking({ cleaner_id: "22222222-2222-2222-2222-222222222222" });
    expect(leaveReviewHrefForBooking(b, new Set(["bk-1"]), false)).toBeNull();
  });

  it("returns review href for eligible solo booking", () => {
    const b = booking({ cleaner_id: "22222222-2222-2222-2222-222222222222" });
    expect(leaveReviewHrefForBooking(b, new Set(), false)).toBe("/review?booking=bk-1");
  });
});
