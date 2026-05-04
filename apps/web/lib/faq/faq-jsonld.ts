import type { FaqStructuredItem } from "@/lib/faq/faq-page-types";
import { SITE_ORIGIN } from "@/lib/site/canonical";

function stripInlineLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

export function faqItemPlainAnswer(item: FaqStructuredItem): string {
  const chunks: string[] = [stripInlineLinks(item.lead)];
  for (const p of item.paragraphs ?? []) chunks.push(stripInlineLinks(p));
  for (const b of item.bullets ?? []) chunks.push(stripInlineLinks(b));
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

/** FAQPage `mainEntity` for Google rich results (plain-text answers). */
export function buildFaqPageJsonLd(items: readonly FaqStructuredItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faqItemPlainAnswer(item),
      },
    })),
    url: `${SITE_ORIGIN}/faq`,
  };
}
