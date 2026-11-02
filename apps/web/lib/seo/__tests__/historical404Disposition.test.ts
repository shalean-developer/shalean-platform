import { describe, expect, it } from "vitest";
import config from "../../../next.config";

describe("SEO historical 404 dispositions", () => {
  it("redirects only verified former service and quote routes to existing pages", async () => {
    const redirects = await config.redirects?.();
    const expected = [
      ["/services/one-time-cleaning", "/services/standard-cleaning-cape-town"],
      ["/booking/quote", "/quote"],
    ] as const;
    for (const [source, destination] of expected) {
      const matched = redirects?.filter((route) => route.source === source) ?? [];
      expect(matched).toHaveLength(1);
      expect(matched[0]).toMatchObject({ destination, permanent: true });
    }
  });

  it("does not invent a destination for the unverified legacy CMS article", async () => {
    const redirects = await config.redirects?.();
    expect(redirects?.some((route) =>
      route.source === "/blog/spring-cleaning-checklist-south-africa"
    )).toBe(false);
  });
});
