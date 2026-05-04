import type { BlogTocEntry } from "@/lib/blog/extract-blog-toc";
import type { HighConversionBlogArticle } from "@/lib/blog/highConversionBlogArticle";

export function getHighConversionTableOfContents(article: HighConversionBlogArticle): BlogTocEntry[] {
  const items: BlogTocEntry[] = article.sections.map((s) => ({
    id: `hc-section-${s.id}`,
    label: s.heading,
    level: s.level === "h2" ? 2 : 3,
  }));
  items.push({ id: "hc-faq-heading", label: "Frequently asked questions", level: 2 });
  if (article.conclusionParagraphs?.length) {
    items.push({ id: "hc-conclusion-heading", label: "Conclusion", level: 2 });
  }
  return items;
}
