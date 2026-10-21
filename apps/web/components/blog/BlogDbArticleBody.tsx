import type { ReactNode } from "react";
import type { BlogContentJson } from "@/lib/blog/content-json";
import { BLOG_DB_DISPLAY_FILTER_OPTS, buildDisplayContentJson, filterBlocksForDisplay } from "@/lib/blog/partition-blog-blocks";
import { createAutoLinkBudget, injectParagraphAutoLinksIntoBlocks } from "@/lib/blog/seo/auto-link-keywords";
import { BlogContentRenderer } from "./BlogContentRenderer";

type Props = {
  content: BlogContentJson;
  /** Retained for older callers. Conversion is now a single closing section in BlogArticleFrame. */
  midArticleSlot?: ReactNode;
  autoLinkSlug?: string;
};

export function BlogDbArticleBody({ content, autoLinkSlug }: Props) {
  const blocks = filterBlocksForDisplay(Array.isArray(content?.blocks) ? content.blocks : [], BLOG_DB_DISPLAY_FILTER_OPTS);
  const displayed = autoLinkSlug ? injectParagraphAutoLinksIntoBlocks(blocks, createAutoLinkBudget()) : blocks;
  return <BlogContentRenderer content={buildDisplayContentJson(content, displayed)} autoLinkSlug={autoLinkSlug} />;
}
