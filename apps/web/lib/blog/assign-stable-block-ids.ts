import { defaultBlogBlockAnchorId } from "@/lib/blog/blog-block-anchors";
import type { BlogContentJson } from "@/lib/blog/content-json";

/** Ensures every block has an `id` so TOC anchors match across split renders. */
export function assignStableBlogBlockIds(content: BlogContentJson): BlogContentJson {
  return {
    ...content,
    blocks: content.blocks.map((block, i) =>
      block.id && block.id.trim() !== "" ? block : { ...block, id: defaultBlogBlockAnchorId(block, i) },
    ),
  };
}
