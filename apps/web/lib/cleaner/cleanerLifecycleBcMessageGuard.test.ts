import { describe, expect, it } from "vitest";
import { planBcQueueRefresh } from "@/lib/cleaner/cleanerLifecycleBcMessageGuard";

describe("planBcQueueRefresh", () => {
  it("applies v3 then v4 and ignores stale v2 (message monotonic + disk)", () => {
    let lastMsg = 0;
    let lastDisk = 0;

    const a = planBcQueueRefresh({ messageVersion: 3, lastAppliedMessageVersion: lastMsg, diskVersion: 3, lastDiskVersionApplied: lastDisk });
    expect(a.shouldRefresh).toBe(true);
    lastMsg = a.nextLastMessageVersion;
    lastDisk = a.nextLastDiskVersion;

    const b = planBcQueueRefresh({ messageVersion: 2, lastAppliedMessageVersion: lastMsg, diskVersion: 3, lastDiskVersionApplied: lastDisk });
    expect(b.shouldRefresh).toBe(false);
    lastMsg = b.nextLastMessageVersion;
    lastDisk = b.nextLastDiskVersion;

    const c = planBcQueueRefresh({ messageVersion: 4, lastAppliedMessageVersion: lastMsg, diskVersion: 4, lastDiskVersionApplied: lastDisk });
    expect(c.shouldRefresh).toBe(true);
    expect(c.nextLastMessageVersion).toBe(4);
    expect(c.nextLastDiskVersion).toBe(4);
  });

  it("handles out-of-order BC (v5, v2, v6) with monotonic message + disk merge", () => {
    let lastMsg = 0;
    let lastDisk = 0;
    const a = planBcQueueRefresh({ messageVersion: 5, lastAppliedMessageVersion: lastMsg, diskVersion: 5, lastDiskVersionApplied: lastDisk });
    expect(a.shouldRefresh).toBe(true);
    lastMsg = a.nextLastMessageVersion;
    lastDisk = a.nextLastDiskVersion;
    const b = planBcQueueRefresh({ messageVersion: 2, lastAppliedMessageVersion: lastMsg, diskVersion: 5, lastDiskVersionApplied: lastDisk });
    expect(b.shouldRefresh).toBe(false);
    lastMsg = b.nextLastMessageVersion;
    lastDisk = b.nextLastDiskVersion;
    const c = planBcQueueRefresh({ messageVersion: 6, lastAppliedMessageVersion: lastMsg, diskVersion: 6, lastDiskVersionApplied: lastDisk });
    expect(c.shouldRefresh).toBe(true);
    expect(c.nextLastMessageVersion).toBe(6);
    expect(c.nextLastDiskVersion).toBe(6);
  });

  it("allows disk-only advance when message is replayed", () => {
    const r = planBcQueueRefresh({
      messageVersion: 3,
      lastAppliedMessageVersion: 3,
      diskVersion: 5,
      lastDiskVersionApplied: 3,
    });
    expect(r.shouldRefresh).toBe(true);
    expect(r.nextLastMessageVersion).toBe(3);
    expect(r.nextLastDiskVersion).toBe(5);
  });
});
