import { describe, expect, it } from "vitest";
import {
  mergeDocumentModeToBlocks,
  proseBlocksToDocumentHtml,
  splitBlocksForDocumentMode,
} from "@/lib/blog/blogDocumentMode";
import type { BlogContentBlock } from "@/lib/blog/content-json";

describe("blogDocumentMode", () => {
  it("merges prose blocks into one HTML document", () => {
    const html = proseBlocksToDocumentHtml([
      { type: "paragraph", content: "Intro paragraph." },
      { type: "heading", level: 2, content: "Section title" },
      {
        type: "bullet_list",
        items: ["First point", "Second point"],
      },
    ]);
    expect(html).toContain("<p>Intro paragraph.</p>");
    expect(html).toContain("<h2>Section title</h2>");
    expect(html).toContain("<ul><li>First point</li><li>Second point</li></ul>");
  });

  it("splits FAQ and CTA into advanced blocks", () => {
    const blocks: BlogContentBlock[] = [
      { type: "paragraph", content: "Body copy." },
      {
        type: "faq",
        items: [{ question: "Q1", answer: "A1" }],
      },
      {
        type: "cta",
        title: "Book now",
        button_text: "Book",
        link: "/book",
      },
    ];
    const split = splitBlocksForDocumentMode(blocks);
    expect(split.documentHtml).toContain("Body copy.");
    expect(split.advancedBlocks).toHaveLength(2);
    expect(split.advancedBlocks[0]?.type).toBe("faq");
    expect(split.advancedBlocks[1]?.type).toBe("cta");
  });

  it("round-trips document body as a single rich_text block", () => {
    const merged = mergeDocumentModeToBlocks("<p>Hello</p><h2>Next</h2>", [
      { type: "cta", title: "CTA", button_text: "Go", link: "/book" },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.type).toBe("rich_text");
    expect(merged[1]?.type).toBe("cta");
  });
});
