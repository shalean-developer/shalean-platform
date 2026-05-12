/**
 * M-17 — cleaner-decline → redispatch is dedup'd to exactly once per decline event.
 *
 * Pre-M-17 the cleaner-decline flow could trigger redispatch TWICE:
 *   1) inside `rejectDispatchOffer` →
 *      `maybeRedispatchPendingBookingIfOffersExhausted` (CAS-bump + ensureBookingAssignment)
 *   2) again in the route handler / WhatsApp webhook calling
 *      `ensureBookingAssignment(...)` or `reassignBookingAfterDecline(...)` after the
 *      reject returned ok.
 *
 * Symptoms that double-trigger caused:
 *   - duplicate dispatch_offers rows + duplicate cleaner notifications
 *   - inflated `dispatch.assignment.attempt` and `dispatch.recovery.wave` metrics
 *   - the second call did NOT pass `excludeCleanerIds`, so the just-rejecting cleaner
 *     could be re-picked for the same booking
 *
 * The fix: redispatch on offer decline is owned by `rejectDispatchOffer` →
 * `maybeRedispatchPendingBookingIfOffersExhausted`, which uses an atomic CAS on
 * `bookings.dispatch_attempt_count` to dedup concurrent decline / cron-expiry signals.
 *
 * These tests prove:
 *   - the three offer-decline route handlers (cleaner API, public token, WhatsApp
 *     webhook) no longer call `ensureBookingAssignment` / `reassignBookingAfterDecline`
 *     after `rejectDispatchOffer`
 *   - normal decline (user_selected and auto_dispatch) redispatches exactly once
 *   - two concurrent decline events with the same `expected` attempt count only
 *     redispatch once — the CAS loser sees `bumped=null` and bails
 *   - the genuine non-response timeout path (`runDispatchTimeouts`) still expires
 *     stale offers and enqueues retries — independent of the decline dedup
 *   - dispatch metrics + `dispatch_attempt_count` increment exactly once per decline
 *   - the `auto_dispatch` → `auto_fallback` re-tag is gated on `user_selected` only
 *     (auto_dispatch declines must NOT silently mutate assignment_type)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/dispatch/ensureBookingAssignment", () => ({
  ensureBookingAssignment: vi.fn(),
}));
vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/metrics/counters", () => ({
  metrics: { increment: vi.fn() },
}));
vi.mock("@/lib/dispatch/dispatchEscalation", () => ({
  notifyDispatchEscalationAdmin: vi.fn().mockResolvedValue(undefined),
}));

import { maybeRedispatchPendingBookingIfOffersExhausted } from "@/lib/dispatch/redispatchAfterOfferReject";
import { ensureBookingAssignment } from "@/lib/dispatch/ensureBookingAssignment";
import { metrics } from "@/lib/metrics/counters";

const ensureMock = vi.mocked(ensureBookingAssignment);
const metricsIncrement = vi.mocked(metrics.increment);

type AnyRecord = Record<string, unknown>;

/**
 * Stateful CAS-aware Supabase mock. Tracks the booking's `dispatch_attempt_count`
 * and only allows the bump if the caller's `expected` count matches the current
 * value — exactly mirroring the server-side compare-and-swap behaviour Postgres
 * gives us via `WHERE dispatch_attempt_count = expected`.
 *
 * This is the only honest way to test the M-17 dedup invariant — a non-stateful
 * mock would let every concurrent caller "win" and we'd be testing nothing.
 */
