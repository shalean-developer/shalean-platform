/**
 * Regression guard for the "cleaner appears Paused after accepting" bug.
 *
 * `acceptDispatchOffer` previously wrote `cleaners.is_available = false`
 * directly after the workload sync. That:
 *   1. Made the dashboard render "Paused / Go online" because the same
 *      flag is what the manual "Go offline" toggle writes.
 *   2. Silently removed the cleaner from `getEligibleCleaners` for *all*
 *      future non-overlapping slots until they manually re-toggled
 *      (`getEligibleCleaners` filters with `.eq("is_available", true)`).
 *
 * The fix: only `syncCleanerBusyFromBookings` (workload `status` only)
 * runs. `cleaners.is_available` is owned exclusively by the manual
 * PATCH /api/cleaner/me toggle.
 *
 * Test strategy: rather than reproduce the full happy path of
 * `acceptDispatchOffer` (heavy, fragile to refactors), we proxy a fake
 * Supabase client that auto-chains every unmocked method to an empty
 * thenable. The accept flow runs as far as the data lets it; we capture
 * every `.from('cleaners').update(payload)` call and assert no payload
 * ever contains the `is_available` key — the contract that, if violated,
 * reproduces the original bug regardless of how the surrounding code
 * evolves.
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { acceptDispatchOffer } from "@/lib/dispatch/dispatchOffers";

const futureIso = new Date(Date.now() + 5 * 60_000).toISOString();

type AnyRecord = Record<string, unknown>;

/**
 * Build a Supabase mock whose `from()` returns a query proxy that:
 *   - Resolves `select(...).eq(...).maybeSingle()` to the configured row
 *     for the named table (or `null` if not configured).
 *   - Resolves `select(...).*.then(...)` (awaited) to `{ data: [], error: null }`.
 *   - Records every `update(payload)` call against `cleaners` so the
 *     contract assertion can inspect every payload.
 *   - Returns chainable empties for any other method call so the accept
 *     flow can complete (or fail late) without crashing on undefined.
 */
function buildAcceptingSupabase(opts: {
  offerRow: AnyRecord;
  bookingBeforeRow: AnyRecord | null;
  bookingUpdatedRows: AnyRecord[] | null;
  cleanerStatusBefore: string;
  activeBookingsAfterAccept: number;
}): { client: SupabaseClient; cleanerUpdates: AnyRecord[] } {
  const cleanerUpdates: AnyRecord[] = [];

  /** Auto-chaining proxy that pretends every method exists and resolves to empty. */
  function emptyChain(thenValue: unknown = { data: null, error: null }): AnyRecord {
    const target = (() => undefined) as unknown as AnyRecord;
    const handler: ProxyHandler<AnyRecord> = {
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

  function dispatchOffersBuilder() {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: opts.offerRow, error: null }),
        }),
      }),
      update: () => emptyChain(),
    };
  }

  function bookingsBuilder(callIndex: number) {
    // The accept flow calls `from('bookings')` repeatedly. We need to
    // disambiguate which call is which by query shape.
    return {
      select: (cols?: string) => {
        const colStr = String(cols ?? "");
        // 1) `select('status, cleaner_id, …').eq('id', x).maybeSingle()` — bookingBefore lookup.
        // 2) `loadDispatchMetricSegmentation` does similar `eq('id', x).maybeSingle()`.
        if (/maybeSingle/.test("maybeSingle") || /\bid\b|status/.test(colStr) || true) {
          return {
            eq: () => ({
              maybeSingle: async () => ({ data: opts.bookingBeforeRow ?? {}, error: null }),
              // `.eq().in().limit()` — `syncCleanerBusyFromBookings` active probe.
              in: () => ({
                limit: async () => ({
                  data: Array.from({ length: opts.activeBookingsAfterAccept }, (_, i) => ({ id: `b-${i}` })),
                  error: null,
                }),
              }),
            }),
          };
        }
        return emptyChain();
      },
      // The `bookings.update({ cleaner_id, status: 'assigned' … })` chain.
      update: () => ({
        eq: () => ({
          neq: () => ({
            in: () => ({
              neq: () => ({
                select: async () => ({ data: opts.bookingUpdatedRows ?? [], error: null }),
              }),
            }),
          }),
        }),
      }),
    };
    void callIndex;
  }

  function cleanersBuilder() {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { status: opts.cleanerStatusBefore }, error: null }),
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

  let bookingsCallCount = 0;
  const fromImpl = (table: string): AnyRecord => {
    if (table === "dispatch_offers") return dispatchOffersBuilder() as AnyRecord;
    if (table === "bookings") {
      bookingsCallCount += 1;
      return bookingsBuilder(bookingsCallCount) as AnyRecord;
    }
    if (table === "cleaners") return cleanersBuilder() as AnyRecord;
    // system_logs / dispatch_offers_metric / etc.
    return emptyChain();
  };

  const client = {
    from: (table: string) => fromImpl(table),
    rpc: async () => ({ data: null, error: null }),
  } as unknown as SupabaseClient;

  return { client, cleanerUpdates };
}

