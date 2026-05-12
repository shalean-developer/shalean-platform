import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/metrics/counters", () => ({
  metrics: { increment: vi.fn() },
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/admin/runAdminAssignSmart", () => ({
  runAdminAssignSmart: vi.fn(),
}));

vi.mock("@/lib/marketplace-intelligence/assignBestCleaner", () => ({
  assignBestCleaner: vi.fn(),
}));

vi.mock("@/lib/dispatch/notifyCleanerAssigned", () => ({
  notifyCleanerAssignedBooking: vi.fn().mockResolvedValue(undefined),
}));

import {
  dispatchFallbackAfterSelectedCleanerOfferInsertFailure,
  SELECTED_CLEANER_OFFER_INSERT_FAILED_REASON,
} from "@/lib/booking/checkoutDispatchOfferFailureFallback";
import { metrics } from "@/lib/metrics/counters";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { runAdminAssignSmart } from "@/lib/admin/runAdminAssignSmart";
import { assignBestCleaner } from "@/lib/marketplace-intelligence/assignBestCleaner";
import { notifyCleanerAssignedBooking } from "@/lib/dispatch/notifyCleanerAssigned";

/**
 * Production Readiness Audit H-7.
 *
 * `upsertBookingFromPaystack` previously stranded paid customers when
 * the selected-cleaner `dispatch_offers` insert failed: only ops were
 * notified and no auto-dispatch fallback ran.
 *
 * This file owns the regression contract for the new helper
 * `dispatchFallbackAfterSelectedCleanerOfferInsertFailure` plus a
 * content-guard that the upsert wires it into the failure branch only.
 *
 * Tests below cover:
 *   1. recovery via `assignBestCleaner` (auto-dispatch enabled)
 *   2. notification + fallback_reason stamp + recovery metric/log
 *   3. fallback to `runAdminAssignSmart` when auto-dispatch returns
 *      not-ok and `CHECKOUT_ADMIN_OFFER_ASSIGN_FALLBACK=true`
 *   4. AUTO_DISPATCH_CLEANERS=false skips assignBestCleaner entirely
 *      and only runs admin smart fallback when explicitly enabled
 *   5. unrecovered branch: `*_unrecovered` log + un-recovered metric
 *      AND no notification, no fallback_reason write
 *   6. fallback_reason update is gated by `.is("fallback_reason", null)`
 *   7. helper does NOT throw when assignBestCleaner throws
 *   8. content-guard: `upsertBookingFromPaystack.ts` calls the helper
 *      ONLY in the offer-insert failure branch (offer-success path
 *      unchanged)
 *   9. team-assignment recovery captures team id, no notification
 */

type CapturedUpdate = { payload: Record<string, unknown>; isFilters: Array<{ col: string; val: unknown }> };

function buildSupabase(): {
  supabase: SupabaseClient;
  state: {
    updates: CapturedUpdate[];
    nextUpdateError?: { message: string } | null;
  };
} {
  const state: { updates: CapturedUpdate[]; nextUpdateError?: { message: string } | null } = {
    updates: [],
    nextUpdateError: null,
  };
  const supabase = {
    from(table: string) {
      if (table !== "bookings") throw new Error(`unexpected table ${table}`);
      return {
        update(payload: Record<string, unknown>) {
          const captured: CapturedUpdate = { payload, isFilters: [] };
          state.updates.push(captured);
          const chain = {
            eq() {
              return chain;
            },
            is(col: string, val: unknown) {
              captured.isFilters.push({ col, val });
              return Promise.resolve({ error: state.nextUpdateError ?? null });
            },
          };
          return chain;
        },
      };
    },
  } as unknown as SupabaseClient;
  return { supabase, state };
}

const BOOKING = "00000000-0000-4000-8000-000000000001";
const FAILED_CLEANER = "00000000-0000-4000-8000-0000000000bb";
const RECOVERED_CLEANER = "00000000-0000-4000-8000-0000000000cc";
const REC_TEAM = "00000000-0000-4000-8000-0000000000dd";
const REF = "ref_h7";