function makeStatefulSupabaseForRedispatch(initial: {
  bookingId: string;
  status: string;
  assignment_type: string;
  selected_cleaner_id?: string | null;
  dispatch_attempt_count?: number;
  pending_offers?: number;
}) {
  const state = {
    bookingId: initial.bookingId,
    status: initial.status,
    cleaner_id: null as string | null,
    dispatch_status: "offered",
    assignment_type: initial.assignment_type,
    selected_cleaner_id: initial.selected_cleaner_id ?? null,
    dispatch_attempt_count: initial.dispatch_attempt_count ?? 0,
    payment_needs_follow_up: false,
    fallback_reason: null as string | null,
    attempted_cleaner_id: null as string | null,
    dispatch_next_recovery_at: null as string | null,
    dispatch_recovery_lease_until: null as string | null,
  };
  const pendingOfferCount = initial.pending_offers ?? 0;

  const log: Array<{ table: string; op: string; payload?: AnyRecord }> = [];

  function bookingsBuilder(): AnyRecord {
    let pendingPatch: AnyRecord | null = null;
    /** "select" = pure read; "update" = pending CAS that hasn't been resolved yet. */
    let mode: "select" | "update" = "select";

    /** filter accumulator — AND-in each filter as the chain grows. */
    const filters: Array<(s: typeof state) => boolean> = [];

    function applyUpdateIfMatched(): { matched: boolean } {
      if (!pendingPatch) return { matched: false };
      if (filters.every((fn) => fn(state))) {
        for (const [k, v] of Object.entries(pendingPatch)) {
          (state as unknown as AnyRecord)[k] = v;
        }
        return { matched: true };
      }
      return { matched: false };
    }

    const builder: AnyRecord = {
      /**
       * Supabase semantics: `.update(...).eq(...).select("col").maybeSingle()` returns the
       * updated row(s). The `select()` after `update()` is a returning clause — it does NOT
       * flip the operation back to a read. So we apply the CAS at the moment the chain
       * resolves (`.then` or `.maybeSingle`), regardless of whether `.select()` came in between.
       */
      select: () => builder,
      update: (patch: AnyRecord) => {
        mode = "update";
        pendingPatch = patch;
        log.push({ table: "bookings", op: "update", payload: patch });
        return builder;
      },
      eq: (col: string, val: unknown) => {
        if (col === "id") {
          filters.push((s) => s.bookingId === String(val));
        } else if (col === "dispatch_attempt_count") {
          filters.push((s) => s.dispatch_attempt_count === Number(val));
        } else if (col === "assignment_type") {
          filters.push((s) => s.assignment_type === String(val));
        } else if (col === "status") {
          filters.push((s) => s.status === String(val));
        }
        return builder;
      },
      in: (col: string, vals: unknown[]) => {
        if (col === "status") {
          filters.push((s) => (vals as string[]).includes(s.status));
        }
        return builder;
      },
      is: (col: string, val: unknown) => {
        if (col === "cleaner_id") {
          filters.push((s) => (val === null ? s.cleaner_id === null : s.cleaner_id === val));
        }
        return builder;
      },
      maybeSingle: async () => {
        if (mode === "update") {
          const { matched } = applyUpdateIfMatched();
          /** Mirror Postgres `RETURNING id`: only return a row when WHERE matched. */
          return matched ? { data: { id: state.bookingId }, error: null } : { data: null, error: null };
        }
        if (filters.length === 0 || filters.every((fn) => fn(state))) {
          return {
            data: {
              id: state.bookingId,
              status: state.status,
              cleaner_id: state.cleaner_id,
              dispatch_status: state.dispatch_status,
              assignment_type: state.assignment_type,
              selected_cleaner_id: state.selected_cleaner_id,
              dispatch_attempt_count: state.dispatch_attempt_count,
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
      then: (resolve: (v: unknown) => unknown) => {
        if (mode === "update") {
          applyUpdateIfMatched();
        }
        return Promise.resolve(resolve({ data: null, error: null }));
      },
    };
    return builder;
  }

  function dispatchOffersBuilder(): AnyRecord {
    return {
      select: () => ({
        eq: () => ({
          eq: async () => ({ count: pendingOfferCount, error: null }),
        }),
      }),
    };
  }

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "bookings") return bookingsBuilder();
      if (table === "dispatch_offers") return dispatchOffersBuilder();
      throw new Error(`unexpected table ${table}`);
    }),
  } as unknown as SupabaseClient;

  return { supabase, state, log };
}

