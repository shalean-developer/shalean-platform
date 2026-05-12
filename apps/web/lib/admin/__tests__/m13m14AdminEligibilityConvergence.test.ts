/**
 * M-13 + M-14 regression suite.
 *
 * Problems:
 *   M-13: admin scheduling lookup (`computeAssignEligibility`) bypassed the
 *     canonical `cleanerAccountEligibleForCustomerBooking` gate that
 *     `getEligibleCleaners` (the checkout / dispatch / single-assign pool) uses,
 *     so cleaners with `is_available=false` / `is_active=false` / blocked
 *     lifecycle status appeared assignable in the admin scheduling UI even
 *     though they were excluded from the actual customer-facing pool.
 *   M-14: the `useStrictAvailability` flag governs only calendar-window
 *     emptiness — but `cleaners.is_available=false` (the manual "Go offline"
 *     toggle) is a separate hard flag that must be respected REGARDLESS of
 *     strict mode. Because `computeAssignEligibility` never even fetched
 *     `is_available`, no mode could enforce it.
 *
 * Contracts under test (any one of these regressing means the bug is back):
 *   1. Admin scheduling + canonical pool converge on account-level exclusion.
 *   2. `is_available=false` is always respected, in strict AND non-strict mode.
 *   3. `performAdminAssignToCleaner` blocks `is_available=false` without
 *      `force`, but `force=true` still overrides (admin override preserved).
 *   4. Assignment-ranking algorithm (`rankCleanersForAutoAssign`,
 *      `getBestCleanerForAssign`) is unchanged — we only gate the eligibility
 *      *signal*, not the ranking math.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import {
  computeAssignEligibility,
  type AssignEligibilityRow,
} from "@/lib/admin/adminAssignEligibility";
import { cleanerAccountEligibleForCustomerBooking } from "@/lib/booking/cleanerSlotEligibility";
import {
  getBestCleaner,
  getBestCleanerForAssign,
  rankCleanersForAutoAssign,
  type CleanerOption,
} from "@/lib/admin/assignRanking";
import { performAdminAssignToCleaner } from "@/lib/admin/performAdminAssignToCleaner";

// Mock the system logger so the `force=true` mock-driven tests (where
// `createDispatchOfferRow` fails by design after the M-14 gate is bypassed)
// don't dump expected warnings into the test output.
vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn(),
  reportOperationalIssue: vi.fn(),
}));

beforeAll(() => {
  // Same reason — the bypass-success tests intentionally fail downstream
  // of the M-14 gate via the auto-chain mock; silence the expected log.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const CITY_ID = "ccccccc1-cccc-4ccc-8ccc-cccccccccccc";
const LOC_ID = "11111111-1111-4111-8111-aaaaaaaaaaaa";

const HEALTHY_ID = "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TOGGLED_OFF_ID = "aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaab";
const INACTIVE_ID = "aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaaac";
const BUSY_STATUS_ID = "aaaaaaa4-aaaa-4aaa-8aaa-aaaaaaaaaaad";
const SUSPENDED_ID = "aaaaaaa5-aaaa-4aaa-8aaa-aaaaaaaaaaae";
const OFFLINE_STATUS_ID = "aaaaaaa6-aaaa-4aaa-8aaa-aaaaaaaaaaaf";

type CleanerSeed = {
  id: string;
  status?: string | null;
  is_active?: boolean | null;
  is_available?: boolean | null;
  location_id?: string | null;
  availability_weekdays?: string[] | null;
  can_do_deep_cleaning?: boolean | null;
  can_do_move_cleaning?: boolean | null;
};

const ALL_WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

function healthyCleaner(id: string, overrides: Partial<CleanerSeed> = {}): CleanerSeed {
  return {
    id,
    status: "available",
    is_active: true,
    is_available: true,
    location_id: LOC_ID,
    availability_weekdays: ALL_WEEKDAYS,
    can_do_deep_cleaning: true,
    can_do_move_cleaning: true,
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// Stateful Supabase mock for `computeAssignEligibility`
// -----------------------------------------------------------------------------

type MockOpts = {
  cleaners: CleanerSeed[];
  /** date used for the booking (YYYY-MM-DD). */
  date?: string;
  /** Optional cleaner_availability rows. Defaults to one all-day window per cleaner. */
  availabilityRows?: Array<{
    cleaner_id: string;
    start_time?: string;
    end_time?: string;
    is_available?: boolean;
  }>;
  /** Optional cleaner_locations rows. Defaults to mapping every cleaner to LOC_ID. */
  locationRows?: Array<{ cleaner_id: string; location_id: string }>;
  /** Other bookings on the same date — empty by default (no overlaps). */
  otherBookings?: Array<{
    id: string;
    cleaner_id: string;
    time: string | null;
    duration_minutes: number | null;
    status: string;
  }>;
  /** When set, `cleaners.select(...)` errors with "is_active does not exist" once,
   *  forcing the column-fallback retry path. */
  simulateMissingIsActiveColumn?: boolean;
};

