import { describe, expect, it } from "vitest";
import {
  buildAdminCleanerWorkloadFlags,
  deriveAdminCleanerWorkloadDisplay,
} from "@/lib/admin/deriveAdminCleanerWorkloadDisplay";

describe("buildAdminCleanerWorkloadFlags", () => {
  it("marks active jobs from in_progress and en_route", () => {
    const map = buildAdminCleanerWorkloadFlags([
      { status: "in_progress", cleaner_id: "c1" },
      { status: "en_route", cleaner_id: "c2" },
    ]);
    expect(map.get("c1")).toEqual({ hasActiveJob: true, hasBookedJob: false });
    expect(map.get("c2")).toEqual({ hasActiveJob: true, hasBookedJob: false });
  });

  it("marks booked from assigned roster rows", () => {
    const map = buildAdminCleanerWorkloadFlags([
      {
        status: "assigned",
        cleaner_id: "lead",
        booking_cleaners: [{ cleaner_id: "c1" }, { cleaner_id: "c2" }],
      },
    ]);
    expect(map.get("c1")).toEqual({ hasActiveJob: false, hasBookedJob: true });
    expect(map.get("c2")).toEqual({ hasActiveJob: false, hasBookedJob: true });
    expect(map.get("lead")).toBeUndefined();
  });

  it("prefers active over booked when both exist", () => {
    const map = buildAdminCleanerWorkloadFlags([
      { status: "assigned", cleaner_id: "c1" },
      { status: "in_progress", cleaner_id: "c1" },
    ]);
    expect(map.get("c1")).toEqual({ hasActiveJob: true, hasBookedJob: true });
    const display = deriveAdminCleanerWorkloadDisplay({
      isAvailable: true,
      hasActiveJob: true,
      hasBookedJob: true,
    });
    expect(display.label).toBe("In progress");
  });
});

describe("deriveAdminCleanerWorkloadDisplay", () => {
  it("returns offline for manual pause", () => {
    expect(
      deriveAdminCleanerWorkloadDisplay({ isAvailable: false, hasBookedJob: true }).filter_key,
    ).toBe("offline");
  });

  it("returns booked for future assigned without active job", () => {
    expect(
      deriveAdminCleanerWorkloadDisplay({
        isAvailable: true,
        dbStatus: "busy",
        hasBookedJob: true,
      }),
    ).toEqual({ label: "Booked", filter_key: "booked" });
  });

  it("returns available when db busy but no open workload bookings", () => {
    expect(
      deriveAdminCleanerWorkloadDisplay({
        isAvailable: true,
        dbStatus: "busy",
      }),
    ).toEqual({ label: "Available", filter_key: "available" });
  });
});