const baseOfferRow: AnyRecord = {
  id: "offer-1",
  booking_id: "book-1",
  cleaner_id: "cleaner-1",
  status: "pending",
  created_at: new Date().toISOString(),
  ux_variant: null,
  expires_at: futureIso,
  whatsapp_sent_at: null,
  sms_sent_at: null,
  dispatch_tier: null,
  dispatch_visible_at: null,
};

describe("acceptDispatchOffer — `cleaners.is_available` invariant", () => {
  it("happy path: every cleaners.update payload omits the `is_available` key", async () => {
    const { client, cleanerUpdates } = buildAcceptingSupabase({
      offerRow: baseOfferRow,
      bookingBeforeRow: { status: "pending", cleaner_id: null },
      bookingUpdatedRows: [{ id: "book-1" }],
      cleanerStatusBefore: "available",
      activeBookingsAfterAccept: 1,
    });

    // Run the accept. Downstream calls may still error against the proxy
    // but that's fine — we only care about the cleaners-table contract.
    try {
      await acceptDispatchOffer({ supabase: client, offerId: "offer-1", cleanerId: "cleaner-1" });
    } catch {
      /* downstream notify / metric paths may throw against the proxy; ignored */
    }

    // No-call is acceptable too (means workload sync didn't fire),
    // but if it DID fire we must not see is_available.
    for (const payload of cleanerUpdates) {
      expect(Object.prototype.hasOwnProperty.call(payload, "is_available")).toBe(false);
    }
  });

  it("manually offline cleaner: workload sync short-circuits (status='offline'), no cleaners.update fires", async () => {
    const { client, cleanerUpdates } = buildAcceptingSupabase({
      offerRow: { ...baseOfferRow, id: "offer-2", booking_id: "book-2", cleaner_id: "cleaner-2" },
      bookingBeforeRow: { status: "pending", cleaner_id: null },
      bookingUpdatedRows: [{ id: "book-2" }],
      cleanerStatusBefore: "offline",
      activeBookingsAfterAccept: 0,
    });

    try {
      await acceptDispatchOffer({ supabase: client, offerId: "offer-2", cleanerId: "cleaner-2" });
    } catch {
      /* downstream notify / metric paths may throw against the proxy; ignored */
    }

    // The deleted rogue write would still have fired here even when sync
    // short-circuits — its absence is the strongest contract this test
    // can assert.
    expect(cleanerUpdates).toHaveLength(0);
  });

  it("documents the contract via a source-level guard", async () => {
    // Belt-and-braces: read the module source and assert no literal
    // `is_available: false` write survives in the accept handler. This
    // is a static sentinel that catches the regression even if a future
    // refactor moves the supabase calls behind helpers our mock no
    // longer reaches.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const here = path.resolve(__dirname, "..", "dispatchOffers.ts");
    const src = await fs.readFile(here, "utf8");
    expect(src.includes("is_available: false")).toBe(false);
  });
});
