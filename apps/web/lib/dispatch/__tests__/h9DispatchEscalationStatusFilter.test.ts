import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/dispatch/ensureBookingAssignment", () => ({
  ensureBookingAssignment: vi.fn(),
}));
vi.mock("@/lib/dispatch/dispatchEscalation", () => ({
  notifyDispatchEscalationAdmin: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/metrics/counters", () => ({
  metrics: { increment: vi.fn() },
}));

import {
  enqueueStrandedBookings,
  processDispatchRetryQueue,
} from "@/lib/dispatch/dispatchRetryQueue";
import { ensureBookingAssignment } from "@/lib/dispatch/ensureBookingAssignment";

const ensureMock = vi.mocked(ensureBookingAssignment);

/**
 * Recorder builder that captures every fluent operation against a single table call so the test can
 * assert which status filter the production code used (the H-9 surface). Each builder is thenable
 * via `.then(...)` (when awaited as a promise) AND callable via `.maybeSingle()`.
 */
type RecordedCall = {
  op: "select" | "insert" | "update" | "eq" | "in" | "is" | "lte" | "lt" | "gte" | "not" | "order" | "limit" | "maybeSingle";
  args: unknown[];
};

type TerminalResult = { data: unknown; count?: number; error: null | { message: string } };

class TableRecorder {
  calls: RecordedCall[] = [];
  result: TerminalResult = { data: null, count: 0, error: null };
  insertResult: { error: null | { message: string } } = { error: null };
  updateResolves: Array<{ data: unknown; error: null | { message: string } }> = [];
  selectResolves: Array<TerminalResult> = [];

  record(op: RecordedCall["op"], ...args: unknown[]): this {
    this.calls.push({ op, args });
    return this;
  }
}

function makeBuilder(rec: TableRecorder): unknown {
  // proxy that records every method call and returns itself, plus a `then` that resolves the
  // current result so `await` on the builder works (for terminal updates without `.select()`).
  const target: Record<string, unknown> = {
    insert(...args: unknown[]) {
      rec.record("insert", ...args);
      return Promise.resolve(rec.insertResult);
    },
    select(...args: unknown[]) {
      rec.record("select", ...args);
      // when the call is purely `.select(..., { count: 'exact', head: true })` the next await must
      // resolve to a count payload — the chain captures further `.eq/.in/...` first, then await.
      return makeBuilder(rec);
    },
    update(...args: unknown[]) {
      rec.record("update", ...args);
      return makeBuilder(rec);
    },
    delete() {
      rec.record("update", { __delete: true });
      return makeBuilder(rec);
    },
    eq(...args: unknown[]) {
      rec.record("eq", ...args);
      return makeBuilder(rec);
    },
    in(...args: unknown[]) {
      rec.record("in", ...args);
      return makeBuilder(rec);
    },
    is(...args: unknown[]) {
      rec.record("is", ...args);
      return makeBuilder(rec);
    },
    lte(...args: unknown[]) {
      rec.record("lte", ...args);
      return makeBuilder(rec);
    },
    lt(...args: unknown[]) {
      rec.record("lt", ...args);
      return makeBuilder(rec);
    },
    gte(...args: unknown[]) {
      rec.record("gte", ...args);
      return makeBuilder(rec);
    },
    not(...args: unknown[]) {
      rec.record("not", ...args);
      return makeBuilder(rec);
    },
    order(...args: unknown[]) {
      rec.record("order", ...args);
      return makeBuilder(rec);
    },
    limit(...args: unknown[]) {
      rec.record("limit", ...args);
      return makeBuilder(rec);
    },
    maybeSingle() {
      rec.record("maybeSingle");
      return Promise.resolve(rec.result);
    },
    then(resolve: (v: unknown) => unknown) {
      return Promise.resolve(rec.result).then(resolve);
    },
  };
  return target;
}

