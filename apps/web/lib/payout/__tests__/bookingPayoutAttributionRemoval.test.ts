import { describe, expect, it } from "vitest";
import {
  bookingHasActivePayoutAttributionRemoval,
  readPayoutAttributionRemovalMarker,
  withPayoutAttributionRemovalMarker,
} from "@/lib/payout/bookingPayoutAttributionRemoval";

describe("bookingPayoutAttributionRemoval", () => {
  const marker = {
    active: true as const,
    cleaner_id: "cleaner-old",
    removed_at: "2026-10-03T18:00:00.000Z",
    removed_by_admin_id: "admin-1",
    reason: "wrong cleaner",
  };

  it("merges and reads the durable metadata marker without discarding existing metadata", () => {
    const metadata = withPayoutAttributionRemovalMarker({ source: "website" }, marker);
    expect(metadata.source).toBe("website");
    expect(readPayoutAttributionRemovalMarker(metadata)).toEqual(marker);
  });

  it("is active only while the retained primary identity matches the removed cleaner", () => {
    const metadata = withPayoutAttributionRemovalMarker(null, marker);
    expect(bookingHasActivePayoutAttributionRemoval({ metadata, cleaner_id: "cleaner-old" })).toBe(true);
    expect(bookingHasActivePayoutAttributionRemoval({ metadata, cleaner_id: "cleaner-new" })).toBe(false);
    expect(bookingHasActivePayoutAttributionRemoval({ metadata, cleaner_id: null, payout_owner_cleaner_id: "cleaner-old" })).toBe(true);
  });
});
