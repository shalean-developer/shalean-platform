import { describe, it, expect } from "vitest";
import {
  isDispatchOfferUnclaimedForCleaner,
  isDispatchOfferVisibleNow,
} from "@/lib/cleaner/dispatchOffersVisibility";

const nowMs = Date.UTC(2026, 4, 15, 10, 0, 0); // 2026-05-15T10:00:00Z
const cleanerId = "d8a75570-4b3f-44bc-848a-ad9f33857c91";
const bookingId = "13cacd49-1d92-4e20-8d06-4f561d144bd8";

describe("isDispatchOfferVisibleNow", () => {
  it("returns true when dispatch_visible_at is null (selected-cleaner checkout default)", () => {
    expect(isDispatchOfferVisibleNow({ dispatch_visible_at: null }, nowMs)).toBe(true);
  });

  it("returns true when dispatch_visible_at is empty string", () => {
    expect(isDispatchOfferVisibleNow({ dispatch_visible_at: "" }, nowMs)).toBe(true);
  });

  it("returns true when dispatch_visible_at is in the past", () => {
    expect(
      isDispatchOfferVisibleNow({ dispatch_visible_at: "2026-05-15T09:00:00Z" }, nowMs),
    ).toBe(true);
  });

  it("returns false when dispatch_visible_at is in the future (tier-deferred)", () => {
    expect(
      isDispatchOfferVisibleNow({ dispatch_visible_at: "2026-05-15T11:00:00Z" }, nowMs),
    ).toBe(false);
  });

  it("returns true (defensive) when dispatch_visible_at is non-parseable", () => {
    expect(isDispatchOfferVisibleNow({ dispatch_visible_at: "not-a-date" }, nowMs)).toBe(true);
  });
});

describe("isDispatchOfferUnclaimedForCleaner", () => {
  const baseArgs = {
    bookingId,
    cleanerId,
    rosterBookingIds: new Set<string>(),
  };

  it("keeps the offer visible when the underlying booking row hasn't been loaded yet", () => {
    expect(isDispatchOfferUnclaimedForCleaner({ ...baseArgs, booking: null })).toBe(true);
  });

  it("keeps the offer visible when the booking is still in pending_assignment (selected-cleaner checkout)", () => {
    expect(
      isDispatchOfferUnclaimedForCleaner({
        ...baseArgs,
        booking: { status: "pending_assignment", cleaner_id: null },
      }),
    ).toBe(true);
  });

  it("keeps the offer visible when the booking is still searching (post-decline rerunning dispatch)", () => {
    expect(
      isDispatchOfferUnclaimedForCleaner({
        ...baseArgs,
        booking: { status: "searching", cleaner_id: null },
      }),
    ).toBe(true);
  });

  it("hides the offer when the booking is already assigned to this cleaner (solo job)", () => {
    expect(
      isDispatchOfferUnclaimedForCleaner({
        ...baseArgs,
        booking: { status: "assigned", cleaner_id: cleanerId },
      }),
    ).toBe(false);
  });

  it("hides the offer when the booking is a team job and this cleaner is on the roster", () => {
    expect(
      isDispatchOfferUnclaimedForCleaner({
        ...baseArgs,
        rosterBookingIds: new Set([bookingId]),
        booking: { status: "in_progress", cleaner_id: "other", is_team_job: true },
      }),
    ).toBe(false);
  });

  it("keeps the offer visible when assigned to a DIFFERENT cleaner (race scenario)", () => {
    expect(
      isDispatchOfferUnclaimedForCleaner({
        ...baseArgs,
        booking: { status: "assigned", cleaner_id: "other-cleaner" },
      }),
    ).toBe(true);
  });
});