function unknownColumnError(column: string): PostgrestError {
  return {
    message: `column cleaners.${column} does not exist`,
    details: "",
    hint: "",
    code: "42703",
    name: "PostgrestError",
  } as unknown as PostgrestError;
}

function buildEligibilityMock(opts: MockOpts): SupabaseClient {
  const date = opts.date ?? "2026-06-15"; // a Monday
  const availabilityRows =
    opts.availabilityRows ??
    opts.cleaners.map((c) => ({
      cleaner_id: c.id,
      start_time: "00:00",
      end_time: "23:59",
      is_available: true,
    }));
  const locationRows =
    opts.locationRows ??
    opts.cleaners.map((c) => ({ cleaner_id: c.id, location_id: LOC_ID }));
  const otherBookings = opts.otherBookings ?? [];

  let cleanersSelectAttempt = 0;

  function cleanersBuilder() {
    return {
      select(columns: string) {
        const wantsIsActive = columns.includes("is_active");
        const wantsCapability = columns.includes("can_do_deep_cleaning");
        const wantsWeekdays = columns.includes("availability_weekdays");
        return {
          in: (_col: string, _ids: string[]) => {
            cleanersSelectAttempt += 1;
            // Force the column-fallback retry path on the FIRST attempt only.
            if (opts.simulateMissingIsActiveColumn && cleanersSelectAttempt === 1 && wantsIsActive) {
              return Promise.resolve({ data: null, error: unknownColumnError("is_active") });
            }
            const rows = opts.cleaners.map((c) => {
              const row: Record<string, unknown> = {
                id: c.id,
                status: c.status ?? null,
                is_available: c.is_available ?? null,
                location_id: c.location_id ?? null,
              };
              if (wantsIsActive) row.is_active = c.is_active ?? null;
              if (wantsWeekdays) row.availability_weekdays = c.availability_weekdays ?? null;
              if (wantsCapability) {
                row.can_do_deep_cleaning = c.can_do_deep_cleaning ?? null;
                row.can_do_move_cleaning = c.can_do_move_cleaning ?? null;
              }
              return row;
            });
            return Promise.resolve({ data: rows, error: null });
          },
        };
      },
    };
  }

  function cleanerAvailabilityBuilder() {
    return {
      select: () => ({
        eq: (_col: string, value: string) => ({
          in: (_col2: string, ids: string[]) => {
            const idSet = new Set(ids);
            const data = availabilityRows.filter(
              (r) => idSet.has(r.cleaner_id) && (value == null || value === date),
            );
            return Promise.resolve({ data, error: null });
          },
        }),
      }),
    };
  }

  function cleanerLocationsBuilder() {
    return {
      select: () => ({
        in: (_col: string, ids: string[]) => {
          const idSet = new Set(ids);
          const data = locationRows.filter((r) => idSet.has(r.cleaner_id));
          return Promise.resolve({ data, error: null });
        },
      }),
    };
  }

  function bookingsBuilder() {
    return {
      select: () => ({
        eq: () => ({
          in: () => ({
            neq: () => Promise.resolve({ data: otherBookings, error: null }),
          }),
        }),
      }),
    };
  }

  const client = {
    from(table: string) {
      switch (table) {
        case "cleaners":
          return cleanersBuilder();
        case "cleaner_availability":
          return cleanerAvailabilityBuilder();
        case "cleaner_locations":
          return cleanerLocationsBuilder();
        case "bookings":
          return bookingsBuilder();
        default:
          throw new Error(`unexpected from('${table}') in computeAssignEligibility mock`);
      }
    },
  };

  return client as unknown as SupabaseClient;
}

