import { describe, expect, it } from "vitest";
import { BLOG_CONTENT_JSON_SCHEMA_VERSION } from "@/lib/blog/content-json";
import type { BlogContentBlock, BlogContentJson } from "@/lib/blog/content-json";
import { WARN_BOOKING_CONFIDENCE_PRICING_HUB } from "@/lib/seo/blogGovernance";
import { validateBlogPublish } from "@/lib/blog/seo/publish-validation";

function content(blocks: BlogContentBlock[]): BlogContentJson {
  return { schema_version: BLOG_CONTENT_JSON_SCHEMA_VERSION, blocks };
}

describe("validateBlogPublish governance warnings", () => {
  it("emits a warning when booking-confidence tag matches and pricing hub is referenced", () => {
    const r = validateBlogPublish(
      content([
        {
          type: "paragraph",
          content: "See [prices](https://shalean.co.za/cleaning-prices-cape-town) for bands.",
        },
      ]),
      { tags: ["cluster-2"] },
    );
    expect(r.warnings.some((w) => w.code === WARN_BOOKING_CONFIDENCE_PRICING_HUB)).toBe(true);
  });

  it("does not warn for pricing hub without booking-confidence tags", () => {
    const r = validateBlogPublish(
      content([
        {
          type: "paragraph",
          content: "See [prices](https://shalean.co.za/cleaning-prices-cape-town).",
        },
      ]),
      { tags: ["pricing"] },
    );
    expect(r.warnings).toHaveLength(0);
  });

  it("does not warn for cluster-2 when pricing hub is absent", () => {
    const r = validateBlogPublish(
      content([{ type: "paragraph", content: "Prepare surfaces before the team arrives." }]),
      { tags: ["cluster-2"] },
    );
    expect(r.warnings).toHaveLength(0);
  });

  it("matches semanticCluster booking-confidence without tags", () => {
    const r = validateBlogPublish(
      content([
        {
          type: "paragraph",
          content: "Link to /cleaning-prices-cape-town here.",
        },
      ]),
      { semanticCluster: "booking-confidence" },
    );
    expect(r.warnings.some((w) => w.code === WARN_BOOKING_CONFIDENCE_PRICING_HUB)).toBe(true);
  });
});
