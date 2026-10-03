import { describe, expect, it } from "vitest";
import {
  bookingHasActivePayoutAttributionRemoval,
  deactivatePayoutAttributionRemovalMarker,
  readPayoutAttributionRemovalMarker,
  withPayoutAttributionRemovalMarker,
} from "@/lib/payout/bookingPayoutAttributionRemoval";

describe("bookingPayoutAttributionRemoval", () => {
  const marker = {
    active: true as const,
    cleaner_id: "cleaner-old",
    header_cleaner_id_at_removal: "cleaner-old",
    removed_at: "2026-10-03T18:00:00.000Z",
    removed_by_admin_id: "admin-1",
    reason: "wrong cleaner",
  };

  it("merges and reads the durable metadata marker without discarding existing metadata", () => {
    const metadata = withPayoutAttributionRemovalMarker({ source: "website" }, marker);
    expect(metadata.source).toBe("website");
    expect(readPayoutAttributionRemovalMarker(metadata)).toEqual(marker);
  });

  it("stays active while the booking header is unchanged and deactivates on a new assignment", () => {
    const metadata = withPayoutAttributionRemovalMarker(null, marker);
    expect(bookingHasActivePayoutAttributionRemoval({ metadata, cleaner_id: "cleaner-old" })).toBe(true);
    expect(bookingHasActivePayoutAttributionRemoval({ metadata, cleaner_id: null, payout_owner_cleaner_id: "cleaner-old" })).toBe(true);
    expect(bookingHasActivePayoutAttributionRemoval({ metadata, cleaner_id: null, payout_owner_cleaner_id: null })).toBe(true);
    expect(bookingHasActivePayoutAttributionRemoval({ metadata, cleaner_id: "cleaner-new" })).toBe(false);
  });

  it("deactivates the marker while preserving its removal audit fields", () => {
    const metadata = withPayoutAttributionRemovalMarker({ source: "website" }, marker);
    const cleared = deactivatePayoutAttributionRemovalMarker(metadata, {
      cleared_at: "2026-10-03T19:10:00.000Z",
      cleared_by_admin_id: "admin-2",
    });
    expect(cleared.source).toBe("website");
    expect(readPayoutAttributionRemovalMarker(cleared)).toBeNull();
    expect(cleared.payout_attribution_removal_v1).toMatchObject({
      active: false,
      cleaner_id: "cleaner-old",
      header_cleaner_id_at_removal: "cleaner-old",
      removed_by_admin_id: "admin-1",
      cleared_at: "2026-10-03T19:10:00.000Z",
      cleared_by_admin_id: "admin-2",
    });
  });

  it("stays active when the removed earnings cleaner differed from the pre-existing header cleaner", () => {
    const mismatchMarker = {
      ...marker,
      cleaner_id: "summary-cleaner",
      header_cleaner_id_at_removal: "header-cleaner",
    };
    const metadata = withPayoutAttributionRemovalMarker(null, mismatchMarker);
    expect(bookingHasActivePayoutAttributionRemoval({ metadata, cleaner_id: "header-cleaner" })).toBe(true);
    expect(bookingHasActivePayoutAttributionRemoval({ metadata, cleaner_id: "new-cleaner" })).toBe(false);
  });
});