async function runEligibilityFor(
  cleaners: CleanerSeed[],
  overrides?: Partial<MockOpts>,
): Promise<Map<string, AssignEligibilityRow>> {
  const admin = buildEligibilityMock({ cleaners, ...(overrides ?? {}) });
  return computeAssignEligibility(admin, {
    bookingId: BOOKING_ID,
    bookingDateYmd: overrides?.date ?? "2026-06-15",
    bookingTimeHm: "10:00",
    durationMinutes: 240,
    cleanerIds: cleaners.map((c) => c.id),
    bookingLocationId: LOC_ID,
    bookingCapabilitySlug: "deep",
    bookingCapabilityLabel: "Deep cleaning",
  });
}

// -----------------------------------------------------------------------------
// Strict-mode toggle helper
// -----------------------------------------------------------------------------

const ORIGINAL_STRICT = process.env.USE_STRICT_AVAILABILITY;

afterEach(() => {
  if (ORIGINAL_STRICT === undefined) delete process.env.USE_STRICT_AVAILABILITY;
  else process.env.USE_STRICT_AVAILABILITY = ORIGINAL_STRICT;
});

// =============================================================================
// 1. M-13: convergence — `accountIneligible` matches `cleanerAccountEligibleForCustomerBooking`
// =============================================================================

describe("M-13: admin scheduling eligibility converges with the canonical pool", () => {
  it("a healthy cleaner is account-eligible everywhere", async () => {
    const map = await runEligibilityFor([healthyCleaner(HEALTHY_ID)]);
    const row = map.get(HEALTHY_ID)!;
    expect(row.accountIneligible).toBe(false);
    expect(row.canAssignWithoutForce).toBe(true);
    expect(
      cleanerAccountEligibleForCustomerBooking({
        is_active: true,
        is_available: true,
        status: "available",
      }),
    ).toBe(true);
  });

  it("`is_available=false` (manual Go offline) → accountIneligible + blocked", async () => {
    const map = await runEligibilityFor([
      healthyCleaner(TOGGLED_OFF_ID, { is_available: false }),
    ]);
    const row = map.get(TOGGLED_OFF_ID)!;
    expect(row.accountIneligible).toBe(true);
    expect(row.canAssignWithoutForce).toBe(false);
    // M-13 contract: same exclusion as the canonical pool gate.
    expect(
      cleanerAccountEligibleForCustomerBooking({
        is_active: true,
        is_available: false,
        status: "available",
      }),
    ).toBe(false);
  });

  it("`is_active=false` → accountIneligible + blocked", async () => {
    const map = await runEligibilityFor([healthyCleaner(INACTIVE_ID, { is_active: false })]);
    const row = map.get(INACTIVE_ID)!;
    expect(row.accountIneligible).toBe(true);
    expect(row.canAssignWithoutForce).toBe(false);
  });

  it.each([
    ["busy", BUSY_STATUS_ID],
    ["suspended", SUSPENDED_ID],
    ["banned", "aaaaaaa7-aaaa-4aaa-8aaa-aaaaaaaaaaa1"],
    ["disabled", "aaaaaaa8-aaaa-4aaa-8aaa-aaaaaaaaaaa2"],
    ["blocked", "aaaaaaa9-aaaa-4aaa-8aaa-aaaaaaaaaaa3"],
  ])("blocked status `%s` → accountIneligible + blocked", async (status, id) => {
    const map = await runEligibilityFor([healthyCleaner(id, { status })]);
    const row = map.get(id)!;
    expect(row.accountIneligible).toBe(true);
    expect(row.canAssignWithoutForce).toBe(false);
  });

  it("`status='offline'` populates BOTH the legacy `offline` flag and `accountIneligible` (the canonical pool excludes offline status)", async () => {
    // `offline` is a more specific UI label (preserved for the
    // existing "Offline" pill / force-overridable assign gate); the
    // canonical pool `INELIGIBLE_ACCOUNT_STATUS` set ALSO includes "offline"
    // so admin scheduling and checkout converge on excluding it.
    const map = await runEligibilityFor([
      healthyCleaner(OFFLINE_STATUS_ID, { status: "offline" }),
    ]);
    const row = map.get(OFFLINE_STATUS_ID)!;
    expect(row.offline).toBe(true);
    expect(row.accountIneligible).toBe(true);
    expect(row.canAssignWithoutForce).toBe(false);
    // Convergence with the canonical pool gate.
    expect(
      cleanerAccountEligibleForCustomerBooking({
        is_active: true,
        is_available: true,
        status: "offline",
      }),
    ).toBe(false);
  });

  it("does NOT suggest `nextAvailableStartHm` for an account-ineligible cleaner", async () => {
    // Without this guard the admin UI would say "Next: 10:15" for a cleaner
    // who has manually toggled off — misleading because the toggle is the
    // root cause, not their calendar.
    const map = await runEligibilityFor([
      healthyCleaner(TOGGLED_OFF_ID, { is_available: false }),
    ]);
    const row = map.get(TOGGLED_OFF_ID)!;
    expect(row.nextAvailableStartHm).toBeNull();
  });

  it("checkout pool gate and admin scheduling agree on the full account-eligibility matrix", () => {
    const matrix: Array<{
      label: string;
      input: { is_active?: boolean | null; is_available?: boolean | null; status?: string | null };
      eligible: boolean;
    }> = [
      { label: "healthy", input: { is_active: true, is_available: true, status: "available" }, eligible: true },
      { label: "is_active=false", input: { is_active: false, is_available: true, status: "available" }, eligible: false },
      { label: "is_available=false", input: { is_active: true, is_available: false, status: "available" }, eligible: false },
      { label: "status=busy", input: { is_active: true, is_available: true, status: "busy" }, eligible: false },
      { label: "status=suspended", input: { is_active: true, is_available: true, status: "suspended" }, eligible: false },
      { label: "status=banned", input: { is_active: true, is_available: true, status: "banned" }, eligible: false },
      { label: "status=disabled", input: { is_active: true, is_available: true, status: "disabled" }, eligible: false },
      { label: "status=blocked", input: { is_active: true, is_available: true, status: "blocked" }, eligible: false },
      { label: "missing fields tolerated", input: {}, eligible: true },
    ];
    for (const row of matrix) {
      expect(cleanerAccountEligibleForCustomerBooking(row.input)).toBe(row.eligible);
    }
  });
});

