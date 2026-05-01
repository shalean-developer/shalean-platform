import type { BlogContentBlock, BlogContentJson } from "./content-json";

function wc(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

function blockWords(b: BlogContentBlock): number {
  switch (b.type) {
    case "intro":
    case "quick_answer":
    case "paragraph":
      return wc(b.content);
    case "section":
      return wc(b.title) + wc(b.content);
    case "comparison":
      return b.items.reduce((n, i) => n + wc(i.label) + wc(i.value), 0);
    case "bullets":
    case "key_takeaways":
      return b.items.reduce((n, i) => n + wc(i), 0);
    case "cta":
      return wc(b.title) + wc(b.button_text) + wc(b.description ?? "") + wc(b.link);
    case "faq":
      return b.items.reduce((n, i) => n + wc(i.question) + wc(i.answer), 0);
    case "image":
      return wc(b.alt) + wc(b.caption ?? "");
    case "quote":
      return wc(b.content) + wc(b.attribution ?? "");
    case "internal_links":
      return (b.title ? wc(b.title) : 0) + b.links.reduce((n, l) => n + wc(l.label) + wc(l.url), 0);
    case "comparison_table":
      return (
        b.columns.reduce((n, c) => n + wc(c), 0) +
        b.rows.reduce((nr, row) => nr + row.reduce((n, c) => n + wc(c), 0), 0)
      );
    case "service_area":
      return b.locations.reduce((n, l) => n + wc(l), 0);
    default: {
      const _b: never = b;
      return _b;
    }
  }
}

/** Rough minutes at ~200 wpm; minimum 1 when any text exists. */
export function computeReadingTimeMinutes(content: BlogContentJson): number {
  const words = content.blocks.reduce((n, b) => n + blockWords(b), 0);
  if (words <= 0) return 1;
  return Math.max(1, Math.round(words / 200));
}
