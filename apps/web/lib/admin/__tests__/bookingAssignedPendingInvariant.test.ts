import { describe, expect, it } from "vitest";
import { bookingViolatesCleanerAssignedWhilePending } from "@/lib/admin/adminBookingPostCreatePipeline";

describe("bookingViolatesCleanerAssignedWhilePending", () => {
  it("returns false when pending with no cleaner refs", () => {
    expect(
      bookingViolatesCleanerAssignedWhilePending({
        status: "pending",
        cleaner_id: null,
        selected_cleaner_id: null,
      }),
    ).toBe(false);
  });

  it("returns true when pending with cleaner_id (assigned cleaner cannot have pending status)", () => {
    expect(
      bookingViolatesCleanerAssignedWhilePending({
        status: "pending",
        cleaner_id: "00000000-0000-4000-8000-000000000001",
        selected_cleaner_id: null,
      }),
    ).toBe(true);
  });

  it("returns true when pending with selected_cleaner_id only", () => {
    expect(
      bookingViolatesCleanerAssignedWhilePending({
        status: "pending",
        cleaner_id: null,
        selected_cleaner_id: "00000000-0000-4000-8000-000000000002",
      }),
    ).toBe(true);
  });

  it("returns false when assigned with cleaner_id", () => {
    expect(
      bookingViolatesCleanerAssignedWhilePending({
        status: "assigned",
        cleaner_id: "00000000-0000-4000-8000-000000000001",
        selected_cleaner_id: null,
      }),
    ).toBe(false);
  });

  it("treats status case-insensitively for pending", () => {
    expect(
      bookingViolatesCleanerAssignedWhilePending({
        status: " PENDING ",
        cleaner_id: "x",
        selected_cleaner_id: null,
      }),
    ).toBe(true);
  });
});
