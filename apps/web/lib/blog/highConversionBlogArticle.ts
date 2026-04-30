/**
 * Structured article shape for `HighConversionBlogTemplate`.
 * Copy `EXAMPLE_HIGH_CONVERSION_ARTICLE` in `highConversionPosts.ts` when adding posts.
 */

export type HighConversionSection = {
  id: string;
  heading: string;
  level: "h2" | "h3";
  paragraphs: string[];
  /** Optional checklist bullets rendered below paragraphs. */
  bullets?: string[];
};

export type HighConversionFaq = {
  question: string;
  answer: string;
};

export type HighConversionBlogArticle = {
  slug: string;
  /** Meta + OG title (keyword-rich) */
  title: string;
  /** Meta description — clear CTA + keyword */
  description: string;
  /** Visible H1 (main keyword) */
  h1: string;
  publishedAt: string;
  dateModified?: string;
  heroImage: { src: string; alt: string };
  readingTimeMinutes?: number;
  /** Quick answer / hook — shown as introduction */
  introParagraphs: string[];
  sections: HighConversionSection[];
  /** 3–5 items */
  faqs: HighConversionFaq[];
  /** At least one suburb hub — use `/locations/{slug}-cleaning-services` */
  primaryLocation: { href: string; label: string };
  /** Extra service link in the intro mandatory block (e.g. move-out hub). */
  mandatoryAdditionalService?: { href: string; label: string };
  /** Override anchor text for standard/deep links in the mandatory intro block. */
  mandatoryServiceLinkLabels?: {
    standard?: string;
    deep?: string;
  };
  /** Optional mid + end CTA copy (defaults to generic cleaning CTA in template). */
  cta?: {
    heading: string;
    subtext?: string;
  };
  /** Short closing section after FAQs. */
  conclusionParagraphs?: string[];
};