beforeEach(() => {
  vi.stubEnv("AUTO_DISPATCH_CLEANERS", "true");
  ensureMock.mockReset();
  ensureMock.mockResolvedValue({
    ok: true,
    assignmentKind: "individual",
    cleanerId: "00000000-0000-4000-8000-0000000000ff",
  } as never);
  metricsIncrement.mockClear();
});

const BOOKING_ID = "00000000-0000-4000-8000-000000000111";
const REJECTING_CLEANER_ID = "00000000-0000-4000-8000-000000000aaa";

describe("M-17 dedup: maybeRedispatchPendingBookingIfOffersExhausted (single owner)", () => {
  it("normal user_selected decline: redispatch fires exactly once and tags as auto_fallback", async () => {
    const { supabase, state } = makeStatefulSupabaseForRedispatch({
      bookingId: BOOKING_ID,
      status: "pending_assignment",
      assignment_type: "user_selected",
      selected_cleaner_id: REJECTING_CLEANER_ID,
    });

    await maybeRedispatchPendingBookingIfOffersExhausted(supabase, {
      bookingId: BOOKING_ID,
      rejectedCleanerId: REJECTING_CLEANER_ID,
      skipBackoffScheduling: true,
    });

    expect(ensureMock).toHaveBeenCalledTimes(1);
    expect(ensureMock).toHaveBeenCalledWith(
      supabase,
      BOOKING_ID,
      expect.objectContaining({
        source: "offer_decline_redispatch",
        smartAssign: { excludeCleanerIds: [REJECTING_CLEANER_ID] },
      }),
    );
    expect(state.dispatch_attempt_count).toBe(1);
    expect(state.assignment_type).toBe("auto_fallback");
    expect(state.fallback_reason).toBe("cleaner_rejected_offer");
    expect(state.attempted_cleaner_id).toBe(REJECTING_CLEANER_ID);
  });

  it("normal auto_dispatch decline: redispatch fires once, KEEPS assignment_type=auto_dispatch", async () => {
    /**
     * Pre-M-17 the inner short-circuited for assignment_type != 'user_selected', so
     * redispatch was always run by the route handler outside the dedup. Now the inner
     * is the single owner and the auto_dispatch tag must not silently flip to
     * auto_fallback on parallel-dispatch declines.
     */
    const { supabase, state } = makeStatefulSupabaseForRedispatch({
      bookingId: BOOKING_ID,
      status: "pending_assignment",
      assignment_type: "auto_dispatch",
    });

    await maybeRedispatchPendingBookingIfOffersExhausted(supabase, {
      bookingId: BOOKING_ID,
      rejectedCleanerId: REJECTING_CLEANER_ID,
      skipBackoffScheduling: true,
    });

    expect(ensureMock).toHaveBeenCalledTimes(1);
    expect(state.dispatch_attempt_count).toBe(1);
    /** auto_dispatch must stay auto_dispatch through redispatch — only user_selected becomes auto_fallback. */
    expect(state.assignment_type).toBe("auto_dispatch");
    expect(state.attempted_cleaner_id).toBeNull();
    expect(state.fallback_reason).toBeNull();
  });

  it("max-attempts cap reached: marks failed and does NOT redispatch — retry counts can't run away", async () => {
    /**
     * Once `dispatch_attempt_count` hits `maxDispatchAttempts()` (default 5),
     * further decline signals must NOT keep dispatching. They must mark the
     * booking failed and bail. This is the cap that keeps decline retry costs
     * bounded and preserves the "exactly once per decline event" envelope —
     * even if a misbehaving caller fires forever, we stop after N attempts.
     */
    const { supabase, state } = makeStatefulSupabaseForRedispatch({
      bookingId: BOOKING_ID,
      status: "pending_assignment",
      assignment_type: "user_selected",
      selected_cleaner_id: REJECTING_CLEANER_ID,
      /** Default cap is 5 — start at the cap so the next decline is over-budget. */
      dispatch_attempt_count: 5,
    });

    await maybeRedispatchPendingBookingIfOffersExhausted(supabase, {
      bookingId: BOOKING_ID,
      rejectedCleanerId: REJECTING_CLEANER_ID,
      skipBackoffScheduling: true,
    });

    expect(ensureMock).not.toHaveBeenCalled();
    /** Counter not bumped — over cap doesn't increment. */
    expect(state.dispatch_attempt_count).toBe(5);
    /** Booking marked failed so ops/escalation can take it from here. */
    expect(state.dispatch_status).toBe("failed");
  });

  it("after first redispatch creates a new pending offer, a stray duplicate signal is short-circuited", async () => {
    /**
     * Real production sequence: decline #1 fires `rejectDispatchOffer` →
     * `maybeRedispatch` → bumps attempt + emits the next wave (creating new
     * pending dispatch_offers). A duplicate signal arrives moments later (Meta
     * webhook retry, double-tap, …). The retry's `pendingOfferCount > 0` guard
     * makes it a no-op — no extra metrics, no extra ensureBookingAssignment.
     */
    const { supabase, state } = makeStatefulSupabaseForRedispatch({
      bookingId: BOOKING_ID,
      status: "pending_assignment",
      assignment_type: "user_selected",
      selected_cleaner_id: REJECTING_CLEANER_ID,
      /** Simulate "first redispatch already happened and created a new pending offer". */
      dispatch_attempt_count: 1,
      pending_offers: 1,
    });

    await maybeRedispatchPendingBookingIfOffersExhausted(supabase, {
      bookingId: BOOKING_ID,
      rejectedCleanerId: REJECTING_CLEANER_ID,
      skipBackoffScheduling: true,
    });

    expect(ensureMock).not.toHaveBeenCalled();
    expect(state.dispatch_attempt_count).toBe(1);
    /** No wave metric for a no-op — keeps `dispatch.recovery.wave` honest. */
    const waveCalls = metricsIncrement.mock.calls.filter(
      (c) => c[0] === "dispatch.recovery.wave",
    );
    expect(waveCalls).toHaveLength(0);
  });

  it("simulated-concurrent declines: two callers race CAS — only one redispatch wave goes out", async () => {
    /**
     * Both callers read `attempts=0`, both compute `next=1`, both fire the bump CAS in
     * parallel. The stateful mock applies the first one to land — the second's
     * `dispatch_attempt_count=0` predicate no longer matches. This is the contract
     * the production Postgres bump relies on for cross-process dedup (multiple Vercel
     * Functions handling concurrent declines).
     */
    const { supabase, state } = makeStatefulSupabaseForRedispatch({
      bookingId: BOOKING_ID,
      status: "pending_assignment",
      assignment_type: "user_selected",
      selected_cleaner_id: REJECTING_CLEANER_ID,
    });

    await Promise.all([
      maybeRedispatchPendingBookingIfOffersExhausted(supabase, {
        bookingId: BOOKING_ID,
        rejectedCleanerId: REJECTING_CLEANER_ID,
        skipBackoffScheduling: true,
      }),
      maybeRedispatchPendingBookingIfOffersExhausted(supabase, {
        bookingId: BOOKING_ID,
        rejectedCleanerId: REJECTING_CLEANER_ID,
        skipBackoffScheduling: true,
      }),
    ]);

    expect(ensureMock).toHaveBeenCalledTimes(1);
    expect(state.dispatch_attempt_count).toBe(1);
  });

  it("redispatch is suppressed while pending offers still exist (parallel auto-dispatch session)", async () => {
    const { supabase, state } = makeStatefulSupabaseForRedispatch({
      bookingId: BOOKING_ID,
      status: "pending_assignment",
      assignment_type: "auto_dispatch",
      pending_offers: 2,
    });

    await maybeRedispatchPendingBookingIfOffersExhausted(supabase, {
      bookingId: BOOKING_ID,
      rejectedCleanerId: REJECTING_CLEANER_ID,
      skipBackoffScheduling: true,
    });

    expect(ensureMock).not.toHaveBeenCalled();
    expect(state.dispatch_attempt_count).toBe(0);
    expect(state.assignment_type).toBe("auto_dispatch");
  });

  it("CAS-loser must NOT inflate dispatch_attempt_count", async () => {
    /**
     * Even if two declines fire close together with stale `expected`, the loser's
     * update has zero rowcount and the CAS-protected counter stays correct.
     */
    const { supabase, state } = makeStatefulSupabaseForRedispatch({
      bookingId: BOOKING_ID,
      status: "pending_assignment",
      assignment_type: "user_selected",
      selected_cleaner_id: REJECTING_CLEANER_ID,
      dispatch_attempt_count: 2,
    });

    await Promise.all([
      maybeRedispatchPendingBookingIfOffersExhausted(supabase, {
        bookingId: BOOKING_ID,
        rejectedCleanerId: REJECTING_CLEANER_ID,
        skipBackoffScheduling: true,
      }),
      maybeRedispatchPendingBookingIfOffersExhausted(supabase, {
        bookingId: BOOKING_ID,
        rejectedCleanerId: REJECTING_CLEANER_ID,
        skipBackoffScheduling: true,
      }),
    ]);

    /** Counter advanced exactly +1 — never +2 — even under race. */
    expect(state.dispatch_attempt_count).toBe(3);
    expect(ensureMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * Static-content guards for the route handlers. We pin "no `ensureBookingAssignment`
 * after `rejectDispatchOffer`" into source so a future revert reintroducing the
 * double-trigger fails this test instead of slipping into prod with duplicate
 * offers / metrics. These complement the runtime dedup tests above — together
 * they prove M-17 from both directions.
 */
describe("M-17 dedup: route handlers no longer redispatch after rejectDispatchOffer", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  /** apps/web root: this file lives at apps/web/lib/dispatch/__tests__/. */
  const WEB_ROOT = path.resolve(here, "..", "..", "..");

  function readFile(rel: string): string {
    return readFileSync(path.join(WEB_ROOT, rel), "utf8");
  }

  it("apps/web/app/api/cleaner/offers/[id]/decline/route.ts does NOT call ensureBookingAssignment", () => {
    const src = readFile("app/api/cleaner/offers/[id]/decline/route.ts");
    expect(/from\s+["']@\/lib\/dispatch\/ensureBookingAssignment["']/.test(src)).toBe(false);
    expect(/\bensureBookingAssignment\s*\(/.test(src)).toBe(false);
    /** Sanity: it still calls rejectDispatchOffer (the canonical dedup-owning path). */
    expect(/\brejectDispatchOffer\s*\(/.test(src)).toBe(true);
  });

  it("apps/web/app/api/offers/decline/route.ts (token-based) does NOT call ensureBookingAssignment", () => {
    const src = readFile("app/api/offers/decline/route.ts");
    expect(/from\s+["']@\/lib\/dispatch\/ensureBookingAssignment["']/.test(src)).toBe(false);
    expect(/\bensureBookingAssignment\s*\(/.test(src)).toBe(false);
    expect(/\brejectDispatchOffer\s*\(/.test(src)).toBe(true);
  });

  it("apps/web/app/api/webhooks/whatsapp/route.ts does NOT call reassignBookingAfterDecline post-decline", () => {
    const src = readFile("app/api/webhooks/whatsapp/route.ts");
    const stripComments = (s: string) =>
      s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[^]*?\*\//g, "");
    const code = stripComments(src);
    /** Function call + import are gone in M-17 (a doc comment may still cite the historical name). */
    expect(/from\s+["']@\/lib\/booking\/reassignBookingAfterDecline["']/.test(code)).toBe(false);
    expect(/\breassignBookingAfterDecline\s*\(/.test(code)).toBe(false);
    expect(/\brejectDispatchOffer\s*\(/.test(code)).toBe(true);
  });

  it("apps/web/lib/booking/reassignBookingAfterDecline.ts removed the duplicate `reassignBookingAfterDecline` export (kept tryOnceReassignAfterDecline)", () => {
    const src = readFile("lib/booking/reassignBookingAfterDecline.ts");
    /** The old "ensureBookingAssignment after decline" wrapper is gone. */
    expect(/export\s+async\s+function\s+reassignBookingAfterDecline\b/.test(src)).toBe(false);
    /** But the assigned-booking decline path (different lifecycle) MUST stay. */
    expect(/export\s+async\s+function\s+tryOnceReassignAfterDecline\b/.test(src)).toBe(true);
  });
});

/**
 * Genuine timeout recovery (cleaner never responded) MUST keep working: the
 * decline-dedup change must not weaken the offer-expiry → retry-queue path.
 * `runDispatchTimeouts` lives independently of the decline flow — it expires
 * stale `dispatch_offers` rows and enqueues `dispatch_retry_queue`. We assert
 * the source still wires that path and that it does NOT route through
 * `maybeRedispatchPendingBookingIfOffersExhausted` (which would couple it to
 * the decline CAS and break the documented separation).
 */
describe("M-17 dedup: timeout recovery preserved (independent of decline dedup)", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dispatchDir = path.resolve(here, "..");

  function readFile(rel: string): string {
    return readFileSync(path.join(dispatchDir, rel), "utf8");
  }

  it("runDispatchTimeouts still expires stale offers and enqueues retry-queue (timeout recovery path intact)", () => {
    const src = readFile("runDispatchTimeouts.ts");
    /** Marks offer expired. */
    expect(/status:\s*["']expired["']/.test(src)).toBe(true);
    /** Queues a retry with the exclude-cleaner metadata so the timed-out cleaner is skipped. */
    expect(/\benqueueDispatchRetry\s*\(/.test(src)).toBe(true);
    expect(/excludeCleanerId/.test(src)).toBe(true);
  });

  it("processUserSelectedOfferExpiryRedispatch still funnels into maybeRedispatch under recovery lease", () => {
    /**
     * The user-selected first-expiry retry path uses `tryClaimDispatchRecoveryLease`
     * → `maybeRedispatchPendingBookingIfOffersExhausted`. M-17 must not break that
     * coupling — the lease + the CAS together prevent decline + cron expiry from
     * both redispatching the same booking in the same tick.
     */
    const src = readFile("processUserSelectedOfferExpiryRedispatch.ts");
    expect(/tryClaimDispatchRecoveryLease/.test(src)).toBe(true);
    expect(/maybeRedispatchPendingBookingIfOffersExhausted/.test(src)).toBe(true);
  });
});

/**
 * Wider invariant: the decline-decoupling MUST NOT touch payment / payout columns.
 * The task explicitly forbids changing payout logic — pin that with a static guard
 * over the helper module so the next refactor can't quietly re-introduce a payout
 * write under the redispatch banner.
 */
describe("M-17 isolation: dedup change does not touch payment / payout / assignment-selection logic", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dispatchDir = path.resolve(here, "..");

  function readFile(rel: string): string {
    return readFileSync(path.join(dispatchDir, rel), "utf8");
  }

  it("redispatchAfterOfferReject.ts must not reference payout / earnings / amount columns", () => {
    const stripComments = (s: string) =>
      s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[^]*?\*\//g, "");
    const code = stripComments(readFile("redispatchAfterOfferReject.ts"));
    expect(/\bamount_paid_cents\b/.test(code)).toBe(false);
    expect(/\bcleaner_payout_cents\b/.test(code)).toBe(false);
    expect(/\bdisplay_earnings_cents\b/.test(code)).toBe(false);
    expect(/\bplatform_fee_cents\b/.test(code)).toBe(false);
    expect(/\bpaystack_reference\b/.test(code)).toBe(false);
  });

  it("redispatchAfterOfferReject.ts must not change assignment selection logic (still defers to ensureBookingAssignment)", () => {
    const code = readFile("redispatchAfterOfferReject.ts");
    /** Selection lives entirely inside ensureBookingAssignment → assignBooking → smart assign. */
    expect(/ensureBookingAssignment\s*\(/.test(code)).toBe(true);
    /** No direct booking_id-cleaner-id stitching here — that would be a selection change. */
    expect(/\.update\(\s*\{\s*cleaner_id:\s*[^n]/.test(code)).toBe(false);
  });
});
