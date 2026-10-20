import { describe, expect, it } from "vitest";
import { preserveOrderedBlogBlocks } from "./blogDocumentMode";
import type { BlogContentBlock } from "./content-json";

describe("ordered blog model", () => {
  it("retains interleaved prose, service areas, images, IDs and attribution without flattening", () => {
    const blocks: BlogContentBlock[] = [
      { type: "section", id: "intro-anchor", title: "Start", content: "First", heading_level: 2 },
      { type: "image", id: "middle-image", url: "/images/one.jpg", alt: "Middle image" },
      { type: "service_area", locations: ["Claremont", "Cape Town"] },
      { type: "quote", content: "Keep this quote", attribution: "Team" },
      { type: "rich_text", html: '<h2 id="authored-anchor">Later prose</h2><p>Last</p>' },
    ];
    const next = preserveOrderedBlogBlocks(blocks);
    expect(next).toEqual(blocks);
    next.reverse();
    expect(blocks[0].id).toBe("intro-anchor");
  });
});
