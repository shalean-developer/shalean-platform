/**
 * M-12 — atomic accept of a dispatch offer.
 *
 * Pre-M-12 the accept flow performed THREE sequential writes:
 *   1) `bookings.update({ cleaner_id, status: 'assigned', ... })`
 *   2) `dispatch_offers.update({ status: 'accepted' })`
 *   3) `dispatch_expire_peer_offers` RPC
 *
 * A concurrent admin reassignment landing between (1) and (2) could leave
 * the dispatch_offers row in `pending` state behind a booking already
 * assigned to a different cleaner. M-12 collapses (1)+(2)+(3) into a single
 * security-definer RPC `accept_dispatch_offer_atomic` that locks the offer
 * + booking rows, validates pending / assignability / expiry, and writes
 * everything in one transaction.
 *
 * These tests prove:
 *   - normal accept invokes the atomic RPC with the right shape and
 *     succeeds (returns `{ ok: true }`)
 *   - stale offer (status no longer pending) is rejected with the failure
 *     code mapped from the JSONB result
 *   - "concurrently reassigned booking" race returns `assigned_other`,
 *     emits the lost-race SMS, and never leaves a pending offer behind
 *   - duplicate accept of an already-accepted offer is rejected cleanly
 *     with `machine_reason='already_taken'`
 *   - per-booking-flag (non-monthly / monthly) earnings logic is untouched
 *     by the RPC contract — payout formulas don't change
 *   - the `dispatch_expire_peer_offers` RPC is no longer called from the
 *     accept path (its job moved into the atomic RPC)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/admin/triggerAssignmentEarningsSnapshot", () => ({
  triggerAssignmentEarningsSnapshotForBooking: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/cleaner/syncCleanerStatus", () => ({
  syncCleanerBusyFromBookings: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/dispatch/notifyCleanerAssigned", () => ({
  notifyCleanerAssignedBooking: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/dispatch/offerNotifications", () => ({
  notifyCleanerDispatchOfferLostRaceSms: vi.fn().mockResolvedValue(undefined),
  notifyCleanerOfDispatchOffer: vi.fn().mockResolvedValue(undefined),
  notifyCleanerOfferDeclined: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/dispatch/dispatchMetricContext", () => ({
  loadDispatchMetricSegmentation: vi
    .fn()
    .mockResolvedValue({ assignment_type: null, fallback_reason: null, attempt_number: null, location: null }),
  compactDispatchMetricTags: vi.fn().mockReturnValue({}),
  firstOfferMetricAnchorIso: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/marketplace-intelligence/marketplaceBookingMeta", () => ({
  marketplaceBookingPatchOnAssign: vi.fn().mockResolvedValue({
    marketplace_cluster_id: "mi_c_test",
    marketplace_forecast_demand: null,
  }),
}));

vi.mock("@/lib/ai-autonomy/learningLoop", () => ({
  learnFromCleanerAcceptance: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/cleaner/cleanerOfferUxVariant", () => ({
  assignCleanerUxVariantForCleaner: vi.fn().mockReturnValue("control"),
  sanitizeCleanerUxVariant: vi.fn().mockImplementation((v: unknown) => v ?? "control"),
}));

vi.mock("@/lib/metrics/counters", () => ({
  metrics: { increment: vi.fn() },
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));

import { acceptDispatchOffer } from "@/lib/dispatch/dispatchOffers";
import { notifyCleanerDispatchOfferLostRaceSms } from "@/lib/dispatch/offerNotifications";

const OFFER_ID = "00000000-0000-4000-8000-00000000f001";
const BOOKING_ID = "00000000-0000-4000-8000-00000000b001";
const CLEANER_ID = "00000000-0000-4000-8000-00000000c001";

const futureIso = (ms = 5 * 60_000) => new Date(Date.now() + ms).toISOString();
const pastIso = (ms = 5 * 60_000) => new Date(Date.now() - ms).toISOString();

type AnyRecord = Record<string, unknown>;

type RpcCall = { name: string; args: AnyRecord };

type BuildOpts = {
  offerRow: AnyRecord | null;
  /**
   * What `bookings.select(...).eq("id",x).maybeSingle()` should return.
   * The accept flow uses this only to compute marketplace meta + truth
   * patch — the atomic decision is the RPC's job.
   */
  bookingMetaRow?: AnyRecord | null;
  /**
   * Result returned by `accept_dispatch_offer_atomic` RPC. Tests pre-program
   * the JSONB shape the DB function would emit for the scenario under test.
   */
  rpcResult: AnyRecord;
  rpcError?: { message: string } | null;
};

