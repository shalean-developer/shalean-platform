import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  fetchOccupyingBookingsForDate,
  OCCUPYING_BOOKINGS_SELECT,
} from "@/lib/booking/getEligibleCleaners";
import { findCleanerSlotOccupancyConflict } from "@/lib/booking/cleanerSlotEligibility";

/**
 * R1.1-001 regression: production `bookings` has no `booking_date` column.
 * Any query that selected or filtered on `bookings.booking_date` failed with
 * `column bookings.booking_date does not exist`; on the slot path the error was
 * swallowed (returned []), silently degrading conflict detection. The authoritative
 * calendar column is `bookings.date` — guard against the fallback ever returning.
 */

type FilterCall = { method: string; args: unknown[] };

const DATE = "2026-06-20";
const CLEANER_ID = "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOOKING_ID = "bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/** Supabase query-builder mock that records the select string and every filter call. */
function buildRecordingAdmin(rows: unknown[]): {
  admin: SupabaseClient;
  getSelect: () => string;
  getCalls: () => FilterCall[];
} {
  let capturedSelect = "";
  const calls: FilterCall[] = [];
  const resolved = Promise.resolve({ data: rows, error: null });

  const chain: Record<string, (...args: unknown[]) => unknown> = {
    in: (...args: unknown[]) => {
      calls.push({ method: "in", args });
      return chain;
    },
    or: (...args: unknown[]) => {
      calls.push({ method: "or", args });
      return chain;
    },
    eq: (...args: unknown[]) => {
      calls.push({ method: "eq", args });
      return Object.assign(Promise.resolve({ data: rows, error: null }), chain);
    },
  };

  const admin = {
    from() {
      return {
        select(sel: string) {
          capturedSelect = sel;
          return chain;
        },
      };
    },
  } as unknown as SupabaseClient;

  void resolved;
  return { admin, getSelect: () => capturedSelect, getCalls: () => calls };
}

const OCCUPYING_ROW = {
  id: BOOKING_ID,
  cleaner_id: CLEANER_ID,
  selected_cleaner_id: CLEANER_ID,
  status: "pending",
  date: DATE,
  time: "10:00",
  duration_minutes: 120,
};

describe("R1.1-001 booking_date fallback removal", () => {
  it("OCCUPYING_BOOKINGS_SELECT does not reference booking_date and keeps date", () => {
    expect(OCCUPYING_BOOKINGS_SELECT).toContain("date");
    expect(OCCUPYING_BOOKINGS_SELECT).not.toContain("booking_date");
  });

  it("fetchOccupyingBookingsForDate filters on date via eq and never on booking_date", async () => {
    const { admin, getSelect, getCalls } = buildRecordingAdmin([OCCUPYING_ROW]);
    const rows = await fetchOccupyingBookingsForDate(admin, DATE);

    expect(rows).toHaveLength(1);
    expect(getSelect()).not.toContain("booking_date");

    const calls = getCalls();
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "date" && c.args[1] === DATE)).toBe(true);
    for (const call of calls) {
      expect(JSON.stringify(call.args)).not.toContain("booking_date");
    }
  });

  it("findCleanerSlotOccupancyConflict filters on date via eq and never on booking_date", async () => {
    const { admin, getSelect, getCalls } = buildRecordingAdmin([OCCUPYING_ROW]);
    const conflictId = await findCleanerSlotOccupancyConflict(admin, {
      cleanerId: CLEANER_ID,
      dateYmd: DATE,
      timeHm: "10:30",
      durationMinutes: 120,
    });

    expect(conflictId).toBe(BOOKING_ID);
    expect(getSelect()).not.toContain("booking_date");

    const calls = getCalls();
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "date" && c.args[1] === DATE)).toBe(true);
    for (const call of calls) {
      expect(JSON.stringify(call.args)).not.toContain("booking_date");
    }
  });

  it("no active booking-path query selects or filters bookings.booking_date", () => {
    const root = process.cwd();
    const activePathFiles = [
      "lib/booking/getEligibleCleaners.ts",
      "lib/booking/cleanerSlotEligibility.ts",
      "lib/booking/runBookingLockValidation.ts",
      "lib/booking/cleanerDailyWorkloadShadow.ts",
      "lib/admin/validateAdminManualAssignToCleaner.ts",
      "lib/admin/adminAssignEligibility.ts",
    ];

    for (const rel of activePathFiles) {
      const src = readFileSync(join(root, rel), "utf8");
      // No PostgREST `.or(...)` filter that references booking_date.
      expect(src, `${rel} still has a booking_date .or() filter`).not.toMatch(/booking_date\.eq\./);
      // No bookings select list that includes the non-existent booking_date column.
      expect(src, `${rel} still selects booking_date`).not.toMatch(/date,\s*booking_date/);
      expect(src, `${rel} still selects booking_date`).not.toMatch(/booking_date,\s*(status|time|duration)/);
    }
  });
});
