/**
 * Structured FAQ entries for `/faq` — answers split for snippet-style leads + expansions.
 * Inline links use `[label](url)` and are rendered via {@link FaqRichText}.
 */
export type FaqStructuredItem = {
  id: string;
  question: string;
  /** One-sentence direct answer (featured snippets). */
  lead: string;
  /** Supporting paragraphs; `[label](url)` for internal links. */
  paragraphs?: string[];
  bullets?: string[];
  /** Extra tokens matched by FAQ search (topic synonyms). */
  keywords?: string[];
  /** Show booking CTA strip after the answer. */
  showInlineCta?: boolean;
};

export type FaqCategoryGroup = {
  id: string;
  title: string;
  description?: string;
  items: FaqStructuredItem[];
};
