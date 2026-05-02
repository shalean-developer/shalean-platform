import { describe, expect, it } from "vitest";
import { shouldDropStaleQueuedLifecycleAction } from "@/lib/cleaner/cleanerQueuedLifecycleFlushGuard";

describe("shouldDropStaleQueuedLifecycleAction", () => {
  it("drops complete when server already completed", () => {
    expect(shouldDropStaleQueuedLifecycleAction("complete", { status: "completed" })).toBe(true);
  });

  it("keeps complete when server still in progress", () => {
    expect(shouldDropStaleQueuedLifecycleAction("complete", { status: "in_progress" })).toBe(false);
  });

  it("drops en_route when already on the way", () => {
    expect(shouldDropStaleQueuedLifecycleAction("en_route", { en_route_at: "2026-01-01T10:00:00Z" })).toBe(true);
  });

  it("returns false when wire is unknown", () => {
    expect(shouldDropStaleQueuedLifecycleAction("accept", null)).toBe(false);
  });
});
