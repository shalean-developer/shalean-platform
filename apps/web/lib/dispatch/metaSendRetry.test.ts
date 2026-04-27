import { describe, expect, it } from "vitest";
import { metaGraphSendRetryDelayMs } from "@/lib/dispatch/metaSendRetry";

describe("metaGraphSendRetryDelayMs", () => {
  it("returns backoff in expected ranges with jitter", () => {
    for (let i = 0; i < 30; i++) {
      const d0 = metaGraphSendRetryDelayMs(0);
      expect(d0).toBeGreaterThanOrEqual(1000);
      expect(d0).toBeLessThan(1500);
      const d1 = metaGraphSendRetryDelayMs(1);
      expect(d1).toBeGreaterThanOrEqual(2000);
      expect(d1).toBeLessThan(2500);
      const d2 = metaGraphSendRetryDelayMs(2);
      expect(d2).toBeGreaterThanOrEqual(5000);
      expect(d2).toBeLessThan(5500);
    }
  });
});