function buildSupabase(opts: BuildOpts): {
  client: SupabaseClient;
  rpcCalls: RpcCall[];
  bookingsUpdates: AnyRecord[];
  dispatchOffersUpdates: AnyRecord[];
} {
  const rpcCalls: RpcCall[] = [];
  const bookingsUpdates: AnyRecord[] = [];
  const dispatchOffersUpdates: AnyRecord[] = [];

  function autoChain(value: unknown = { data: null, error: null }): AnyRecord {
    const target = (() => undefined) as unknown as AnyRecord;
    const handler: ProxyHandler<AnyRecord> = {
      get(_t, prop: string | symbol) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => resolve(value);
        }
        return () => autoChain(value);
      },
      apply: () => autoChain(value),
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
      update: (payload: AnyRecord) => {
        dispatchOffersUpdates.push(payload);
        return autoChain();
      },
      insert: () => autoChain(),
    };
  }

  function bookingsBuilder() {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: opts.bookingMetaRow ?? {}, error: null }),
          in: () => ({
            limit: async () => ({ data: [], error: null }),
          }),
        }),
      }),
      update: (payload: AnyRecord) => {
        bookingsUpdates.push(payload);
        return autoChain();
      },
    };
  }

  function fromImpl(table: string): AnyRecord {
    if (table === "dispatch_offers") return dispatchOffersBuilder() as AnyRecord;
    if (table === "bookings") return bookingsBuilder() as AnyRecord;
    return autoChain();
  }

  const client = {
    from: fromImpl,
    rpc: async (name: string, args: AnyRecord) => {
      rpcCalls.push({ name, args });
      if (name === "accept_dispatch_offer_atomic") {
        return { data: opts.rpcResult, error: opts.rpcError ?? null };
      }
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;

  return { client, rpcCalls, bookingsUpdates, dispatchOffersUpdates };
}

const baseOfferRow: AnyRecord = {
  id: OFFER_ID,
  booking_id: BOOKING_ID,
  cleaner_id: CLEANER_ID,
  status: "pending",
  created_at: pastIso(2_000),
  ux_variant: null,
  expires_at: futureIso(),
  whatsapp_sent_at: null,
  sms_sent_at: null,
  dispatch_tier: null,
  dispatch_visible_at: null,
};

const bookingMetaRow: AnyRecord = {
  date: "2026-06-01",
  time: "10:00",
  location_id: "loc-1",
  city_id: "city-1",
  assignment_type: null,
  selected_cleaner_id: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("acceptDispatchOffer (M-12 atomic accept)", () => {
  it("normal accept: invokes accept_dispatch_offer_atomic with offer + cleaner + meta and returns ok", async () => {
    const { client, rpcCalls, bookingsUpdates, dispatchOffersUpdates } = buildSupabase({
      offerRow: baseOfferRow,
      bookingMetaRow,
      rpcResult: { ok: true, booking_id: BOOKING_ID, expired_peers: 2 },
    });

    const result = await acceptDispatchOffer({ supabase: client, offerId: OFFER_ID, cleanerId: CLEANER_ID });

    expect(result).toEqual({ ok: true });

    const atomicCall = rpcCalls.find((c) => c.name === "accept_dispatch_offer_atomic");
    expect(atomicCall, "atomic accept RPC must be called").toBeDefined();
    expect(atomicCall!.args).toMatchObject({
      p_offer_id: OFFER_ID,
      p_cleaner_id: CLEANER_ID,
    });
    expect(atomicCall!.args.p_response_latency_ms).toBeGreaterThanOrEqual(0);
    /** Marketplace meta + truth patch are forwarded as JSONB so the RPC can apply them atomically. */
    expect(atomicCall!.args.p_assign_meta).toMatchObject({
      marketplace_cluster_id: "mi_c_test",
    });
    expect(atomicCall!.args.p_truth_patch).toBeTypeOf("object");

    /** No direct `bookings.update` and no direct `dispatch_offers.update` happen — both moved into the RPC. */
    expect(bookingsUpdates).toEqual([]);
    expect(dispatchOffersUpdates).toEqual([]);

    /** And the legacy peer-expire RPC must NOT be called: it's now part of the atomic RPC. */
    expect(rpcCalls.some((c) => c.name === "dispatch_expire_peer_offers")).toBe(false);
  });

  it("stale offer (RPC returns failure='not_pending') is rejected without a booking write", async () => {
    /** Simulate the offer having moved to 'expired' between read and RPC. */
    const { client, rpcCalls, bookingsUpdates, dispatchOffersUpdates } = buildSupabase({
      offerRow: baseOfferRow,
      bookingMetaRow,
      rpcResult: {
        ok: false,
        failure: "not_pending",
        booking_id: BOOKING_ID,
        machine_reason: "already_taken",
      },
    });

    const result = await acceptDispatchOffer({ supabase: client, offerId: OFFER_ID, cleanerId: CLEANER_ID });

    expect(result).toMatchObject({
      ok: false,
      failure: "not_pending",
      machineReason: "already_taken",
    });
    expect(rpcCalls.some((c) => c.name === "accept_dispatch_offer_atomic")).toBe(true);
    expect(bookingsUpdates).toEqual([]);
    /**
     * No direct dispatch_offers writes from app code — all status moves are
     * the RPC's responsibility now.
     */
    expect(dispatchOffersUpdates).toEqual([]);
  });

  it("concurrently reassigned booking (assigned_other): no pending offer left behind, lost-race SMS fires", async () => {
    /**
     * Race scenario: admin reassigns booking to OTHER_CLEANER between
     * `acceptDispatchOffer` reading the offer and the RPC running. The
     * atomic RPC observes `bookings.cleaner_id != p_cleaner_id` while
     * still holding the offer + booking row locks, marks the offer
     * expired in the same transaction, and returns `assigned_other`.
     * App code MUST emit the lost-race SMS and propagate the failure
     * code so the cleaner UI shows "another cleaner was assigned".
     */
    const { client, rpcCalls, bookingsUpdates, dispatchOffersUpdates } = buildSupabase({
      offerRow: baseOfferRow,
      bookingMetaRow,
      rpcResult: {
        ok: false,
        failure: "assigned_other",
        booking_id: BOOKING_ID,
        machine_reason: "already_taken",
      },
    });

    const result = await acceptDispatchOffer({ supabase: client, offerId: OFFER_ID, cleanerId: CLEANER_ID });

    expect(result).toMatchObject({
      ok: false,
      failure: "assigned_other",
      machineReason: "already_taken",
    });
    expect(notifyCleanerDispatchOfferLostRaceSms).toHaveBeenCalledTimes(1);
    expect(notifyCleanerDispatchOfferLostRaceSms).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: BOOKING_ID, cleanerId: CLEANER_ID, offerId: OFFER_ID }),
    );

    /**
     * Crucial M-12 invariant: the app code must NOT issue any direct
     * dispatch_offers / bookings UPDATE in the race-loss branch. The RPC
     * is the single source of truth for cleaning up the pending offer.
     */
    expect(bookingsUpdates).toEqual([]);
    expect(dispatchOffersUpdates).toEqual([]);
    expect(rpcCalls.find((c) => c.name === "accept_dispatch_offer_atomic")).toBeDefined();
  });

  it("booking_taken (concurrent peer accept won the lock): same lost-race SMS + no dangling pending offer", async () => {
    const { client, dispatchOffersUpdates, bookingsUpdates } = buildSupabase({
      offerRow: baseOfferRow,
      bookingMetaRow,
      rpcResult: {
        ok: false,
        failure: "booking_taken",
        booking_id: BOOKING_ID,
        machine_reason: "already_taken",
      },
    });

    const result = await acceptDispatchOffer({ supabase: client, offerId: OFFER_ID, cleanerId: CLEANER_ID });

    expect(result).toMatchObject({ ok: false, failure: "booking_taken", machineReason: "already_taken" });
    expect(notifyCleanerDispatchOfferLostRaceSms).toHaveBeenCalledTimes(1);
    expect(bookingsUpdates).toEqual([]);
    expect(dispatchOffersUpdates).toEqual([]);
  });

  it("duplicate accept (same cleaner, same offer): RPC heals offer and returns not_pending+already_taken cleanly", async () => {
    /**
     * Idempotency check. First accept lands; cleaner re-fires accept (e.g.
     * SMS double-tap or network retry). The atomic RPC observes
     * `bookings.cleaner_id = p_cleaner_id` already-assigned and returns
     * `failure='not_pending'` with `machine_reason='already_taken'`. App
     * code must propagate that without firing duplicate notifications,
     * earnings snapshots, or peer-expire — those already happened on the
     * first accept.
     */
    const { client, rpcCalls } = buildSupabase({
      offerRow: { ...baseOfferRow, status: "pending" },
      bookingMetaRow,
      rpcResult: {
        ok: false,
        failure: "not_pending",
        booking_id: BOOKING_ID,
        offer_status: "accepted",
        machine_reason: "already_taken",
      },
    });

    const result = await acceptDispatchOffer({ supabase: client, offerId: OFFER_ID, cleanerId: CLEANER_ID });

    expect(result).toMatchObject({
      ok: false,
      failure: "not_pending",
      machineReason: "already_taken",
    });
    expect(rpcCalls.find((c) => c.name === "accept_dispatch_offer_atomic")).toBeDefined();
    /** No lost-race SMS for an idempotent re-accept by the SAME cleaner. */
    expect(notifyCleanerDispatchOfferLostRaceSms).not.toHaveBeenCalled();
  });

  it("RPC database error surfaces as failure='db' without rewriting any rows", async () => {
    const { client, bookingsUpdates, dispatchOffersUpdates } = buildSupabase({
      offerRow: baseOfferRow,
      bookingMetaRow,
      rpcResult: {},
      rpcError: { message: "deadlock detected" },
    });

    const result = await acceptDispatchOffer({ supabase: client, offerId: OFFER_ID, cleanerId: CLEANER_ID });

    expect(result).toMatchObject({ ok: false, failure: "db" });
    expect(result).toMatchObject({ error: expect.stringMatching(/deadlock detected/) });
    expect(bookingsUpdates).toEqual([]);
    expect(dispatchOffersUpdates).toEqual([]);
  });

  it("unrecognised RPC failure code is mapped to 'db' (defensive narrowing)", async () => {
    const { client } = buildSupabase({
      offerRow: baseOfferRow,
      bookingMetaRow,
      rpcResult: { ok: false, failure: "future_unknown_code" },
    });

    const result = await acceptDispatchOffer({ supabase: client, offerId: OFFER_ID, cleanerId: CLEANER_ID });
    expect(result).toMatchObject({ ok: false, failure: "db" });
  });

  it("payload to atomic RPC carries forward truth patch + assign meta exactly (no payout-formula mutation)", async () => {
    /**
     * Wider regression guard: the M-12 wrapper must forward the meta and
     * truth patch through to the RPC verbatim — no per-booking earnings
     * fields, no `display_earnings_cents`, no payout multipliers should
     * appear in the JSONB args. If a future change accidentally folded
     * payout fields into the assign_meta path we'd silently start
     * persisting different numbers; this assertion pins that down.
     */
    const { client, rpcCalls } = buildSupabase({
      offerRow: baseOfferRow,
      bookingMetaRow: {
        ...bookingMetaRow,
        assignment_type: "auto_dispatch",
        selected_cleaner_id: CLEANER_ID,
      },
      rpcResult: { ok: true, booking_id: BOOKING_ID, expired_peers: 0 },
    });

    await acceptDispatchOffer({ supabase: client, offerId: OFFER_ID, cleanerId: CLEANER_ID });

    const atomic = rpcCalls.find((c) => c.name === "accept_dispatch_offer_atomic")!;
    const meta = atomic.args.p_assign_meta as AnyRecord;
    const truth = atomic.args.p_truth_patch as AnyRecord;

    /** Whitelist: only the fields the RPC is documented to accept. */
    const metaAllowedKeys = new Set(["marketplace_cluster_id", "marketplace_forecast_demand", "assignment_type", "fallback_reason"]);
    for (const k of Object.keys(meta)) {
      expect(metaAllowedKeys.has(k), `assign_meta has unexpected key '${k}'`).toBe(true);
    }
    const truthAllowedKeys = new Set(["assignment_type", "fallback_reason"]);
    for (const k of Object.keys(truth)) {
      expect(truthAllowedKeys.has(k), `truth_patch has unexpected key '${k}'`).toBe(true);
    }
    /** Sanity: no payout / earnings keys ever leak in. */
    const banned = ["display_earnings_cents", "cleaner_payout_cents", "earnings_cents", "platform_fee_cents"];
    for (const k of banned) {
      expect(meta[k]).toBeUndefined();
      expect(truth[k]).toBeUndefined();
    }
  });

  it("module no longer references dispatch_expire_peer_offers from accept (peer expire is inside the atomic RPC)", async () => {
    /**
     * Static guard: ensure the in-flight refactor stays committed.
     * If a future revert reintroduces the separate peer-expire call we
     * lose half the M-12 atomicity guarantee. Read the module source
     * directly so this guard survives even if mocks change.
     */
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const here = path.resolve(__dirname, "..", "dispatchOffers.ts");
    const src = await fs.readFile(here, "utf8");

    /**
     * The legacy RPC is allowed to remain in DOC COMMENTS (we cite it as
     * the predecessor of the atomic RPC), but it must not appear inside
     * `params.supabase.rpc("dispatch_expire_peer_offers", ...)`.
     */
    expect(/\.rpc\(\s*["']dispatch_expire_peer_offers["']/.test(src)).toBe(false);

    /** Conversely the atomic RPC MUST be wired. */
    expect(/\.rpc\(\s*["']accept_dispatch_offer_atomic["']/.test(src)).toBe(true);
  });
});
