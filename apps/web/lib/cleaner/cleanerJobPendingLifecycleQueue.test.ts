import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  canEnqueueLifecycleAfterQueued,
  CLEANER_PENDING_LIFECYCLE_LOCAL_KEY,
  enqueuePendingLifecycle,
  getLatestPendingLifecycleItemForBooking,
  listPendingLifecycle,
  listPendingLifecycleForBooking,
  readPendingLifecycleQueueStorageVersion,
  type PendingLifecycleItem,
} from "@/lib/cleaner/cleanerJobPendingLifecycleQueue";

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
});

describe("canEnqueueLifecycleAfterQueued", () => {
  it("allows forward progression", () => {
    expect(canEnqueueLifecycleAfterQueued("en_route", "start").ok).toBe(true);
    expect(canEnqueueLifecycleAfterQueued("start", "complete").ok).toBe(true);
  });

  it("blocks backwards linear steps", () => {
    expect(canEnqueueLifecycleAfterQueued("complete", "en_route").ok).toBe(false);
    expect(canEnqueueLifecycleAfterQueued("start", "en_route").ok).toBe(false);
  });

  it("allows accept to replace stale forward-queued intent (server still on accept)", () => {
    expect(canEnqueueLifecycleAfterQueued("en_route", "accept").ok).toBe(true);
    expect(canEnqueueLifecycleAfterQueued("start", "accept").ok).toBe(true);
    expect(canEnqueueLifecycleAfterQueued("complete", "accept").ok).toBe(true);
  });

  it("allows same-action replace", () => {
    expect(canEnqueueLifecycleAfterQueued("accept", "accept").ok).toBe(true);
  });

  it("blocks new work after queued reject", () => {
    expect(canEnqueueLifecycleAfterQueued("reject", "en_route").ok).toBe(false);
  });
});

describe("enqueuePendingLifecycle compaction", () => {
  it("keeps one row per booking with latest action and idempotency key", async () => {
    const t0 = Date.now() - 60_000;
    const t1 = Date.now();
    expect(
      (
        await enqueuePendingLifecycle({
          bookingId: "b1",
          action: "en_route",
          idempotencyKey: "aaaaaaaaaa-en-route",
          queuedAt: t0,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await enqueuePendingLifecycle({
          bookingId: "b1",
          action: "complete",
          idempotencyKey: "bbbbbbbbbb-complete",
          queuedAt: t1,
        })
      ).ok,
    ).toBe(true);
    const q = listPendingLifecycle();
    expect(q.filter((x) => x.bookingId === "b1").length).toBe(1);
    expect(q.find((x) => x.bookingId === "b1")?.action).toBe("complete");
    expect(q.find((x) => x.bookingId === "b1")?.idempotencyKey).toBe("bbbbbbbbbb-complete");
  });
});

describe("readPendingLifecycleQueueStorageVersion", () => {
  it("returns envelope version after enqueue", async () => {
    expect(
      (
        await enqueuePendingLifecycle({
          bookingId: "b-ver-read",
          action: "accept",
          idempotencyKey: "key-ver-read-1",
          queuedAt: Date.now(),
        })
      ).ok,
    ).toBe(true);
    expect(readPendingLifecycleQueueStorageVersion()).toBeGreaterThanOrEqual(1);
  });
});

describe("versioned envelope persistence", () => {
  it("persists wrapped envelope with monotonic version", async () => {
    expect(
      (
        await enqueuePendingLifecycle({
          bookingId: "b-env",
          action: "accept",
          idempotencyKey: "key-env-accept-1",
          queuedAt: Date.now(),
        })
      ).ok,
    ).toBe(true);
    const raw = localStorage.getItem(CLEANER_PENDING_LIFECYCLE_LOCAL_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as { version?: number; items?: unknown[] };
    expect(typeof parsed.version).toBe("number");
    expect(parsed.version).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(parsed.items)).toBe(true);
  });
});

describe("listPendingLifecycleForBooking", () => {
  it("drops TTL-expired rows via the same read path as global queue", () => {
    const staleAt = Date.now() - 25 * 60 * 60 * 1000;
    localStorage.setItem(
      CLEANER_PENDING_LIFECYCLE_LOCAL_KEY,
      JSON.stringify([
        {
          bookingId: "b-ttl",
          action: "complete",
          idempotencyKey: "stale-key",
          queuedAt: staleAt,
          attempts: 0,
        },
      ]),
    );
    expect(listPendingLifecycleForBooking("b-ttl")).toHaveLength(0);
    expect(listPendingLifecycle().some((x) => x.bookingId === "b-ttl")).toBe(false);
  });
});

describe("getLatestPendingLifecycleItemForBooking", () => {
  it("returns newest non-failed row by queuedAt", () => {
    const q: PendingLifecycleItem[] = [
      {
        bookingId: "b1",
        action: "en_route",
        idempotencyKey: "a1",
        queuedAt: 100,
        attempts: 0,
      },
      {
        bookingId: "b1",
        action: "start",
        idempotencyKey: "a2",
        queuedAt: 500,
        attempts: 0,
      },
      {
        bookingId: "b2",
        action: "complete",
        idempotencyKey: "a3",
        queuedAt: 600,
        attempts: 0,
      },
    ];
    const latest = getLatestPendingLifecycleItemForBooking(q, "b1");
    expect(latest?.idempotencyKey).toBe("a2");
  });

  it("ignores failed rows", () => {
    const q: PendingLifecycleItem[] = [
      {
        bookingId: "b1",
        action: "start",
        idempotencyKey: "old",
        queuedAt: 900,
        attempts: 3,
        failed: true,
      },
      {
        bookingId: "b1",
        action: "en_route",
        idempotencyKey: "new",
        queuedAt: 100,
        attempts: 0,
      },
    ];
    expect(getLatestPendingLifecycleItemForBooking(q, "b1")?.idempotencyKey).toBe("new");
  });
});
