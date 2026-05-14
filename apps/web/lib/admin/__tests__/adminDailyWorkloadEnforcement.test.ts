import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { maxCleanerDailyWorkloadEnforceAdmin } from "@/lib/booking/availabilityFlags";
import { performAdminAssignToCleaner } from "@/lib/admin/performAdminAssignToCleaner";
import { getEligibleCleaners } from "@/lib/booking/getEligibleCleaners";
import { setAdminManualBookingOffered } from "@/lib/admin/adminManualBookingOfferCommand";
import { createDispatchOfferRow } from "@/lib/dispatch/dispatchOffers";

vi.mock("@/lib/booking/getEligibleCleaners", () => ({
  getEligibleCleaners: vi.fn(),
}));

vi.mock("@/lib/admin/adminManualBookingOfferCommand", () => ({
  setAdminManualBookingOffered: vi.fn(),
}));

vi.mock("@/lib/dispatch/dispatchOffers", () => ({
  createDispatchOfferRow: vi.fn(),
}));

vi.mock("@/lib/cleaner/syncCleanerStatus", () => ({
  syncCleanerBusyFromBookings: vi.fn(),
}));

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const CLEANER_ID = "22222222-2222-4222-8222-222222222222";
const CITY_ID = "33333333-3333-4333-8333-333333333333";
const LOC_ID = "44444444-4444-4444-8444-444444444444";
const DATE = "2026-06-15";

function booking(overrides: Record<string, unknown> = {}) {
  return {
    id: BOOKING_ID,
    date: DATE,
    time: "10:00",
    status: "pending",
    cleaner_id: null,
    city_id: CITY_ID,
    dispatch_status: null,
    duration_minutes: 240,
    location_id: LOC_ID,
    service_slug: "standard",
    service: "Standard Cleaning",
    ...overrides,
  };
}