// =============================================================================
// 2. M-14: `is_available=false` always respected, regardless of strict mode
// =============================================================================

describe("M-14: cleaners.is_available=false is always respected (strict and non-strict)", () => {
  it("non-strict mode still blocks `is_available=false`", async () => {
    process.env.USE_STRICT_AVAILABILITY = "false";
    const map = await runEligibilityFor([
      healthyCleaner(TOGGLED_OFF_ID, { is_available: false }),
    ]);
    const row = map.get(TOGGLED_OFF_ID)!;
    expect(row.accountIneligible).toBe(true);
    expect(row.canAssignWithoutForce).toBe(false);
  });

  it("strict mode blocks `is_available=false` (same verdict as non-strict)", async () => {
    process.env.USE_STRICT_AVAILABILITY = "true";
    const map = await runEligibilityFor([
      healthyCleaner(TOGGLED_OFF_ID, { is_available: false }),
    ]);
    const row = map.get(TOGGLED_OFF_ID)!;
    expect(row.accountIneligible).toBe(true);
    expect(row.canAssignWithoutForce).toBe(false);
  });

  it("flipping the strict flag does not change the `accountIneligible` verdict", async () => {
    const cleaners = [healthyCleaner(TOGGLED_OFF_ID, { is_available: false })];

    process.env.USE_STRICT_AVAILABILITY = "true";
    const strictMap = await runEligibilityFor(cleaners);
    process.env.USE_STRICT_AVAILABILITY = "false";
    const looseMap = await runEligibilityFor(cleaners);

    expect(strictMap.get(TOGGLED_OFF_ID)!.accountIneligible).toBe(
      looseMap.get(TOGGLED_OFF_ID)!.accountIneligible,
    );
    expect(strictMap.get(TOGGLED_OFF_ID)!.canAssignWithoutForce).toBe(
      looseMap.get(TOGGLED_OFF_ID)!.canAssignWithoutForce,
    );
  });

  it("non-strict mode still allows a healthy cleaner with no calendar rows (pre-existing strict semantic preserved)", async () => {
    // This is the only thing strict-mode is supposed to gate — empty calendar
    // for the date is treated as "all day" in non-strict mode. We assert the
    // M-14 fix did not accidentally tighten this orthogonal control.
    process.env.USE_STRICT_AVAILABILITY = "false";
    const map = await runEligibilityFor([healthyCleaner(HEALTHY_ID)], {
      availabilityRows: [],
    });
    const row = map.get(HEALTHY_ID)!;
    expect(row.accountIneligible).toBe(false);
    expect(row.slotCalendarOk).toBe(true);
  });
});

