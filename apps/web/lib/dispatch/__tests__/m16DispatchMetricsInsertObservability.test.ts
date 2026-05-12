/**
 * M-16 regression suite.
 *
 * Problem:
 *   `dispatch_metrics` insert failures inside `acceptDispatchOffer` were
 *   swallowed silently in two places:
 *     (a) the prerequisite `dispatch_offers` count query was gated by
 *         `if (!scErr) { ... }` with no log when `scErr` was set — the
 *         dispatch_metrics insert was simply skipped without any signal;
 *     (b) the existing `dmErr` and catch-block paths used `logSystemEvent`,
 *         which only persists to `system_logs` (no console signal), so a
 *         storm of failures wouldn't surface in stderr-aggregated dashboards
 *         the same way sibling dispatch errors do.
 *
 * Contracts under test (any one of these regressing means the bug is back):
 *   1. The dispatch_metrics observability block uses `reportOperationalIssue`
 *      (the standard escalation channel — `console.warn` + `system_logs`),
 *      consistent with sibling dispatch error paths.
 *   2. All three failure modes (scErr, dmErr, thrown exception) are logged.
 *   3. `acceptDispatchOffer` still resolves to `{ ok: true }` regardless of
 *      metric outcome — dispatch is never blocked by observability.
 *   4. A successful insert path does NOT call `reportOperationalIssue`
 *      (no false-positive noise on the happy path).
 *   5. Dispatch assignment / payout / payment logic is untouched.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// IMPORTANT: hoist these mocks BEFORE importing the module under test.
// `reportOperationalIssue` is the channel M-16 escalates to; we capture every
// call so the per-failure-mode tests can assert source + level + message.
vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));

// Side-effect free stubs for the helpers `acceptDispatchOffer` calls AFTER
// the atomic accept RPC. We don't drive their logic — we only need the
// function to keep walking until it reaches the dispatch_metrics block.
vi.mock("@/lib/cleaner/syncCleanerStatus", () => ({
  syncCleanerBusyFromBookings: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/admin/triggerAssignmentEarningsSnapshot", () => ({
  triggerAssignmentEarningsSnapshotForBooking: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/dispatch/notifyCleanerAssigned", () => ({
  notifyCleanerAssignedBooking: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/dispatch/offerNotifications", () => ({
  notifyCleanerOfDispatchOffer: vi.fn().mockResolvedValue(undefined),
  notifyCleanerOfferDeclined: vi.fn().mockResolvedValue(undefined),
  notifyCleanerDispatchOfferLostRaceSms: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/ai-autonomy/learningLoop", () => ({
  learnFromCleanerAcceptance: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/dispatch/dispatchMetricContext", () => ({
  compactDispatchMetricTags: () => ({}),
  firstOfferMetricAnchorIso: () => null,
  loadDispatchMetricSegmentation: vi.fn().mockResolvedValue({
    assignment_type: null,
    fallback_reason: null,
    attempt_number: null,
    location: null,
  }),
}));
vi.mock("@/lib/marketplace-intelligence/marketplaceBookingMeta", () => ({
  marketplaceBookingPatchOnAssign: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/dispatch/assignmentTruth", () => ({
  assignmentTruthPatchForOfferAccept: vi.fn().mockReturnValue({}),
}));
vi.mock("@/lib/cleaner/cleanerOfferUxVariant", () => ({
  assignCleanerUxVariantForCleaner: vi.fn().mockReturnValue(null),
  sanitizeCleanerUxVariant: (v: unknown) => (typeof v === "string" ? v : null),
}));
vi.mock("@/lib/metrics/counters", () => ({
  metrics: { increment: vi.fn() },
}));
// `maybeRedispatchPendingBookingIfOffersExhausted` is invoked from the reject
// path; harmless on accept, but mocked here for symmetry across the suite.
vi.mock("@/lib/dispatch/redispatchAfterOfferReject", () => ({
  maybeRedispatchPendingBookingIfOffersExhausted: vi.fn().mockResolvedValue(undefined),
}));

import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { acceptDispatchOffer } from "@/lib/dispatch/dispatchOffers";

const reportMock = vi.mocked(reportOperationalIssue);

const OFFER_ID = "11111111-1111-4111-8111-111111111111";
const BOOKING_ID = "22222222-2222-4222-8222-222222222222";
const CLEANER_ID = "33333333-3333-4333-8333-333333333333";

const futureIso = new Date(Date.now() + 5 * 60_000).toISOString();
const pastCreatedAt = new Date(Date.now() - 10_000).toISOString();

type AnyRecord = Record<string, unknown>;

/**
 * Stateful Supabase mock for `acceptDispatchOffer`. Drives the function all
 * the way to the M-16 dispatch_metrics block; the count and insert outcomes
 * are controlled per-test via `metricsCountError` and `metricsInsertError`.
 *
 * `metricsInsertThrows` causes the `dispatch_metrics.insert(...)` call itself
 * to throw synchronously, exercising the catch-block escalation.
 */
