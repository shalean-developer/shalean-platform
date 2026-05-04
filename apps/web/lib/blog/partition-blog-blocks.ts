import type { BlogContentBlock, BlogContentJson } from "@/lib/blog/content-json";

export type PartitionBlogBlocksResult = {
  before: BlogContentBlock[];
  after: BlogContentBlock[];
};

/**
 * Split narrative vs FAQ/tail so we can inject services + a single mid-page CTA
 * before FAQ when present, else before internal_links, else append slot after full body.
 */
export function partitionBlogBlocks(blocks: BlogContentBlock[]): PartitionBlogBlocksResult {
  const faqIdx = blocks.findIndex((b) => b.type === "faq");
  if (faqIdx >= 0) {
    return { before: blocks.slice(0, faqIdx), after: blocks.slice(faqIdx) };
  }
  const linksIdx = blocks.findIndex((b) => b.type === "internal_links");
  if (linksIdx >= 0) {
    return { before: blocks.slice(0, linksIdx), after: blocks.slice(linksIdx) };
  }
  return { before: blocks, after: [] };
}

export function filterBlocksForDisplay(
  blocks: BlogContentBlock[],
  opts: { stripInlineCtas?: boolean; skipInvalidImages?: boolean },
): BlogContentBlock[] {
  return blocks.filter((b) => {
    if (opts.stripInlineCtas && b.type === "cta") return false;
    if (opts.skipInvalidImages && b.type === "image") {
      const url = "url" in b ? String(b.url ?? "").trim() : "";
      if (!url) return false;
    }
    return true;
  });
}

export function buildDisplayContentJson(
  content: BlogContentJson,
  blocks: BlogContentBlock[],
): BlogContentJson {
  return { ...content, blocks };
}