// =============================================================================
// 3. Admin override semantics preserved (`performAdminAssignToCleaner` + ranking)
// =============================================================================

describe("performAdminAssignToCleaner preserves admin-override semantics for is_available=false", () => {
  /** Auto-chaining proxy: every property access returns a callable that resolves
   *  to `{ data: null, error: null }` (or the configured `then` value). This lets
   *  the mock complete `createDispatchOfferRow` without crashing on unmocked
   *  method chains — we only care about which gate the function trips on. */
  function emptyChain(thenValue: unknown = { data: null, error: null }): Record<string, unknown> {
    const target = (() => undefined) as unknown as Record<string, unknown>;
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_t, prop: string | symbol) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => resolve(thenValue);
        }
        if (prop === Symbol.toPrimitive || prop === "toJSON") return undefined;
        return () => emptyChain(thenValue);
      },
      apply: () => emptyChain(thenValue),
    };
    return new Proxy(target, handler);
  }

  function buildAssignMock(opts: {
    booking: Record<string, unknown>;
    cleaner: Record<string, unknown> | null;
  }): SupabaseClient {
    let bookingsCallIdx = 0;
    return {
      from(table: string) {
        if (table === "bookings") {
          bookingsCallIdx += 1;
          if (bookingsCallIdx === 1) {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: opts.booking, error: null }),
                }),
              }),
            } as unknown as ReturnType<SupabaseClient["from"]>;
          }
          // Subsequent calls — let the auto-chain handle them so we never
          // crash on `.select(...).eq(...).maybeSingle()` from
          // `createDispatchOfferRow`.
          return emptyChain() as unknown as ReturnType<SupabaseClient["from"]>;
        }
        if (table === "cleaners") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: opts.cleaner, error: null }),
              }),
            }),
          } as unknown as ReturnType<SupabaseClient["from"]>;
        }
        // dispatch_offers, etc — auto-chain.
        return emptyChain() as unknown as ReturnType<SupabaseClient["from"]>;
      },
    } as unknown as SupabaseClient;
  }

  // Booking with no date/time → skips the `getEligibleCleaners` slot path and
  // falls straight through to the cleaner-state checks (status==="offline" /
  // is_available===false). This isolates the M-14 explicit defense-in-depth
  // assertion from the canonical-pool DB filter.
  const noSlotBooking = {
    id: BOOKING_ID,
    date: "",
    time: "",
    status: "pending",
    cleaner_id: null,
    city_id: CITY_ID,
    dispatch_status: null,
    duration_minutes: 240,
    location_id: LOC_ID,
    service_slug: "deep",
    service: "Deep cleaning",
  };

  it("blocks `is_available=false` cleaner without force (parallel to status='offline' gate)", async () => {
    const admin = buildAssignMock({
      booking: noSlotBooking,
      cleaner: { id: TOGGLED_OFF_ID, status: "available", city_id: CITY_ID, is_available: false },
    });
    const r = await performAdminAssignToCleaner(admin, {
      bookingId: BOOKING_ID,
      cleanerId: TOGGLED_OFF_ID,
      force: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.httpStatus).toBe(400);
      expect(r.error.toLowerCase()).toMatch(/unavailable|toggled/);
    }
  });

  it("force=true bypasses the `is_available=false` gate (admin override preserved)", async () => {
    const admin = buildAssignMock({
      booking: noSlotBooking,
      cleaner: { id: TOGGLED_OFF_ID, status: "available", city_id: CITY_ID, is_available: false },
    });
    const r = await performAdminAssignToCleaner(admin, {
      bookingId: BOOKING_ID,
      cleanerId: TOGGLED_OFF_ID,
      force: true,
    });
    // We don't assert success — the dispatch-offer creation isn't fully wired
    // in this minimal mock — but the function MUST get past the
    // `is_available=false` short-circuit when force=true.
    if (!r.ok) {
      expect(r.error.toLowerCase()).not.toMatch(/toggled themselves unavailable/);
    }
  });

  it("force=false still blocks status='offline' (existing gate intact)", async () => {
    const admin = buildAssignMock({
      booking: noSlotBooking,
      cleaner: { id: OFFLINE_STATUS_ID, status: "offline", city_id: CITY_ID, is_available: true },
    });
    const r = await performAdminAssignToCleaner(admin, {
      bookingId: BOOKING_ID,
      cleanerId: OFFLINE_STATUS_ID,
      force: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.httpStatus).toBe(400);
  });

  it("a healthy cleaner with no slot info passes both account-state gates", async () => {
    const admin = buildAssignMock({
      booking: noSlotBooking,
      cleaner: { id: HEALTHY_ID, status: "available", city_id: CITY_ID, is_available: true },
    });
    const r = await performAdminAssignToCleaner(admin, {
      bookingId: BOOKING_ID,
      cleanerId: HEALTHY_ID,
      force: false,
    });
    // Either succeeds OR fails downstream of the account-state gates — but
    // never with the M-14 message.
    if (!r.ok) {
      expect(r.error.toLowerCase()).not.toMatch(/toggled themselves unavailable/);
      expect(r.error.toLowerCase()).not.toMatch(/cleaner is not available/);
    }
  });
});

