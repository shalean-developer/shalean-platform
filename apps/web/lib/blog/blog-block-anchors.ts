import type { BlogContentBlock } from "@/lib/blog/content-json";

export function defaultBlogBlockAnchorId(block: BlogContentBlock, index: number): string {
  return `blog-${block.type}-${index}`;
}

/** FAQ blocks use a dedicated id on the visible H2 for TOC jump links. */
export function blogFaqHeadingDomId(block: { id?: string }, index: number): string {
  if (block.id && block.id.trim() !== "") return `${block.id}-title`;
  return `blog-faq-heading-${index}`;
}
