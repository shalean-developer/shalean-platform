import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { markRetargetingCandidate } from "@/lib/growth/trackEvent";

describe("markRetargetingCandidate storage safety", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = env;
    vi.unstubAllGlobals();
  });

  it("does not throw when localStorage setItem/removeItem throw SecurityError", () => {
    const securityError = new DOMException("Access denied", "SecurityError");
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw securityError;
        },
        setItem: () => {
          throw securityError;
        },
        removeItem: () => {
          throw securityError;
        },
      },
    });
    expect(() => markRetargetingCandidate(true)).not.toThrow();
    expect(() => markRetargetingCandidate(false)).not.toThrow();
  });

  it("writes and clears the retargeting flag when storage works", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });
    markRetargetingCandidate(true);
    expect(store.get("shalean_retargeting_pending")).toBe("1");
    markRetargetingCandidate(false);
    expect(store.has("shalean_retargeting_pending")).toBe(false);
  });
});
