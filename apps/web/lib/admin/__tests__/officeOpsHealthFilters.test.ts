import { describe, expect, it } from "vitest";
import {
  bookingEngineUptimeBarsFromSuccessCounts,
  filterBookingEngineCronErrors,
  hasLiveBookingEngineFinding,
  isBookingEngineCronScheduleFindingCode,
  isBookingEngineLiveFindingCode,
  isCronRunNoiseMessage,
  isWebsiteCustomerFacingSystemLog,
} from "@/lib/admin/officeOpsHealthFilters";

describe("isWebsiteCustomerFacingSystemLog", () => {
  it("excludes cron and ops-health mirror errors", () => {
    expect(isWebsiteCustomerFacingSystemLog({ created_at: "2026-07-05T10:00:00Z", source: "cron_run", message: "booking-lifecycle" })).toBe(false);
    expect(isWebsiteCustomerFacingSystemLog({ created_at: "2026-07-05T10:00:00Z", source: "production_health", message: "scan" })).toBe(false);
    expect(isWebsiteCustomerFacingSystemLog({ created_at: "2026-07-05T10:00:00Z", source: "booking_finalize", message: "payment mismatch" })).toBe(true);
  });
});

describe("filterBookingEngineCronErrors", () => {
  it("keeps booking cron jobs and drops auth noise", () => {
    const rows = filterBookingEngineCronErrors([
      { created_at: "2026-07-05T10:00:00Z", job_name: "booking-lifecycle", message: "handler failed" },
      { created_at: "2026-07-05T10:00:00Z", job_name: "ops-health", message: "Unauthorized." },
      { created_at: "2026-07-05T10:00:00Z", job_name: "booking-lifecycle", message: "[auth] Unauthorized." },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.job_name).toBe("booking-lifecycle");
  });
});

describe("booking finding code matchers", () => {
  it("separates live drift from cron schedule lag and recurring template backfill", () => {
    expect(isBookingEngineLiveFindingCode("dispatch_stale_unassigned")).toBe(true);
    expect(isBookingEngineLiveFindingCode("cron_stale_or_missing_success")).toBe(false);
    expect(isBookingEngineLiveFindingCode("recurring_snapshot_drift")).toBe(false);
    expect(isBookingEngineCronScheduleFindingCode("cron_stale_or_missing_success")).toBe(true);
    expect(
      hasLiveBookingEngineFinding(
        [{ code: "cron_stale_or_missing_success", severity: "high", count: 2 }],
        isBookingEngineLiveFindingCode,
      ),
    ).toBe(false);
    expect(
      hasLiveBookingEngineFinding(
        [{ code: "recurring_snapshot_drift", severity: "high", count: 57 }],
        isBookingEngineLiveFindingCode,
      ),
    ).toBe(false);
  });
});

describe("bookingEngineUptimeBarsFromSuccessCounts", () => {
  it("treats days without cron activity as neutral", () => {
    expect(bookingEngineUptimeBarsFromSuccessCounts(["2026-07-01", "2026-07-02"], new Map(), new Map())).toEqual(["ok", "ok"]);
  });

  it("marks error-only days as warn", () => {
    expect(
      bookingEngineUptimeBarsFromSuccessCounts(
        ["2026-07-01", "2026-07-02"],
        new Map([["2026-07-01", 2]]),
        new Map([["2026-07-02", 1]]),
      ),
    ).toEqual(["ok", "warn"]);
  });
});

describe("isCronRunNoiseMessage", () => {
  it("detects skipped lock payloads", () => {
    expect(isCronRunNoiseMessage('{"skipped":true,"reason":"lock_held"}')).toBe(true);
    expect(isCronRunNoiseMessage("[env] Supabase not configured.")).toBe(true);
  });

  it("treats legacy user_id schema probe failures as noise", () => {
    expect(isCronRunNoiseMessage("[bookings_select] column bookings.user_id does not exist")).toBe(true);
  });
});
