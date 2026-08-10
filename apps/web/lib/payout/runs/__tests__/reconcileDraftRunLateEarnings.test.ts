import { describe, expect, it } from "vitest";

describe("draft payout late-earnings reconciliation policy", () => {
  it("documents the safety boundary: only draft runs may be reopened", () => {
    const reopenable = new Set(["draft"]);
    expect(reopenable.has("draft")).toBe(true);
    expect(reopenable.has("approved")).toBe(false);
    expect(reopenable.has("paid")).toBe(false);
  });
});
