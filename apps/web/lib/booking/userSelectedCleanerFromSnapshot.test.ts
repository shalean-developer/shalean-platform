import { describe, it, expect } from "vitest";
import { pickUserSelectedCleanerId } from "@/lib/booking/userSelectedCleanerFromSnapshot";
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
