import { describe, expect, it } from "vitest";
import { assignStableBlogBlockIds } from "./assign-stable-block-ids";
import { preserveOrderedBlogBlocks } from "./blogDocumentMode";
import type { BlogContentBlock } from "./content-json";

describe("ordered blog model", () => {
  it("stabilizes legacy DOM anchors before an editor reorders blocks", () => {
    const content = { schema_version: 1 as const, blocks: [{ type: "paragraph" as const, content: "First" },{ type: "image" as const, url: "/images/one.jpg", alt: "Middle" }] };
    const before = assignStableBlogBlockIds(content);
    const reordered = preserveOrderedBlogBlocks(before.blocks).reverse();
    expect(reordered[0].id).toBe(before.blocks[1].id);
    expect(reordered[1].id).toBe(before.blocks[0].id);
  });
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
