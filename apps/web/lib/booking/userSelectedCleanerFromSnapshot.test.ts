import { describe, it, expect } from "vitest";
import {
  mergePickedCleanerWithPersistedBookingSelection,
  paystackFinalizeClearsSelectedCleanerId,
  pickUserSelectedCleanerId,
} from "@/lib/booking/userSelectedCleanerFromSnapshot";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";

const sampleUuid = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

describe("pickUserSelectedCleanerId", () => {
  it("prefers locked.cleaner_id over snapshot", () => {
    const locked = { cleaner_id: sampleUuid } as LockedBooking;
    const snap = { v: 1, cleaner_id: "00000000-0000-4000-8000-000000000001" } as BookingSnapshotV1;
    expect(pickUserSelectedCleanerId(locked, snap)).toBe(sampleUuid.toLowerCase());
  });

  it("falls back to snapshot.cleaner_id", () => {
    const snap = { v: 1, cleaner_id: sampleUuid } as BookingSnapshotV1;
    expect(pickUserSelectedCleanerId(null, snap)).toBe(sampleUuid.toLowerCase());
  });

  it("returns null for empty or invalid", () => {
    expect(pickUserSelectedCleanerId({ cleaner_id: "" } as LockedBooking, null)).toBe(null);
    expect(pickUserSelectedCleanerId({ cleaner_id: "not-a-uuid" } as LockedBooking, null)).toBe(null);
  });
});

describe("mergePickedCleanerWithPersistedBookingSelection", () => {
  const snap = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
  const db = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";

  it("prefers snapshot/lock pick when present", () => {
    expect(mergePickedCleanerWithPersistedBookingSelection(snap, db)).toBe(snap.toLowerCase());
  });

  it("falls back to persisted bookings.selected_cleaner_id", () => {
    expect(mergePickedCleanerWithPersistedBookingSelection(null, db)).toBe(db.toLowerCase());
    expect(mergePickedCleanerWithPersistedBookingSelection(null, undefined)).toBe(null);
  });
});

describe("paystackFinalizeClearsSelectedCleanerId", () => {
  it("clears only on no_pick without honor confirmation", () => {
    expect(
      paystackFinalizeClearsSelectedCleanerId({
        userConfirmedCleanerId: null,
        checkoutResolutionKind: "no_pick",
      }),
    ).toBe(true);
    expect(
      paystackFinalizeClearsSelectedCleanerId({
        userConfirmedCleanerId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        checkoutResolutionKind: "no_pick",
      }),
    ).toBe(false);
    expect(
      paystackFinalizeClearsSelectedCleanerId({
        userConfirmedCleanerId: null,
        checkoutResolutionKind: "fallback",
      }),
    ).toBe(false);
    expect(
      paystackFinalizeClearsSelectedCleanerId({
        userConfirmedCleanerId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        checkoutResolutionKind: "honor",
      }),
    ).toBe(false);
  });
});