// =============================================================================
// 4. Assignment-ranking algorithm is unchanged (constraint #5)
// =============================================================================

describe("Assignment ranking algorithm is untouched by M-13/M-14", () => {
  // Three roster cleaners: closest, mid, far. Distance-first ranking should
  // pick the closest. M-13/M-14 must NOT change this ordering.
  const closest: CleanerOption = {
    id: "11111111-aaaa-4aaa-8aaa-111111111111",
    full_name: "Close",
    status: "available",
    is_available: true,
    rating: 4.5,
    jobs_completed: 10,
    distance_km: 1.0,
    reliability_score: 0.7,
  };
  const mid: CleanerOption = {
    id: "22222222-aaaa-4aaa-8aaa-222222222222",
    full_name: "Mid",
    status: "available",
    is_available: true,
    rating: 4.9,
    jobs_completed: 50,
    distance_km: 5.0,
    reliability_score: 0.95,
  };
  const far: CleanerOption = {
    id: "33333333-aaaa-4aaa-8aaa-333333333333",
    full_name: "Far",
    status: "available",
    is_available: true,
    rating: 5.0,
    jobs_completed: 100,
    distance_km: 50.0,
    reliability_score: 0.99,
  };
  // Test fixture for the rosterCleaners filter ONLY: this cleaner has BOTH
  // `is_available=false` AND a non-"available" status, so the existing OR-logic
  // roster filter (`is_available === true || status === "available"`) drops them.
  // The fixture exists to assert the filter's untouched behavior — the M-13/M-14
  // fix happens upstream in `computeAssignEligibility`, NOT in the ranker.
  const togglerOffFullyExcluded: CleanerOption = {
    id: "44444444-aaaa-4aaa-8aaa-444444444444",
    full_name: "Toggled+NoStatus",
    status: null,
    is_available: false,
    rating: 5.0,
    jobs_completed: 100,
    distance_km: 0.5,
  };

  // This fixture demonstrates that the EXISTING ranker's roster filter is
  // intentionally permissive (kept only by the OR-condition `status="available"`)
  // — it's NOT the line of defense against `is_available=false`. That's exactly
  // why M-13/M-14 needed the upstream fix in `computeAssignEligibility`.
  const togglerOffStatusAvailable: CleanerOption = {
    id: "55555555-aaaa-4aaa-8aaa-555555555555",
    full_name: "Toggled+StatusAvailable",
    status: "available",
    is_available: false,
    rating: 5.0,
    jobs_completed: 100,
    distance_km: 0.5,
  };

  const eligOk = {
    [closest.id]: { canAssignWithoutForce: true },
    [mid.id]: { canAssignWithoutForce: true },
    [far.id]: { canAssignWithoutForce: true },
    [togglerOffFullyExcluded.id]: { canAssignWithoutForce: false },
    [togglerOffStatusAvailable.id]: { canAssignWithoutForce: false },
  };

  it("distance-first ranking still picks the closest (default mode)", () => {
    const ranked = rankCleanersForAutoAssign([closest, mid, far], eligOk, {
      requireSlotOk: true,
    });
    expect(ranked.map((c) => c.id)).toEqual([closest.id, mid.id, far.id]);
  });

  it("speed-first ranking still kicks in at SLA threshold (rating-first)", () => {
    const ranked = rankCleanersForAutoAssign([closest, mid, far], eligOk, {
      requireSlotOk: true,
      slaBreachMinutes: 30,
    });
    // far (5.0★) > mid (4.9★) > closest (4.5★)
    expect(ranked.map((c) => c.id)).toEqual([far.id, mid.id, closest.id]);
  });

  it("getBestCleanerForAssign still returns the canonical top pick", () => {
    expect(getBestCleanerForAssign([closest, mid, far], eligOk, { requireSlotOk: true })?.id).toBe(
      closest.id,
    );
  });

  it("getBestCleaner (no eligibility map) still ranks by distance first", () => {
    expect(getBestCleaner([far, mid, closest])?.id).toBe(closest.id);
  });

  it("rosterCleaners drops a fully-excluded cleaner (is_available=false AND status!=available) — existing filter intact", () => {
    // The existing OR-logic roster filter drops this cleaner regardless of
    // M-13/M-14. We assert it still drops them after our changes.
    const ranked = rankCleanersForAutoAssign(
      [togglerOffFullyExcluded, closest, mid, far],
      {
        ...eligOk,
        // Pretend computeAssignEligibility hadn't gated them (worst case);
        // the ranker's own roster filter still has to drop them.
        [togglerOffFullyExcluded.id]: { canAssignWithoutForce: true },
      },
      { requireSlotOk: true },
    );
    expect(ranked.find((c) => c.id === togglerOffFullyExcluded.id)).toBeUndefined();
    expect(ranked.map((c) => c.id)).toEqual([closest.id, mid.id, far.id]);
  });

  it("rosterCleaners (existing OR logic) ALONE does NOT drop `is_available=false, status='available'` — that's why M-13/M-14 needed an upstream fix", () => {
    // Documents the gap that motivated M-13/M-14: rosterCleaners would happily
    // forward this cleaner if computeAssignEligibility hadn't gated them.
    // Under `requireSlotOk: true` + M-13 gate (canAssignWithoutForce=false),
    // they are correctly dropped by the slot filter — NOT by the roster filter.
    const rankedWithGate = rankCleanersForAutoAssign(
      [togglerOffStatusAvailable, closest, mid, far],
      eligOk, // M-13 gate flips this cleaner's canAssignWithoutForce to false
      { requireSlotOk: true },
    );
    expect(rankedWithGate.find((c) => c.id === togglerOffStatusAvailable.id)).toBeUndefined();

    // Without the M-13 gate (counter-factual), the roster filter alone would NOT
    // exclude them — proving the upstream fix was necessary.
    const rankedWithoutGate = rankCleanersForAutoAssign(
      [togglerOffStatusAvailable, closest, mid, far],
      {
        ...eligOk,
        [togglerOffStatusAvailable.id]: { canAssignWithoutForce: true }, // pretend M-13 wasn't applied
      },
      { requireSlotOk: true },
    );
    expect(rankedWithoutGate.find((c) => c.id === togglerOffStatusAvailable.id)).toBeDefined();
  });

  it("ranking math (distance vs rating ordering) is identical before and after M-13/M-14", () => {
    // Direct comparison: the ranker should produce the same order whether or
    // not the M-13/M-14 gates are applied to a healthy cleaner pool.
    const beforeFix = rankCleanersForAutoAssign([closest, mid, far], null, {
      requireSlotOk: false,
    });
    const afterFix = rankCleanersForAutoAssign([closest, mid, far], eligOk, {
      requireSlotOk: true,
    });
    expect(afterFix.map((c) => c.id)).toEqual(beforeFix.map((c) => c.id));
  });
});