function makeSupabaseRecorder(setup: (tables: Record<string, TableRecorder>) => void) {
  const tables: Record<string, TableRecorder> = {};
  const get = (name: string) => {
    if (!tables[name]) tables[name] = new TableRecorder();
    return tables[name];
  };
  setup(new Proxy(tables, { get: (_, key: string) => get(key) }));
  const supabase = {
    from: vi.fn((name: string) => makeBuilder(get(name))),
  } as unknown as SupabaseClient;
  return { supabase, tables };
}

const PENDING_FILTER = ["pending", "pending_assignment"];

describe("H-9: dispatch escalation status filter widens to include pending_assignment", () => {
  beforeEach(() => {
    ensureMock.mockReset();
  });

  it("processDispatchRetryQueue: terminal `unassignable` mark filters by [pending, pending_assignment]", async () => {
    ensureMock.mockResolvedValueOnce({ ok: false, error: "db_error", message: "boom" } as never);

    const bookingId = "00000000-0000-4000-8000-000000000a01";
    const queueId = "10000000-0000-4000-8000-000000000a01";

    const { supabase, tables } = makeSupabaseRecorder((t) => {
      t.dispatch_retry_queue.result = {
        data: [{ id: queueId, booking_id: bookingId, retries_done: 4, last_reason: null }],
        error: null,
      };
    });

    await processDispatchRetryQueue(supabase);

    const bookingsCalls = tables.bookings.calls;
    const updateIdx = bookingsCalls.findIndex((c) => c.op === "update");
    expect(updateIdx).toBeGreaterThanOrEqual(0);
    expect(bookingsCalls[updateIdx]?.args[0]).toEqual({ dispatch_status: "unassignable" });

    const tail = bookingsCalls.slice(updateIdx);
    const inCall = tail.find((c) => c.op === "in" && c.args[0] === "status");
    expect(inCall, "terminal escalation must filter status using IN(...)").toBeDefined();
    expect(inCall?.args[1]).toEqual(PENDING_FILTER);

    const eqStatus = tail.find((c) => c.op === "eq" && c.args[0] === "status");
    expect(eqStatus, "must NOT use the legacy .eq('status','pending') filter").toBeUndefined();

    const isCleaner = tail.find((c) => c.op === "is" && c.args[0] === "cleaner_id");
    expect(isCleaner?.args[1]).toBeNull();
  });

  it("processDispatchRetryQueue: `no_candidate` exhaustion uses `no_cleaner` terminal status with the same widened filter", async () => {
    ensureMock.mockResolvedValueOnce({ ok: false, error: "no_candidate", message: "no_one" } as never);

    const bookingId = "00000000-0000-4000-8000-000000000b02";
    const queueId = "10000000-0000-4000-8000-000000000b02";

    const { supabase, tables } = makeSupabaseRecorder((t) => {
      t.dispatch_retry_queue.result = {
        data: [{ id: queueId, booking_id: bookingId, retries_done: 4, last_reason: null }],
        error: null,
      };
    });

    await processDispatchRetryQueue(supabase);

    const bookingsCalls = tables.bookings.calls;
    const updateIdx = bookingsCalls.findIndex((c) => c.op === "update");
    expect(bookingsCalls[updateIdx]?.args[0]).toEqual({ dispatch_status: "no_cleaner" });

    const inCall = bookingsCalls.slice(updateIdx).find((c) => c.op === "in" && c.args[0] === "status");
    expect(inCall?.args[1]).toEqual(PENDING_FILTER);
  });

  it("processDispatchRetryQueue: successful assignment does NOT touch bookings.status filter (no terminal mark)", async () => {
    ensureMock.mockResolvedValueOnce({
      ok: true,
      assignmentKind: "individual",
      cleanerId: "00000000-0000-4000-8000-0000000000aa",
    } as never);

    const queueId = "10000000-0000-4000-8000-000000000c03";
    const { supabase, tables } = makeSupabaseRecorder((t) => {
      t.dispatch_retry_queue.result = {
        data: [
          {
            id: queueId,
            booking_id: "00000000-0000-4000-8000-000000000c03",
            retries_done: 0,
            last_reason: null,
          },
        ],
        error: null,
      };
    });

    await processDispatchRetryQueue(supabase);

    const bookingsCalls = tables.bookings?.calls ?? [];
    expect(
      bookingsCalls.find(
        (c) => c.op === "update" && (c.args[0] as Record<string, unknown>)?.dispatch_status,
      ),
      "successful assignment must not write any terminal dispatch_status",
    ).toBeUndefined();
  });

  it("processDispatchRetryQueue: retries that are NOT yet exhausted (retries_done < 4) do not terminal-mark", async () => {
    ensureMock.mockResolvedValueOnce({ ok: false, error: "db_error", message: "transient" } as never);

    const queueId = "10000000-0000-4000-8000-000000000d04";
    const { supabase, tables } = makeSupabaseRecorder((t) => {
      t.dispatch_retry_queue.result = {
        data: [
          {
            id: queueId,
            booking_id: "00000000-0000-4000-8000-000000000d04",
            retries_done: 1,
            last_reason: null,
          },
        ],
        error: null,
      };
    });

    await processDispatchRetryQueue(supabase);

    const bookingsCalls = tables.bookings?.calls ?? [];
    expect(
      bookingsCalls.find(
        (c) => c.op === "update" && (c.args[0] as Record<string, unknown>)?.dispatch_status,
      ),
      "non-exhausted retry must reschedule, not terminal-mark",
    ).toBeUndefined();
  });

  it("enqueueStrandedBookings: candidate scan filters bookings.status by IN(['pending','pending_assignment'])", async () => {
    const { supabase, tables } = makeSupabaseRecorder((t) => {
      t.bookings.result = { data: [], error: null };
    });

    await enqueueStrandedBookings(supabase);

    const calls = tables.bookings.calls;
    const inStatus = calls.find((c) => c.op === "in" && c.args[0] === "status");
    expect(inStatus, "stranded scan must IN-filter status").toBeDefined();
    expect(inStatus?.args[1]).toEqual(PENDING_FILTER);

    const eqStatus = calls.find((c) => c.op === "eq" && c.args[0] === "status");
    expect(eqStatus, "stranded scan must not legacy-equal status to 'pending'").toBeUndefined();

    // dispatch_status pre-filter must be preserved (escalation is still scoped to the live funnel).
    const inDispatch = calls.find((c) => c.op === "in" && c.args[0] === "dispatch_status");
    expect(inDispatch?.args[1]).toEqual(["searching", "offered", "failed"]);

    // cleaner_id must remain NULL (don't re-enqueue assigned bookings).
    const isCleaner = calls.find((c) => c.op === "is" && c.args[0] === "cleaner_id");
    expect(isCleaner?.args[1]).toBeNull();

    // location_id IS NOT NULL must remain (no dispatch without location).
    const notLocation = calls.find((c) => c.op === "not" && c.args[0] === "location_id");
    expect(notLocation?.args[1]).toBe("is");
    expect(notLocation?.args[2]).toBeNull();
  });
});