const assignBestCleanerMock = vi.mocked(assignBestCleaner);
const runAdminAssignSmartMock = vi.mocked(runAdminAssignSmart);
const notifyMock = vi.mocked(notifyCleanerAssignedBooking);
const metricsIncrementMock = vi.mocked(metrics.increment);
const logSystemEventMock = vi.mocked(logSystemEvent);
const reportOperationalIssueMock = vi.mocked(reportOperationalIssue);

describe("dispatchFallbackAfterSelectedCleanerOfferInsertFailure (H-7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("AUTO_DISPATCH_CLEANERS", "");
    vi.stubEnv("CHECKOUT_ADMIN_OFFER_ASSIGN_FALLBACK", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("recovers via assignBestCleaner: stamps fallback_reason, notifies, emits recovered metric+log", async () => {
    assignBestCleanerMock.mockResolvedValue({
      ok: true,
      assignmentKind: "individual",
      cleanerId: RECOVERED_CLEANER,
    } as unknown as Awaited<ReturnType<typeof assignBestCleaner>>);
    const { supabase, state } = buildSupabase();
    const res = await dispatchFallbackAfterSelectedCleanerOfferInsertFailure({
      supabase,
      bookingId: BOOKING,
      paystackReference: REF,
      failedSelectedCleanerId: FAILED_CLEANER,
    });

    expect(res.recovered).toBe(true);
    if (res.recovered) {
      expect(res.recoveryKind).toBe("auto_dispatch");
      expect(res.cleanerId).toBe(RECOVERED_CLEANER);
    }
    expect(assignBestCleanerMock).toHaveBeenCalledTimes(1);
    expect(runAdminAssignSmartMock).not.toHaveBeenCalled();
    expect(notifyMock).toHaveBeenCalledWith(supabase, BOOKING, RECOVERED_CLEANER);

    const reasonUpdate = state.updates.find((u) => u.payload.fallback_reason);
    expect(reasonUpdate).toBeDefined();
    expect(reasonUpdate!.payload.fallback_reason).toBe(SELECTED_CLEANER_OFFER_INSERT_FAILED_REASON);
    expect(reasonUpdate!.isFilters).toEqual([{ col: "fallback_reason", val: null }]);

    expect(metricsIncrementMock).toHaveBeenCalledWith(
      "booking.checkout_assignment",
      expect.objectContaining({
        assignment_type: "auto_fallback",
        bookingId: BOOKING,
        selected_cleaner_id: FAILED_CLEANER,
        assigned_cleaner_id: RECOVERED_CLEANER,
        fallback_reason: SELECTED_CLEANER_OFFER_INSERT_FAILED_REASON,
        phase: "offer_insert_failed_recovered",
        recovery_kind: "auto_dispatch",
      }),
    );
    expect(logSystemEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ source: "checkout_offer_insert_fallback_recovered" }),
    );
  });

  it("excludes the failed cleaner from the smart re-attempt (no immediate retry of broken pick)", async () => {
    assignBestCleanerMock.mockResolvedValue({
      ok: true,
      assignmentKind: "individual",
      cleanerId: RECOVERED_CLEANER,
    } as unknown as Awaited<ReturnType<typeof assignBestCleaner>>);
    const { supabase } = buildSupabase();
    await dispatchFallbackAfterSelectedCleanerOfferInsertFailure({
      supabase,
      bookingId: BOOKING,
      paystackReference: REF,
      failedSelectedCleanerId: FAILED_CLEANER,
    });
    const call = assignBestCleanerMock.mock.calls[0]!;
    expect(call[1]).toBe(BOOKING);
    expect(call[2]).toMatchObject({
      source: "paystack_checkout_offer_failure_fallback",
      smartAssign: { excludeCleanerIds: [FAILED_CLEANER] },
    });
  });

  it("falls back to runAdminAssignSmart when assignBestCleaner returns not-ok and CHECKOUT_ADMIN_OFFER_ASSIGN_FALLBACK=true", async () => {
    vi.stubEnv("CHECKOUT_ADMIN_OFFER_ASSIGN_FALLBACK", "true");
    assignBestCleanerMock.mockResolvedValue({ ok: false, error: "no_candidate", message: "x" } as unknown as Awaited<
      ReturnType<typeof assignBestCleaner>
    >);
    runAdminAssignSmartMock.mockResolvedValue({ ok: true, cleanerId: RECOVERED_CLEANER } as unknown as Awaited<
      ReturnType<typeof runAdminAssignSmart>
    >);
    const { supabase } = buildSupabase();
    const res = await dispatchFallbackAfterSelectedCleanerOfferInsertFailure({
      supabase,
      bookingId: BOOKING,
      paystackReference: REF,
      failedSelectedCleanerId: FAILED_CLEANER,
    });
    expect(res.recovered).toBe(true);
    if (res.recovered) {
      expect(res.recoveryKind).toBe("admin_smart_fallback");
      expect(res.cleanerId).toBe(RECOVERED_CLEANER);
    }
    expect(runAdminAssignSmartMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(supabase, BOOKING, RECOVERED_CLEANER);
  });

  it("AUTO_DISPATCH_CLEANERS=false skips assignBestCleaner; only smart admin fallback runs when enabled", async () => {
    vi.stubEnv("AUTO_DISPATCH_CLEANERS", "false");
    vi.stubEnv("CHECKOUT_ADMIN_OFFER_ASSIGN_FALLBACK", "true");
    runAdminAssignSmartMock.mockResolvedValue({ ok: true, cleanerId: RECOVERED_CLEANER } as unknown as Awaited<
      ReturnType<typeof runAdminAssignSmart>
    >);
    const { supabase } = buildSupabase();
    const res = await dispatchFallbackAfterSelectedCleanerOfferInsertFailure({
      supabase,
      bookingId: BOOKING,
      paystackReference: REF,
      failedSelectedCleanerId: FAILED_CLEANER,
    });
    expect(res.recovered).toBe(true);
    expect(assignBestCleanerMock).not.toHaveBeenCalled();
    expect(runAdminAssignSmartMock).toHaveBeenCalledTimes(1);
  });

  it("AUTO_DISPATCH_CLEANERS=false AND CHECKOUT_ADMIN_OFFER_ASSIGN_FALLBACK=false: nothing runs, unrecovered logged", async () => {
    vi.stubEnv("AUTO_DISPATCH_CLEANERS", "false");
    vi.stubEnv("CHECKOUT_ADMIN_OFFER_ASSIGN_FALLBACK", "false");
    const { supabase, state } = buildSupabase();
    const res = await dispatchFallbackAfterSelectedCleanerOfferInsertFailure({
      supabase,
      bookingId: BOOKING,
      paystackReference: REF,
      failedSelectedCleanerId: FAILED_CLEANER,
    });
    expect(res.recovered).toBe(false);
    expect(assignBestCleanerMock).not.toHaveBeenCalled();
    expect(runAdminAssignSmartMock).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
    expect(state.updates).toHaveLength(0);
    expect(metricsIncrementMock).toHaveBeenCalledWith(
      "booking.checkout_assignment",
      expect.objectContaining({
        phase: "offer_insert_failed_unrecovered",
        fallback_reason: SELECTED_CLEANER_OFFER_INSERT_FAILED_REASON,
      }),
    );
    expect(logSystemEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ source: "checkout_offer_insert_fallback_unrecovered", level: "warn" }),
    );
  });

  it("does not stamp fallback_reason or notify when neither dispatcher recovers", async () => {
    vi.stubEnv("CHECKOUT_ADMIN_OFFER_ASSIGN_FALLBACK", "true");
    assignBestCleanerMock.mockResolvedValue({ ok: false, error: "no_candidate", message: "x" } as unknown as Awaited<
      ReturnType<typeof assignBestCleaner>
    >);
    runAdminAssignSmartMock.mockResolvedValue({ ok: false, error: "no_candidate", attempts: 3 } as unknown as Awaited<
      ReturnType<typeof runAdminAssignSmart>
    >);
    const { supabase, state } = buildSupabase();
    const res = await dispatchFallbackAfterSelectedCleanerOfferInsertFailure({
      supabase,
      bookingId: BOOKING,
      paystackReference: REF,
      failedSelectedCleanerId: FAILED_CLEANER,
    });
    expect(res.recovered).toBe(false);
    expect(notifyMock).not.toHaveBeenCalled();
    expect(state.updates).toHaveLength(0);
  });

  it("does not throw when assignBestCleaner throws — reports operational issue and returns unrecovered", async () => {
    assignBestCleanerMock.mockRejectedValue(new Error("network down"));
    const { supabase } = buildSupabase();
    const res = await dispatchFallbackAfterSelectedCleanerOfferInsertFailure({
      supabase,
      bookingId: BOOKING,
      paystackReference: REF,
      failedSelectedCleanerId: FAILED_CLEANER,
    });
    expect(res.recovered).toBe(false);
    expect(reportOperationalIssueMock).toHaveBeenCalledWith(
      "warn",
      "checkoutDispatchOfferFailureFallback",
      expect.stringContaining("network down"),
      expect.objectContaining({ bookingId: BOOKING }),
    );
  });

  it("auto-dispatch noOp (already-assigned booking) is treated as not-fresh and does not notify", async () => {
    assignBestCleanerMock.mockResolvedValue({
      ok: true,
      noOp: true,
      assignmentKind: "individual",
      cleanerId: RECOVERED_CLEANER,
    } as unknown as Awaited<ReturnType<typeof assignBestCleaner>>);
    const { supabase, state } = buildSupabase();
    const res = await dispatchFallbackAfterSelectedCleanerOfferInsertFailure({
      supabase,
      bookingId: BOOKING,
      paystackReference: REF,
      failedSelectedCleanerId: FAILED_CLEANER,
    });
    expect(res.recovered).toBe(false);
    expect(notifyMock).not.toHaveBeenCalled();
    expect(state.updates).toHaveLength(0);
  });

  it("team assignment recovery: captures teamId, does NOT notify (team notification owned elsewhere)", async () => {
    assignBestCleanerMock.mockResolvedValue({
      ok: true,
      assignmentKind: "team",
      teamId: REC_TEAM,
    } as unknown as Awaited<ReturnType<typeof assignBestCleaner>>);
    const { supabase } = buildSupabase();
    const res = await dispatchFallbackAfterSelectedCleanerOfferInsertFailure({
      supabase,
      bookingId: BOOKING,
      paystackReference: REF,
      failedSelectedCleanerId: FAILED_CLEANER,
    });
    expect(res.recovered).toBe(true);
    if (res.recovered) {
      expect(res.recoveryKind).toBe("auto_dispatch");
      expect(res.cleanerId).toBeNull();
      expect(res.teamId).toBe(REC_TEAM);
    }
    expect(notifyMock).not.toHaveBeenCalled();
    expect(metricsIncrementMock).toHaveBeenCalledWith(
      "booking.checkout_assignment",
      expect.objectContaining({ assigned_team_id: REC_TEAM, assigned_cleaner_id: null }),
    );
  });

  it("fallback_reason update uses .is('fallback_reason', null) to never overwrite existing reasons", async () => {
    assignBestCleanerMock.mockResolvedValue({
      ok: true,
      assignmentKind: "individual",
      cleanerId: RECOVERED_CLEANER,
    } as unknown as Awaited<ReturnType<typeof assignBestCleaner>>);
    const { supabase, state } = buildSupabase();
    await dispatchFallbackAfterSelectedCleanerOfferInsertFailure({
      supabase,
      bookingId: BOOKING,
      paystackReference: REF,
      failedSelectedCleanerId: FAILED_CLEANER,
    });
    const upd = state.updates[0]!;
    expect(upd.payload).toEqual({ fallback_reason: SELECTED_CLEANER_OFFER_INSERT_FAILED_REASON });
    expect(upd.isFilters).toEqual([{ col: "fallback_reason", val: null }]);
  });

  it("reports a warn ops issue if the fallback_reason stamp itself errors out, but still returns recovered", async () => {
    assignBestCleanerMock.mockResolvedValue({
      ok: true,
      assignmentKind: "individual",
      cleanerId: RECOVERED_CLEANER,
    } as unknown as Awaited<ReturnType<typeof assignBestCleaner>>);
    const { supabase, state } = buildSupabase();
    state.nextUpdateError = { message: "23514 conflict" };
    const res = await dispatchFallbackAfterSelectedCleanerOfferInsertFailure({
      supabase,
      bookingId: BOOKING,
      paystackReference: REF,
      failedSelectedCleanerId: FAILED_CLEANER,
    });
    expect(res.recovered).toBe(true);
    expect(reportOperationalIssueMock).toHaveBeenCalledWith(
      "warn",
      "checkoutDispatchOfferFailureFallback",
      expect.stringContaining("fallback_reason stamp failed"),
      expect.any(Object),
    );
  });
});

