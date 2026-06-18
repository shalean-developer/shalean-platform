/**
 * Contract tests for `syncCleanerBusyFromBookings`.
 *
 * Invariants asserted here (mirrored in the JSDoc on the function itself):
 *   1. Manual offline (`status='offline'`) is preserved verbatim. Completing
 *      a job MUST NOT silently bring a cleaner back online.
 *   2. The function NEVER writes `cleaners.is_available`. That field is
 *      reserved for the manual Go online / Go offline toggle.
 *   3. When the derived status equals the current value the function
 *      issues NO UPDATE (no-op), so realtime subscribers don't churn on
 *      `updated_at` changes for non-events.
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { syncCleanerBusyFromBookings, isBookingTerminalForCleanerWorkloadSync } from "@/lib/cleaner/syncCleanerStatus";

type AnyRecord = Record<string, unknown>;

function buildRecordingSupabase(opts: {
  cleanerStatus: string;
  activeBookings: number;
}): { client: SupabaseClient; cleanerUpdates: AnyRecord[] } {
  const cleanerUpdates: AnyRecord[] = [];

  const client: AnyRecord = {
    from: vi.fn((table: string) => {
      if (table === "cleaners") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { status: opts.cleanerStatus }, error: null }),
            }),
          }),
          update: (payload: AnyRecord) => {
            cleanerUpdates.push(payload);
            return {
              eq: async () => ({ data: null, error: null }),
            };
          },
        };
      }
      if (table === "bookings") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                limit: async () => ({
                  data: Array.from({ length: opts.activeBookings }, (_, i) => ({ id: `b-${i}` })),
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {};
    }),
  };

  return { client: client as unknown as SupabaseClient, cleanerUpdates };
}

describe("syncCleanerBusyFromBookings — invariants", () => {
  it("preserves manual offline (returns early, no UPDATE)", async () => {
    const { client, cleanerUpdates } = buildRecordingSupabase({
      cleanerStatus: "offline",
      activeBookings: 0,
    });
    await syncCleanerBusyFromBookings(client, "cleaner-1");
    expect(cleanerUpdates).toHaveLength(0);
  });

  it("preserves manual offline even when an active booking still exists", async () => {
    // Edge case: cleaner toggled offline mid-shift while a job was still
    // assigned. We must not flip them to busy and then back online ourselves.
    const { client, cleanerUpdates } = buildRecordingSupabase({
      cleanerStatus: "offline",
      activeBookings: 2,
    });
    await syncCleanerBusyFromBookings(client, "cleaner-1");
    expect(cleanerUpdates).toHaveLength(0);
  });

  it("sets status='busy' when active bookings exist and current status is available", async () => {
    const { client, cleanerUpdates } = buildRecordingSupabase({
      cleanerStatus: "available",
      activeBookings: 1,
    });
    await syncCleanerBusyFromBookings(client, "cleaner-1");
    expect(cleanerUpdates).toHaveLength(1);
    expect(cleanerUpdates[0]).toEqual({ status: "busy" });
  });

  it("sets status='available' on completion when current status is busy and no active bookings remain", async () => {
    const { client, cleanerUpdates } = buildRecordingSupabase({
      cleanerStatus: "busy",
      activeBookings: 0,
    });
    await syncCleanerBusyFromBookings(client, "cleaner-1");
    expect(cleanerUpdates).toHaveLength(1);
    expect(cleanerUpdates[0]).toEqual({ status: "available" });
  });

  it("is a no-op when the derived status equals the current value (busy → busy)", async () => {
    const { client, cleanerUpdates } = buildRecordingSupabase({
      cleanerStatus: "busy",
      activeBookings: 3,
    });
    await syncCleanerBusyFromBookings(client, "cleaner-1");
    expect(cleanerUpdates).toHaveLength(0);
  });

  it("is a no-op when the derived status equals the current value (available → available)", async () => {
    const { client, cleanerUpdates } = buildRecordingSupabase({
      cleanerStatus: "available",
      activeBookings: 0,
    });
    await syncCleanerBusyFromBookings(client, "cleaner-1");
    expect(cleanerUpdates).toHaveLength(0);
  });

  it("never writes the `is_available` key in any UPDATE payload", async () => {
    // Run all the non-trivial transitions and verify the invariant.
    const transitions = [
      { cleanerStatus: "available", activeBookings: 1 }, // → busy
      { cleanerStatus: "busy", activeBookings: 0 }, // → available
    ];
    for (const t of transitions) {
      const { client, cleanerUpdates } = buildRecordingSupabase(t);
      await syncCleanerBusyFromBookings(client, "cleaner-1");
      for (const payload of cleanerUpdates) {
        expect(Object.prototype.hasOwnProperty.call(payload, "is_available")).toBe(false);
      }
    }
  });
});

describe("isBookingTerminalForCleanerWorkloadSync", () => {
  it("recognises terminal booking statuses", () => {
    expect(isBookingTerminalForCleanerWorkloadSync("completed")).toBe(true);
    expect(isBookingTerminalForCleanerWorkloadSync("cancelled")).toBe(true);
    expect(isBookingTerminalForCleanerWorkloadSync("failed")).toBe(true);
    expect(isBookingTerminalForCleanerWorkloadSync("assigned")).toBe(false);
  });
});