describe("H-9: source content guards (lock the widened status filter into both modules)", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dispatchDir = path.resolve(here, "..");
  const bookingCommandsDir = path.resolve(here, "..", "..", "booking");

  function readFile(base: string, rel: string): string {
    return readFileSync(path.join(base, rel), "utf8");
  }

  const h9TerminalStatusGuard =
    /\.in\(\s*"status"\s*,\s*\[\s*"pending"\s*,\s*"pending_assignment"\s*\]\s*\)[^]*?\.is\(\s*"cleaner_id"\s*,\s*null\s*\)/;

  it("assignmentBookingStateCommands: terminal marks use widened status + cleaner_id null guard", () => {
    const src = readFile(bookingCommandsDir, "assignmentBookingStateCommands.ts");
    expect(
      h9TerminalStatusGuard.test(src),
      "markDispatchOfferCapUnassignable / markDispatchRetryTerminalBookingStatus must guard pending + pending_assignment",
    ).toBe(true);
    expect(src).toContain("markDispatchOfferCapUnassignable");
    expect(src).toContain("markDispatchRetryTerminalBookingStatus");
  });

  it("runDispatchTimeouts.ts: offer-cap escalation uses shared terminal command", () => {
    const src = readFile(dispatchDir, "runDispatchTimeouts.ts");
    expect(src).toContain("markDispatchOfferCapUnassignable");
    expect(
      src.includes('.update({ dispatch_status: "unassignable" })\n          .eq("id", bookingId)\n          .eq("status", "pending")'),
      "legacy inline .eq('status','pending') terminal mark must be removed",
    ).toBe(false);
  });

  it("dispatchRetryQueue.ts: retry-exhausted escalation uses shared terminal command", () => {
    const src = readFile(dispatchDir, "dispatchRetryQueue.ts");
    expect(src).toContain("markDispatchRetryTerminalBookingStatus");
    expect(
      src.includes('.update({ dispatch_status: terminalDispatchStatus })\n        .eq("id", bookingId)\n        .eq("status", "pending")'),
      "legacy inline .eq('status','pending') terminal mark must be removed",
    ).toBe(false);
  });

  it("dispatchRetryQueue.ts: enqueueStrandedBookings candidate scan filters status with IN(...)", () => {
    const src = readFile(dispatchDir, "dispatchRetryQueue.ts");
    // Match `.from("bookings").select("id, created_at").in("status", [...])`
    expect(
      /\.from\("bookings"\)\s*\.select\("id, created_at"\)\s*\.in\(\s*"status"\s*,\s*\[\s*"pending"\s*,\s*"pending_assignment"\s*\]\s*\)/.test(src),
      "stranded candidate scan must IN-filter status to include pending_assignment",
    ).toBe(true);
  });

  it("does not weaken status filtering elsewhere (offer-side `.eq(\"status\", \"pending\")` on dispatch_offers stays untouched)", () => {
    const src = readFile(dispatchDir, "runDispatchTimeouts.ts");
    // dispatch_offers.status='pending' filters MUST still be exactly that — those refer to the
    // offer row lifecycle, not the booking status, and are correct as-is.
    const offersExpiredSelect =
      /\.from\("dispatch_offers"\)\s*\.select\("id, booking_id, cleaner_id"\)\s*\.eq\(\s*"status"\s*,\s*"pending"\s*\)/;
    expect(offersExpiredSelect.test(src)).toBe(true);

    const offerExpireUpdate =
      /\.update\(\{\s*status:\s*"expired",\s*responded_at:\s*respondedAt\s*\}\)[^]*?\.eq\(\s*"status"\s*,\s*"pending"\s*\)/;
    expect(offerExpireUpdate.test(src)).toBe(true);
  });

  it("widens only escalation paths — does not change assignment engine status acceptance logic", () => {
    // assignment engine entry points already accept both 'pending' and 'pending_assignment'.
    // H-9 must NOT introduce a new terminal status, must NOT change retry backoff math,
    // and must NOT touch payment / payout columns.
    const stripComments = (s: string) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[^]*?\*\//g, "");
    for (const rel of ["runDispatchTimeouts.ts", "dispatchRetryQueue.ts"]) {
      const code = stripComments(readFile(dispatchDir, rel));
      expect(/\bamount_paid_cents\b/.test(code), `${rel} must not touch amount_paid_cents`).toBe(false);
      expect(/\bpaystack_reference\b/.test(code), `${rel} must not touch paystack_reference`).toBe(false);
      expect(/\bcleaner_payout_cents\b/.test(code), `${rel} must not touch cleaner_payout_cents`).toBe(false);
      expect(/\bdisplay_earnings_cents\b/.test(code), `${rel} must not touch display_earnings_cents`).toBe(false);
    }
  });
});