function buildMock(opts: {
  metricsCountError?: { message: string } | null;
  metricsInsertError?: { message: string } | null;
  metricsInsertThrows?: boolean;
}): { client: SupabaseClient; metricsInsertCalls: AnyRecord[] } {
  const metricsInsertCalls: AnyRecord[] = [];

  const offerRow: AnyRecord = {
    id: OFFER_ID,
    booking_id: BOOKING_ID,
    cleaner_id: CLEANER_ID,
    status: "pending",
    created_at: pastCreatedAt,
    ux_variant: null,
    expires_at: futureIso,
    whatsapp_sent_at: null,
    sms_sent_at: null,
    dispatch_tier: null,
    dispatch_visible_at: null,
  };

  const bookingRow: AnyRecord = {
    date: "2026-06-01",
    time: "10:00",
    location_id: null,
    city_id: null,
    assignment_type: "auto_dispatch",
    selected_cleaner_id: null,
  };

  // Track which `dispatch_offers` SELECT this is — there are TWO count queries
  // and one initial maybeSingle. Both count queries hit the same builder, so
  // we count to disambiguate which is the dispatch_metrics-feeding one.
  let dispatchOffersCountIdx = 0;

  function dispatchOffersBuilder() {
    return {
      select: (cols?: string, options?: { count?: string; head?: boolean }) => {
        // Count-only query (used by both kpi.offers_per_booking and the
        // dispatch_metrics prerequisite). Both probes return the same value
        // by default; the second one is the dispatch_metrics gate.
        if (options?.head === true && options?.count === "exact") {
          return {
            eq: () => {
              dispatchOffersCountIdx += 1;
              const isMetricsProbe = dispatchOffersCountIdx >= 2;
              if (isMetricsProbe && opts.metricsCountError) {
                return Promise.resolve({ count: null, data: null, error: opts.metricsCountError });
              }
              return Promise.resolve({ count: 3, data: null, error: null });
            },
          };
        }
        // Initial offer lookup (maybeSingle).
        return {
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: offerRow, error: null }),
          }),
        };
      },
      update: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      }),
    };
  }

  function bookingsBuilder() {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: bookingRow, error: null }),
        }),
      }),
    };
  }

  function dispatchMetricsBuilder() {
    return {
      insert: (payload: AnyRecord) => {
        if (opts.metricsInsertThrows) {
          throw new Error("simulated dispatch_metrics insert exception");
        }
        metricsInsertCalls.push(payload);
        return Promise.resolve({ data: null, error: opts.metricsInsertError ?? null });
      },
    };
  }

  // Fully chainable empty proxy for any other table touched downstream
  // (system_logs writes from the mocked logger don't reach the real client,
  // but the auto-chain catches any stray `.from('whatever').select(...)`).
  function emptyChain(thenValue: unknown = { data: null, error: null }): AnyRecord {
    const target = (() => undefined) as unknown as AnyRecord;
    const handler: ProxyHandler<AnyRecord> = {
      get(_t, prop: string | symbol) {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve(thenValue);
        if (prop === Symbol.toPrimitive || prop === "toJSON") return undefined;
        return () => emptyChain(thenValue);
      },
      apply: () => emptyChain(thenValue),
    };
    return new Proxy(target, handler);
  }

  const client = {
    from(table: string) {
      switch (table) {
        case "dispatch_offers":
          return dispatchOffersBuilder();
        case "bookings":
          return bookingsBuilder();
        case "dispatch_metrics":
          return dispatchMetricsBuilder();
        default:
          return emptyChain();
      }
    },
    rpc(name: string) {
      // The atomic accept must return ok:true so the function continues to
      // the metrics block. All other RPCs (`dispatch_cleaner_offer_accepted`,
      // `dispatch_record_offer_response`) succeed with no error.
      if (name === "accept_dispatch_offer_atomic") {
        return Promise.resolve({
          data: {
            ok: true,
            booking_id: BOOKING_ID,
            expired_peers: 0,
            failure: null,
            machine_reason: null,
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
  } as unknown as SupabaseClient;

  return { client, metricsInsertCalls };
}

beforeEach(() => {
  reportMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// 1. Behavioral: success path — no observability noise
// =============================================================================

describe("M-16 — successful dispatch_metrics insert is unchanged (no log noise)", () => {
  it("inserts the row and emits NO `reportOperationalIssue` for `dispatch_metrics_insert`", async () => {
    const { client, metricsInsertCalls } = buildMock({});
    const result = await acceptDispatchOffer({
      supabase: client,
      offerId: OFFER_ID,
      cleanerId: CLEANER_ID,
    });

    expect(result.ok).toBe(true);
    expect(metricsInsertCalls).toHaveLength(1);
    // The insert payload shape is preserved (M-16 is observability-only —
    // the row contents must not change).
    const payload = metricsInsertCalls[0]!;
    expect(payload.booking_id).toBe(BOOKING_ID);
    expect(payload.cleaner_id).toBe(CLEANER_ID);
    expect(typeof payload.time_to_accept_ms).toBe("number");
    expect(typeof payload.offers_sent).toBe("number");

    const dmCalls = reportMock.mock.calls.filter((c) => c[1] === "dispatch_metrics_insert");
    expect(dmCalls).toHaveLength(0);
  });
});

// =============================================================================
// 2. Behavioral: prerequisite count fails — escalates AND returns ok
// =============================================================================

describe("M-16 — prerequisite count failure escalates instead of silently skipping", () => {
  it("calls `reportOperationalIssue('warn', 'dispatch_metrics_insert', …)` and the dispatch still succeeds", async () => {
    const { client, metricsInsertCalls } = buildMock({
      metricsCountError: { message: "PG connection lost during count probe" },
    });
    const result = await acceptDispatchOffer({
      supabase: client,
      offerId: OFFER_ID,
      cleanerId: CLEANER_ID,
    });

    // Dispatch outcome: ALWAYS ok regardless of the metric outcome.
    expect(result.ok).toBe(true);
    // Insert is correctly skipped — we cannot derive `offers_sent` without the count.
    expect(metricsInsertCalls).toHaveLength(0);

    // Observability: previously silent, now escalated.
    const dmCalls = reportMock.mock.calls.filter((c) => c[1] === "dispatch_metrics_insert");
    expect(dmCalls.length).toBeGreaterThanOrEqual(1);
    const [level, source, message, ctx] = dmCalls[0]!;
    expect(level).toBe("warn");
    expect(source).toBe("dispatch_metrics_insert");
    expect(String(message).toLowerCase()).toContain("offers count");
    expect(String(message)).toContain("PG connection lost during count probe");
    expect(ctx).toMatchObject({
      bookingId: BOOKING_ID,
      cleanerId: CLEANER_ID,
      offerId: OFFER_ID,
    });
  });
});

// =============================================================================
// 3. Behavioral: insert returns DB error — escalates AND returns ok
// =============================================================================

describe("M-16 — `dispatch_metrics` insert PostgrestError escalates and never blocks dispatch", () => {
  it("logs `dispatch_metrics_insert` with the DB message and returns `{ ok: true }`", async () => {
    const { client, metricsInsertCalls } = buildMock({
      metricsInsertError: { message: "duplicate key value violates unique constraint" },
    });
    const result = await acceptDispatchOffer({
      supabase: client,
      offerId: OFFER_ID,
      cleanerId: CLEANER_ID,
    });

    expect(result.ok).toBe(true);
    // Insert was attempted (we drove it with a real payload), it just returned
    // an error — distinguishing this case from the count-failure case above.
    expect(metricsInsertCalls).toHaveLength(1);

    const dmCalls = reportMock.mock.calls.filter((c) => c[1] === "dispatch_metrics_insert");
    expect(dmCalls.length).toBeGreaterThanOrEqual(1);
    const [level, source, message, ctx] = dmCalls[0]!;
    expect(level).toBe("warn");
    expect(source).toBe(source); // narrow type
    expect(String(message)).toContain("insert failed");
    expect(String(message)).toContain("duplicate key value violates unique constraint");
    expect(ctx).toMatchObject({
      bookingId: BOOKING_ID,
      cleanerId: CLEANER_ID,
      offerId: OFFER_ID,
    });
  });
});

// =============================================================================
// 4. Behavioral: insert throws — caught + escalated, dispatch unblocked
// =============================================================================

describe("M-16 — thrown exceptions during the metrics block are caught and escalated", () => {
  it("catches a synchronous throw, escalates, and still returns `{ ok: true }`", async () => {
    const { client, metricsInsertCalls } = buildMock({ metricsInsertThrows: true });
    const result = await acceptDispatchOffer({
      supabase: client,
      offerId: OFFER_ID,
      cleanerId: CLEANER_ID,
    });

    // A throw must NEVER bubble out of `acceptDispatchOffer` — the M-16
    // contract is that observability never blocks dispatch success.
    expect(result.ok).toBe(true);
    expect(metricsInsertCalls).toHaveLength(0);

    const dmCalls = reportMock.mock.calls.filter((c) => c[1] === "dispatch_metrics_insert");
    expect(dmCalls.length).toBeGreaterThanOrEqual(1);
    const [level, source, message, ctx] = dmCalls[0]!;
    expect(level).toBe("warn");
    expect(source).toBe("dispatch_metrics_insert");
    expect(String(message)).toContain("threw");
    expect(String(message)).toContain("simulated dispatch_metrics insert exception");
    expect(ctx).toMatchObject({
      bookingId: BOOKING_ID,
      cleanerId: CLEANER_ID,
      offerId: OFFER_ID,
    });
  });
});

// =============================================================================
// 5. Static source contract — guards against silent regressions
// =============================================================================

describe("M-16 source-level contract: dispatch_metrics observability is preserved", () => {
  let src: string;

  beforeEach(async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    src = await fs.readFile(path.resolve(__dirname, "..", "dispatchOffers.ts"), "utf8");
  });

  it("imports `reportOperationalIssue` from the systemLog module", () => {
    expect(src).toMatch(/import\s*\{[^}]*\breportOperationalIssue\b[^}]*\}\s*from\s*["']@\/lib\/logging\/systemLog["']/);
  });

  it("the dispatch_metrics block escalates count-query failures (no silent `if (!scErr)` short-circuit)", () => {
    // The fix replaced the pre-M-16 `if (!scErr) { ... }` with `if (scErr)
    // { reportOperationalIssue(...) } else { insert(...) }`. We assert the
    // shape of the new structure so a future "simplification" back to the
    // silent form is caught by this test.
    const dispatchMetricsBlock = extractDispatchMetricsBlock(src);
    expect(dispatchMetricsBlock).toMatch(/if\s*\(\s*scErr\s*\)/);
    expect(dispatchMetricsBlock).toMatch(/reportOperationalIssue\s*\(\s*["']warn["']\s*,\s*["']dispatch_metrics_insert["']/);
  });

  it("the dispatch_metrics insert error path uses `reportOperationalIssue`", () => {
    const block = extractDispatchMetricsBlock(src);
    // dmErr branch must escalate.
    expect(block).toMatch(/dmErr/);
    const occurrences = (block.match(/reportOperationalIssue\s*\(/g) ?? []).length;
    // Three escalation points: scErr, dmErr, catch.
    expect(occurrences).toBeGreaterThanOrEqual(3);
  });

  it("the catch block escalates (no silent swallow) and includes offerId in context", () => {
    const block = extractDispatchMetricsBlock(src);
    expect(block).toMatch(/catch\s*\([^)]*\)\s*\{[\s\S]*?reportOperationalIssue/);
    // All three escalation points should carry `offerId` for traceability.
    expect(block).toMatch(/offerId:\s*params\.offerId/);
  });

  it("`acceptDispatchOffer` returns `{ ok: true }` AFTER the dispatch_metrics block", () => {
    // The metrics block must NOT sit between `return { ok: true }` and the
    // function's exit — it must be the LAST observability step before the
    // success return, so a thrown exception during instrumentation is
    // guaranteed to be caught before the return is reached.
    //
    // Use `lastIndexOf` for the success-return anchor because the M-16 fix's
    // comment block intentionally references "`return { ok: true }`" in
    // prose (documenting the contract); the real return is the LAST one.
    const acceptFn = extractAcceptDispatchOfferBody(src);
    const dispatchMetricsIdx = acceptFn.indexOf(`from("dispatch_metrics")`);
    const returnOkIdx = acceptFn.lastIndexOf("return { ok: true }");
    expect(dispatchMetricsIdx).toBeGreaterThan(0);
    expect(returnOkIdx).toBeGreaterThan(dispatchMetricsIdx);
  });

  it("does NOT use the legacy `logSystemEvent` for the dispatch_metrics_insert source", () => {
    // The pre-M-16 code used `logSystemEvent({ level: 'warn', source:
    // 'dispatch_metrics_insert', ... })` — replaced by `reportOperationalIssue`
    // for console + persist parity. Assert no `logSystemEvent` survives in
    // the dispatch_metrics block.
    const block = extractDispatchMetricsBlock(src);
    expect(block).not.toMatch(/logSystemEvent\s*\(/);
  });

  it("the dispatch_metrics insert payload column set is unchanged (no scope creep)", () => {
    // M-16 is observability-only. The insert must keep the same four columns
    // (`booking_id`, `cleaner_id`, `time_to_accept_ms`, `offers_sent`) it
    // wrote pre-M-16; adding columns here would expand the fix scope into
    // dispatch logic / payout territory.
    const block = extractDispatchMetricsBlock(src);
    expect(block).toMatch(/booking_id:\s*bookingId/);
    expect(block).toMatch(/cleaner_id:\s*params\.cleanerId/);
    expect(block).toMatch(/time_to_accept_ms:/);
    expect(block).toMatch(/offers_sent:/);
    // Sanity: no payout / payment columns sneaking into the metrics row.
    expect(block).not.toMatch(/payout|payment|amount|earnings/i);
  });
});

// -----------------------------------------------------------------------------
// Source extraction helpers
// -----------------------------------------------------------------------------

/** Return the body text of `acceptDispatchOffer`. The function signature
 *  contains `(params: { ... })`, so a naive `indexOf("{", start)` would land
 *  inside the params type object — we walk PARENS first to skip past the
 *  parameter list, then find the body's opening `{`. */
function extractAcceptDispatchOfferBody(src: string): string {
  const startMatch = src.match(/export\s+async\s+function\s+acceptDispatchOffer\s*\(/);
  if (!startMatch) throw new Error("acceptDispatchOffer not found in source");
  const start = startMatch.index!;
  // Walk parens to find the closing `)` of the parameter list.
  let i = start + startMatch[0].length;
  let parenDepth = 1;
  while (i < src.length && parenDepth > 0) {
    const c = src[i];
    if (c === "(") parenDepth += 1;
    else if (c === ")") parenDepth -= 1;
    i += 1;
  }
  if (parenDepth !== 0) throw new Error("acceptDispatchOffer parameter list not closed");
  // The next `{` after the closing `)` is the function body opener.
  const bodyOpen = src.indexOf("{", i);
  if (bodyOpen === -1) throw new Error("acceptDispatchOffer body opener not found");
  // Walk braces to find the matching close.
  let braceDepth = 1;
  let j = bodyOpen + 1;
  while (j < src.length && braceDepth > 0) {
    const c = src[j];
    if (c === "{") braceDepth += 1;
    else if (c === "}") braceDepth -= 1;
    j += 1;
  }
  if (braceDepth !== 0) throw new Error("acceptDispatchOffer body not closed");
  return src.slice(bodyOpen, j);
}

/** Slice from the dispatch_metrics try-block through the function's
 *  `return { ok: true }`. Lets the contract tests assert on JUST the
 *  observability block without false positives elsewhere in the function. */
function extractDispatchMetricsBlock(src: string): string {
  const fn = extractAcceptDispatchOfferBody(src);
  // Anchor on a structural marker — the `try { const { count: sentCount, ...`
  // line that opens the dispatch_metrics block. This pattern is short and
  // will only match here.
  const start = fn.search(/try\s*\{\s*const\s*\{\s*count:\s*sentCount/);
  if (start === -1) throw new Error("dispatch_metrics block start not found");
  // End at `return { ok: true }` — the immediate post-block return.
  const returnIdx = fn.indexOf("return { ok: true }", start);
  if (returnIdx === -1) throw new Error("return { ok: true } not found after metrics block");
  return fn.slice(start, returnIdx);
}