/**
 * Content-guard: `upsertBookingFromPaystack.ts` must invoke the new
 * fallback helper ONLY in the offer-insert failure branch — never on
 * the offer-success path. This prevents a future refactor from
 * accidentally creating duplicate offers / double-assigning cleaners
 * when the customer-selected offer already succeeded.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filenameContent = fileURLToPath(import.meta.url);
const __dirnameContent = path.dirname(__filenameContent);
const upsertSrc = readFileSync(
  path.resolve(__dirnameContent, "../upsertBookingFromPaystack.ts"),
  "utf8",
);

describe("H-7 wiring — upsertBookingFromPaystack content guard", () => {
  it("imports the fallback helper", () => {
    expect(upsertSrc).toMatch(
      /import\s*\{\s*dispatchFallbackAfterSelectedCleanerOfferInsertFailure\s*\}\s*from\s*"@\/lib\/booking\/checkoutDispatchOfferFailureFallback"/,
    );
  });

  it("calls the fallback helper exactly once in the source", () => {
    const calls = upsertSrc.match(/dispatchFallbackAfterSelectedCleanerOfferInsertFailure\s*\(/g) ?? [];
    expect(calls).toHaveLength(1);
  });

  it("calls the fallback helper AFTER the existing offer-failure escalation (failure branch only)", () => {
    const escalateIdx = upsertSrc.indexOf("escalateFailedCheckoutDispatchOffer({");
    const fallbackIdx = upsertSrc.indexOf("dispatchFallbackAfterSelectedCleanerOfferInsertFailure({");
    expect(escalateIdx).toBeGreaterThan(0);
    expect(fallbackIdx).toBeGreaterThan(escalateIdx);
  });

  it("offer-success branch (offerRes.ok) still increments user_selected metric and does NOT call the fallback", () => {
    /*
     * Sanity-check the order:
     *   ...if (offerRes.ok) { metrics.increment(... "user_selected" ...); }
     *   else { escalate(...); fallback(...); }
     * The fallback identifier must appear strictly AFTER the
     * "user_selected" success metric block — proving it lives only in
     * the else branch.
     */
    const successMetricIdx = upsertSrc.indexOf('assignment_type: "user_selected"');
    const fallbackIdx = upsertSrc.indexOf("dispatchFallbackAfterSelectedCleanerOfferInsertFailure({");
    expect(successMetricIdx).toBeGreaterThan(0);
    expect(fallbackIdx).toBeGreaterThan(successMetricIdx);
  });

  it("does not modify payment finalization control flow (no payment_status / amount_paid_cents writes touched)", () => {
    /*
     * Light guard: the helper file itself must never write financial
     * columns. This freezes the H-7 isolation invariant. We strip
     * comments first so doc comments that legitimately describe what
     * the helper does NOT do (e.g. "does not touch refund logic")
     * don't trip the guard.
     */
    const rawHelperSrc = readFileSync(
      path.resolve(__dirnameContent, "../checkoutDispatchOfferFailureFallback.ts"),
      "utf8",
    );
    const helperCode = rawHelperSrc
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    expect(helperCode).not.toMatch(/payment_status\s*[:=]/);
    expect(helperCode).not.toMatch(/amount_paid_cents\s*[:=]/);
    expect(helperCode).not.toMatch(/cleaner_payout_cents\s*[:=]/);
    expect(helperCode).not.toMatch(/total_paid_cents\s*[:=]/);
    expect(helperCode).not.toMatch(/\brefund(s|ed|_)?\b/i);
    /*
     * Sanity: comment-stripping didn't accidentally remove the actual
     * fallback_reason write — without this, the previous nots could
     * pass against an empty string.
     */
    expect(helperCode).toMatch(/fallback_reason:\s*SELECTED_CLEANER_OFFER_INSERT_FAILED_REASON/);
  });
});
