import { readFileSync } from "node:fs";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/customer/customerBookingsForUser", () => ({
  resolveBookingOwnershipColumn: vi.fn(async () => "customer_id" as const),
}));

import { existingBookingOccupancyWindow } from "@/lib/booking/cleanerSlotEligibility";
import {
  buildBookingDurationMinutesDiagnostics,
  findBookingsMissingDurationMinutes,
  findBookingsWithUnrealisticDurationMinutes,
  findFutureDailyWorkloadPolicyExcess,
  lockedDurationMinutesFromBookingSnapshot,
  selectLockedBookingDurationMinutesForPersistence,
} from "@/lib/booking/durationMinutesIntegrity";
import { insertPendingPaymentBookingRow } from "@/lib/booking/insertPendingPaymentBooking";
import type { LockedBooking } from "@/lib/booking/lockedBooking";

const repoRoot = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function buildLocked(overrides: Partial<LockedBooking> = {}): LockedBooking {
  return {
    locked: true,
    lockedAt: "2026-06-01T08:00:00.000Z",
    lockExpiresAt: "2026-06-01T08:15:00.000Z",
    date: "2026-06-01",
    time: "10:00",
    finalPrice: 950,
    finalHours: 3.5,
    duration: 3.5,
    surge: 1,
    rooms: 2,
    bathrooms: 1,
    extraRooms: 0,
    extras: [],
    location: "Sea Point",
    service: "standard",
    quoteSignature: "sig",
    ...overrides,
  } as LockedBooking;
}

function buildInsertAdmin(): {
  admin: SupabaseClient;
  state: { insertPayload?: Record<string, unknown> };
} {
  const state: { insertPayload?: Record<string, unknown> } = {};
  const admin = {
    from(table: string) {
      if (table === "booking_payment_recovery_jobs") {
        return {
          insert: async () => ({ error: null }),
        };
      }
      if (table !== "bookings") throw new Error(`unexpected table ${table}`);
      return {
        insert(payload: Record<string, unknown>) {
          state.insertPayload = payload;
          return {
            select() {
              return {
                async maybeSingle() {
                  return { data: { id: "00000000-0000-4000-8000-0000000002ea" }, error: null };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { admin, state };
}

describe("Phase 2E-A duration_minutes persistence", () => {
  it("customer pending-payment inserts persist the locked legacy duration", async () => {
    const { admin, state } = buildInsertAdmin();
    const res = await insertPendingPaymentBookingRow(admin, {
      paystackReference: "ref-duration-2ea",
      locked: buildLocked({ finalHours: 3.25, duration: 3.25 }),
      customerEmail: "duration@example.com",
    });

    expect(res.ok).toBe(true);
    expect(state.insertPayload?.duration_minutes).toBe(195);
  });

  it("snapshot helpers preserve checkout/lock duration parity", () => {
    const locked = buildLocked({ finalHours: 4.25, duration: 4.25 });
    expect(selectLockedBookingDurationMinutesForPersistence(locked)).toBe(255);
    expect(lockedDurationMinutesFromBookingSnapshot({ locked })).toBe(255);
  });

  it("returns null occupancy when duration is missing (no silent 120m fallback)", () => {
    expect(existingBookingOccupancyWindow({ id: "old-booking", time: "09:00", duration_minutes: null })).toBeNull();
  });

  it("uses persisted duration when present", () => {
    expect(existingBookingOccupancyWindow({ id: "booking", time: "09:00", duration_minutes: 120 })).toEqual({
      startMin: 540,
      endMin: 660,
    });
  });

  it("reports missing, fallback, mismatch, unrealistic, and future 8h signals without enforcing them", () => {
    expect(
      buildBookingDurationMinutesDiagnostics({
        bookingId: "missing",
        source: "test",
        durationMinutes: null,
        lockedDurationMinutes: 210,
        fallbackUsed: true,
      }).map((d) => d.code),
    ).toEqual(["missing_duration_minutes", "fallback_to_120"]);

    expect(
      buildBookingDurationMinutesDiagnostics({
        bookingId: "mismatch",
        source: "test",
        durationMinutes: 180,
        lockedDurationMinutes: 210,
      }).map((d) => d.code),
    ).toEqual(["duration_mismatch_vs_locked_quote"]);

    expect(
      buildBookingDurationMinutesDiagnostics({
        bookingId: "long",
        source: "test",
        durationMinutes: 721,
      }).map((d) => d.code),
    ).toEqual(["unrealistic_duration_minutes", "future_8h_day_exceeded"]);
  });

  it("exposes read-only reporting helpers for missing, unrealistic, and future 8h/day policy candidates", () => {
    const rows = [
      { id: "a", cleaner_id: "cleaner-1", date: "2026-06-01", duration_minutes: null },
      { id: "b", cleaner_id: "cleaner-1", date: "2026-06-01", duration_minutes: 500 },
      { id: "c", cleaner_id: "cleaner-1", date: "2026-06-01", duration_minutes: 60 },
      { id: "d", cleaner_id: "cleaner-2", date: "2026-06-01", duration_minutes: 721 },
    ];

    expect(findBookingsMissingDurationMinutes(rows).map((r) => r.id)).toEqual(["a"]);
    expect(findBookingsWithUnrealisticDurationMinutes(rows).map((r) => r.id)).toEqual(["d"]);
    expect(findFutureDailyWorkloadPolicyExcess(rows)).toEqual([
      {
        cleanerId: "cleaner-1",
        dateYmd: "2026-06-01",
        bookingIds: ["b", "c"],
        totalDurationMinutes: 560,
        maxPolicyMinutes: 480,
      },
      {
        cleanerId: "cleaner-2",
        dateYmd: "2026-06-01",
        bookingIds: ["d"],
        totalDurationMinutes: 721,
        maxPolicyMinutes: 480,
      },
    ]);
  });
});

describe("Phase 2E-A duration_minutes creation/finalization convergence", () => {
  it("all new-booking creation and finalization paths write the shared locked-duration helper", () => {
    const expected = [
      [
        "lib/booking/insertPendingPaymentBooking.ts",
        ["buildLegacyLockDurationPersistPatch", "duration_minutes", "lockedDurationMinutesFromBookingSnapshot"],
      ],
      [
        "lib/booking/paystackInitializeCore.ts",
        ["selectLockedBookingDurationMinutesForPersistence(locked)", "durationMinutes:"],
      ],
      ["lib/booking/upsertBookingFromPaystack.ts", ["buildLegacyLockDurationPersistPatch", "authoritativeDurationPatchFromBookingRow"]],
      ["lib/recurring/insertRecurringOccurrenceBooking.ts", ["lockedDurationMinutesPatch(locked)"]],
      ["lib/recurring/insertMonthlyRecurringOccurrenceBooking.ts", ["lockedDurationMinutesPatch(locked)"]],
    ] as const;

    for (const [relativePath, snippets] of expected) {
      const source = readRepoFile(relativePath);
      for (const snippet of snippets) {
        expect(source, `${relativePath} should contain ${snippet}`).toContain(snippet);
      }
    }
  });

  it("recurring occurrence generation keeps its intentional quote-signature bypass while persisting duration", () => {
    for (const relativePath of [
      "lib/recurring/insertRecurringOccurrenceBooking.ts",
      "lib/recurring/insertMonthlyRecurringOccurrenceBooking.ts",
    ]) {
      const source = readRepoFile(relativePath);
      expect(source).toContain("quoteSignature: undefined");
      expect(source).toContain("lockedDurationMinutesPatch(locked)");
    }
  });
});
