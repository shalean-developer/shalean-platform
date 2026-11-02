import { describe, expect, it } from "vitest";
import config from "../../../next.config";

describe("legacy pet guide URL consolidation", () => {
  it("maps the old pet-owner slug to exactly one existing CMS guide", async () => {
    const redirects = await config.redirects?.();
    const matches = redirects?.filter((r) => r.source === "/blog/home-cleaning-tips-for-pet-owners") ?? [];
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      destination: "/blog/pet-friendly-cleaning-tips",
      permanent: true,
    });
  });
  it("does not add speculative preparation or kitchen redirects", async () => {
    const redirects = await config.redirects?.();
    for (const source of ["/blog/prepare-home-before-cleaner-arrives", "/blog/keep-kitchen-hygienic-between-deep-cleans"]) {
      expect(redirects?.some((r) => r.source === source)).toBe(false);
    }
  });
});
