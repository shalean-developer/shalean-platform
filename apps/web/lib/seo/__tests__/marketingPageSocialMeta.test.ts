import { describe, expect, it } from "vitest";
import { buildMarketingSocialMetadata } from "@/lib/seo/marketingPageSocialMeta";
import { HOME_OG_IMAGE } from "@/lib/seo/homePageMeta";

describe("buildMarketingSocialMetadata", () => {
  it("returns og:image and twitter large image card", () => {
    const meta = buildMarketingSocialMetadata({
      url: "https://shalean.co.za/faq",
      title: "FAQ",
      description: "Answers",
    });
    expect(JSON.stringify(meta.openGraph?.images)).toContain(HOME_OG_IMAGE);
    expect(meta.twitter).toMatchObject({ card: "summary_large_image" });
    expect(meta.twitter?.images).toContain(HOME_OG_IMAGE);
  });
});
