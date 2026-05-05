import type { ReactNode } from "react";
import type { BlogContentJson } from "@/lib/blog/content-json";
import {
  buildDisplayContentJson,
  filterBlocksForDisplay,
  partitionBlogBlocks,
} from "@/lib/blog/partition-blog-blocks";
import {
  createAutoLinkBudget,
  injectParagraphAutoLinksIntoBlocks,
} from "@/lib/blog/seo/auto-link-keywords";
import { BlogContentRenderer } from "@/components/blog/BlogContentRenderer";

type Props = {
  content: BlogContentJson;
  /** Services, areas, and the single mid-page booking CTA — rendered before FAQ / tail blocks. */
  midArticleSlot: ReactNode;
  /** When set, paragraph blocks get conservative keyword→internal URL auto-links (trusted CMS only). */
  autoLinkSlug?: string;
};

const DISPLAY_OPTS = { stripInlineCtas: true, skipInvalidImages: true } as const;

/**
 * DB-backed blog articles: strips duplicate inline CTAs, drops empty images,
 * and inserts the conversion stack immediately before FAQ (or internal_links / end).
 */
export function BlogDbArticleBody({ content, midArticleSlot, autoLinkSlug }: Props) {
  const { before, after } = partitionBlogBlocks(content.blocks);
  let beforeFiltered = filterBlocksForDisplay(before, DISPLAY_OPTS);
  let afterFiltered = filterBlocksForDisplay(after, DISPLAY_OPTS);

  if (autoLinkSlug) {
    const budget = createAutoLinkBudget();
    beforeFiltered = injectParagraphAutoLinksIntoBlocks(beforeFiltered, budget);
    afterFiltered = injectParagraphAutoLinksIntoBlocks(afterFiltered, budget);
  }

  return (
    <div className="space-y-10 lg:space-y-12">
      <BlogContentRenderer content={buildDisplayContentJson(content, beforeFiltered)} />
      {midArticleSlot}
      {afterFiltered.length > 0 ? (
        <BlogContentRenderer content={buildDisplayContentJson(content, afterFiltered)} />
      ) : null}
    </div>
  );
}
