import { describe, expect, it } from "vitest";
import { resolveSeoFreshness } from "@/components/admin/seo-insights/SeoFreshnessStatus";

describe("resolveSeoFreshness", () => {
  const now = Date.parse("2026-08-10T12:00:00.000Z");

  it("marks recent syncs healthy", () => {
    expect(resolveSeoFreshness("2026-08-09T06:00:00.000Z", now).state).toBe("healthy");
  });

  it("marks syncs older than 36 hours stale", () => {
    expect(resolveSeoFreshness("2026-08-08T18:00:00.000Z", now).state).toBe("stale");
  });

  it("marks missing or very old syncs failed", () => {
    expect(resolveSeoFreshness(null, now).state).toBe("failed");
    expect(resolveSeoFreshness("2026-08-06T00:00:00.000Z", now).state).toBe("failed");
  });
});
