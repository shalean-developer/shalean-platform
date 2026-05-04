import { blogFaqHeadingDomId, defaultBlogBlockAnchorId } from "@/lib/blog/blog-block-anchors";
import type { BlogContentBlock, BlogContentJson } from "@/lib/blog/content-json";

export type BlogTocEntry = {
  id: string;
  label: string;
  level: 2 | 3;
};

/** Headings only — matches anchors emitted by `BlogContentRenderer`. */
export function extractTocFromBlogBlocks(blocks: BlogContentBlock[]): BlogTocEntry[] {
  const out: BlogTocEntry[] = [];
  blocks.forEach((block, index) => {
    if (block.type === "section") {
      const level: 2 | 3 = block.heading_level === 3 || block.heading_level === 4 ? 3 : 2;
      out.push({
        id: block.id ?? defaultBlogBlockAnchorId(block, index),
        label: block.title,
        level,
      });
    }
    if (block.type === "heading") {
      const level: 2 | 3 = block.level === 3 ? 3 : 2;
      out.push({
        id: block.id ?? defaultBlogBlockAnchorId(block, index),
        label: block.content,
        level,
      });
    }
    if (block.type === "faq" && !block.omit_section_heading) {
      out.push({
        id: blogFaqHeadingDomId(block, index),
        label: "Frequently asked questions",
        level: 2,
      });
    }
  });
  return out;
}

export function extractTocFromBlogContent(content: BlogContentJson): BlogTocEntry[] {
  return extractTocFromBlogBlocks(content.blocks);
}
