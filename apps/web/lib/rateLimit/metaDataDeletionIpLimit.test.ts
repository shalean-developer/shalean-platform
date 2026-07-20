import { describe, expect, it } from "vitest";
import {
  allowMetaDataDeletionRequest,
  metaDataDeletionRateLimitKey,
} from "@/lib/rateLimit/metaDataDeletionIpLimit";

describe("metaDataDeletionIpLimit", () => {
  it("builds a key from x-forwarded-for", () => {
    const req = new Request("https://shalean.co.za/api/meta/data-deletion", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    });
    expect(metaDataDeletionRateLimitKey(req)).toBe("meta-ddr:203.0.113.9");
  });

  it("allows then eventually rate-limits a hot key", () => {
    const key = `meta-ddr:test-${Date.now()}-${Math.random()}`;
    let allowed = 0;
    let blocked = false;
    for (let i = 0; i < 40; i += 1) {
      if (allowMetaDataDeletionRequest(key)) allowed += 1;
      else {
        blocked = true;
        break;
      }
    }
    expect(allowed).toBeGreaterThan(0);
    expect(blocked).toBe(true);
  });
});
