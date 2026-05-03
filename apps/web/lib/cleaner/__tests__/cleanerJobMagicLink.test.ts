import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isCleanerJobMagicLinkSigningConfigured,
  signCleanerJobAccessToken,
  verifyCleanerJobAccessToken,
} from "@/lib/cleaner/cleanerJobMagicLink";

describe("cleanerJobMagicLink", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CLEANER_MAGIC_LINK_SECRET;
  });

  it("signs and verifies round-trip", () => {
    process.env.CLEANER_MAGIC_LINK_SECRET = "test-secret-at-least-16-chars-long";
    expect(isCleanerJobMagicLinkSigningConfigured()).toBe(true);
    const tok = signCleanerJobAccessToken({ cleanerId: "c1", bookingId: "b1" });
    const p = verifyCleanerJobAccessToken(tok);
    expect(p?.sub).toBe("c1");
    expect(p?.bid).toBe("b1");
    expect(p?.typ).toBe("job_access");
  });

  it("rejects tampered payload", () => {
    process.env.CLEANER_MAGIC_LINK_SECRET = "test-secret-at-least-16-chars-long";
    const tok = signCleanerJobAccessToken({ cleanerId: "c1", bookingId: "b1" });
    const broken = `${tok.slice(0, -4)}xxxx`;
    expect(verifyCleanerJobAccessToken(broken)).toBeNull();
  });

  it("rejects expired token", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      process.env.CLEANER_MAGIC_LINK_SECRET = "test-secret-at-least-16-chars-long";
      const tok = signCleanerJobAccessToken({ cleanerId: "c1", bookingId: "b1" });
      vi.setSystemTime(new Date("2026-01-01T01:00:00Z"));
      expect(verifyCleanerJobAccessToken(tok)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
