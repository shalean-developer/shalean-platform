import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { getAvailableCleaners } from "@/lib/booking/availabilityEngine";
import { resolveCheckoutCleanerSelection } from "@/lib/booking/checkoutCleanerEligibility";
import { getEligibleCleaners, type CleanerBase } from "@/lib/booking/getEligibleCleaners";
import type { CleanerPreferenceRowLike } from "@/lib/dispatch/cleanerPreferenceMatch";
import { computeCleanerOfferEarningsSnapshot } from "@/lib/payout/computeCleanerOfferEarningsSnapshot";
import { BOOKING_SERVICE_IDS } from "@/components/booking/serviceCategories";
import type { LockedBooking } from "@/lib/booking/lockedBooking";

function baseLocked(over: Partial<LockedBooking>): LockedBooking {
  return {
    date: DATE,
    time: "10:00",
    finalPrice: 500,
    finalHours: 2,
    surge: 1,
    locked: true,
    lockedAt: new Date().toISOString(),
    service: "standard",
    serviceAreaLocationId: LOC,
    ...over,
  } as LockedBooking;
}

vi.mock("@/lib/booking/availabilityEngine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/booking/availabilityEngine")>();
  return {
    ...actual,
    isCleanerInAvailablePoolForSlot: vi.fn(),
  };
});

import { isCleanerInAvailablePoolForSlot } from "@/lib/booking/availabilityEngine";

const DATE = "2026-06-01";
const LOC = "11111111-1111-4111-8111-aaaaaaaaaaaa";
const STANDARD_CLEANER = "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AIRBNB_ONLY_CLEANER = "bbbbbbb2-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BLANK_PREF_CLEANER = "ccccccc3-cccc-4ccc-8ccc-cccccccccccc";

function cleaner(id: string, name = "Cleaner"): CleanerBase {
  return {
    id,
    full_name: name,
    phone: null,
    email: null,
    rating: 5,
    is_active: true,
    is_available: true,
    jobs_completed: 10,
    review_count: 0,
    location_id: LOC,
    status: "available",
    availability_weekdays: ["monday"],
    can_do_deep_cleaning: true,
    can_do_move_cleaning: true,
  };
}

function slotPreload(cleanerIds: string[]) {
  return {
    preloadedAvailability: cleanerIds.map((cleanerId) => ({
      cleaner_id: cleanerId,
      date: DATE,
      start_time: "00:00",
      end_time: "23:59",
      is_available: true,
    })),
    preloadedCleanerLocations: cleanerIds.map((cleanerId) => ({ cleaner_id: cleanerId, location_id: LOC })),
  };
}

type PrefMap = Map<string, CleanerPreferenceRowLike>;

