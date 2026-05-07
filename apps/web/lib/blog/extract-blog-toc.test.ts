import { describe, expect, it } from "vitest";
import type { BlogContentBlock } from "@/lib/blog/content-json";
import {
  extractTocFromBlogBlocks,
  shouldShowBlogTableOfContents,
} from "@/lib/blog/extract-blog-toc";
import { blogFaqHeadingDomId } from "@/lib/blog/blog-block-anchors";

describe("extractTocFromBlogBlocks", () => {
  it("includes FAQ when omit_section_heading is true", () => {
    const blocks: BlogContentBlock[] = [
      { type: "heading", level: 2, content: "First section" },
      { type: "heading", level: 2, content: "Second section" },
      { type: "faq", omit_section_heading: true, items: [{ question: "Q?", answer: "A." }] },
    ];
    const toc = extractTocFromBlogBlocks(blocks);
    expect(toc.some((e) => e.label === "FAQ")).toBe(true);
    const faq = toc.find((e) => e.label === "FAQ");
    expect(faq?.id).toBe(blogFaqHeadingDomId(blocks[2] as { id?: string }, 2));
  });

  it("extracts h2/h3 from rich_text with stable ids", () => {
    const blocks: BlogContentBlock[] = [
      { type: "heading", level: 2, content: "Intro" },
      { type: "rich_text", html: "<h2>From HTML</h2><p>x</p><h3>Sub</h3>" },
      { type: "heading", level: 2, content: "Outro" },
    ];
    const toc = extractTocFromBlogBlocks(blocks);
    expect(toc.map((e) => e.label)).toEqual(["Intro", "From HTML", "Sub", "Outro"]);
    expect(toc[1]?.id).toBe("blog-rich-blog-rich_text-1-0");
    expect(toc[2]?.id).toBe("blog-rich-blog-rich_text-1-1");
  });

  it("uses full FAQ title when heading is not omitted", () => {
    const blocks: BlogContentBlock[] = [
      { type: "heading", level: 2, content: "A" },
      { type: "heading", level: 2, content: "B" },
      { type: "faq", omit_section_heading: false, items: [] },
    ];
    const toc = extractTocFromBlogBlocks(blocks);
    expect(toc.at(-1)?.label).toBe("Frequently asked questions");
  });
});

describe("shouldShowBlogTableOfContents", () => {
  it("returns false when fewer than 2 entries", () => {
    expect(shouldShowBlogTableOfContents([{ id: "x", label: "Only", level: 2 }], 20)).toBe(false);
  });

  it("returns true when at least 3 level-2 rows", () => {
    const entries = [
      { id: "a", label: "A", level: 2 as const },
      { id: "b", label: "B", level: 2 as const },
      { id: "c", label: "C", level: 2 as const },
    ];
    expect(shouldShowBlogTableOfContents(entries, 1)).toBe(true);
  });

  it("returns true for long read with structured entries", () => {
    const entries = [
      { id: "a", label: "A", level: 2 as const },
      { id: "b", label: "B", level: 3 as const },
      { id: "c", label: "C", level: 2 as const },
    ];
    expect(shouldShowBlogTableOfContents(entries, 8)).toBe(true);
  });

  it("returns false for two H2 and short read", () => {
    const entries = [
      { id: "a", label: "A", level: 2 as const },
      { id: "b", label: "B", level: 2 as const },
    ];
    expect(shouldShowBlogTableOfContents(entries, 5)).toBe(false);
  });
});
