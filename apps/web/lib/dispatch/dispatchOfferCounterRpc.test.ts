import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/metrics/counters", () => ({
  metrics: { increment: vi.fn() },
}));

import { bumpCleanerOfferSentCounter } from "@/lib/dispatch/dispatchOfferCounterRpc";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";

const logMock = vi.mocked(logSystemEvent);
const metricsMock = vi.mocked(metrics);

function makeSupabase(rpcResult: { error: { message: string; code?: string } | null } | Error): SupabaseClient {
  const rpc = vi.fn(async () => {
    if (rpcResult instanceof Error) throw rpcResult;
    return rpcResult;
  });
  return { rpc } as unknown as SupabaseClient;
}

const ctx = {
  cleanerId: "cleaner-1",
  bookingId: "book-1",
  offerId: "offer-1",
};

describe("bumpCleanerOfferSentCounter", () => {
  beforeEach(() => {
    logMock.mockClear();
    metricsMock.increment = vi.fn();
  });

  it("returns success when RPC reports no error", async () => {
    const supabase = makeSupabase({ error: null });
    const r = await bumpCleanerOfferSentCounter({ supabase, ...ctx });
    expect(r).toEqual({ ok: true, kind: "success" });
    expect(logMock).not.toHaveBeenCalled();
  });

  it("classifies missing-column errors as schema gap (info, not warn)", async () => {
    const supabase = makeSupabase({
      error: { message: 'column "total_offers" does not exist', code: "42703" },
    });
    const r = await bumpCleanerOfferSentCounter({ supabase, ...ctx });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("missing_column");

    expect(logMock).toHaveBeenCalledTimes(1);
    const arg = logMock.mock.calls[0]![0];
    expect(arg.level).toBe("info");
    expect(arg.source).toBe("dispatch_offer_sent_rpc_schema_gap");
    expect(metricsMock.increment).toHaveBeenCalledWith(
      "dispatch.offer.counter_rpc_schema_gap",
      expect.objectContaining({ cleanerId: "cleaner-1", bookingId: "book-1" }),
    );
  });

  it("classifies generic RPC errors as warn-level fault", async () => {
    const supabase = makeSupabase({ error: { message: "deadlock detected", code: "40P01" } });
    const r = await bumpCleanerOfferSentCounter({ supabase, ...ctx });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("other");

    expect(logMock).toHaveBeenCalledTimes(1);
    const arg = logMock.mock.calls[0]![0];
    expect(arg.level).toBe("warn");
    expect(arg.source).toBe("dispatch_offer_sent_rpc");
  });

  it("does not throw when the RPC call itself rejects", async () => {
    const supabase = makeSupabase(new Error("network down"));
    const r = await bumpCleanerOfferSentCounter({ supabase, ...ctx });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("other");
      expect(r.message).toContain("network down");
    }
    const arg = logMock.mock.calls[0]![0];
    expect(arg.source).toBe("dispatch_offer_sent_rpc_exception");
  });
});