function buildAdminMock(rows: Array<Record<string, unknown>>, bookingOverrides: Record<string, unknown> = {}): SupabaseClient {
  const client = {
    from(table: string) {
      if (table === "bookings") {
        return {
          select(columns: string) {
            if (columns.includes("payout_owner_cleaner_id")) {
              return {
                eq(column: string, value: string) {
                  expect([column, value]).toEqual(["date", DATE]);
                  return {
                    eq(column2: string, value2: string) {
                      expect([column2, value2]).toEqual(["cleaner_id", CLEANER_ID]);
                      return {
                        neq(column3: string, value3: string) {
                          expect([column3, value3]).toEqual(["id", BOOKING_ID]);
                          return Promise.resolve({ data: rows, error: null });
                        },
                      };
                    },
                  };
                },
              };
            }
            return {
              eq(column: string, value: string) {
                expect([column, value]).toEqual(["id", BOOKING_ID]);
                return {
                  maybeSingle: () => Promise.resolve({ data: booking(bookingOverrides), error: null }),
                };
              },
            };
          },
          update() {
            return {
              eq() {
                return {
                  eq: () => Promise.resolve({ data: null, error: null }),
                };
              },
            };
          },
        };
      }
      if (table === "cleaners") {
        return {
          select: () => ({
            eq: (_column: string, _value: string) => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: CLEANER_ID, status: "available", city_id: CITY_ID, is_available: true },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "dispatch_offers") {
        return {
          update: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return client as unknown as SupabaseClient;
}

describe("Phase 2E-E admin daily workload enforcement flag", () => {
  const originalFlag = process.env.MAX_CLEANER_DAILY_WORKLOAD_ENFORCE_ADMIN;

  beforeEach(() => {
    vi.mocked(getEligibleCleaners).mockResolvedValue([
      {
        id: CLEANER_ID,
        full_name: "Cleaner",
        phone: null,
        email: null,
        rating: 5,
        is_available: true,
        slot_eligible: true,
        jobs_completed: 10,
        review_count: 0,
        recent_reviews: [],
        distance_km: null,
        base_lat: null,
        base_lng: null,
      },
    ]);
    vi.mocked(setAdminManualBookingOffered).mockResolvedValue({ ok: true });
    vi.mocked(createDispatchOfferRow).mockResolvedValue({
      ok: true,
      offerId: "offer-1",
      expiresAtIso: "2026-06-15T08:15:00.000Z",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (originalFlag === undefined) delete process.env.MAX_CLEANER_DAILY_WORKLOAD_ENFORCE_ADMIN;
    else process.env.MAX_CLEANER_DAILY_WORKLOAD_ENFORCE_ADMIN = originalFlag;
  });

  it("defaults OFF and preserves current normal admin assignment behavior", async () => {
    delete process.env.MAX_CLEANER_DAILY_WORKLOAD_ENFORCE_ADMIN;
    expect(maxCleanerDailyWorkloadEnforceAdmin()).toBe(false);

    const res = await performAdminAssignToCleaner(
      buildAdminMock([{ id: "existing", cleaner_id: CLEANER_ID, date: DATE, duration_minutes: 300 }]),
      { bookingId: BOOKING_ID, cleanerId: CLEANER_ID, force: false },
    );

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.workloadWarning?.code).toBe("daily_workload_over_limit");
    if (res.ok) {
      expect(res.warnings?.[0]).toMatchObject({
        code: "admin.assignment.daily_workload_over_limit_requires_confirmation",
        domain: "assignment",
        severity: "high",
        action: "requires_confirmation",
        blocking: true,
      });
    }
    expect(createDispatchOfferRow).toHaveBeenCalled();
  });

  it("ON blocks normal admin assignment when solo workload would exceed 8h", async () => {
    process.env.MAX_CLEANER_DAILY_WORKLOAD_ENFORCE_ADMIN = "true";

    const res = await performAdminAssignToCleaner(
      buildAdminMock([{ id: "existing", cleaner_id: CLEANER_ID, date: DATE, duration_minutes: 300 }]),
      { bookingId: BOOKING_ID, cleanerId: CLEANER_ID, force: false },
    );

    expect(res).toEqual(
      expect.objectContaining({
        ok: false,
        httpStatus: 400,
        code: "admin_daily_workload_over_limit",
      }),
    );
    if (!res.ok) {
      expect(res.workloadWarning?.code).toBe("daily_workload_over_limit");
      expect(res.error).toMatch(/8-hour daily workload/i);
      expect(res.warnings?.[0]).toMatchObject({
        code: "admin.assignment.daily_workload_over_limit_requires_confirmation",
        domain: "assignment",
        severity: "high",
        action: "requires_confirmation",
        blocking: true,
      });
    }
    expect(createDispatchOfferRow).not.toHaveBeenCalled();
  });

  it("force assignment overrides over-8h enforcement and surfaces an override code", async () => {
    process.env.MAX_CLEANER_DAILY_WORKLOAD_ENFORCE_ADMIN = "true";

    const res = await performAdminAssignToCleaner(
      buildAdminMock([{ id: "existing", cleaner_id: CLEANER_ID, date: DATE, duration_minutes: 300 }]),
      { bookingId: BOOKING_ID, cleanerId: CLEANER_ID, force: true },
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.workloadWarning?.code).toBe("daily_workload_over_limit");
      expect(res.workloadOverrideCode).toBe("admin_daily_workload_over_limit_force_override");
      expect(res.workloadOverrideReason).toMatch(/force override/i);
      expect(res.warnings?.[0]).toMatchObject({
        code: "admin.assignment.daily_workload_over_limit_requires_confirmation",
        domain: "assignment",
        severity: "high",
        action: "requires_confirmation",
        blocking: true,
      });
    }
    expect(getEligibleCleaners).not.toHaveBeenCalled();
    expect(createDispatchOfferRow).toHaveBeenCalled();
  });

  it("near limit but at or below 8h remains assignable", async () => {
    process.env.MAX_CLEANER_DAILY_WORKLOAD_ENFORCE_ADMIN = "true";

    const res = await performAdminAssignToCleaner(
      buildAdminMock([{ id: "existing", cleaner_id: CLEANER_ID, date: DATE, duration_minutes: 240 }]),
      { bookingId: BOOKING_ID, cleanerId: CLEANER_ID, force: false },
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.workloadWarning?.code).toBe("daily_workload_near_limit");
      expect(res.warnings?.[0]).toMatchObject({
        code: "admin.assignment.daily_workload_near_limit",
        domain: "assignment",
        severity: "medium",
        action: "diagnostic_only",
        blocking: false,
      });
    }
  });

  it("missing existing duration uses fallback and returns a warning without blocking", async () => {
    process.env.MAX_CLEANER_DAILY_WORKLOAD_ENFORCE_ADMIN = "true";

    const res = await performAdminAssignToCleaner(
      buildAdminMock([{ id: "missing-duration", cleaner_id: CLEANER_ID, date: DATE, duration_minutes: null }]),
      { bookingId: BOOKING_ID, cleanerId: CLEANER_ID, force: false },
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.workloadWarning).toEqual(
        expect.objectContaining({
          code: "duration_fallback_used",
          fallbackBookingIds: ["missing-duration"],
        }),
      );
      expect(res.warnings?.[0]).toMatchObject({
        code: "admin.assignment.duration_fallback_used",
        domain: "assignment",
        severity: "medium",
        action: "diagnostic_only",
        blocking: false,
      });
    }
  });

  it("team jobs remain separated and do not trigger solo admin enforcement", async () => {
    process.env.MAX_CLEANER_DAILY_WORKLOAD_ENFORCE_ADMIN = "true";

    const res = await performAdminAssignToCleaner(
      buildAdminMock([
        {
          id: "team-existing",
          cleaner_id: CLEANER_ID,
          payout_owner_cleaner_id: CLEANER_ID,
          team_id: "team-1",
          is_team_job: true,
          date: DATE,
          duration_minutes: 360,
        },
      ]),
      { bookingId: BOOKING_ID, cleanerId: CLEANER_ID, force: false },
    );

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.workloadWarning).toBeNull();
  });
});
