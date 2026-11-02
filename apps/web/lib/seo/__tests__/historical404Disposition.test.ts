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

  it("maps the retired spring checklist to its existing published CMS counterpart", async () => {
    const redirects = await config.redirects?.();
    const matches = redirects?.filter((rule) => rule.source === "/blog/spring-cleaning-checklist-south-africa") ?? [];
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ destination: "/blog/spring-cleaning-checklist-cape-town", permanent: true });
  });
});