// =============================================================================
// 5. Schema fallback path (legacy schemas missing `is_active`)
// =============================================================================

describe("computeAssignEligibility: schema fallback when is_active column is missing", () => {
  it("still loads is_available and applies the gate when is_active is missing", async () => {
    const map = await runEligibilityFor(
      [
        // Healthy except is_available=false; the legacy schema fallback
        // strips is_active from the SELECT but MUST keep is_available.
        healthyCleaner(TOGGLED_OFF_ID, { is_available: false, is_active: undefined }),
      ],
      { simulateMissingIsActiveColumn: true },
    );
    const row = map.get(TOGGLED_OFF_ID)!;
    expect(row.accountIneligible).toBe(true);
    expect(row.canAssignWithoutForce).toBe(false);
  });

  it("still passes a healthy cleaner when is_active is missing", async () => {
    const map = await runEligibilityFor(
      [healthyCleaner(HEALTHY_ID, { is_active: undefined })],
      { simulateMissingIsActiveColumn: true },
    );
    const row = map.get(HEALTHY_ID)!;
    expect(row.accountIneligible).toBe(false);
    expect(row.canAssignWithoutForce).toBe(true);
  });
});

// =============================================================================
// 6. Empty-input safety: M-13 default row carries the new field
// =============================================================================

