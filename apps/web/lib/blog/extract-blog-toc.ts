import { blogFaqHeadingDomId, defaultBlogBlockAnchorId } from "@/lib/blog/blog-block-anchors";
import type { BlogContentBlock, BlogContentJson } from "@/lib/blog/content-json";
import { injectRichTextHeadingAnchors } from "@/lib/blog/inject-rich-text-heading-anchors";
import { sanitizeBlogRichHtml } from "@/lib/blog/sanitize-blog-html";

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
    if (block.type === "faq") {
      out.push({
        id: blogFaqHeadingDomId(block, index),
        label: block.omit_section_heading ? "FAQ" : "Frequently asked questions",
        level: 2,
      });
    }
    if (block.type === "rich_text") {
      const safe = sanitizeBlogRichHtml(block.html);
      const scope = block.id?.trim() || defaultBlogBlockAnchorId(block, index);
      out.push(...injectRichTextHeadingAnchors(safe, scope).entries);
    }
  });
  return out;
}

export function extractTocFromBlogContent(content: BlogContentJson): BlogTocEntry[] {
  return extractTocFromBlogBlocks(content.blocks);
}

/**
 * TOC rows from sanitized rich HTML (`h2` / `h3` only). Uses the same anchor injection as
 * {@link BlogContentRenderer} — pass the same `scope` string (`block.id` or `defaultBlogBlockAnchorId`).
 */
export function extractTocFromRichText(html: string, scope: string): BlogTocEntry[] {
  const safe = sanitizeBlogRichHtml(html ?? "");
  return injectRichTextHeadingAnchors(safe, scope).entries;
}

/**
 * Long-form / structure gate — TOC stays off short pages to avoid clutter.
 * - ≥3 level-2 entries (H2-equivalent), or
 * - ~8+ min read with at least 3 TOC rows.
 */
export function shouldShowBlogTableOfContents(
  entries: BlogTocEntry[],
  readingTimeMinutes: number | null | undefined,
): boolean {
  if (entries.length < 2) return false;
  const h2 = entries.filter((e) => e.level === 2).length;
  if (h2 >= 3) return true;
  const rt = readingTimeMinutes ?? 0;
  if (rt >= 8 && entries.length >= 3) return true;
  return false;
}
