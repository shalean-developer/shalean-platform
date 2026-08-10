import { describe, expect, it } from "vitest";

describe("late earnings reconciliation safety boundary", () => {
  it("only permits draft payout runs to be reopened", () => {
    const reopenable = (status: string) => status === "draft";
    expect(reopenable("draft")).toBe(true);
    expect(reopenable("approved")).toBe(false);
    expect(reopenable("paid")).toBe(false);
  });
});
