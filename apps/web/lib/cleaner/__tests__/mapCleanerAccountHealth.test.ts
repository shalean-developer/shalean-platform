import { describe, expect, it } from "vitest";
import { accountHealthBadge, mapCleanerAccountHealthTier } from "@/lib/cleaner/mapCleanerAccountHealth";

describe("mapCleanerAccountHealthTier", () => {
  it("maps explicit blocked statuses", () => {
    expect(mapCleanerAccountHealthTier("blocked")).toBe("action_required");
    expect(mapCleanerAccountHealthTier("suspended")).toBe("action_required");
  });

  it("maps pending_* to pending_verification", () => {
    expect(mapCleanerAccountHealthTier("pending_review")).toBe("pending_verification");
  });

  it("defaults to active for operational statuses", () => {
    expect(mapCleanerAccountHealthTier("available")).toBe("active");
    expect(mapCleanerAccountHealthTier("offline")).toBe("active");
  });
});

describe("accountHealthBadge", () => {
  it("returns destructive for action_required", () => {
    expect(accountHealthBadge("action_required").variant).toBe("destructive");
  });
});