function adminWithPrefs(
  prefs: PrefMap,
  bookings: Array<Record<string, unknown>> = [],
): SupabaseClient {
  return {
    from(table: string) {
      if (table === "bookings") {
        return {
          select() {
            return {
              in() {
                return {
                  eq() {
                    return Promise.resolve({ data: bookings, error: null });
                  },
                };
              },
            };
          },
        };
      }
      if (table === "cleaner_preferences") {
        return {
          select() {
            return {
              in(_col: string, ids: string[]) {
                const rows = ids
                  .filter((id) => prefs.has(id))
                  .map((id) => ({ cleaner_id: id, ...prefs.get(id)! }));
                return Promise.resolve({ data: rows, error: null });
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
}

async function runStandardEligibility(
  cleanerIds: string[],
  prefs: PrefMap,
  opts: { serviceType?: string | null } = {},
) {
  const preloadedCleaners = cleanerIds.map((id) => cleaner(id));
  return getEligibleCleaners(adminWithPrefs(prefs), {
    date: DATE,
    startTime: "10:00",
    durationMinutes: 120,
    locationId: LOC,
    locationExpandedIds: [LOC],
    serviceType: opts.serviceType ?? "standard",
    preloadedCleaners,
    ...slotPreload(cleanerIds),
    preloadedCleanerPreferences: prefs,
  });
}

describe("Standard Cleaning cleaner preference eligibility convergence", () => {
  it("excludes strict Airbnb-only cleaner from Standard Cleaning pool", async () => {
    const prefs: PrefMap = new Map([
      [
        AIRBNB_ONLY_CLEANER,
        {
          preferred_areas: [],
          preferred_services: ["airbnb"],
          preferred_time_blocks: [],
          is_strict: true,
        },
      ],
      [
        STANDARD_CLEANER,
        {
          preferred_areas: [],
          preferred_services: ["standard"],
          preferred_time_blocks: [],
          is_strict: true,
        },
      ],
    ]);

    const rows = await runStandardEligibility([STANDARD_CLEANER, AIRBNB_ONLY_CLEANER], prefs);
    expect(rows.map((r) => r.id)).toEqual([STANDARD_CLEANER]);
  });

  it("includes Standard-eligible strict cleaner for Standard Cleaning", async () => {
    const prefs: PrefMap = new Map([
      [
        STANDARD_CLEANER,
        {
          preferred_areas: [],
          preferred_services: ["standard"],
          preferred_time_blocks: [],
          is_strict: true,
        },
      ],
    ]);

    const rows = await runStandardEligibility([STANDARD_CLEANER], prefs);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(STANDARD_CLEANER);
  });

  it("blank/null preferred_services stays eligible under strict mode (matches dispatch)", async () => {
    const prefs: PrefMap = new Map([
      [
        BLANK_PREF_CLEANER,
        {
          preferred_areas: [],
          preferred_services: [],
          preferred_time_blocks: [],
          is_strict: true,
        },
      ],
    ]);

    const rows = await runStandardEligibility([BLANK_PREF_CLEANER], prefs);
    expect(rows.map((r) => r.id)).toEqual([BLANK_PREF_CLEANER]);
  });

  it("non-strict Airbnb-only cleaner remains eligible for Standard (matches dispatch scoring-only path)", async () => {
    const prefs: PrefMap = new Map([
      [
        AIRBNB_ONLY_CLEANER,
        {
          preferred_areas: [],
          preferred_services: ["airbnb"],
          preferred_time_blocks: [],
          is_strict: false,
        },
      ],
    ]);

    const rows = await runStandardEligibility([AIRBNB_ONLY_CLEANER], prefs);
    expect(rows.map((r) => r.id)).toEqual([AIRBNB_ONLY_CLEANER]);
  });

  it("excludes strict Standard-only cleaner from Airbnb job pool", async () => {
    const prefs: PrefMap = new Map([
      [
        STANDARD_CLEANER,
        {
          preferred_areas: [],
          preferred_services: ["standard"],
          preferred_time_blocks: [],
          is_strict: true,
        },
      ],
    ]);

    const rows = await runStandardEligibility([STANDARD_CLEANER], prefs, { serviceType: "airbnb" });
    expect(rows).toHaveLength(0);
  });

  it("does not remap Standard service identity to Airbnb", () => {
    expect(BOOKING_SERVICE_IDS).toContain("standard");
    expect(BOOKING_SERVICE_IDS).toContain("airbnb");
    expect(BOOKING_SERVICE_IDS).not.toContain("quick");
  });
});

describe("getAvailableCleaners /api/booking/cleaners pool", () => {
  it("returns Standard-eligible cleaner and excludes strict Airbnb-only for standard service", async () => {
    const prefs: PrefMap = new Map([
      [
        AIRBNB_ONLY_CLEANER,
        {
          preferred_areas: [],
          preferred_services: ["airbnb"],
          preferred_time_blocks: [],
          is_strict: true,
        },
      ],
      [
        STANDARD_CLEANER,
        {
          preferred_areas: [],
          preferred_services: ["standard"],
          preferred_time_blocks: [],
          is_strict: true,
        },
      ],
    ]);

    const admin = {
      from(table: string) {
        if (table === "cleaner_availability") {
          return {
            select() {
              return {
                eq() {
                  return Promise.resolve({
                    data: [
                      {
                        cleaner_id: STANDARD_CLEANER,
                        date: DATE,
                        start_time: "00:00",
                        end_time: "23:59",
                        is_available: true,
                      },
                      {
                        cleaner_id: AIRBNB_ONLY_CLEANER,
                        date: DATE,
                        start_time: "00:00",
                        end_time: "23:59",
                        is_available: true,
                      },
                    ],
                    error: null,
                  });
                },
              };
            },
          };
        }
        if (table === "cleaners") {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return Promise.resolve({
                        data: [cleaner(STANDARD_CLEANER), cleaner(AIRBNB_ONLY_CLEANER, "Airbnb Only")],
                        error: null,
                      });
                    },
                  };
                },
              };
            },
          };
        }
        if (table === "cleaner_locations") {
          return {
            select() {
              return {
                in() {
                  return Promise.resolve({
                    data: [
                      { cleaner_id: STANDARD_CLEANER, location_id: LOC },
                      { cleaner_id: AIRBNB_ONLY_CLEANER, location_id: LOC },
                    ],
                    error: null,
                  });
                },
              };
            },
          };
        }
        if (table === "bookings") {
          return {
            select() {
              return {
                in() {
                  return {
                    eq() {
                      return Promise.resolve({ data: [], error: null });
                    },
                  };
                },
              };
            },
          };
        }
        if (table === "cleaner_preferences") {
          return {
            select() {
              return {
                in(_col: string, ids: string[]) {
                  const rows = ids
                    .filter((id) => prefs.has(id))
                    .map((id) => ({ cleaner_id: id, ...prefs.get(id)! }));
                  return Promise.resolve({ data: rows, error: null });
                },
              };
            },
          };
        }
        if (table === "reviews") {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        order() {
                          return {
                            limit() {
                              return Promise.resolve({ data: [], error: null });
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as unknown as SupabaseClient;

    const rows = await getAvailableCleaners(admin, {
      selectedDate: DATE,
      selectedTime: "10:00",
      durationMinutes: 120,
      locationId: LOC,
      bookingServiceSlug: "standard",
      limit: 5,
    });

    expect(rows.map((r) => r.id)).toEqual([STANDARD_CLEANER]);
  });
});

describe("selected cleaner checkout resolution", () => {
  it("honors Standard-eligible selected cleaner after payment", async () => {
    vi.mocked(isCleanerInAvailablePoolForSlot).mockResolvedValue(true);

    const admin = {
      from(table: string) {
        if (table === "cleaners") {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle() {
                      return Promise.resolve({
                        data: {
                          id: STANDARD_CLEANER,
                          is_active: true,
                          is_available: true,
                          status: "available",
                        },
                        error: null,
                      });
                    },
                  };
                },
              };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as unknown as SupabaseClient;

    const resolution = await resolveCheckoutCleanerSelection(admin, {
      pickedCleanerUuid: STANDARD_CLEANER,
      locked: baseLocked({ service: "standard" }),
    });

    expect(resolution).toEqual({ kind: "honor", cleanerId: STANDARD_CLEANER });
  });

  it("falls back when strict Airbnb-only cleaner was picked for Standard", async () => {
    vi.mocked(isCleanerInAvailablePoolForSlot).mockResolvedValue(false);

    const admin = {
      from(table: string) {
        if (table === "cleaners") {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle() {
                      return Promise.resolve({
                        data: {
                          id: AIRBNB_ONLY_CLEANER,
                          is_active: true,
                          is_available: true,
                          status: "available",
                        },
                        error: null,
                      });
                    },
                  };
                },
              };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as unknown as SupabaseClient;

    const resolution = await resolveCheckoutCleanerSelection(admin, {
      pickedCleanerUuid: AIRBNB_ONLY_CLEANER,
      locked: baseLocked({ service: "standard" }),
    });

    expect(resolution.kind).toBe("fallback");
  });
});

describe("cleaner offer earnings preview for Standard", () => {
  it("remains positive for Standard Cleaning, never R0", () => {
    const r = computeCleanerOfferEarningsSnapshot({
      booking: {
        is_team_job: false,
        service: "Standard Cleaning",
        date: DATE,
        time: "10:00",
        total_paid_zar: 450,
      },
      cleaner: { joined_at: "2024-01-01T00:00:00.000Z" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.amount_cents).toBeGreaterThan(0);
    }
  });
});
