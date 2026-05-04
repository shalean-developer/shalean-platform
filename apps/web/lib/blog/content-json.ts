/**
 * Canonical shape for `blog_posts.content_json` (JSONB).
 * Render with a single `switch (block.type)` map.
 * `rich_text` uses sanitized HTML at render time (`sanitizeBlogRichHtml`).
 */

export const BLOG_CONTENT_JSON_SCHEMA_VERSION = 1 as const;

type BaseBlock = {
  /** Stable id for editor reconciliation, scroll anchors, analytics */
  id?: string;
};

export type BlogIntroBlock = BaseBlock & {
  type: "intro";
  /** Plain text or minimal inline convention agreed in CMS (e.g. future markdown subset) */
  content: string;
};

export type BlogQuickAnswerBlock = BaseBlock & {
  type: "quick_answer";
  content: string;
};

export type BlogSectionBlock = BaseBlock & {
  type: "section";
  title: string;
  content: string;
  /**
   * Heading level for `title`. Renderer MUST default to 2 when omitted (map to <h2>).
   */
  heading_level?: 2 | 3 | 4;
};

export type BlogComparisonItem = { label: string; value: string };

export type BlogComparisonBlock = BaseBlock & {
  type: "comparison";
  items: BlogComparisonItem[];
};

export type BlogBulletsBlock = BaseBlock & {
  type: "bullets";
  items: string[];
  /** Accessible label if UI renders as region */
  title?: string;
};

export type BlogCtaBlock = BaseBlock & {
  type: "cta";
  title: string;
  description?: string;
  button_text: string;
  link: string;
  variant?: "primary" | "secondary";
};

export type BlogFaqItem = { question: string; answer: string };

export type BlogFaqBlock = BaseBlock & {
  type: "faq";
  items: BlogFaqItem[];
  /** When true, skip the FAQ section’s built-in H2 so a preceding `heading` block owns the title. */
  omit_section_heading?: boolean;
};

export type BlogParagraphBlock = BaseBlock & {
  type: "paragraph";
  content: string;
};

/** Rich prose block (TipTap HTML). Prefer over `paragraph` for new content. */
export type BlogRichTextBlock = BaseBlock & {
  type: "rich_text";
  html: string;
};

/** Standalone heading — prefer level 2–3 in body copy (page layout usually owns the main H1). */
export type BlogHeadingBlock = BaseBlock & {
  type: "heading";
  /** Semantic heading level rendered as `<h1>`–`<h3>`. */
  level: 1 | 2 | 3;
  content: string;
};

/** Semantic unordered list (distinct legacy type name `bullets`). */
export type BlogBulletListBlock = BaseBlock & {
  type: "bullet_list";
  items: string[];
  title?: string;
};

export type BlogNumberedListBlock = BaseBlock & {
  type: "numbered_list";
  items: string[];
  title?: string;
};

/** Key moment / snippet — emit strong visible heading + short copy for SERP-friendly layout */
export type BlogKeyTakeawaysBlock = BaseBlock & {
  type: "key_takeaways";
  items: string[];
};

export type BlogImageBlock = BaseBlock & {
  type: "image";
  url: string;
  alt: string;
  caption?: string;
  /** Intrinsic dimensions for layout-stable rendering (recommended). */
  width?: number;
  height?: number;
  /** LCP / above-fold only — avoids lazy loading. */
  priority?: boolean;
};

export type BlogQuoteBlock = BaseBlock & {
  type: "quote";
  content: string;
  attribution?: string;
};

export type BlogInternalLinksBlock = BaseBlock & {
  type: "internal_links";
  title?: string;
  links: { label: string; url: string }[];
};

export type BlogComparisonTableBlock = BaseBlock & {
  type: "comparison_table";
  columns: string[];
  rows: string[][];
};

export type BlogServiceAreaBlock = BaseBlock & {
  type: "service_area";
  locations: string[];
};

export type BlogContentBlock =
  | BlogIntroBlock
  | BlogQuickAnswerBlock
  | BlogSectionBlock
  | BlogComparisonBlock
  | BlogBulletsBlock
  | BlogBulletListBlock
  | BlogNumberedListBlock
  | BlogHeadingBlock
  | BlogCtaBlock
  | BlogFaqBlock
  | BlogRichTextBlock
  | BlogParagraphBlock
  | BlogKeyTakeawaysBlock
  | BlogImageBlock
  | BlogQuoteBlock
  | BlogInternalLinksBlock
  | BlogComparisonTableBlock
  | BlogServiceAreaBlock;

export type BlogContentJson = {
  schema_version: typeof BLOG_CONTENT_JSON_SCHEMA_VERSION;
  blocks: BlogContentBlock[];
};

export function emptyBlogContentJson(): BlogContentJson {
  return { schema_version: BLOG_CONTENT_JSON_SCHEMA_VERSION, blocks: [] };
}

export function isBlogContentJson(value: unknown): value is BlogContentJson {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.schema_version === BLOG_CONTENT_JSON_SCHEMA_VERSION &&
    Array.isArray(v.blocks)
  );
}
