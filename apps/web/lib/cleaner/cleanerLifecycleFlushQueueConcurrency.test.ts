import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  CLEANER_PENDING_LIFECYCLE_LOCAL_KEY,
  enqueuePendingLifecycle,
  listPendingLifecycle,
  removePendingLifecycleByKey,
} from "@/lib/cleaner/cleanerJobPendingLifecycleQueue";
import { createSingleFlight } from "@/lib/cleaner/cleanerLifecycleSingleFlight";
import { postCleanerLifecycleWithRetry } from "@/lib/cleaner/cleanerLifecyclePostWithRetry";

vi.mock("@/lib/cleaner/cleanerLifecyclePostWithRetry", () => ({
  postCleanerLifecycleWithRetry: vi.fn(),
}));

const mem = new Map<string, string>();
const fakeStorage: Storage = {
  get length() {
    return mem.size;
  },
  clear() {
    mem.clear();
  },
  getItem(k) {
    return mem.get(k) ?? null;
  },
  setItem(k, v) {
    mem.set(k, v);
  },
  removeItem(k) {
    mem.delete(k);
  },
  key(i) {
    return [...mem.keys()][i] ?? null;
  },
};

beforeAll(() => {
  Object.defineProperty(globalThis, "localStorage", { value: fakeStorage, configurable: true, writable: true });
});
afterAll(() => {
  mem.clear();
});
afterEach(() => {
  localStorage.removeItem(CLEANER_PENDING_LIFECYCLE_LOCAL_KEY);
  vi.mocked(postCleanerLifecycleWithRetry).mockReset();
});

describe("flush queue concurrency + compaction", () => {
  it("compacts to latest idempotency key then single-flight issues one POST", async () => {
    const t0 = Date.now() - 120_000;
    const t1 = Date.now();
    expect(
      (
        await enqueuePendingLifecycle({
          bookingId: "b-conc",
          action: "en_route",
          idempotencyKey: "key-a-en-route",
          queuedAt: t0,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await enqueuePendingLifecycle({
          bookingId: "b-conc",
          action: "complete",
          idempotencyKey: "key-b-complete",
          queuedAt: t1,
        })
      ).ok,
    ).toBe(true);
    const row = listPendingLifecycle().find((x) => x.bookingId === "b-conc");
    expect(row?.idempotencyKey).toBe("key-b-complete");

    vi.mocked(postCleanerLifecycleWithRetry).mockResolvedValue({
      ok: true,
      status: 200,
    });

    const gate = createSingleFlight();
    const flushOnce = async () => {
      await gate.run(async () => {
        const q = listPendingLifecycle();
        for (const item of q) {
          if (item.failed) continue;
          await postCleanerLifecycleWithRetry({
            bookingId: item.bookingId,
            action: item.action,
            idempotencyKey: item.idempotencyKey,
            getHeaders: async () => ({ Authorization: "x" }),
          });
          await removePendingLifecycleByKey(item.idempotencyKey);
        }
      });
    };

    await Promise.all([flushOnce(), flushOnce()]);

    expect(vi.mocked(postCleanerLifecycleWithRetry)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(postCleanerLifecycleWithRetry).mock.calls[0]?.[0]?.idempotencyKey).toBe("key-b-complete");
    expect(listPendingLifecycle().filter((x) => x.bookingId === "b-conc")).toHaveLength(0);
  });
});
