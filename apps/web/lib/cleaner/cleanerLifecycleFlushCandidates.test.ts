import { afterEach, describe, expect, it, vi } from "vitest";
import {
  pendingLifecycleFlushCandidatesForSnapshot,
  type PendingLifecycleItem,
} from "@/lib/cleaner/cleanerJobPendingLifecycleQueue";
import { createSingleFlight } from "@/lib/cleaner/cleanerLifecycleSingleFlight";
import { postCleanerLifecycleWithRetry } from "@/lib/cleaner/cleanerLifecyclePostWithRetry";

vi.mock("@/lib/cleaner/cleanerLifecyclePostWithRetry", () => ({
  postCleanerLifecycleWithRetry: vi.fn(),
}));

afterEach(() => {
  vi.mocked(postCleanerLifecycleWithRetry).mockReset();
});

describe("pendingLifecycleFlushCandidatesForSnapshot", () => {
  it("keeps only latest row per booking when snapshot has stale + latest", () => {
    const t0 = 1_000;
    const t1 = 2_000;
    const queue: PendingLifecycleItem[] = [
      {
        bookingId: "b1",
        action: "en_route",
        idempotencyKey: "k-old",
        queuedAt: t0,
        attempts: 0,
      },
      {
        bookingId: "b1",
        action: "complete",
        idempotencyKey: "k-latest",
        queuedAt: t1,
        attempts: 0,
      },
    ];
    const candidates = pendingLifecycleFlushCandidatesForSnapshot(queue);
    expect(candidates.map((c) => c.idempotencyKey)).toEqual(["k-latest"]);
  });
});

describe("flush pipeline: dual trigger + compaction (one POST, latest key)", () => {
  it("parallel flushes post once with latest idempotency key", async () => {
    const queue: PendingLifecycleItem[] = [
      {
        bookingId: "b-pipe",
        action: "start",
        idempotencyKey: "k-start",
        queuedAt: Date.now() - 120_000,
        attempts: 0,
      },
      {
        bookingId: "b-pipe",
        action: "complete",
        idempotencyKey: "k-complete",
        queuedAt: Date.now(),
        attempts: 0,
      },
    ];
    expect(pendingLifecycleFlushCandidatesForSnapshot(queue).map((x) => x.idempotencyKey)).toEqual(["k-complete"]);

    vi.mocked(postCleanerLifecycleWithRetry).mockResolvedValue({ ok: true, status: 200 });
    const gate = createSingleFlight();
    const flushOnce = async () => {
      await gate.run(async () => {
        const candidates = pendingLifecycleFlushCandidatesForSnapshot(queue);
        for (const item of candidates) {
          await postCleanerLifecycleWithRetry({
            bookingId: item.bookingId,
            action: item.action,
            idempotencyKey: item.idempotencyKey,
            getHeaders: async () => ({ Authorization: "x" }),
          });
        }
      });
    };
    await Promise.all([flushOnce(), flushOnce()]);
    expect(vi.mocked(postCleanerLifecycleWithRetry)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(postCleanerLifecycleWithRetry).mock.calls[0]?.[0]?.idempotencyKey).toBe("k-complete");
  });
});
