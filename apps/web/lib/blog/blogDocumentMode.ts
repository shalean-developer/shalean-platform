import type { BlogContentBlock } from "@/lib/blog/content-json";

/** Metadata edits must retain the complete, ordered content tree without conversion. */
export function preserveOrderedBlogBlocks(blocks: readonly BlogContentBlock[]): BlogContentBlock[] {
  return structuredClone(blocks) as BlogContentBlock[];
}
