import { describe, expect, it } from "vitest";
import config from "../../../next.config";

describe("SEO legacy service aliases", () => {
  it("reuses canonical service pages without new landing pages", async () => {
    const redirects = await config.redirects?.();
    for (const [source, destination] of [
      ["/services/regular-cleaning", "/services/standard-cleaning-cape-town"],
      ["/services/airbnb-cleaning", "/services/airbnb-cleaning-cape-town"],
    ]) {
      const matches = redirects?.filter((rule) => rule.source === source) ?? [];
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({ destination, permanent: true });
    }
  });
  it("does not invent a match for move-turnover or out-of-area services", async () => {
    const redirects = await config.redirects?.();
    for (const source of ["/services/move-turnover", "/services/bluff", "/services/annlin", "/services/navalsig", "/services/langenhoven-park", "/services/edenvale"]) {
      expect(redirects?.some((rule) => rule.source === source)).toBe(false);
    }
  });
});