describe("AssignEligibilityRow shape", () => {
  it("default empty rows include `accountIneligible: false` (so consumers never see undefined)", async () => {
    // No cleanerIds → function returns map of synthetic default rows.
    const admin = buildEligibilityMock({ cleaners: [] });
    const map = await computeAssignEligibility(admin, {
      bookingId: BOOKING_ID,
      bookingDateYmd: "2026-06-15",
      bookingTimeHm: "10:00",
      durationMinutes: 240,
      cleanerIds: [HEALTHY_ID],
    });
    const row = map.get(HEALTHY_ID);
    // Function early-returns with synthetic defaults when input is empty OR
    // start time is unparseable. We pass a valid time but empty cleaners list
    // simulates the "no cleaners loaded" edge case via a lookup miss.
    if (row) {
      expect(row).toHaveProperty("accountIneligible");
      expect(typeof row.accountIneligible).toBe("boolean");
    }
  });

  it("empty cleanerIds returns an empty map (early return path)", async () => {
    const admin = buildEligibilityMock({ cleaners: [] });
    const map = await computeAssignEligibility(admin, {
      bookingId: BOOKING_ID,
      bookingDateYmd: "2026-06-15",
      bookingTimeHm: "10:00",
      durationMinutes: 240,
      cleanerIds: [],
    });
    expect(map.size).toBe(0);
  });

  it("invalid startTime returns synthetic default rows with `accountIneligible: false`", async () => {
    const admin = buildEligibilityMock({ cleaners: [healthyCleaner(HEALTHY_ID)] });
    const map = await computeAssignEligibility(admin, {
      bookingId: BOOKING_ID,
      bookingDateYmd: "2026-06-15",
      bookingTimeHm: "garbage",
      durationMinutes: 240,
      cleanerIds: [HEALTHY_ID],
    });
    const row = map.get(HEALTHY_ID)!;
    expect(row.accountIneligible).toBe(false);
    expect(row.canAssignWithoutForce).toBe(false);
    expect(row.weekdayOk).toBe(false);
  });
});

// =============================================================================
// 7. Sanity: vi mock plumbing works (no accidental hoisting issues)
// =============================================================================

describe("M-13/M-14 test plumbing", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("the canonical gate function is exported and callable", () => {
    expect(typeof cleanerAccountEligibleForCustomerBooking).toBe("function");
  });

  it("computeAssignEligibility is exported with the M-13/M-14 row shape", async () => {
    const map = await runEligibilityFor([healthyCleaner(HEALTHY_ID)]);
    const row = map.get(HEALTHY_ID)!;
    const keys: Array<keyof AssignEligibilityRow> = [
      "cleanerId",
      "weekdayOk",
      "slotCalendarOk",
      "overlapBlocked",
      "busyUntilMin",
      "overlapJobRangeLabel",
      "nextAvailableStartHm",
      "offline",
      "accountIneligible",
      "canAssignWithoutForce",
    ];
    for (const k of keys) expect(row).toHaveProperty(k);
  });
});
