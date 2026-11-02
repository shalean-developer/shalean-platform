import { describe, expect, it } from "vitest";
import config from "../../../next.config";

describe("legacy pet guide URL consolidation", () => {
  it("does not intercept the pet-owner slug before the protected proxy", async () => {
    const redirects = await config.redirects?.();
    expect(redirects?.some((r) => r.source === "/blog/home-cleaning-tips-for-pet-owners")).toBe(false);
  });
  it("does not add speculative preparation or kitchen redirects", async () => {
    const redirects = await config.redirects?.();
    for (const source of ["/blog/prepare-home-before-cleaner-arrives", "/blog/keep-kitchen-hygienic-between-deep-cleans"]) {
      expect(redirects?.some((r) => r.source === source)).toBe(false);
    }
  });
});
